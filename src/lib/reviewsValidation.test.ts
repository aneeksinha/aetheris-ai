import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReviewStats,
  MAX_REVIEW_COMMENT_LENGTH,
  sanitizeAuthorName,
  validateReviewInput,
} from './reviewsValidation';

test('validateReviewInput accepts valid ratings and trimmed comments', () => {
  const res = validateReviewInput(5, '  Super fast responses with live search!  ');
  assert.equal(res.valid, true);
  assert.equal(res.rating, 5);
  assert.equal(res.comment, 'Super fast responses with live search!');
});

test('validateReviewInput rejects invalid ratings and too-short or too-long comments', () => {
  assert.equal(validateReviewInput(0, 'Good app').valid, false);
  assert.equal(validateReviewInput(6, 'Good app').valid, false);
  assert.equal(validateReviewInput(4.5, 'Good app').valid, false);
  assert.equal(validateReviewInput(4, 'ok').valid, false);
  assert.equal(
    validateReviewInput(5, 'a'.repeat(MAX_REVIEW_COMMENT_LENGTH + 1)).valid,
    false,
  );
});

test('sanitizeAuthorName falls back cleanly and caps length', () => {
  assert.equal(sanitizeAuthorName(''), 'Aetheris User');
  assert.equal(sanitizeAuthorName('   Jane   Doe  '), 'Jane Doe');
  assert.equal(sanitizeAuthorName('x'.repeat(120)).length, 80);
});

test('computeReviewStats calculates rounded average and handles empty lists', () => {
  assert.deepEqual(computeReviewStats([]), { totalCount: 0, averageRating: 0 });
  assert.deepEqual(
    computeReviewStats([{ rating: 5 }, { rating: 4 }, { rating: 4 }]),
    { totalCount: 3, averageRating: 4.3 },
  );
});
