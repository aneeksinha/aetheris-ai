export const MIN_REVIEW_COMMENT_LENGTH = 3;
export const MAX_REVIEW_COMMENT_LENGTH = 600;
export const MAX_REVIEW_AUTHOR_NAME_LENGTH = 80;

export interface ReviewValidationResult {
  valid: boolean;
  rating: number;
  comment: string;
  error?: string;
}

export function validateReviewInput(
  rating: number,
  rawComment: string,
): ReviewValidationResult {
  const comment = rawComment.trim();
  const normalizedRating = Number.isInteger(rating) ? rating : Math.round(rating);

  if (!Number.isInteger(rating) || normalizedRating < 1 || normalizedRating > 5) {
    return {
      valid: false,
      rating: normalizedRating,
      comment,
      error: 'Select a rating between 1 and 5 stars.',
    };
  }

  if (comment.length < MIN_REVIEW_COMMENT_LENGTH) {
    return {
      valid: false,
      rating: normalizedRating,
      comment,
      error: `Please write at least ${MIN_REVIEW_COMMENT_LENGTH} characters in your review.`,
    };
  }

  if (comment.length > MAX_REVIEW_COMMENT_LENGTH) {
    return {
      valid: false,
      rating: normalizedRating,
      comment,
      error: `Reviews must be ${MAX_REVIEW_COMMENT_LENGTH} characters or fewer.`,
    };
  }

  return {
    valid: true,
    rating: normalizedRating,
    comment,
  };
}

export function sanitizeAuthorName(rawName: string | null | undefined): string {
  const trimmed = (rawName || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Aetheris User';
  return trimmed.slice(0, MAX_REVIEW_AUTHOR_NAME_LENGTH);
}

export interface ReviewRatingItem {
  rating: number;
}

export interface ReviewStats {
  totalCount: number;
  averageRating: number;
}

export function computeReviewStats(reviews: ReviewRatingItem[]): ReviewStats {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { totalCount: 0, averageRating: 0 };
  }

  let validCount = 0;
  let sum = 0;
  for (const item of reviews) {
    if (Number.isFinite(item.rating) && item.rating >= 1 && item.rating <= 5) {
      sum += item.rating;
      validCount += 1;
    }
  }

  if (validCount === 0) {
    return { totalCount: 0, averageRating: 0 };
  }

  return {
    totalCount: validCount,
    averageRating: Math.round((sum / validCount) * 10) / 10,
  };
}
