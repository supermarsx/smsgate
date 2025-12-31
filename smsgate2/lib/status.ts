/**
 * Map low-level websocket errors to translation keys.
 */
export function mapWsErrorKey(error?: string): string | undefined {
  if (!error) return undefined;
  const lower = error.toLowerCase();
  if (lower.includes("offline mode")) return "wsOfflineMode";
  if (lower.includes("websocket error")) return "wsErrorGeneric";
  if (lower.includes("failed to fetch") || lower.includes("network")) return "wsNetworkError";
  return undefined;
}
