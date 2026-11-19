import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  buildDailySeries,
  computeUsageSummary,
  exportUsageCsv,
  filterRecordsByRange,
  formatLatency,
  formatTokens,
  groupUsageByModel,
  type TimeRangeFilter,
  type UsageRecord,
} from '../lib/analytics';
import {
  AI_MODELS,
  GUEST_DAILY_REQUEST_LIMIT,
  MAX_FILE_SIZE_MB,
  MONTHLY_TOKEN_QUOTA,
  SIGNED_IN_DAILY_REQUEST_LIMIT,
} from '../lib/models';
import type { AuthGateReason } from '../types/chat';

interface AnalyticsDashboardProps {
  usageLogs: UsageRecord[];
  dailyLimit: number | null;
  onStartChat: () => void;
  onRequireAuth: (reason: AuthGateReason) => void;
}

export function AnalyticsDashboard({
  usageLogs,
  dailyLimit,
  onStartChat,
  onRequireAuth,
}: AnalyticsDashboardProps) {
  const { user, profile, isOwner, hasUnlimitedAccess } = useAuth();
  const [range, setRange] = useState<TimeRangeFilter>('7d');
  const [modelFilter, setModelFilter] = useState<string>('all');

  const filteredLogs = useMemo(
    () => filterRecordsByRange(usageLogs, range, modelFilter),
    [usageLogs, range, modelFilter],
  );

  // Compute daily request usage across all records for accurate 30/100/Unlimited quota display
  const allUsageSummary = useMemo(
    () => computeUsageSummary(usageLogs, dailyLimit),
    [usageLogs, dailyLimit],
  );

  const summary = useMemo(
    () => computeUsageSummary(filteredLogs, dailyLimit),
    [filteredLogs, dailyLimit],
  );

  const modelBreakdown = useMemo(
    () => groupUsageByModel(filteredLogs),
    [filteredLogs],
  );

  const dailySeries = useMemo(
    () => buildDailySeries(filteredLogs, range === '30d' ? 14 : 7),
    [filteredLogs, range],
  );

  const maxDailyTokens = Math.max(
    1,
    ...dailySeries.map((pt) => pt.tokens),
  );

  const handleExportCsv = () => {
    const csv = exportUsageCsv(filteredLogs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aetheris-usage-${range}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-6xl mx-auto space-y-6"
      >
        {/* Top Controls Row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Usage Analytics
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {isOwner
                ? `Owner full access active for ${profile?.displayName || user?.email || 'Workspace Owner'} · Unlimited requests`
                : hasUnlimitedAccess
                  ? `Unlimited request access granted for ${profile?.displayName || user?.email || 'your account'}`
                  : user
                    ? `Synced usage telemetry for ${profile?.displayName || user.displayName || 'your account'} · ${SIGNED_IN_DAILY_REQUEST_LIMIT} requests/day`
                    : `Local browser telemetry · ${GUEST_DAILY_REQUEST_LIMIT} guest requests/day · Sign in for ${SIGNED_IN_DAILY_REQUEST_LIMIT}/day & uploads`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented Range Filter */}
            <div
              role="group"
              aria-label="Time window filter"
              className="inline-flex items-center p-1 rounded-xl liquid-glass"
            >
              {(['24h', '7d', '30d'] as TimeRangeFilter[]).map((windowKey) => (
                <button
                  key={windowKey}
                  type="button"
                  onClick={() => setRange(windowKey)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 ${
                    range === windowKey
                      ? 'liquid-glass-btn-primary text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {windowKey === '24h' ? '24 Hours' : windowKey === '7d' ? '7 Days' : '30 Days'}
                </button>
              ))}
            </div>

            <label className="inline-block">
              <span className="sr-only">Filter by model</span>
              <select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl liquid-glass-btn text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Models</option>
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={handleExportCsv}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl liquid-glass-btn text-xs font-medium text-slate-800 dark:text-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Guest Sync Banner */}
        {!user && (
          <div className="rounded-2xl liquid-glass p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Browser session telemetry active
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Your prompts are tracked locally. Sign in when you want to upload files, unlock {SIGNED_IN_DAILY_REQUEST_LIMIT} requests/day, or sync threads across devices.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRequireAuth('upload')}
              className="min-h-[40px] px-4 py-2 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Sign in for uploads &amp; sync
            </button>
          </div>
        )}

        {/* 4-Column KPI Strip */}
        <section aria-label="Usage summary metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.02, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl liquid-glass p-5 space-y-3 hover:-translate-y-0.5 transition-transform duration-200"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Requests ({range})
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {summary.totalRequests}
              </span>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                {allUsageSummary.dailyLimit === null
                  ? `${allUsageSummary.todayRequests} today (Unlimited)`
                  : `${allUsageSummary.todayRequests} / ${allUsageSummary.dailyLimit} today`}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-900 dark:bg-white/85 transition-all duration-300"
                style={{ width: `${allUsageSummary.dailyQuotaUsedPct}%` }}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.07, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl liquid-glass p-5 space-y-3 hover:-translate-y-0.5 transition-transform duration-200"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tokens Processed
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatTokens(summary.totalTokens)}
              </span>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                {summary.monthlyTokenUsedPct}% of {formatTokens(MONTHLY_TOKEN_QUOTA)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-900 dark:bg-white/85 transition-all duration-300"
                style={{ width: `${summary.monthlyTokenUsedPct}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {formatTokens(summary.promptTokens)} in · {formatTokens(summary.completionTokens)} out
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl liquid-glass p-5 space-y-3 hover:-translate-y-0.5 transition-transform duration-200"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Average Latency
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatLatency(summary.avgLatencyMs)}
              </span>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                {summary.completedRequests} ok · {summary.errorRequests} err
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              End-to-end streaming response time
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.17, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl liquid-glass p-5 space-y-3 hover:-translate-y-0.5 transition-transform duration-200"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isOwner
                ? 'Owner Access'
                : hasUnlimitedAccess
                  ? 'Granted Unlimited'
                  : 'Daily Free Quota'}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {allUsageSummary.remainingDailyRequests === null
                  ? 'Unlimited'
                  : `${allUsageSummary.remainingDailyRequests} left`}
              </span>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                {MAX_FILE_SIZE_MB} MB max upload
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {isOwner
                ? 'Full workspace privileges active'
                : hasUnlimitedAccess
                  ? 'Unlimited daily requests granted by owner'
                  : 'Gemini 3.1 Flash Lite · Resets daily'}
            </div>
          </motion.div>
        </section>

        {/* Charts Row */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Daily Token Volume Chart */}
          <div className="lg:col-span-7 rounded-2xl liquid-glass p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Token Volume Over Time
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Daily token throughput across selected models
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Peak {formatTokens(maxDailyTokens === 1 && summary.totalTokens === 0 ? 0 : maxDailyTokens)}
              </span>
            </div>

            <div className="pt-2">
              <div
                className="grid gap-2 items-end h-44"
                style={{ gridTemplateColumns: `repeat(${dailySeries.length}, minmax(0, 1fr))` }}
              >
                {dailySeries.map((pt, idx) => {
                  const heightPct =
                    pt.tokens > 0 ? Math.max(8, Math.round((pt.tokens / maxDailyTokens) * 100)) : 4;
                  return (
                    <div
                      key={pt.dateKey}
                      className="flex flex-col items-center justify-end h-full gap-2 group"
                      title={`${pt.label}: ${pt.requests} requests · ${pt.tokens} tokens`}
                    >
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                        {formatTokens(pt.tokens)}
                      </span>
                      <div className="w-full flex-1 flex items-end">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPct}%` }}
                          transition={{
                            duration: 0.42,
                            delay: idx * 0.03,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className={`w-full rounded-t-lg transition-colors duration-200 ${
                            pt.tokens > 0
                              ? 'bg-slate-900/90 dark:bg-white/85 group-hover:bg-black dark:group-hover:bg-white'
                              : 'bg-slate-200/70 dark:bg-white/10'
                          }`}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full tabular-nums">
                        {pt.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Model Usage Breakdown */}
          <div className="lg:col-span-5 rounded-2xl liquid-glass p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Usage by Model
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Token share and latency per free model
              </p>
            </div>

            <div className="space-y-4 pt-1">
              {modelBreakdown.map((row) => (
                <div key={row.modelId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {row.modelName}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {row.requests} req · {formatTokens(row.totalTokens)} · {formatLatency(row.avgLatencyMs)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-slate-900 dark:bg-white/85 transition-all duration-300"
                      style={{ width: `${row.sharePct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Recent Requests Table */}
        <section className="rounded-2xl liquid-glass overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-white/10 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recent Requests Ledger
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Per-turn token consumption and response latency
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {filteredLogs.length} entries
            </span>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No requests recorded in this window yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Send a prompt in the chat workspace to see live token counts, model latency, and breakdown metrics appear here.
              </p>
              <button
                type="button"
                onClick={onStartChat}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl liquid-glass-btn-primary text-white text-xs font-semibold"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Start a Chat</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/60 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/35 dark:bg-white/5">
                    <th className="py-2.5 px-4">Model</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Prompt</th>
                    <th className="py-2.5 px-4 text-right">Output</th>
                    <th className="py-2.5 px-4 text-right">Total Tokens</th>
                    <th className="py-2.5 px-4 text-right">Latency</th>
                    <th className="py-2.5 px-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-white/8 text-xs">
                  {filteredLogs.slice(0, 20).map((log) => (
                    <tr
                      key={log.id}
                      className="h-10 hover:bg-white/45 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="py-2 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {log.modelLabel}
                        {log.hasAttachment && (
                          <span className="text-slate-500 dark:text-slate-400 font-normal"> · Attachment</span>
                        )}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        {log.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Completed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                        {log.promptTokens.toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                        {log.completionTokens.toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-right font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                        {log.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                        {formatLatency(log.latencyMs)}
                      </td>
                      <td className="py-2 px-4 text-right text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {new Date(log.createdAtMs).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </motion.div>
    </div>
  );
}
