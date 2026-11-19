export interface EmailValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validateEmailAddress(rawEmail: string): EmailValidationResult {
  const normalized = rawEmail.trim();
  if (!normalized) {
    return {
      valid: false,
      normalized,
      error: 'Please enter your email address first.',
    };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Please enter a valid email address (for example, name@example.com).',
    };
  }
  return { valid: true, normalized };
}

export function validatePassword(rawPassword: string): PasswordValidationResult {
  if (!rawPassword) {
    return {
      valid: false,
      error: 'Please enter your password.',
    };
  }
  if (rawPassword.length < 6) {
    return {
      valid: false,
      error: 'Password must be at least 6 characters long.',
    };
  }
  if (rawPassword.length > 128) {
    return {
      valid: false,
      error: 'Password must be 128 characters or fewer.',
    };
  }
  return { valid: true };
}

function extractAuthCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  if (error instanceof Error) {
    const match = error.message.match(/\((auth\/[a-z0-9-]+)\)/i);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return '';
}

export function isFirebasePopupAssertionError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return (
    msg.includes('INTERNAL ASSERTION FAILED: Pending promise was never set') ||
    msg.includes('Pending promise was never set')
  );
}

export function formatFirebaseAuthError(error: unknown): string {
  if (isFirebasePopupAssertionError(error)) {
    return 'The sign-in pop-up closed or was interrupted by the browser. Please allow pop-ups and try again.';
  }

  const code = extractAuthCode(error);

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Check your details, click Forgot password?, or switch to Create account.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Sign in with your password or use Google / Apple if you registered with a social provider.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support for help.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/popup-closed-by-user':
      return 'The sign-in pop-up was closed before finishing. Try again to complete authentication.';
    case 'auth/cancelled-popup-request':
      return 'A previous sign-in window was cancelled. Click the sign-in button once to continue.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication yet. Add this host under Firebase Console -> Authentication -> Settings -> Authorized domains.';
    case 'auth/network-request-failed':
      return 'Network error while reaching authentication servers. Check your internet connection and try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled yet in Firebase Console -> Authentication -> Sign-in method.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in provider. Try Continue with Google or Email/Password.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts in a short time. Wait a moment and try again.';
    case 'auth/internal-error':
      return 'Authentication encountered a temporary internal error. Please try again.';
    default:
      break;
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unable to complete sign-in.';

  if (rawMessage.trim().startsWith('{') && rawMessage.includes('"operationType"')) {
    return 'Signed in, but syncing your cloud profile hit a permissions or connectivity issue. Try refreshing the page.';
  }

  const cleaned = rawMessage
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\(auth\/[a-z0-9-]+\)\.?$/i, '')
    .trim();

  return cleaned || 'Sign-in could not be completed. Please try again.';
}
