export type ModelId = 'flash-lite';

export const GUEST_DAILY_REQUEST_LIMIT = 30;
export const SIGNED_IN_DAILY_REQUEST_LIMIT = 100;
export const DAILY_REQUEST_LIMIT = SIGNED_IN_DAILY_REQUEST_LIMIT;
export const MONTHLY_TOKEN_QUOTA = 500_000;
export const MAX_FILE_SIZE_MB = 15;
export const OWNER_EMAIL = 'aneeksinha52@gmail.com';

export interface AIModelSpec {
  id: ModelId;
  name: string;
  shortName: string;
  apiModel: 'gemini-3.1-flash-lite';
  profile: string;
  contextWindow: string;
  description: string;
  latencyTarget: string;
  supportsAttachments: boolean;
  liveSearchEnabled: boolean;
}

export const AI_MODELS: AIModelSpec[] = [
  {
    id: 'flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    shortName: 'Flash Lite',
    apiModel: 'gemini-3.1-flash-lite',
    profile: 'Instant · Live Web',
    contextWindow: '1M context',
    description:
      'Tuned for rapid, accurate everyday reasoning, clean code, vision/PDF analysis, and live Google Search grounding.',
    latencyTarget: '~0.6s',
    supportsAttachments: true,
    liveSearchEnabled: true,
  },
];

export function getModelSpec(_id: string): AIModelSpec {
  return AI_MODELS[0];
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function emailToGrantId(rawEmail: string): string {
  const normalized = normalizeEmail(rawEmail);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const slug =
    normalized
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'user';
  return `grant_${slug}_${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function isOwnerEmail(
  email: string | null | undefined,
  emailVerified: boolean = true,
): boolean {
  if (!emailVerified || !email) return false;
  return normalizeEmail(email) === OWNER_EMAIL;
}

export function getDailyRequestLimit(
  isSignedIn: boolean,
  hasUnlimitedAccess: boolean = false,
): number | null {
  if (isSignedIn && hasUnlimitedAccess) return null;
  return isSignedIn ? SIGNED_IN_DAILY_REQUEST_LIMIT : GUEST_DAILY_REQUEST_LIMIT;
}
