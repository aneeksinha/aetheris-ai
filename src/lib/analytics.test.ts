import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailySeries,
  canMakeDailyRequest,
  computeUsageSummary,
  countTodayRequests,
  exportUsageCsv,
  filterRecordsByRange,
  formatLatency,
  formatTokens,
  groupUsageByModel,
  validateAttachment,
  type UsageRecord,
} from './analytics';
import {
  emailToGrantId,
  getDailyRequestLimit,
  getModelSpec,
  GUEST_DAILY_REQUEST_LIMIT,
  isOwnerEmail,
  MAX_FILE_SIZE_MB,
  normalizeEmail,
  SIGNED_IN_DAILY_REQUEST_LIMIT,
} from './models';

const NOW = new Date('2026-11-18T12:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SAMPLE_RECORDS: UsageRecord[] = [
  {
    id: 'u1',
    modelId: 'flash-lite',
    modelLabel: 'Gemini 3.1 Flash Lite',
    promptTokens: 200,
    completionTokens: 400,
    totalTokens: 600,
    latencyMs: 650,
    hasAttachment: false,
    status: 'completed',
    createdAtMs: NOW - 2 * HOUR,
  },
  {
    id: 'u2',
    modelId: 'hydrogen-fast',
    modelLabel: 'Hydrogen 4 · Fast',
    promptTokens: 500,
    completionTokens: 1500,
    totalTokens: 2000,
    latencyMs: 920,
    hasAttachment: true,
    status: 'completed',
    createdAtMs: NOW - 2 * DAY,
  },
  {
    id: 'u3',
    modelId: 'flash-lite',
    modelLabel: 'Gemini 3.1 Flash Lite',
    promptTokens: 100,
    completionTokens: 100,
    totalTokens: 200,
    latencyMs: 0,
    hasAttachment: false,
    status: 'error',
    createdAtMs: NOW - 10 * DAY,
  },
];

test('role-based daily limits give 30 for guests, 100 for signed-in users, and unlimited for owner or granted emails', () => {
  assert.equal(getDailyRequestLimit(false, false), 30);
  assert.equal(getDailyRequestLimit(false, true), 30);
  assert.equal(getDailyRequestLimit(true, false), 100);
  assert.equal(getDailyRequestLimit(true, true), null);

  assert.equal(isOwnerEmail('aneeksinha52@gmail.com', true), true);
  assert.equal(isOwnerEmail('AneekSinha52@gmail.com ', true), true);
  assert.equal(isOwnerEmail('aneeksinha52@gmail.com', false), false);
  assert.equal(isOwnerEmail('other@gmail.com', true), false);

  assert.equal(normalizeEmail(' Friend@Gmail.COM '), 'friend@gmail.com');
  const idA = emailToGrantId('Friend@Gmail.com');
  const idB = emailToGrantId('  friend@gmail.com  ');
  const idC = emailToGrantId('other@gmail.com');
  assert.equal(idA, idB);
  assert.notEqual(idA, idC);
  assert.match(idA, /^[a-zA-Z0-9_-]{1,128}$/);
});

test('computeUsageSummary aggregates totals, averages, and dynamic daily quota accurately', () => {
  const guestSummary = computeUsageSummary(SAMPLE_RECORDS, GUEST_DAILY_REQUEST_LIMIT, NOW);
  assert.equal(guestSummary.todayRequests, 1);
  assert.equal(guestSummary.dailyLimit, 30);
  assert.equal(guestSummary.remainingDailyRequests, 29);

  const signedInSummary = computeUsageSummary(SAMPLE_RECORDS, SIGNED_IN_DAILY_REQUEST_LIMIT, NOW);
  assert.equal(signedInSummary.totalRequests, 3);
  assert.equal(signedInSummary.completedRequests, 2);
  assert.equal(signedInSummary.errorRequests, 1);
  assert.equal(signedInSummary.avgLatencyMs, 785);
  assert.equal(signedInSummary.dailyLimit, 100);
  assert.equal(signedInSummary.remainingDailyRequests, 99);

  const ownerSummary = computeUsageSummary(SAMPLE_RECORDS, null, NOW);
  assert.equal(ownerSummary.dailyLimit, null);
  assert.equal(ownerSummary.remainingDailyRequests, null);
});

