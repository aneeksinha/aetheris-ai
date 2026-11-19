import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { BarChart3, KeyRound, MailCheck, Menu, Moon, PanelLeftOpen, RefreshCw, Sun, UserCheck } from 'lucide-react';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AuthModal } from './components/AuthModal';
import { ChatWorkspace } from './components/ChatWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ModelSelector } from './components/ModelSelector';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { ProfileModal } from './components/ProfileModal';
import { Sidebar, type ActiveView } from './components/Sidebar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import {
  canMakeDailyRequest,
  countTodayRequests,
  loadGuestUsageLogs,
  saveGuestUsageLogs,
  type UsageRecord,
} from './lib/analytics';
import {
  getDailyRequestLimit,
  getModelSpec,
  GUEST_DAILY_REQUEST_LIMIT,
  SIGNED_IN_DAILY_REQUEST_LIMIT,
  type ModelId,
} from './lib/models';
import {
  appendChatMessage,
  createChatSession,
  deleteChatSession,
  loadChatMessages,
  makeSafeId,
  recordUsageLog,
  subscribeUserChats,
  subscribeUserUsageLogs,
  updateChatSummary,
} from './services/firestoreService';
import type {
  AuthGateReason,
  ChatMessage,
  ChatSession,
  GroundingSource,
  PendingAttachment,
} from './types/chat';

