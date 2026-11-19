import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  History,
  Lock,
  LogIn,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GUEST_DAILY_REQUEST_LIMIT, SIGNED_IN_DAILY_REQUEST_LIMIT } from '../lib/models';
import type { AuthGateReason, ChatSession } from '../types/chat';

export type ActiveView = 'chat' | 'dashboard';

interface SidebarProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  chats: ChatSession[];
  activeChatId: string | null;
  todayRequests: number;
  dailyLimit: number | null;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onOpenAuth: (reason: AuthGateReason) => void;
  onOpenProfile: () => void;
  onOpenPrivacy: () => void;
  desktopOpen: boolean;
  onCloseDesktop: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeView,
  onChangeView,
  chats,
  activeChatId,
  todayRequests,
  dailyLimit,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenAuth,
  onOpenProfile,
  onOpenPrivacy,
  desktopOpen,
  onCloseDesktop,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { user, profile, isOwner, hasUnlimitedAccess, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = searchQuery.trim()
    ? chats.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : chats;

  const sidebarBody = (
    <div className="flex flex-col h-full w-[268px] liquid-glass border-y-0 border-l-0 rounded-none select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200/60 dark:border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => {
            onChangeView('chat');
            onCloseMobile();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 transition-opacity hover:opacity-80"
        >
          Aetheris
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCloseDesktop}
            aria-label="Collapse navigation sidebar"
            title="Collapse sidebar"
            className="hidden md:inline-flex p-2 -mr-1.5 rounded-xl liquid-glass-btn text-slate-600 dark:text-slate-300"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation sidebar"
            className="md:hidden p-2 -mr-2 rounded-xl liquid-glass-btn text-slate-600 dark:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="p-3 space-y-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onChangeView('chat');
            onCloseMobile();
          }}
          className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl liquid-glass-btn-primary text-white text-sm font-medium whitespace-nowrap"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>New Chat</span>
        </button>

        <nav aria-label="Workspace sections" className="pt-1 space-y-1">
          <button
            type="button"
            onClick={() => {
              onChangeView('chat');
              onCloseMobile();
            }}
            className={`w-full min-h-[40px] flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              activeView === 'chat'
                ? 'liquid-glass-btn text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/45 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>Chat Workspace</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeView('dashboard');
              onCloseMobile();
            }}
            className={`w-full min-h-[40px] flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              activeView === 'dashboard'
                ? 'liquid-glass-btn text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/45 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>Usage Analytics</span>
          </button>
        </nav>
      </div>

      {/* Chat History Area */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-slate-200/60 dark:border-white/10">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Chat History
          </span>
          {user && (
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {chats.length}
            </span>
          )}
        </div>

        {!user ? (
          <div className="px-3 py-2">
            <div className="rounded-2xl liquid-glass p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Sign in for uploads &amp; history</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Guests get {GUEST_DAILY_REQUEST_LIMIT} requests/day. Sign in to unlock {SIGNED_IN_DAILY_REQUEST_LIMIT}/day, uploads, and synced history.
              </p>
              <button
                type="button"
                onClick={() => onOpenAuth('history')}
                className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-btn text-xs font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap"
              >
                <History className="w-3.5 h-3.5 shrink-0" />
                <span>Sign in to sync history</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-3 pb-2">
              <label className="relative block">
                <span className="sr-only">Search chat history</span>
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search threads..."
                  className="w-full pl-8 pr-2.5 py-2 text-xs rounded-xl liquid-glass text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
              {filteredChats.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  {chats.length === 0
                    ? 'Your saved conversations will appear here.'
                    : 'No matching conversations.'}
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const isActive = chat.id === activeChatId && activeView === 'chat';
                  return (
                    <div
                      key={chat.id}
                      className={`group flex items-center gap-1 rounded-xl transition-all duration-150 ${
                        isActive
                          ? 'liquid-glass-btn'
                          : 'hover:bg-white/45 dark:hover:bg-white/5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectChat(chat.id);
                          onChangeView('chat');
                          onCloseMobile();
                        }}
                        className="flex-1 min-w-0 text-left px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 truncate"
                      >
                        {chat.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteChat(chat.id)}
                        aria-label={`Delete '${chat.title}'`}
                        className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Account Footer */}
      <div className="p-3 border-t border-slate-200/60 dark:border-white/10 shrink-0 space-y-2">
        <div className="px-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          <span>Daily requests</span>
          <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
            {dailyLimit === null ? `${todayRequests} · Unlimited` : `${todayRequests} / ${dailyLimit}`}
          </span>
        </div>

        {user ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onOpenProfile();
                onCloseMobile();
              }}
              aria-label="Open account details"
              className="min-w-0 flex-1 text-left px-3 py-2 rounded-xl liquid-glass-btn"
            >
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {profile?.displayName || user.displayName || 'Member'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isOwner
                  ? 'Owner · Manage unlimited emails'
                  : hasUnlimitedAccess
                    ? 'Unlimited access granted'
                    : 'Uploads & history synced'}
              </div>
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl liquid-glass-btn text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenAuth('general')}
            className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl liquid-glass-btn text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5 shrink-0" />
            <span>Sign in</span>
          </button>
        )}
        <div className="px-2 pt-0.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => {
              onOpenPrivacy();
              onCloseMobile();
            }}
            className="hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-2 transition-colors"
          >
            Privacy Policy
          </button>
          <span>
            {isOwner
              ? 'Owner · Unlimited'
              : hasUnlimitedAccess
                ? 'Granted · Unlimited'
                : user
                  ? `Signed in · ${SIGNED_IN_DAILY_REQUEST_LIMIT}/day`
                  : `Guest · ${GUEST_DAILY_REQUEST_LIMIT}/day`}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop collapsible sidebar */}
      <AnimatePresence initial={false}>
        {desktopOpen && (
          <motion.aside
            key="desktop-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 268, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="hidden md:flex shrink-0 h-full overflow-hidden"
          >
            {sidebarBody}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile slide-over drawer with smooth transitions */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={onCloseMobile}
              aria-hidden="true"
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -272 }}
              animate={{ x: 0 }}
              exit={{ x: -272 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 h-full"
            >
              {sidebarBody}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
