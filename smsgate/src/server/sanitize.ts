/** Maximum metadata entries accepted per message. */
const MAX_METADATA_ENTRIES = 20;

/**
 * Escapes angle brackets and caps length to avoid oversized payloads.
 */
export function sanitizeStr(input: string): string {
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 500);
}

/**
 * Normalizes optional metadata into a flat string map with safe keys/values.
 */
export function sanitizeMetadata(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const entries = Object.entries(input as Record<string, unknown>).slice(0, MAX_METADATA_ENTRIES);
  const output: Record<string, string> = {};

  for (const [rawKey, rawValue] of entries) {
    const key = sanitizeStr(String(rawKey)).trim();
    if (!key) continue;
    if (rawValue === null || rawValue === undefined) continue;
    const value = sanitizeStr(String(rawValue)).trim();
    if (!value) continue;
    output[key] = value;
  }

  return Object.keys(output).length ? output : undefined;
}
