import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFirebaseAuthError,
  isFirebasePopupAssertionError,
  validateEmailAddress,
  validatePassword,
} from './authErrors';

test('validateEmailAddress rejects empty and malformed emails cleanly', () => {
  const empty = validateEmailAddress('   ');
  assert.equal(empty.valid, false);
  assert.ok(empty.error?.includes('enter your email'));

  const invalid = validateEmailAddress('not-an-email@');
  assert.equal(invalid.valid, false);
  assert.ok(invalid.error?.includes('valid email'));

  const valid = validateEmailAddress('  user@example.com  ');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, 'user@example.com');
  assert.equal(valid.error, undefined);
});

test('validatePassword enforces empty, minimum length, and maximum length rules', () => {
  assert.equal(validatePassword('').valid, false);
  assert.ok(validatePassword('12345').error?.includes('at least 6 characters'));
  assert.equal(validatePassword('123456').valid, true);
  assert.equal(validatePassword('x'.repeat(129)).valid, false);
});

test('isFirebasePopupAssertionError detects Firebase Auth v13 PopupOperation double-reject assertion', () => {
  const err = new Error('INTERNAL ASSERTION FAILED: Pending promise was never set');
  assert.equal(isFirebasePopupAssertionError(err), true);
  assert.equal(isFirebasePopupAssertionError(new Error('Something else')), false);

  const formatted = formatFirebaseAuthError(err);
  assert.equal(formatted.includes('INTERNAL ASSERTION'), false);
  assert.ok(formatted.toLowerCase().includes('pop-up'));
});

test('formatFirebaseAuthError maps email/password and popup Firebase Auth codes cleanly', () => {
  assert.ok(
    formatFirebaseAuthError({ code: 'auth/invalid-credential', message: '' })
      .toLowerCase()
      .includes('incorrect email or password'),
  );
  assert.ok(
    formatFirebaseAuthError({ code: 'auth/email-already-in-use', message: '' })
      .toLowerCase()
      .includes('already exists'),
  );
  assert.ok(
    formatFirebaseAuthError({ code: 'auth/weak-password', message: '' })
      .toLowerCase()
      .includes('at least 6 characters'),
  );
  assert.ok(
    formatFirebaseAuthError({ code: 'auth/popup-blocked', message: 'Firebase: Error (auth/popup-blocked).' })
      .toLowerCase()
      .includes('blocked the sign-in pop-up'),
  );
  assert.ok(
    formatFirebaseAuthError({ code: 'auth/popup-closed-by-user', message: '' })
      .toLowerCase()
      .includes('closed before finishing'),
  );
  assert.ok(
    formatFirebaseAuthError(new Error('Firebase: Error (auth/unauthorized-domain).'))
      .toLowerCase()
      .includes('authorized domains'),
  );
  assert.ok(
    formatFirebaseAuthError({ code: 'auth/operation-not-allowed', message: '' })
      .toLowerCase()
      .includes('firebase console'),
  );
});

test('formatFirebaseAuthError hides raw Firestore JSON errors from user alert banner', () => {
  const rawJson = JSON.stringify({
    error: 'Missing or insufficient permissions.',
    operationType: 'get',
    path: 'users/123',
  });
  const formatted = formatFirebaseAuthError(new Error(rawJson));
  assert.equal(formatted.includes('"operationType"'), false);
  assert.ok(formatted.toLowerCase().includes('signed in'));
});
