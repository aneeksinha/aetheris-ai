import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  History,
  KeyRound,
  Paperclip,
  Plus,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { validateEmailAddress } from '../lib/authErrors';
import {
  GUEST_DAILY_REQUEST_LIMIT,
  MAX_FILE_SIZE_MB,
  SIGNED_IN_DAILY_REQUEST_LIMIT,
} from '../lib/models';
import {
  grantUnlimitedEmail,
  revokeUnlimitedEmail,
  subscribeUnlimitedGrants,
} from '../services/firestoreService';
import type { AuthGateReason, UnlimitedGrant } from '../types/chat';

interface ProfileModalProps {
  open: boolean;
  todayRequests: number;
  dailyLimit: number | null;
  onClose: () => void;
  onRequireAuth: (reason: AuthGateReason) => void;
  onOpenPrivacy: () => void;
}

export function ProfileModal({
  open,
  todayRequests,
  dailyLimit,
  onClose,
  onRequireAuth,
  onOpenPrivacy,
}: ProfileModalProps) {
  const { user, profile, isOwner, hasUnlimitedAccess, signOut } = useAuth();
  const [grants, setGrants] = useState<UnlimitedGrant[]>([]);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantNotice, setGrantNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !isOwner || !user) {
      setGrants([]);
      return;
    }

    const unsubscribe = subscribeUnlimitedGrants(
      (items) => {
        setGrants(items);
        setGrantError(null);
      },
      () => {
        setGrantError('Could not load the unlimited-access email list right now.');
      },
    );

    return () => unsubscribe();
  }, [open, isOwner, user]);

  const handleGrantSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !isOwner || grantBusy) return;

    setGrantError(null);
    setGrantNotice(null);

    const check = validateEmailAddress(grantEmail);
    if (!check.valid) {
      setGrantError(check.error || 'Enter a valid email address.');
      return;
    }

    setGrantBusy(true);
    try {
      await grantUnlimitedEmail({
        email: check.normalized,
        grantedByUid: user.uid,
        note: grantNote.trim() || undefined,
      });
      setGrantNotice(`Unlimited access granted to ${check.normalized.toLowerCase()}.`);
      setGrantEmail('');
      setGrantNote('');
    } catch {
      setGrantError('Unable to save this email right now. Please try again.');
    } finally {
      setGrantBusy(false);
    }
  };

  const handleRevoke = async (grant: UnlimitedGrant) => {
    if (!isOwner || grantBusy) return;
    setGrantError(null);
    setGrantNotice(null);
    setGrantBusy(true);
    try {
      await revokeUnlimitedEmail(grant.id);
      setGrantNotice(`Revoked unlimited access for ${grant.email}.`);
    } catch {
      setGrantError('Unable to revoke access right now. Please try again.');
    } finally {
      setGrantBusy(false);
    }
  };

  const remaining = dailyLimit === null ? null : Math.max(0, dailyLimit - todayRequests);
  const progressPct =
    dailyLimit === null
      ? 100
      : Math.min(100, Math.round((todayRequests / dailyLimit) * 100));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl liquid-glass-elevated overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200/60 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-slate-800 dark:text-slate-100" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="profile-modal-title"
                    className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
                  >
                    {user
                      ? profile?.displayName || user.displayName || 'Account Profile'
                      : 'Guest Session'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {isOwner
                      ? `${user?.email} · Workspace Owner (Full Access)`
                      : hasUnlimitedAccess
                        ? `${user?.email} · Unlimited Access Granted`
                        : user
                          ? user.email || 'Signed in account'
                          : `Guest (${GUEST_DAILY_REQUEST_LIMIT}/day) · Sign in for ${SIGNED_IN_DAILY_REQUEST_LIMIT}/day & uploads`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close account dialog"
                className="p-2 rounded-xl liquid-glass-btn text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Quota Summary */}
              <div className="rounded-2xl liquid-glass p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {isOwner
                      ? 'Owner Access Allowance'
                      : hasUnlimitedAccess
                        ? 'Granted Unlimited Allowance'
                        : 'Daily Request Allowance'}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {dailyLimit === null
                      ? `${todayRequests} used today · Unlimited`
                      : `${todayRequests} / ${dailyLimit} used (${remaining} left today)`}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-slate-900 dark:bg-white/85 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Owner Unlimited Access Email Allowlist Manager */}
              {isOwner && (
                <div className="rounded-2xl liquid-glass p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-slate-900 dark:text-slate-100 shrink-0" />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Grant Unlimited Access
                      </h3>
                    </div>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {grants.length} {grants.length === 1 ? 'email' : 'emails'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Any verified account matching an email below automatically receives unlimited daily requests.
                  </p>

                  {grantError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-300/80 dark:border-red-500/30 bg-red-50/85 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-200"
                    >
                      {grantError}
                    </div>
                  )}

                  {grantNotice && (
                    <div
                      role="status"
                      className="rounded-xl border border-emerald-300/80 dark:border-emerald-500/30 bg-emerald-50/85 dark:bg-emerald-950/35 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200"
                    >
                      {grantNotice}
                    </div>
                  )}

                  <form onSubmit={(e) => void handleGrantSubmit(e)} className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="owner-grant-email" className="sr-only">
                          Email address to grant unlimited access
                        </label>
                        <input
                          id="owner-grant-email"
                          type="email"
                          value={grantEmail}
                          onChange={(e) => setGrantEmail(e.target.value)}
                          placeholder="teammate@example.com"
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white/75 dark:bg-black/45 border border-slate-300/80 dark:border-white/15 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label htmlFor="owner-grant-note" className="sr-only">
                          Optional label or note
                        </label>
                        <input
                          id="owner-grant-note"
                          type="text"
                          value={grantNote}
                          onChange={(e) => setGrantNote(e.target.value)}
                          placeholder="Optional note (e.g. Friend)"
                          maxLength={120}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white/75 dark:bg-black/45 border border-slate-300/80 dark:border-white/15 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/30"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={grantBusy}
                      className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold disabled:opacity-60"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>{grantBusy ? 'Saving...' : 'Grant Unlimited Requests'}</span>
                    </button>
                  </form>

                  <div className="space-y-1.5 pt-1 max-h-44 overflow-y-auto">
                    {grants.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 py-2 text-center">
                        No extra emails granted yet. Enter an email above to give unlimited access.
                      </p>
                    ) : (
                      grants.map((grant) => (
                        <div
                          key={grant.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/10"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                              {grant.email}
                            </div>
                            {grant.note && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {grant.note}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={grantBusy}
                            onClick={() => void handleRevoke(grant)}
                            aria-label={`Revoke unlimited access for ${grant.email}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-btn text-[11px] font-medium text-red-600 dark:text-red-300 disabled:opacity-50 shrink-0"
                          >
                            <Trash2 className="w-3 h-3 shrink-0" />
                            <span>Revoke</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2.5">
                  <Paperclip className="w-4 h-4 text-slate-800 dark:text-slate-200 shrink-0" />
                  <span>
                    File uploads (images, PDFs, text/code up to {MAX_FILE_SIZE_MB} MB){' '}
                    {user ? 'unlocked' : 'require sign-in'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <History className="w-4 h-4 text-slate-800 dark:text-slate-200 shrink-0" />
                  <span>
                    Conversation history &amp; analytics{' '}
                    {user ? 'synced to your account' : 'stored locally in browser'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-4 h-4 text-slate-800 dark:text-slate-200 shrink-0" />
                  <span>Powered by Gemini 3.1 Flash Lite with live Google Search</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2.5 px-6 py-4 border-t border-slate-200/60 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPrivacy();
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white underline underline-offset-2 transition-colors"
              >
                Privacy Policy
              </button>
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                    onClose();
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl liquid-glass-btn text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap"
                >
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequireAuth('upload');
                  }}
                  className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold whitespace-nowrap"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Sign in</span>
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

