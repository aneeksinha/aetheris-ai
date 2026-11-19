import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type ActionCodeSettings,
  type AuthProvider as FirebaseAuthProvider,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  auth,
  browserPopupRedirectResolver,
  db,
  firebaseConfig,
  googleProvider,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  extractFirebaseAuthCode,
  formatFirebaseAuthError,
  isEmailAuthDisabledError,
  isFirebasePopupAssertionError,
} from '../lib/authErrors';
import { isOwnerEmail } from '../lib/models';
import { subscribeOwnUnlimitedGrant } from '../services/firestoreService';
import type { UserProfile } from '../types/chat';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isEmailVerified: boolean;
  isOwner: boolean;
  hasUnlimitedAccess: boolean;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  emailAuthDisabled: boolean;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmailPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithEmailPassword: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  resendVerificationEmail: () => Promise<boolean>;
  refreshVerificationStatus: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let popupInFlight = false;

function sanitizeDisplayName(
  name: string | null | undefined,
  email?: string | null,
): string {
  const emailPrefix = email ? email.split('@')[0] : '';
  const cleaned = (name || emailPrefix || 'Member').trim().slice(0, 100);
  return cleaned.length > 0 ? cleaned : 'Member';
}

function getContinueActionSettings(): ActionCodeSettings | undefined {
  if (typeof window === 'undefined' || !window.location?.origin) return undefined;
  return { url: window.location.origin };
}

function isContinueUriError(err: unknown): boolean {
  const code = extractFirebaseAuthCode(err);
  return (
    code === 'auth/unauthorized-continue-uri' ||
    code === 'auth/invalid-continue-uri' ||
    code === 'auth/missing-continue-uri'
  );
}

async function sendVerificationWithFallback(targetUser: User): Promise<void> {
  const settings = getContinueActionSettings();
  if (!settings) {
    await sendEmailVerification(targetUser);
    return;
  }
  try {
    await sendEmailVerification(targetUser, settings);
  } catch (err) {
    if (isContinueUriError(err)) {
      await sendEmailVerification(targetUser);
      return;
    }
    throw err;
  }
}

async function sendPasswordResetWithFallback(email: string): Promise<void> {
  const settings = getContinueActionSettings();
  if (!settings) {
    await sendPasswordResetEmail(auth, email);
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email, settings);
  } catch (err) {
    if (isContinueUriError(err)) {
      await sendPasswordResetEmail(auth, email);
      return;
    }
    throw err;
  }
}

