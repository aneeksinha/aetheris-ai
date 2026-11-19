import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Lock,
  Paperclip,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatLatency, formatTokens, validateAttachment } from '../lib/analytics';
import {
  getModelSpec,
  GUEST_DAILY_REQUEST_LIMIT,
  MAX_FILE_SIZE_MB,
  SIGNED_IN_DAILY_REQUEST_LIMIT,
  type ModelId,
} from '../lib/models';
import type { AuthGateReason, ChatMessage, PendingAttachment } from '../types/chat';
import { MarkdownMessage } from './MarkdownMessage';

interface ChatWorkspaceProps {
  messages: ChatMessage[];
  selectedModelId: ModelId;
  todayRequests: number;
  dailyLimit: number | null;
  isGenerating: boolean;
  onSendMessage: (text: string, attachment?: PendingAttachment) => void;
  onStopGenerating: () => void;
  onRetryLast: () => void;
  onRequireAuth: (reason: AuthGateReason) => void;
  loadingThread: boolean;
}

const STARTER_PROMPTS = [
  {
    title: 'Check today’s live context',
    prompt: 'What is today’s exact date and day of the week, and what are the top technology headlines today?',
  },
  {
    title: 'Explain an architecture tradeoff',
    prompt: 'Compare optimistic UI updates vs. server-confirmed writes for a collaborative task app in 4 concise bullets.',
  },
  {
    title: 'Write clean TypeScript',
    prompt: 'Write a type-safe debounce hook in React 19 with cleanup on unmount and an example usage.',
  },
  {
    title: 'Debug SQL query performance',
    prompt: 'Why would a PostgreSQL query with an index on created_at still do a sequential scan, and how do I diagnose it?',
  },
];

async function readAttachmentFile(file: File): Promise<PendingAttachment> {
  const isBinaryVisualOrPdf =
    file.type.startsWith('image/') || file.type === 'application/pdf';

  if (isBinaryVisualOrPdf) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read attached file.'));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      dataBase64: base64,
    };
  }

  const textContent = await file.text();
  return {
    name: file.name,
    mimeType: file.type || 'text/plain',
    sizeBytes: file.size,
    textContent,
  };
}

