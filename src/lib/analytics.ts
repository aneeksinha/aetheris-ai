import {
  AI_MODELS,
  getModelSpec,
  MONTHLY_TOKEN_QUOTA,
  SIGNED_IN_DAILY_REQUEST_LIMIT,
  type ModelId,
} from './models';

export interface UsageRecord {
  id: string;
  modelId: string;
  modelLabel: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  hasAttachment: boolean;
  status: 'completed' | 'error';
  createdAtMs: number;
}

export type TimeRangeFilter = '24h' | '7d' | '30d';

export interface UsageSummary {
  totalRequests: number;
  completedRequests: number;
  errorRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  dailyQuotaUsedPct: number;
  monthlyTokenUsedPct: number;
  todayRequests: number;
  dailyLimit: number | null;
  remainingDailyRequests: number | null;
}

export interface ModelBreakdownRow {
  modelId: ModelId;
  modelName: string;
  requests: number;
  totalTokens: number;
  avgLatencyMs: number;
  sharePct: number;
}

export interface DailySeriesPoint {
  label: string;
  dateKey: string;
  requests: number;
  tokens: number;
}

export function countTodayRequests(
  records: UsageRecord[],
  nowMs: number = Date.now(),
): number {
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayMs = startOfDay.getTime();
  let count = 0;
  for (const rec of records) {
    if (rec.status === 'completed' && rec.createdAtMs >= startOfDayMs) {
      count += 1;
    }
  }
  return count;
}

export function canMakeDailyRequest(
  records: UsageRecord[],
  dailyLimit: number | null = SIGNED_IN_DAILY_REQUEST_LIMIT,
  nowMs: number = Date.now(),
): { allowed: boolean; todayRequests: number; remaining: number | null } {
  const todayRequests = countTodayRequests(records, nowMs);
  if (dailyLimit === null) {
    return {
      allowed: true,
      todayRequests,
      remaining: null,
    };
  }
  const remaining = Math.max(0, dailyLimit - todayRequests);
  return {
    allowed: todayRequests < dailyLimit,
    todayRequests,
    remaining,
  };
}

export function filterRecordsByRange(
  records: UsageRecord[],
  range: TimeRangeFilter,
  modelFilter: string,
  nowMs: number = Date.now(),
): UsageRecord[] {
  const windowMs =
    range === '24h'
      ? 24 * 60 * 60 * 1000
      : range === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

  const cutoff = nowMs - windowMs;
  return records.filter((rec) => {
    if (rec.createdAtMs < cutoff) return false;
    if (modelFilter !== 'all' && rec.modelId !== modelFilter) return false;
    return true;
  });
}

export function computeUsageSummary(
  records: UsageRecord[],
  dailyLimit: number | null = SIGNED_IN_DAILY_REQUEST_LIMIT,
  nowMs: number = Date.now(),
): UsageSummary {
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayMs = startOfDay.getTime();

  let completedRequests = 0;
  let errorRequests = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let latencySum = 0;
  let todayRequests = 0;

  for (const rec of records) {
    if (rec.status === 'completed') {
      completedRequests += 1;
      latencySum += rec.latencyMs;
      if (rec.createdAtMs >= startOfDayMs) {
        todayRequests += 1;
      }
    } else {
      errorRequests += 1;
    }
    promptTokens += rec.promptTokens;
    completionTokens += rec.completionTokens;
    totalTokens += rec.totalTokens;
  }

  const totalRequests = records.length;
  const avgLatencyMs = completedRequests > 0 ? Math.round(latencySum / completedRequests) : 0;
  const dailyQuotaUsedPct =
    dailyLimit && dailyLimit > 0
      ? Math.min(100, Math.round((todayRequests / dailyLimit) * 100))
      : 0;
  const monthlyTokenUsedPct = Math.min(
    100,
    Math.round((totalTokens / MONTHLY_TOKEN_QUOTA) * 100),
  );
  const remainingDailyRequests =
    dailyLimit === null ? null : Math.max(0, dailyLimit - todayRequests);

  return {
    totalRequests,
    completedRequests,
    errorRequests,
    promptTokens,
    completionTokens,
    totalTokens,
    avgLatencyMs,
    dailyQuotaUsedPct,
    monthlyTokenUsedPct,
    todayRequests,
    dailyLimit,
    remainingDailyRequests,
  };
}

