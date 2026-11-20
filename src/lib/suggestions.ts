export interface StarterPrompt {
  id: string;
  title: string;
  prompt: string;
}

export const STARTER_PROMPT_POOL: StarterPrompt[] = [
  {
    id: 'live-headlines',
    title: 'Check today’s live context',
    prompt: 'What is today’s exact date and day of the week, and what are the top technology headlines today?',
  },
  {
    id: 'optimistic-ui',
    title: 'Explain an architecture tradeoff',
    prompt: 'Compare optimistic UI updates vs. server-confirmed writes for a collaborative task app in 4 concise bullets.',
  },
  {
    id: 'react-debounce',
    title: 'Write clean TypeScript',
    prompt: 'Write a type-safe debounce hook in React 19 with cleanup on unmount and an example usage.',
  },
  {
    id: 'postgres-seq-scan',
    title: 'Debug SQL query performance',
    prompt: 'Why would a PostgreSQL query with an index on created_at still do a sequential scan, and how do I diagnose it?',
  },
  {
    id: 'live-space-news',
    title: 'Explore recent space missions',
    prompt: 'What are the most notable upcoming or recent orbital spaceflight launches this month?',
  },
  {
    id: 'ai-hardware-trends',
    title: 'Survey current AI hardware',
    prompt: 'Summarize the latest breakthroughs in consumer AI laptops and edge NPU chips released recently.',
  },
  {
    id: 'rate-limiter-design',
    title: 'Design an API rate limiter',
    prompt: 'Compare token bucket vs. sliding window log rate limiting in Redis and show a clean TypeScript pseudocode sketch.',
  },
  {
    id: 'css-grid-subgrid',
    title: 'Master responsive CSS layout',
    prompt: 'When should I use CSS Subgrid instead of nested Flexbox for aligned card footers across variable-height content?',
  },
  {
    id: 'memory-leak-hunt',
    title: 'Track down browser leaks',
    prompt: 'Give a practical 5-step checklist to find and fix detached DOM node memory leaks in a single-page React app.',
  },
  {
    id: 'live-currency-context',
    title: 'Check live market rates',
    prompt: 'What is the current USD to EUR and USD to INR exchange rate right now, and what moved markets today?',
  },
  {
    id: 'science-fusion',
    title: 'Catch up on clean energy',
    prompt: 'What major milestones have fusion energy startups or national labs announced in the past year?',
  },
  {
    id: 'jwt-vs-sessions',
    title: 'Compare auth session models',
    prompt: 'When are opaque server-side sessions safer than stateless JWTs in a multi-tab web application?',
  },
  {
    id: 'study-plan',
    title: 'Build a focused study sprint',
    prompt: 'Create a realistic 7-day evening study plan to learn distributed systems fundamentals from scratch.',
  },
  {
    id: 'git-bisect',
    title: 'Debug regressions faster',
    prompt: 'Explain how to automate git bisect with a test script to pinpoint the exact commit that broke a unit test.',
  },
  {
    id: 'web-vitals',
    title: 'Improve Interaction to Next Paint',
    prompt: 'What are the fastest ways to cut high INP latency caused by heavy client-side markdown rendering?',
  },
  {
    id: 'live-climate-weather',
    title: 'Check real-time weather',
    prompt: 'What is the current weather forecast in Tokyo and London today?',
  },
  {
    id: 'oauth-pkce',
    title: 'Harden OAuth2 flows',
    prompt: 'Walk through why OAuth 2.1 requires PKCE even for confidential clients and how the code verifier works.',
  },
  {
    id: 'python-asyncio',
    title: 'Avoid async bottlenecks',
    prompt: 'Show a common mistake that blocks Python’s asyncio event loop and how to offload CPU-bound work properly.',
  },
  {
    id: 'product-spec',
    title: 'Draft a crisp feature brief',
    prompt: 'Help me structure a 1-page technical design doc covering goals, non-goals, failure modes, and rollout metrics.',
  },
  {
    id: 'open-source-release',
    title: 'Plan semantic versioning',
    prompt: 'Explain practical rules for bumping major, minor, and patch versions in a TypeScript library without breaking users.',
  },
];

/**
 * Picks `count` distinct starter prompts using Fisher-Yates shuffle.
 * Passing an explicit `randomFn` makes unit testing deterministic.
 */
export function pickStarterPrompts(
  count = 4,
  pool: StarterPrompt[] = STARTER_PROMPT_POOL,
  randomFn: () => number = Math.random,
): StarterPrompt[] {
  if (count <= 0 || pool.length === 0) return [];
  const copy = [...pool];
  const limit = Math.min(count, copy.length);

  for (let i = 0; i < limit; i++) {
    const remaining = copy.length - i;
    const raw = randomFn();
    const clamped = Number.isFinite(raw) ? Math.min(0.999999999, Math.max(0, raw)) : 0;
    const swapIndex = i + Math.floor(clamped * remaining);
    const tmp = copy[i];
    copy[i] = copy[swapIndex];
    copy[swapIndex] = tmp;
  }

  return copy.slice(0, limit);
}