export function ChatWorkspace({
  messages,
  selectedModelId,
  todayRequests,
  dailyLimit,
  isGenerating,
  onSendMessage,
  onStopGenerating,
  onRetryLast,
  onRequireAuth,
  loadingThread,
}: ChatWorkspaceProps) {
  const { user, isOwner, hasUnlimitedAccess } = useAuth();
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const activeModel = getModelSpec(selectedModelId);
  const remainingRequests =
    dailyLimit === null ? null : Math.max(0, dailyLimit - todayRequests);
  const limitReached = remainingRequests !== null && remainingRequests <= 0;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({
      behavior: isGenerating ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [messages.length, messages[messages.length - 1]?.content, isGenerating]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  const handleAttachClick = () => {
    setAttachmentError(null);
    if (!user) {
      onRequireAuth('upload');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const check = validateAttachment(
      file.name,
      file.type,
      file.size,
      MAX_FILE_SIZE_MB,
    );
    if (!check.valid) {
      setAttachmentError(check.reason || 'File cannot be attached.');
      return;
    }

    try {
      const prepared = await readAttachmentFile(file);
      setAttachment(prepared);
      setAttachmentError(null);
    } catch {
      setAttachmentError('Could not read the selected file.');
    }
  };

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed || isGenerating || limitReached) return;
    onSendMessage(trimmed, attachment || undefined);
    setDraft('');
    setAttachment(null);
    setAttachmentError(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyMessage = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Scrollable Thread */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto py-6 sm:py-10">
          {loadingThread ? (
            <div className="space-y-6 py-8">
              <div className="h-14 w-2/3 ml-auto rounded-2xl liquid-glass animate-pulse" />
              <div className="h-28 w-full rounded-2xl liquid-glass animate-pulse" />
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="py-6 sm:py-12 space-y-8"
            >
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {activeModel.name} · {activeModel.profile} · {activeModel.contextWindow}
                </p>
                <h1 className="font-display text-2xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
                  What are we exploring or building today?
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                  {isOwner
                    ? 'Owner full access enabled with unlimited requests, real-time web grounding, file uploads, and 1M context.'
                    : hasUnlimitedAccess
                      ? 'Unlimited request access granted by workspace owner, with real-time web grounding, file uploads, and synced history.'
                      : user
                        ? `Signed in with ${SIGNED_IN_DAILY_REQUEST_LIMIT} free requests/day, real-time web grounding, file uploads, and synced history.`
                        : `Fast open chat with real-time clock & live web search—${GUEST_DAILY_REQUEST_LIMIT} free requests/day as a guest, or sign in for ${SIGNED_IN_DAILY_REQUEST_LIMIT}/day, uploads, and saved history.`}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {STARTER_PROMPTS.map((item, idx) => (
                  <motion.button
                    key={item.title}
                    type="button"
                    disabled={limitReached}
                    onClick={() => onSendMessage(item.prompt)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.28,
                      delay: idx * 0.055,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.985 }}
                    className="text-left p-4 rounded-2xl liquid-glass hover:border-slate-900/25 dark:hover:border-white/25 transition-colors duration-200 space-y-1.5 disabled:opacity-50"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {item.prompt}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-7">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const modelSpec = getModelSpec(msg.modelId);
                const isLast = index === messages.length - 1;

                if (isUser) {
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[88%] sm:max-w-[78%] space-y-2">
                        {msg.attachmentName && (
                          <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {msg.attachmentType?.startsWith('image/') ? (
                              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="truncate max-w-[240px]">{msg.attachmentName}</span>
                          </div>
                        )}
                        <div className="rounded-2xl rounded-br-sm liquid-glass-message-bubble text-white px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.article
                    key={msg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="py-1.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>{msg.respondedBy || modelSpec.name}</span>
                        {!msg.isStreaming && msg.tokens > 0 && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>{formatTokens(msg.tokens)} tokens</span>
                          </>
                        )}
                        {!msg.isStreaming && msg.latencyMs > 0 && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>{formatLatency(msg.latencyMs)}</span>
                          </>
                        )}
                        {msg.isStreaming && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>Generating…</span>
                          </>
                        )}
                      </div>

                      {!msg.isStreaming && msg.content && (
                        <div className="flex items-center gap-1.5">
                          {isLast && (
                            <button
                              type="button"
                              onClick={onRetryLast}
                              aria-label="Regenerate response"
                              className="p-2 rounded-xl liquid-glass-btn text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleCopyMessage(msg.id, msg.content)}
                            aria-label="Copy response"
                            className="p-2 rounded-xl liquid-glass-btn text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {msg.isError ? (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200/80 dark:border-red-900/60 bg-red-50/75 dark:bg-red-950/35 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <span className="leading-relaxed">{msg.content}</span>
                        {isLast && (
                          <button
                            type="button"
                            onClick={onRetryLast}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-btn text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap shrink-0 self-start sm:self-auto"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    ) : msg.content ? (
                      <MarkdownMessage content={msg.content} />
                    ) : (
                      <div className="space-y-2.5 py-1" aria-label="Generating response">
                        <div className="flex items-center gap-1.5">
                          {[0, 1, 2].map((dot) => (
                            <motion.span
                              key={dot}
                              animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.12, 0.85] }}
                              transition={{
                                duration: 1.05,
                                repeat: Infinity,
                                delay: dot * 0.16,
                                ease: 'easeInOut',
                              }}
                              className="w-2 h-2 rounded-full bg-blue-500/80 dark:bg-blue-400/85"
                            />
                          ))}
                        </div>
                        <div className="h-3.5 w-3/4 rounded-lg bg-slate-300/55 dark:bg-white/10 animate-pulse" />
                        <div className="h-3.5 w-1/2 rounded-lg bg-slate-300/55 dark:bg-white/10 animate-pulse" />
                      </div>
                    )}

                    {!msg.isStreaming && msg.sources && msg.sources.length > 0 && (
                      <div className="pt-2.5 border-t border-slate-200/60 dark:border-white/10 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span>Live web sources</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {msg.sources.map((src) => (
                            <a
                              key={src.uri}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline underline-offset-2 max-w-[260px] truncate"
                            >
                              <span className="truncate">{src.title}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.article>
                );
              })}
              <div ref={threadEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Composer Dock */}
      <div className="shrink-0 px-4 sm:px-6 pb-4 pt-2">
        <div className="max-w-3xl mx-auto space-y-2">
          {limitReached && (
            <div
              role="status"
              className="rounded-xl liquid-glass px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3"
            >
              <span>
                {!user
                  ? `Guest limit reached (${GUEST_DAILY_REQUEST_LIMIT} / ${GUEST_DAILY_REQUEST_LIMIT} requests today). Sign in to unlock ${SIGNED_IN_DAILY_REQUEST_LIMIT} requests/day.`
                  : `Daily limit reached (${dailyLimit} / ${dailyLimit} requests used today). Your free quota resets at midnight.`}
              </span>
              {!user && (
                <button
                  type="button"
                  onClick={() => onRequireAuth('general')}
                  className="px-3 py-1.5 rounded-lg liquid-glass-btn-primary text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  Sign in for {SIGNED_IN_DAILY_REQUEST_LIMIT}/day
                </button>
              )}
            </div>
          )}

          {attachmentError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200/80 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 backdrop-blur-md px-3.5 py-2 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2"
            >
              <span>{attachmentError}</span>
              <button
                type="button"
                onClick={() => setAttachmentError(null)}
                aria-label="Dismiss attachment error"
                className="p-1 hover:bg-red-100/70 dark:hover:bg-red-900/40 rounded-lg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {attachment && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl liquid-glass text-xs text-slate-700 dark:text-slate-200">
              {attachment.mimeType.startsWith('image/') ? (
                <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
              <span className="truncate max-w-[220px] font-medium">{attachment.name}</span>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                ({Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB)
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label={`Remove attachment ${attachment.name}`}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="rounded-2xl liquid-glass-composer p-2.5 sm:p-3">
            <label htmlFor="chat-prompt-input" className="sr-only">
              Message {activeModel.name}
            </label>
            <textarea
              id="chat-prompt-input"
              ref={textareaRef}
              rows={1}
              value={draft}
              disabled={limitReached}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                limitReached
                  ? !user
                    ? `Guest daily ${GUEST_DAILY_REQUEST_LIMIT}-request limit reached — sign in for ${SIGNED_IN_DAILY_REQUEST_LIMIT}/day`
                    : `Daily ${dailyLimit}-request limit reached for today`
                  : `Message ${activeModel.name}…`
              }
              className="w-full resize-none bg-transparent px-1.5 py-1 text-[15px] text-white placeholder:text-slate-400 focus:outline-none max-h-[180px] disabled:opacity-60"
            />

            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleAttachClick}
                  aria-label={user ? 'Attach file' : 'Attach file (sign in required)'}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/18 border border-white/18 text-xs font-medium text-white backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all duration-150 whitespace-nowrap shrink-0"
                >
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span>Attach</span>
                  {!user && <Lock className="w-3 h-3 text-slate-300 shrink-0" />}
                </button>

                <span className="hidden sm:inline text-xs text-slate-300/85 truncate tabular-nums">
                  {isOwner
                    ? `Owner · Full unlimited access · Up to ${MAX_FILE_SIZE_MB} MB uploads`
                    : hasUnlimitedAccess
                      ? `Unlimited access granted · Up to ${MAX_FILE_SIZE_MB} MB uploads`
                      : user
                        ? `Up to ${MAX_FILE_SIZE_MB} MB · ${remainingRequests} of ${dailyLimit} left today`
                        : `Sign in for uploads & ${SIGNED_IN_DAILY_REQUEST_LIMIT}/day · ${remainingRequests} of ${dailyLimit} left today`}
                </span>
              </div>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStopGenerating}
                  aria-label="Stop generation"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-black/80 hover:bg-black border border-white/30 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.34)] text-xs font-semibold whitespace-nowrap shrink-0 transition-all"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!draft.trim() || limitReached}
                  onClick={handleSubmit}
                  aria-label="Send message"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl liquid-glass-btn-primary text-white disabled:bg-white/10 disabled:border-white/12 disabled:text-slate-500 shrink-0 px-3.5"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