function AetherisApp() {
  const {
    user,
    profile,
    isEmailVerified,
    isOwner,
    hasUnlimitedAccess,
    authBusy,
    resendVerificationEmail,
    refreshVerificationStatus,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [verificationNote, setVerificationNote] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [selectedModelId, setSelectedModelId] = useState<ModelId>('flash-lite');
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<AuthGateReason>('general');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // Persisted Firestore lists (for verified signed-in users)
  const [savedChats, setSavedChats] = useState<ChatSession[]>([]);
  const [savedUsageLogs, setSavedUsageLogs] = useState<UsageRecord[]>([]);

  // Active conversation state (works openly for guests, syncs for verified signed-in users)
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Local browser telemetry used by guests & newly-registered unverified email accounts
  const [guestUsageLogs, setGuestUsageLogs] = useState<UsageRecord[]>(() =>
    loadGuestUsageLogs(),
  );

  const abortRef = useRef<AbortController | null>(null);
  const isCloudSynced = Boolean(user && isEmailVerified);

  useEffect(() => {
    if (!user || !isEmailVerified) {
      setSavedChats([]);
      setSavedUsageLogs([]);
      if (!user) {
        setActiveChatId(null);
      }
      return;
    }

    const unsubChats = subscribeUserChats(
      user.uid,
      (items) => setSavedChats(items),
      (err) => console.error('Chat history subscription error:', err),
    );
    const unsubLogs = subscribeUserUsageLogs(
      user.uid,
      (logs) => setSavedUsageLogs(logs),
      (err) => console.error('Usage log subscription error:', err),
    );

    return () => {
      unsubChats();
      unsubLogs();
    };
  }, [user, isEmailVerified]);

  const displayedUsageLogs = isCloudSynced ? savedUsageLogs : guestUsageLogs;
  const dailyLimit = getDailyRequestLimit(Boolean(user), hasUnlimitedAccess);
  const todayRequests = useMemo(
    () => countTodayRequests(displayedUsageLogs),
    [displayedUsageLogs],
  );

  const openAuthModal = (reason: AuthGateReason) => {
    setAuthModalReason(reason);
    setAuthModalOpen(true);
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setActiveChatId(null);
    setMessages([]);
  };

  const handleSelectChat = async (chatId: string) => {
    if (!user || !isCloudSynced) return;
    abortRef.current?.abort();
    setIsGenerating(false);
    setActiveChatId(chatId);
    setLoadingThread(true);
    try {
      const loaded = await loadChatMessages(chatId, user.uid);
      setMessages(loaded);
      const chatMeta = savedChats.find((c) => c.id === chatId);
      if (chatMeta) {
        setSelectedModelId(getModelSpec(chatMeta.modelId).id);
      }
    } catch (err) {
      console.error('Failed to load chat thread:', err);
    } finally {
      setLoadingThread(false);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!user || !isCloudSynced) return;
    await deleteChatSession(chatId, user.uid);
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
    }
  };

  const runCompletion = async (
    historyForRequest: ChatMessage[],
    assistantMessageId: string,
    chatIdForPersistence: string | null,
    attachment?: PendingAttachment,
    pendingUserWrite: Promise<void> = Promise.resolve(),
  ) => {
    const modelSpec = getModelSpec(selectedModelId);
    const startedAt = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let latencyMs = 0;
    let sources: GroundingSource[] | undefined;
    let respondedBy: string | undefined;
    let status: 'completed' | 'error' = 'completed';

    const isTransientError = (message: string) =>
      /high demand|unavailable|503|timed out|longer than|temporar|overloaded/i.test(message);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (user) {
        const idToken = await user.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const now = new Date();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const localDateTime = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });

      const requestBody = JSON.stringify({
        modelId: selectedModelId,
        messages: historyForRequest.slice(-8).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        attachment: attachment
          ? {
              name: attachment.name,
              mimeType: attachment.mimeType,
              dataBase64: attachment.dataBase64,
              textContent: attachment.textContent,
            }
          : undefined,
        clientContext: {
          isoNow: now.toISOString(),
          timeZone,
          localDateTime,
        },
      });

      for (let clientAttempt = 0; clientAttempt < 2; clientAttempt++) {
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: requestBody,
          });

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(errBody.error || `Server error (${response.status})`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Response stream unavailable.');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const frame of lines) {
              const dataLine = frame
                .split('\n')
                .find((l) => l.startsWith('data: '));
              if (!dataLine) continue;

              const payload = JSON.parse(dataLine.slice(6)) as {
                type: 'chunk' | 'done' | 'error';
                text?: string;
                respondedBy?: string;
                promptTokens?: number;
                completionTokens?: number;
                totalTokens?: number;
                latencyMs?: number;
                sources?: GroundingSource[];
                message?: string;
              };

              if (payload.type === 'chunk' && payload.text) {
                fullText += payload.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: fullText }
                      : m,
                  ),
                );
              } else if (payload.type === 'done') {
                promptTokens = payload.promptTokens || 0;
                completionTokens = payload.completionTokens || 0;
                totalTokens = payload.totalTokens || promptTokens + completionTokens;
                latencyMs = payload.latencyMs || Math.max(1, Date.now() - startedAt);
                sources = Array.isArray(payload.sources) && payload.sources.length > 0
                  ? payload.sources
                  : undefined;
                respondedBy = payload.respondedBy;
              } else if (payload.type === 'error') {
                throw new Error(payload.message || 'Model generation failed.');
              }
            }
          }
          break;
        } catch (attemptErr) {
          if (
            (attemptErr as Error)?.name === 'AbortError' ||
            clientAttempt === 1 ||
            fullText.length > 0 ||
            !(attemptErr instanceof Error && isTransientError(attemptErr.message))
          ) {
            throw attemptErr;
          }
          await new Promise((resolve) => setTimeout(resolve, 900));
          if (controller.signal.aborted) {
            throw attemptErr;
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        latencyMs = Math.max(1, Date.now() - startedAt);
        if (!fullText) {
          fullText = 'Generation stopped.';
        }
      } else {
        status = 'error';
        latencyMs = Math.max(1, Date.now() - startedAt);
        const msg = err instanceof Error ? err.message : 'Unable to complete response.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: msg,
                  isStreaming: false,
                  isError: true,
                  latencyMs,
                }
              : m,
          ),
        );
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }

    if (status === 'completed') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: fullText || 'No text returned by model.',
                tokens: totalTokens,
                latencyMs,
                sources,
                respondedBy,
                isStreaming: false,
              }
            : m,
        ),
      );
    }

    const usageEntry: UsageRecord = {
      id: makeSafeId('log'),
      modelId: selectedModelId,
      modelLabel: modelSpec.name,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      hasAttachment: Boolean(attachment),
      status,
      createdAtMs: Date.now(),
    };

    if (user && isCloudSynced) {
      void recordUsageLog({
        userId: user.uid,
        modelId: selectedModelId,
        modelLabel: modelSpec.name,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs,
        hasAttachment: Boolean(attachment),
        status,
      });

      if (chatIdForPersistence && status === 'completed') {
        await pendingUserWrite.catch((err) =>
          console.error('Background user turn persistence failed:', err),
        );
        const existingTokens = historyForRequest.reduce((acc, m) => acc + (m.tokens || 0), 0);
        await appendChatMessage({
          chatId: chatIdForPersistence,
          messageId: assistantMessageId,
          userId: user.uid,
          role: 'assistant',
          content: fullText || 'No text returned by model.',
          modelId: selectedModelId,
          tokens: totalTokens,
          latencyMs,
        });
        await updateChatSummary({
          chatId: chatIdForPersistence,
          modelId: selectedModelId,
          messageCount: historyForRequest.length + 1,
          totalTokens: existingTokens + totalTokens,
        });
      }
    } else {
      setGuestUsageLogs((prev) => {
        const next = [usageEntry, ...prev].slice(0, 200);
        saveGuestUsageLogs(next);
        return next;
      });
    }
  };

  const handleSendMessage = async (
    text: string,
    attachment?: PendingAttachment,
  ) => {
    if (attachment && !user) {
      openAuthModal('upload');
      return;
    }

    const quotaCheck = canMakeDailyRequest(displayedUsageLogs, dailyLimit);
    if (!quotaCheck.allowed) {
      const limitMsg: ChatMessage = {
        id: makeSafeId('msg'),
        role: 'assistant',
        content: !user
          ? `Guest daily limit of ${GUEST_DAILY_REQUEST_LIMIT} requests reached for today. Sign in with Google or Apple to unlock ${SIGNED_IN_DAILY_REQUEST_LIMIT} requests/day, file uploads, and synced history.`
          : `Daily limit of ${dailyLimit} requests reached for today. Your free quota resets at midnight.`,
        modelId: selectedModelId,
        tokens: 0,
        latencyMs: 0,
        createdAtMs: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, limitMsg]);
      return;
    }

    const userMsgId = makeSafeId('msg');
    const assistantMsgId = makeSafeId('msg');

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      modelId: selectedModelId,
      tokens: 0,
      latencyMs: 0,
      attachmentName: attachment?.name,
      attachmentType: attachment?.mimeType,
      createdAtMs: Date.now(),
    };

    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      modelId: selectedModelId,
      tokens: 0,
      latencyMs: 0,
      createdAtMs: Date.now(),
      isStreaming: true,
    };

    const nextHistoryForApi = [...messages, userMessage];
    setMessages([...nextHistoryForApi, assistantPlaceholder]);

    let targetChatId = activeChatId;
    let pendingUserWrite: Promise<void> = Promise.resolve();
    if (user && isCloudSynced) {
      const isNewChat = !targetChatId;
      if (!targetChatId) {
        targetChatId = makeSafeId('chat');
        setActiveChatId(targetChatId);
      }
      const resolvedChatId = targetChatId;
      pendingUserWrite = (async () => {
        if (isNewChat) {
          await createChatSession({
            chatId: resolvedChatId,
            userId: user.uid,
            title: text.slice(0, 72),
            modelId: selectedModelId,
          });
        }
        await appendChatMessage({
          chatId: resolvedChatId,
          messageId: userMsgId,
          userId: user.uid,
          role: 'user',
          content: text,
          modelId: selectedModelId,
          tokens: 0,
          latencyMs: 0,
          attachmentName: attachment?.name,
          attachmentType: attachment?.mimeType,
        });
      })();
    }

    await runCompletion(
      nextHistoryForApi,
      assistantMsgId,
      targetChatId,
      attachment,
      pendingUserWrite,
    );
  };

  const handleRetryLast = async () => {
    if (isGenerating || messages.length < 2) return;
    const quotaCheck = canMakeDailyRequest(displayedUsageLogs, dailyLimit);
    if (!quotaCheck.allowed) return;

    const lastUserIndex = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIndex === -1) return;
    const sliceEnd = messages.length - lastUserIndex;
    const historyUpToLastUser = messages.slice(0, sliceEnd);
    const assistantMsgId = makeSafeId('msg');

    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      modelId: selectedModelId,
      tokens: 0,
      latencyMs: 0,
      createdAtMs: Date.now(),
      isStreaming: true,
    };

    setMessages([...historyUpToLastUser, assistantPlaceholder]);
    await runCompletion(historyUpToLastUser, assistantMsgId, activeChatId);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-screen w-full overflow-hidden liquid-stage text-slate-900 dark:text-slate-100">
        <Sidebar
          activeView={activeView}
          onChangeView={setActiveView}
          chats={savedChats}
          activeChatId={activeChatId}
          todayRequests={todayRequests}
          dailyLimit={dailyLimit}
          onNewChat={handleNewChat}
          onSelectChat={(id) => void handleSelectChat(id)}
          onDeleteChat={(id) => void handleDeleteChat(id)}
          onOpenAuth={openAuthModal}
          onOpenProfile={() => setProfileModalOpen(true)}
          onOpenPrivacy={() => setPrivacyModalOpen(true)}
          desktopOpen={desktopSidebarOpen}
          onCloseDesktop={() => setDesktopSidebarOpen(false)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* Top Header Bar (Single Row, Liquid Glass 3-Zone Contract) */}
          <header className="h-14 shrink-0 px-3 sm:px-6 liquid-glass border-x-0 border-t-0 rounded-none flex items-center justify-between gap-4 relative z-20">
            <div className="flex items-center gap-2.5 min-w-0">
              {!desktopSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setDesktopSidebarOpen(true)}
                  aria-label="Open navigation sidebar"
                  title="Open sidebar"
                  className="hidden md:inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl liquid-glass-btn text-slate-600 dark:text-slate-300 shrink-0"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open navigation menu"
                className="md:hidden min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl liquid-glass-btn text-slate-600 dark:text-slate-300 shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>

              {activeView === 'chat' ? (
                <ModelSelector
                  selectedModelId={selectedModelId}
                  dailyLimit={dailyLimit}
                  onSelectModel={setSelectedModelId}
                  disabled={isGenerating}
                />
              ) : (
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  <span className="sm:hidden">Analytics</span>
                  <span className="hidden sm:inline">Workspace / Usage Analytics</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setActiveView(activeView === 'chat' ? 'dashboard' : 'chat')
                }
                className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-xl liquid-glass-btn text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span>{activeView === 'chat' ? 'Usage Analytics' : 'Back to Chat'}</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl liquid-glass-btn text-slate-600 dark:text-slate-300 shrink-0"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {isOwner && (
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(true)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Unlimited Access</span>
                  <span className="sm:hidden">Owner</span>
                </button>
              )}

              {user ? (
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(true)}
                  aria-label="Open account profile"
                  className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl liquid-glass-btn text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
                >
                  <UserCheck className="w-3.5 h-3.5 text-slate-900 dark:text-slate-100 shrink-0" />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {profile?.displayName || user.displayName || 'Account'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openAuthModal('general')}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  Sign In
                </button>
              )}
            </div>
          </header>

          {/* Email Verification Bar for Newly Registered Email/Password Users */}
          {user && !isEmailVerified && (
            <div className="shrink-0 px-4 sm:px-6 py-2 bg-blue-50/85 dark:bg-blue-950/45 border-b border-blue-200/70 dark:border-blue-500/20 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <MailCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate">
                  {verificationNote ||
                    `Verify ${user.email || 'your email'} to activate cloud history sync.`}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => {
                    void resendVerificationEmail().then((sent) => {
                      setVerificationNote(
                        sent
                          ? `Verification link sent to ${user.email || 'your email'}.`
                          : 'Could not resend verification email right now.',
                      );
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg liquid-glass-btn font-medium text-slate-800 dark:text-slate-100 disabled:opacity-60"
                >
                  Resend link
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => {
                    void refreshVerificationStatus().then((verified) => {
                      setVerificationNote(
                        verified
                          ? null
                          : 'Not verified yet — click the link in your inbox, then check again.',
                      );
                    });
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg liquid-glass-btn-primary text-white font-semibold disabled:opacity-60"
                >
                  <RefreshCw className={`w-3 h-3 ${authBusy ? 'animate-spin' : ''}`} />
                  <span>I verified</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Active Viewport with Smooth View Transition */}
          <main className="flex-1 min-h-0 flex flex-col relative">
            <AnimatePresence mode="wait">
              {activeView === 'chat' ? (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="flex-1 min-h-0 flex flex-col"
                >
                  <ChatWorkspace
                    messages={messages}
                    selectedModelId={selectedModelId}
                    todayRequests={todayRequests}
                    dailyLimit={dailyLimit}
                    isGenerating={isGenerating}
                    onSendMessage={(text, att) => void handleSendMessage(text, att)}
                    onStopGenerating={() => abortRef.current?.abort()}
                    onRetryLast={() => void handleRetryLast()}
                    onRequireAuth={openAuthModal}
                    loadingThread={loadingThread}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="flex-1 min-h-0 flex flex-col"
                >
                  <AnalyticsDashboard
                    usageLogs={displayedUsageLogs}
                    dailyLimit={dailyLimit}
                    onStartChat={() => setActiveView('chat')}
                    onRequireAuth={openAuthModal}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>

        <AuthModal
          open={authModalOpen}
          reason={authModalReason}
          onClose={() => setAuthModalOpen(false)}
          onOpenPrivacy={() => setPrivacyModalOpen(true)}
        />

        <ProfileModal
          open={profileModalOpen}
          todayRequests={todayRequests}
          dailyLimit={dailyLimit}
          onClose={() => setProfileModalOpen(false)}
          onRequireAuth={openAuthModal}
          onOpenPrivacy={() => setPrivacyModalOpen(true)}
        />

        <PrivacyPolicyModal
          open={privacyModalOpen}
          onClose={() => setPrivacyModalOpen(false)}
        />
      </div>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AetherisApp />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
