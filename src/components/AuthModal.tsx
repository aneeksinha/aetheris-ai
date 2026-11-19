import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { validateEmailAddress, validatePassword } from '../lib/authErrors';
import { firebaseConfig } from '../lib/firebase';
import { GUEST_DAILY_REQUEST_LIMIT, SIGNED_IN_DAILY_REQUEST_LIMIT } from '../lib/models';
import type { AuthGateReason } from '../types/chat';

interface AuthModalProps {
  open: boolean;
  reason: AuthGateReason;
  onClose: () => void;
  onOpenPrivacy: () => void;
}

const REASON_SUBTITLE: Record<AuthGateReason, string> = {
  upload: `Unlock ${SIGNED_IN_DAILY_REQUEST_LIMIT} daily requests and upload files, images, and PDFs.`,
  history: `Sync chat history across sessions, unlock ${SIGNED_IN_DAILY_REQUEST_LIMIT} requests/day, and upload files.`,
  general: `Unlock ${SIGNED_IN_DAILY_REQUEST_LIMIT} requests/day (vs ${GUEST_DAILY_REQUEST_LIMIT} guest), file uploads, and synced history.`,
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] shrink-0">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function AuthModal({ open, reason, onClose, onOpenPrivacy }: AuthModalProps) {
  const {
    signInWithGoogle,
    signInWithEmailPassword,
    signUpWithEmailPassword,
    sendPasswordReset,
    authBusy,
    authError,
    emailAuthDisabled,
    clearAuthError,
  } = useAuth();

  const [activeProvider, setActiveProvider] = useState<'google' | 'email' | null>(null);
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Reset local form feedback only when the modal transitions from closed -> open.
  // Never clear authError on parent re-renders while the dialog stays open.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      clearAuthError();
      setInlineNotice(null);
      setInlineError(null);
      setActiveProvider(null);
    }
    wasOpenRef.current = open;
  }, [open, clearAuthError]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearAuthError();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, clearAuthError]);

  const handleClose = () => {
    clearAuthError();
    setInlineNotice(null);
    setInlineError(null);
    setActiveProvider(null);
    onClose();
  };

  const handleGoogleSignIn = async () => {
    clearAuthError();
    setInlineNotice(null);
    setInlineError(null);
    setActiveProvider('google');
    const ok = await signInWithGoogle();
    setActiveProvider(null);
    if (ok) {
      onClose();
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setInlineNotice(null);
    setInlineError(null);

    const emailCheck = validateEmailAddress(email);
    if (!emailCheck.valid) {
      setInlineError(emailCheck.error || 'Please enter a valid email address.');
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      setInlineError(passwordCheck.error || 'Please enter your password.');
      return;
    }

    setActiveProvider('email');
    const ok =
      emailMode === 'signup'
        ? await signUpWithEmailPassword(
            emailCheck.normalized,
            password,
            displayName.trim() || undefined,
          )
        : await signInWithEmailPassword(emailCheck.normalized, password);
    setActiveProvider(null);

    if (ok) {
      setPassword('');
      setDisplayName('');
      onClose();
    }
  };

  const handleForgotPassword = async () => {
    clearAuthError();
    setInlineNotice(null);
    setInlineError(null);

    const emailCheck = validateEmailAddress(email);
    if (!emailCheck.valid) {
      setInlineError(
        emailCheck.error || 'Enter your email address first so we can send a reset link.',
      );
      return;
    }

    setActiveProvider('email');
    const ok = await sendPasswordReset(emailCheck.normalized);
    setActiveProvider(null);

    if (ok) {
      setInlineNotice(
        `Password reset link sent to ${emailCheck.normalized}. Check your inbox and spam folder.`,
      );
    }
  };

  const switchEmailMode = (nextMode: 'signin' | 'signup') => {
    if (nextMode === emailMode) return;
    clearAuthError();
    setInlineNotice(null);
    setInlineError(null);
    setEmailMode(nextMode);
  };

  const visibleError = inlineError || authError;
  const consoleProvidersUrl = `https://console.firebase.google.com/project/${encodeURIComponent(
    firebaseConfig.projectId,
  )}/authentication/providers`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[400px] max-h-[92vh] overflow-y-auto rounded-3xl liquid-glass-elevated p-6 sm:p-7 space-y-4"
          >
            {/* Subtle Liquid Specular Top Highlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 dark:via-white/35 to-transparent"
            />

            {/* Top-right Close */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close sign in dialog"
              className="absolute right-4 top-4 p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Centered Title & Subtitle */}
            <div className="text-center space-y-1.5 pt-2 px-2">
              <h2
                id="auth-modal-title"
                className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white"
              >
                {emailMode === 'signup' ? 'Create account' : 'Log in or sign up'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {REASON_SUBTITLE[reason]}
              </p>
            </div>

            {/* Continue with Google */}
            <div className="pt-1">
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void handleGoogleSignIn()}
                className="w-full h-11 rounded-full liquid-glass-btn px-4 inline-flex items-center justify-center gap-2.5 text-sm font-medium text-slate-900 dark:text-white disabled:opacity-60"
              >
                {authBusy && activeProvider === 'google' ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <GoogleMark />
                )}
                <span>
                  {authBusy && activeProvider === 'google'
                    ? 'Connecting to Google…'
                    : 'Continue with Google'}
                </span>
              </button>
            </div>

            {/* OR Divider */}
            <div className="flex items-center gap-3 px-1">
              <div className="h-px flex-1 bg-slate-300/70 dark:bg-white/15" />
              <span className="text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                OR
              </span>
              <div className="h-px flex-1 bg-slate-300/70 dark:bg-white/15" />
            </div>

            {/* Clear Sign in / Create account Tabs */}
            <div
              role="tablist"
              aria-label="Email authentication mode"
              className="grid grid-cols-2 gap-1 p-1 rounded-2xl liquid-glass"
            >
              <button
                type="button"
                role="tab"
                aria-selected={emailMode === 'signin'}
                disabled={authBusy}
                onClick={() => switchEmailMode('signin')}
                className={`h-9 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  emailMode === 'signin'
                    ? 'liquid-glass-btn-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={emailMode === 'signup'}
                disabled={authBusy}
                onClick={() => switchEmailMode('signup')}
                className={`h-9 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  emailMode === 'signup'
                    ? 'liquid-glass-btn-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Create account
              </button>
            </div>

            {/* Email + Password Form */}
            <form onSubmit={(e) => void handleEmailSubmit(e)} noValidate className="space-y-2.5">
              {emailMode === 'signup' && (
                <div>
                  <label htmlFor="auth-name-input" className="sr-only">
                    Full name (optional)
                  </label>
                  <input
                    id="auth-name-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Full name (optional)"
                    autoComplete="name"
                    maxLength={80}
                    className="w-full h-11 px-4 rounded-2xl bg-white/75 dark:bg-slate-950/75 border border-slate-300/70 dark:border-white/15 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-slate-900/30 dark:focus:ring-white/30 transition-all"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email-input" className="sr-only">
                  Email address
                </label>
                <input
                  id="auth-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (inlineError) setInlineError(null);
                    if (inlineNotice) setInlineNotice(null);
                  }}
                  placeholder="Email address"
                  autoComplete="email"
                  className="w-full h-11 px-4 rounded-2xl bg-white/75 dark:bg-slate-950/75 border border-slate-300/70 dark:border-white/15 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-slate-900/30 dark:focus:ring-white/30 transition-all"
                />
              </div>

              <div className="relative">
                <label htmlFor="auth-password-input" className="sr-only">
                  Password
                </label>
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (inlineError) setInlineError(null);
                    if (inlineNotice) setInlineNotice(null);
                  }}
                  placeholder={emailMode === 'signup' ? 'Create password (6+ chars)' : 'Password'}
                  autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full h-11 pl-4 pr-11 rounded-2xl bg-white/75 dark:bg-slate-950/75 border border-slate-300/70 dark:border-white/15 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-slate-900/30 dark:focus:ring-white/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {emailMode === 'signin' && (
                <div className="flex justify-end px-1 text-xs">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void handleForgotPassword()}
                    className="font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors disabled:opacity-60"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full h-11 rounded-full text-sm font-semibold liquid-glass-btn-primary text-white disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {authBusy && activeProvider === 'email' && (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                )}
                <span>
                  {authBusy && activeProvider === 'email'
                    ? emailMode === 'signup'
                      ? 'Creating account…'
                      : 'Signing in…'
                    : emailMode === 'signup'
                      ? 'Create account'
                      : 'Continue'}
                </span>
              </button>
            </form>

            {/* Auth Error / Inline Guidance */}
            <AnimatePresence>
              {(visibleError || inlineNotice) && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  role={visibleError ? 'alert' : 'status'}
                  className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed backdrop-blur-md border space-y-2 ${
                    visibleError
                      ? 'border-red-300/80 dark:border-red-900/60 bg-red-50/85 dark:bg-red-950/45 text-red-700 dark:text-red-300'
                      : 'border-slate-300/70 dark:border-white/20 bg-white/80 dark:bg-white/10 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <p>{visibleError || inlineNotice}</p>
                  {emailAuthDisabled && visibleError && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <a
                        href={consoleProvidersUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                      >
                        <span>Open Firebase Sign-in Providers</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={() => void handleGoogleSignIn()}
                        className="px-2.5 py-1 rounded-lg liquid-glass-btn-primary text-white text-[11px] font-semibold"
                      >
                        Use Google instead
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Privacy Policy Consent Footer */}
            <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
              By continuing, you acknowledge Aetheris&apos;s{' '}
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="font-medium text-slate-800 dark:text-slate-200 underline underline-offset-2 hover:text-slate-950 dark:hover:text-white transition-colors"
              >
                Privacy Policy
              </button>
              .
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