test('canMakeDailyRequest enforces 30 guest, 100 signed-in, and unlimited owner limits', () => {
  const makeRecords = (count: number): UsageRecord[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `req_${i}`,
      modelId: 'flash-lite',
      modelLabel: 'Gemini 3.1 Flash Lite',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      latencyMs: 500,
      hasAttachment: false,
      status: 'completed',
      createdAtMs: NOW - 1000 * i,
    }));

  const thirtyToday = makeRecords(30);
  assert.equal(countTodayRequests(thirtyToday, NOW), 30);
  assert.equal(canMakeDailyRequest(thirtyToday, GUEST_DAILY_REQUEST_LIMIT, NOW).allowed, false);
  assert.equal(canMakeDailyRequest(thirtyToday, SIGNED_IN_DAILY_REQUEST_LIMIT, NOW).allowed, true);
  assert.equal(canMakeDailyRequest(thirtyToday, SIGNED_IN_DAILY_REQUEST_LIMIT, NOW).remaining, 70);

  const hundredToday = makeRecords(100);
  assert.equal(canMakeDailyRequest(hundredToday, SIGNED_IN_DAILY_REQUEST_LIMIT, NOW).allowed, false);
  assert.equal(canMakeDailyRequest(hundredToday, null, NOW).allowed, true);
  assert.equal(canMakeDailyRequest(hundredToday, null, NOW).remaining, null);
});

test('getModelSpec routes all requests cleanly to Gemini 3.1 Flash Lite', () => {
  assert.equal(getModelSpec('flash-lite').id, 'flash-lite');
  assert.equal(getModelSpec('flash-lite').apiModel, 'gemini-3.1-flash-lite');
  assert.equal(getModelSpec('hydrogen-fast').id, 'flash-lite');
  assert.equal(getModelSpec('unknown').id, 'flash-lite');
});

test('filterRecordsByRange and groupUsageByModel roll up records into Flash Lite', () => {
  const last24h = filterRecordsByRange(SAMPLE_RECORDS, '24h', 'all', NOW);
  assert.equal(last24h.length, 1);
  assert.equal(last24h[0].id, 'u1');

  const breakdown = groupUsageByModel(SAMPLE_RECORDS);
  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0].modelId, 'flash-lite');
  assert.equal(breakdown[0].requests, 3);
  assert.equal(breakdown[0].totalTokens, 2800);
  assert.equal(breakdown[0].sharePct, 100);
});

test('buildDailySeries builds contiguous day buckets', () => {
  const series = buildDailySeries(SAMPLE_RECORDS, 7, NOW);
  assert.equal(series.length, 7);
  const totalRequestsIn7Days = series.reduce((acc, p) => acc + p.requests, 0);
  assert.equal(totalRequestsIn7Days, 2);
});

test('formatTokens, formatLatency, and exportUsageCsv produce expected strings', () => {
  assert.equal(formatTokens(450), '450');
  assert.equal(formatTokens(12500), '12.5k');
  assert.equal(formatTokens(1_500_000), '1.50M');
  assert.equal(formatLatency(0), '—');
  assert.equal(formatLatency(420), '420ms');
  assert.equal(formatLatency(1450), '1.45s');

  const csv = exportUsageCsv([SAMPLE_RECORDS[0]]);
  assert.ok(csv.includes('Timestamp,Model,Status'));
  assert.ok(csv.includes('"Gemini 3.1 Flash Lite",completed,200,400,600,650,No'));
});

test('validateAttachment enforces size limits and file types', () => {
  assert.equal(validateAttachment('notes.md', 'text/markdown', 1024, MAX_FILE_SIZE_MB).valid, true);
  assert.equal(validateAttachment('diagram.png', 'image/png', 1024, MAX_FILE_SIZE_MB).valid, true);
  assert.equal(
    validateAttachment('huge.pdf', 'application/pdf', 20 * 1024 * 1024, MAX_FILE_SIZE_MB).valid,
    false,
  );
  assert.equal(
    validateAttachment('binary.exe', 'application/x-msdownload', 1024, MAX_FILE_SIZE_MB).valid,
    false,
  );
});
