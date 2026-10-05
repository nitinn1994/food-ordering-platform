// The /search page's recent searches (docs/features/mcdelivery-parity/
// requirements.md AC8): the last few, most recent first, kept only in this
// browser. Storage can be missing or throw (private windows, blocked site
// data), so every access is guarded and a failure just means "none".
export const RECENT_SEARCHES_KEY = "quickserve.recentSearches";
export const MAX_RECENT_SEARCHES = 5;
const MAX_QUERY_LENGTH = 60;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentSearches(): string[] {
  try {
    const raw = storage()?.getItem(RECENT_SEARCHES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // Only ever our own shape; anything else stored there is ignored.
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

function write(entries: readonly string[]): void {
  try {
    storage()?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries));
  } catch {
    // Not saved; the page still works.
  }
}

// Moves the query to the front (case-insensitively unique) and trims the
// list. Returns the new list.
export function addRecentSearch(query: string): string[] {
  const entry = query.trim().slice(0, MAX_QUERY_LENGTH);
  const current = readRecentSearches();
  if (entry === "") return current;
  const next = [
    entry,
    ...current.filter((existing) => existing.toLowerCase() !== entry.toLowerCase()),
  ].slice(0, MAX_RECENT_SEARCHES);
  write(next);
  return next;
}

export function clearRecentSearches(): void {
  try {
    storage()?.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Nothing to clear.
  }
}
