const LIVE_SEARCH_PATTERN =
  /\b(news|headline|headlines|weather|forecast|temperature|aqi|humidity|price|prices|stock|stocks|share|shares|crypto|bitcoin|btc|eth|ethereum|usd|inr|eur|exchange rate|forex|gold|silver|score|scores|match|matches|tournament|ipl|world cup|olympics|election|elections|president|prime minister|chancellor|ceo|minister|latest|newest|recent|recently|breaking|trending|live|currently|live updates|recent updates|released|release date|schedule|upcoming|standings|who won|what happened|search the web|look up|google|http|https|www\.|202[5-9])\b/i;

const EXPLICIT_SEARCH_WITH_FILE_PATTERN =
  /\b(search the web|look up online|latest news|current price|verify online)\b/i;

/**
 * Determines whether a turn benefits from Google Search grounding.
 * Casual greetings, coding/debugging prompts, and static explanations skip the
 * external search tool for lower latency and higher upstream reliability,
 * while always retaining real-time clock/timezone context in systemInstruction.
 */
export function shouldEnableLiveSearch(
  userPrompt: string,
  hasAttachment = false,
): boolean {
  const trimmed = userPrompt.trim();
  if (!trimmed || trimmed.length < 6) {
    return false;
  }

  if (hasAttachment) {
    return EXPLICIT_SEARCH_WITH_FILE_PATTERN.test(trimmed);
  }

  return LIVE_SEARCH_PATTERN.test(trimmed);
}