export function groupUsageByModel(records: UsageRecord[]): ModelBreakdownRow[] {
  const totalTokensAll = records.reduce((acc, r) => acc + r.totalTokens, 0);
  const map = new Map<ModelId, { requests: number; tokens: number; latencySum: number; completed: number }>();

  for (const model of AI_MODELS) {
    map.set(model.id, { requests: 0, tokens: 0, latencySum: 0, completed: 0 });
  }

  for (const rec of records) {
    const spec = getModelSpec(rec.modelId);
    const current = map.get(spec.id) ?? { requests: 0, tokens: 0, latencySum: 0, completed: 0 };
    current.requests += 1;
    current.tokens += rec.totalTokens;
    if (rec.status === 'completed') {
      current.latencySum += rec.latencyMs;
      current.completed += 1;
    }
    map.set(spec.id, current);
  }

  return AI_MODELS.map((m) => {
    const entry = map.get(m.id)!;
    return {
      modelId: m.id,
      modelName: m.name,
      requests: entry.requests,
      totalTokens: entry.tokens,
      avgLatencyMs: entry.completed > 0 ? Math.round(entry.latencySum / entry.completed) : 0,
      sharePct: totalTokensAll > 0 ? Math.round((entry.tokens / totalTokensAll) * 100) : 0,
    };
  });
}

export function buildDailySeries(
  records: UsageRecord[],
  days: number = 7,
  nowMs: number = Date.now(),
): DailySeriesPoint[] {
  const buckets = new Map<string, DailySeriesPoint>();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * dayMs);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets.set(dateKey, { label, dateKey, requests: 0, tokens: 0 });
  }

  for (const rec of records) {
    const d = new Date(rec.createdAtMs);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = buckets.get(dateKey);
    if (bucket) {
      bucket.requests += 1;
      bucket.tokens += rec.totalTokens;
    }
  }

  return Array.from(buckets.values());
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatLatency(ms: number): string {
  if (ms <= 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

export function exportUsageCsv(records: UsageRecord[]): string {
  const header = 'Timestamp,Model,Status,Prompt Tokens,Completion Tokens,Total Tokens,Latency (ms),Attachment';
  const rows = records.map((r) => {
    const iso = new Date(r.createdAtMs).toISOString();
    const safeLabel = `"${r.modelLabel.replace(/"/g, '""')}"`;
    return [
      iso,
      safeLabel,
      r.status,
      r.promptTokens,
      r.completionTokens,
      r.totalTokens,
      r.latencyMs,
      r.hasAttachment ? 'Yes' : 'No',
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

const ALLOWED_ATTACHMENT_MIME_PREFIXES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/'];
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css'];

export interface AttachmentValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateAttachment(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  maxFileSizeMb: number,
): AttachmentValidationResult {
  const maxBytes = maxFileSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      reason: `File exceeds the ${maxFileSizeMb} MB upload limit.`,
    };
  }
  const lowerName = fileName.toLowerCase();
  const mimeOk = ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
  const extOk = ALLOWED_ATTACHMENT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!mimeOk && !extOk) {
    return {
      valid: false,
      reason: 'Unsupported file type. Attach PNG, JPEG, WebP, PDF, or text/code files.',
    };
  }
  return { valid: true };
}

const GUEST_USAGE_STORAGE_KEY = 'aetheris_guest_usage_v1';

export function loadGuestUsageLogs(): UsageRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_USAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 200) as UsageRecord[];
  } catch {
    return [];
  }
}

export function saveGuestUsageLogs(records: UsageRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      GUEST_USAGE_STORAGE_KEY,
      JSON.stringify(records.slice(0, 200)),
    );
  } catch {
    // Ignore storage quota issues
  }
}
