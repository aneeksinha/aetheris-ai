import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  computeReviewStats,
  MAX_REVIEW_COMMENT_LENGTH,
  sanitizeAuthorName,
  validateReviewInput,
} from '../lib/reviewsValidation';
import {
  deleteReview,
  submitReview,
  subscribePublicReviews,
} from '../services/firestoreService';
import type { AuthGateReason, ReviewItem } from '../types/chat';

interface ReviewsModalProps {
  open: boolean;
  onClose: () => void;
  onRequireAuth: (reason: AuthGateReason) => void;
}

function formatReviewDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export function ReviewsModal({ open, onClose, onRequireAuth }: ReviewsModalProps) {
  const { user, profile, isEmailVerified, isOwner } = useAuth();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);

    const unsubscribe = subscribePublicReviews(
      (items) => {
        setReviews(items);
        setLoading(false);
        setLoadError(null);
      },
      () => {
        setLoading(false);
        setLoadError('Unable to load community reviews right now.');
      },
    );

    return () => unsubscribe();
  }, [open]);

  const stats = useMemo(() => computeReviewStats(reviews), [reviews]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !isEmailVerified || submitting) return;

    setFormError(null);
    setFormNotice(null);

    const check = validateReviewInput(rating, comment);
    if (!check.valid) {
      setFormError(check.error || 'Please check your review before posting.');
      return;
    }

    setSubmitting(true);
    try {
      const displayName = sanitizeAuthorName(
        profile?.displayName || user.displayName || user.email?.split('@')[0],
      );
      await submitReview({
        authorId: user.uid,
        authorName: displayName,
        rating: check.rating,
        comment: check.comment,
      });
      setComment('');
      setRating(5);
      setFormNotice('Thanks! Your review is now live.');
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not post review right now. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (deletingId) return;
    setFormError(null);
    setFormNotice(null);
    setDeletingId(reviewId);
    try {
      await deleteReview(reviewId);
    } catch {
      setFormError('Could not delete review right now.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reviews-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl liquid-glass-elevated overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200/60 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center shrink-0">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="reviews-modal-title"
                    className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
                  >
                    AI Reviews
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {stats.totalCount > 0
                      ? `${stats.averageRating.toFixed(1)} / 5 average · ${stats.totalCount} ${stats.totalCount === 1 ? 'review' : 'reviews'}`
                      : 'Community feedback on Aetheris'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close AI reviews"
                className="p-2 rounded-xl liquid-glass-btn text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Review Submission Panel */}
              <div className="rounded-2xl liquid-glass p-4 space-y-3">
                {!user ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Share your experience
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Sign in with Google or email to rate Aetheris and post a review.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRequireAuth('general');
                      }}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Sign in to review</span>
                    </button>
                  </div>
                ) : !isEmailVerified ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Verify your email address using the bar at the top of the workspace to post a public review.
                  </p>
                ) : (
                  <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Rate Aetheris
                      </span>
                      <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = star <= rating;
                          return (
                            <button
                              key={star}
                              type="button"
                              role="radio"
                              aria-checked={rating === star}
                              aria-label={`Rate ${star} out of 5 stars`}
                              onClick={() => setRating(star)}
                              className="p-1.5 rounded-lg hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  active
                                    ? 'fill-amber-400 text-amber-500'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="review-comment-input" className="sr-only">
                        Write your review about Aetheris
                      </label>
                      <textarea
                        id="review-comment-input"
                        rows={3}
                        maxLength={MAX_REVIEW_COMMENT_LENGTH}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="What do you think of Aetheris speed, accuracy, or live Google Search?"
                        className="w-full resize-none rounded-xl bg-white/75 dark:bg-black/45 border border-slate-300/80 dark:border-white/15 px-3 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/30"
                      />
                    </div>

                    {formError && (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-300/80 dark:border-red-500/30 bg-red-50/85 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-200"
                      >
                        {formError}
                      </div>
                    )}

                    {formNotice && (
                      <div
                        role="status"
                        className="rounded-xl border border-emerald-300/80 dark:border-emerald-500/30 bg-emerald-50/85 dark:bg-emerald-950/35 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200"
                      >
                        {formNotice}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {comment.trim().length} / {MAX_REVIEW_COMMENT_LENGTH}
                      </span>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="min-h-[40px] px-4 py-2 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
                      >
                        {submitting ? 'Posting...' : 'Post Review'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Reviews Feed List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Recent Reviews</span>
                  {stats.totalCount > 0 && (
                    <span className="tabular-nums">{stats.totalCount} posted</span>
                  )}
                </div>

                {loadError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-300/80 dark:border-red-500/30 bg-red-50/85 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-200"
                  >
                    {loadError}
                  </div>
                )}

                {loading ? (
                  <div className="space-y-2.5">
                    <div className="h-20 rounded-2xl liquid-glass animate-pulse" />
                    <div className="h-20 rounded-2xl liquid-glass animate-pulse" />
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="rounded-2xl liquid-glass p-6 text-center space-y-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      No reviews yet
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Be the first to share feedback on Aetheris.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {reviews.map((item) => {
                      const canDelete = Boolean(
                        user && isEmailVerified && (user.uid === item.authorId || isOwner),
                      );
                      return (
                        <article
                          key={item.id}
                          className="rounded-2xl liquid-glass p-4 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {item.authorName}
                              </div>
                              <div className="flex items-center gap-2 pt-0.5">
                                <div
                                  className="flex items-center gap-0.5"
                                  aria-label={`Rated ${item.rating} out of 5 stars`}
                                >
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      className={`w-3 h-3 ${
                                        s <= item.rating
                                          ? 'fill-amber-400 text-amber-500'
                                          : 'text-slate-300 dark:text-slate-600'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                  {formatReviewDate(item.createdAtMs)}
                                </span>
                              </div>
                            </div>

                            {canDelete && (
                              <button
                                type="button"
                                disabled={deletingId === item.id}
                                onClick={() => void handleDelete(item.id)}
                                aria-label={`Delete review by ${item.authorName}`}
                                className="p-1.5 rounded-lg liquid-glass-btn text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 disabled:opacity-50 shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                            {item.comment}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
