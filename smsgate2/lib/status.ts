/**
 * @fileoverview Status helpers for mapping websocket errors to translation keys.
 */

/**
 * Map low-level websocket errors to translation keys.
 * @returns i18n key or undefined when no match.
 */
export function mapWsErrorKey(error?: string): string | undefined {
  if (!error) return undefined;
  const lower = error.toLowerCase();
  if (lower.includes("offline mode")) return "wsOfflineMode";
  if (lower.includes("websocket error")) return "wsErrorGeneric";
  if (lower.includes("failed to fetch") || lower.includes("network")) return "wsNetworkError";
  return undefined;
}
