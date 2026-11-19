import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, FileText, Globe, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  GUEST_DAILY_REQUEST_LIMIT,
  MAX_FILE_SIZE_MB,
  SIGNED_IN_DAILY_REQUEST_LIMIT,
} from '../lib/models';

interface PrivacyPolicyModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ open, onClose }: PrivacyPolicyModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-policy-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl liquid-glass-elevated overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200/60 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl liquid-glass flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="privacy-policy-title"
                    className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Privacy Policy
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    How Aetheris collects, processes, and protects your data
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close privacy policy"
                className="p-2 rounded-xl liquid-glass-btn text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Policy Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Effective Date: November 2026 · Aetheris AI Workspace
              </p>

              <section className="rounded-2xl liquid-glass p-4 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <h3>1. Account &amp; Authentication Data</h3>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  You can use Aetheris openly without creating an account. If you choose to sign in with Google, Apple, or email and password, we collect only your Firebase user identifier (UID), display name, and verified email address to authenticate your session, isolate your private chat history, and authorize file uploads.
                </p>
              </section>

              <section className="rounded-2xl liquid-glass p-4 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <h3>2. Prompts, Conversations &amp; Uploaded Files</h3>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  Messages and file attachments (images, PDFs, or text/code files up to {MAX_FILE_SIZE_MB} MB when signed in) are sent over encrypted HTTPS to the Aetheris server strictly to generate AI responses. Raw uploaded file binaries are processed in memory for your active request and are not saved in separate cloud storage buckets; only attachment names and MIME types are recorded on saved conversation turns.
                </p>
              </section>

              <section className="rounded-2xl liquid-glass p-4 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <h3>3. Storage, Telemetry &amp; Daily Allowance</h3>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  For signed-in users, chat threads and usage metrics (model name, token counts, response latency, and timestamps) are stored in Google Cloud Firestore under access rules restricted solely to your UID (up to {SIGNED_IN_DAILY_REQUEST_LIMIT} free requests/day). For guest sessions, recent usage counters for the {GUEST_DAILY_REQUEST_LIMIT} requests/day guest limit are kept locally in your browser&apos;s storage.
                </p>
              </section>

              <section className="rounded-2xl liquid-glass p-4 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <h3>4. Real-Time Search &amp; Context Sharing</h3>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  When a prompt asks for live information, your local date, time, timezone, and relevant search queries may be included so models return current answers with source links. We never sell your personal data, prompts, or uploaded files to advertisers or third parties.
                </p>
              </section>

              <section className="rounded-2xl liquid-glass p-4 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <Trash2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <h3>5. Your Controls, Export &amp; Deletion</h3>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  You remain in full control of your data. You can export usage telemetry as CSV from the Usage Analytics tab, delete any saved conversation from the sidebar at any time, or sign out and clear local browser storage.
                </p>
              </section>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-5 py-2 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