async function loadOrCreateUserProfileViaRest(user: User): Promise<UserProfile> {
  const idToken = await user.getIdToken();
  const baseUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}` +
    `/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}`;
  const docName = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${user.uid}`;
  const docUrl = `${baseUrl}/documents/users/${encodeURIComponent(user.uid)}`;

  const res = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (res.ok) {
    const docData = (await res.json()) as {
      fields?: Record<string, { stringValue?: string }>;
    };
    const f = docData.fields || {};
    return {
      uid: String(f.uid?.stringValue || user.uid),
      displayName: sanitizeDisplayName(
        f.displayName?.stringValue || user.displayName,
        user.email,
      ),
    };
  }

  if (res.status === 404) {
    const safeName = sanitizeDisplayName(user.displayName, user.email);
    const commitRes = await fetch(`${baseUrl}/documents:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            currentDocument: { exists: false },
            update: {
              name: docName,
              fields: {
                uid: { stringValue: user.uid },
                displayName: { stringValue: safeName },
              },
            },
            updateTransforms: [
              { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
        ],
      }),
    });

    if (!commitRes.ok) {
      throw new Error(`REST profile commit failed (${commitRes.status})`);
    }

    return {
      uid: user.uid,
      displayName: safeName,
    };
  }

  throw new Error(`REST profile lookup failed (${res.status})`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [hasUnlimitedGrant, setHasUnlimitedGrant] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailAuthDisabled, setEmailAuthDisabled] = useState(false);
  const authBusyRef = useRef(false);

  const syncVerifiedUserProfile = useCallback(async (targetUser: User) => {
    const userPath = `users/${targetUser.uid}`;
    const userRef = doc(db, 'users', targetUser.uid);

    try {
      await targetUser.getIdToken();
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setProfile({
          uid: String(data.uid || targetUser.uid),
          displayName: sanitizeDisplayName(
            data.displayName ? String(data.displayName) : targetUser.displayName,
            targetUser.email,
          ),
        });
      } else {
        const newProfile: UserProfile = {
          uid: targetUser.uid,
          displayName: sanitizeDisplayName(targetUser.displayName, targetUser.email),
        };
        await setDoc(userRef, {
          ...newProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setProfile(newProfile);
      }
      setAuthError(null);
    } catch (err) {
      if (isFirestoreOfflineError(err)) {
        try {
          const restProfile = await loadOrCreateUserProfileViaRest(targetUser);
          setProfile(restProfile);
          setAuthError(null);
        } catch {
          setProfile({
            uid: targetUser.uid,
            displayName: sanitizeDisplayName(targetUser.displayName, targetUser.email),
          });
        }
      } else {
        try {
          handleFirestoreError(err, OperationType.GET, userPath);
        } catch {
          setProfile({
            uid: targetUser.uid,
            displayName: sanitizeDisplayName(targetUser.displayName, targetUser.email),
          });
          setAuthError(formatFirebaseAuthError(err));
        }
      }
    }
  }, []);

  // Guard against @firebase/auth v13 secondary PopupOperation.reject race
  // ("INTERNAL ASSERTION FAILED: Pending promise was never set") inside embedded iframes
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isFirebasePopupAssertionError(event.reason)) {
        event.preventDefault();
        popupInFlight = false;
        authBusyRef.current = false;
        setAuthBusy(false);
        setAuthError((prev) => prev || formatFirebaseAuthError(event.reason));
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      if (isFirebasePopupAssertionError(event.error || event.message)) {
        event.preventDefault();
        popupInFlight = false;
        authBusyRef.current = false;
        setAuthBusy(false);
        setAuthError((prev) => prev || formatFirebaseAuthError(event.error || event.message));
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleWindowError);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleWindowError);
    };
  }, []);

  useEffect(() => {
    void testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setIsEmailVerified(false);
        setHasUnlimitedGrant(false);
        setEmailAuthDisabled(false);
        setAuthReady(true);
        return;
      }

      const verified = Boolean(nextUser.emailVerified);
      setIsEmailVerified(verified);

      if (!verified) {
        // Firestore rules enforce email_verified == true; hold local profile until verified
        setProfile({
          uid: nextUser.uid,
          displayName: sanitizeDisplayName(nextUser.displayName, nextUser.email),
        });
        setAuthReady(true);
        return;
      }

      try {
        await syncVerifiedUserProfile(nextUser);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, [syncVerifiedUserProfile]);

  const runPopupSignIn = useCallback(async (provider: FirebaseAuthProvider): Promise<boolean> => {
    if (popupInFlight || authBusyRef.current) return false;
    popupInFlight = true;
    authBusyRef.current = true;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      return true;
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
      return false;
    } finally {
      popupInFlight = false;
      authBusyRef.current = false;
      setAuthBusy(false);
    }
  }, []);

  const signInWithGoogle = useCallback(
    () => runPopupSignIn(googleProvider),
    [runPopupSignIn],
  );

  const signInWithEmailPassword = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (authBusyRef.current) return false;
      authBusyRef.current = true;
      setAuthBusy(true);
      setAuthError(null);
      setEmailAuthDisabled(false);
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        return true;
      } catch (err) {
        setEmailAuthDisabled(isEmailAuthDisabledError(err));
        setAuthError(formatFirebaseAuthError(err));
        return false;
      } finally {
        authBusyRef.current = false;
        setAuthBusy(false);
      }
    },
    [],
  );

  const signUpWithEmailPassword = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string,
    ): Promise<boolean> => {
      if (authBusyRef.current) return false;
      authBusyRef.current = true;
      setAuthBusy(true);
      setAuthError(null);
      setEmailAuthDisabled(false);
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const cleanName = sanitizeDisplayName(displayName, cred.user.email);
        if (displayName?.trim()) {
          await updateProfile(cred.user, { displayName: cleanName }).catch(() => undefined);
        }
        await sendVerificationWithFallback(cred.user).catch(() => undefined);
        setProfile({
          uid: cred.user.uid,
          displayName: cleanName,
        });
        return true;
      } catch (err) {
        setEmailAuthDisabled(isEmailAuthDisabledError(err));
        setAuthError(formatFirebaseAuthError(err));
        return false;
      } finally {
        authBusyRef.current = false;
        setAuthBusy(false);
      }
    },
    [],
  );

  const sendPasswordReset = useCallback(async (email: string): Promise<boolean> => {
    if (authBusyRef.current) return false;
    authBusyRef.current = true;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await sendPasswordResetWithFallback(email.trim());
      return true;
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
      return false;
    } finally {
      authBusyRef.current = false;
      setAuthBusy(false);
    }
  }, []);

  const resendVerificationEmail = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser || authBusyRef.current) return false;
    authBusyRef.current = true;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await auth.currentUser.getIdToken(true);
        setIsEmailVerified(true);
        await syncVerifiedUserProfile(auth.currentUser);
        return true;
      }
      await sendVerificationWithFallback(auth.currentUser);
      return true;
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
      return false;
    } finally {
      authBusyRef.current = false;
      setAuthBusy(false);
    }
  }, [syncVerifiedUserProfile]);

  const refreshVerificationStatus = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const verified = Boolean(auth.currentUser.emailVerified);
      setIsEmailVerified(verified);
      if (verified) {
        await syncVerifiedUserProfile(auth.currentUser);
      }
      return verified;
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, [syncVerifiedUserProfile]);

  // Automatically check verification when the user returns from clicking their inbox link
  useEffect(() => {
    if (!user || isEmailVerified) return;

    const checkQuietly = async () => {
      if (!auth.currentUser || authBusyRef.current) return;
      try {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          await auth.currentUser.getIdToken(true);
          setIsEmailVerified(true);
          await syncVerifiedUserProfile(auth.currentUser);
        }
      } catch {
        // Ignore transient reload failures while waiting for user verification
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkQuietly();
      }
    };
    const handleFocus = () => {
      void checkQuietly();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, isEmailVerified, syncVerifiedUserProfile]);

  const signOut = useCallback(async (): Promise<void> => {
    setAuthBusy(true);
    setAuthError(null);
    setEmailAuthDisabled(false);
    try {
      await firebaseSignOut(auth);
      setProfile(null);
      setIsEmailVerified(false);
      setHasUnlimitedGrant(false);
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setEmailAuthDisabled(false);
  }, []);
  const isOwner = isOwnerEmail(user?.email, isEmailVerified);

  useEffect(() => {
    if (!user || !isEmailVerified || !user.email || isOwner) {
      setHasUnlimitedGrant(false);
      return;
    }

    const unsubscribe = subscribeOwnUnlimitedGrant(
      user.email,
      (granted) => setHasUnlimitedGrant(granted),
      () => setHasUnlimitedGrant(false),
    );

    return () => unsubscribe();
  }, [user, isEmailVerified, isOwner]);

  const hasUnlimitedAccess = isOwner || hasUnlimitedGrant;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isEmailVerified,
        isOwner,
        hasUnlimitedAccess,
        authReady,
        authBusy,
        authError,
        emailAuthDisabled,
        clearAuthError,
        signInWithGoogle,
        signInWithEmailPassword,
        signUpWithEmailPassword,
        sendPasswordReset,
        resendVerificationEmail,
        refreshVerificationStatus,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
