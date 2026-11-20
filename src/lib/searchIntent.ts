const LIVE_SEARCH_PATTERN =
  /\b(news|headline|headlines|weather|forecast|temperature|aqi|humidity|price|prices|stock|stocks|share|shares|crypto|bitcoin|btc|eth|ethereum|usd|inr|eur|exchange rate|forex|gold|silver|score|scores|match|matches|tournament|ipl|world cup|champions league|super bowl|nba|nfl|fifa|olympics|election|elections|president|prime minister|chancellor|ceo|minister|latest|newest|recent|recently|breaking|trending|live|currently|right now|today|this week|this month|this year|live updates|recent updates|released|release date|schedule|upcoming|standings|who won|what happened|who is|current|search the web|look up|google|http|https|www\.|202[5-9])\b/i;

const EXPLICIT_SEARCH_WITH_FILE_PATTERN =
  /\b(search the web|look up online|latest news|current price|verify online)\b/i;

const TRIVIAL_GREETING_PATTERN =
  /^(hi|hello|hey|yo|sup|good morning|good evening|good afternoon|thanks|thank you|thx|ok|okay|bye|goodbye)[!.,?\s]*$/i;

/**
 * Built-in smart Google Search detection for Gemini 3.1 Flash Lite:
 * Automatically activates Google Search grounding for real-world, live, and current-event
 * questions while keeping greetings, coding, and static explanations fast without search overhead.
 */
export function shouldEnableLiveSearch(
  userPrompt: string,
  hasAttachment = false,
): boolean {
  const trimmed = userPrompt.trim();
  if (trimmed.length < 4 || TRIVIAL_GREETING_PATTERN.test(trimmed)) {
    return false;
  }

  if (hasAttachment) {
    return EXPLICIT_SEARCH_WITH_FILE_PATTERN.test(trimmed);
  }

  return LIVE_SEARCH_PATTERN.test(trimmed);
}
