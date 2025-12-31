/**
 * Schema validation helpers for config editor.
 */

export type ConfigLike = Record<string, unknown>;

type IssueCollector = (msg: string) => void;

const isObject = (val: unknown): val is Record<string, unknown> => !!val && typeof val === "object" && !Array.isArray(val);

function ensureBoolean(obj: Record<string, unknown>, key: string, issues: IssueCollector) {
  if (typeof obj[key] !== "boolean") issues(`${key} must be boolean`);
}

function ensureNumber(obj: Record<string, unknown>, key: string, issues: IssueCollector, opts?: { min?: number }) {
  if (obj[key] === undefined) return;
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) issues(`${key} must be a number`);
  else if (opts?.min !== undefined && (obj[key] as number) < opts.min) issues(`${key} must be >= ${opts.min}`);
}

function ensureStringArray(val: unknown, label: string, issues: IssueCollector) {
  if (!Array.isArray(val)) {
    issues(`${label} must be an array`);
    return;
  }
  if (!val.every((item) => typeof item === "string" && item.trim().length > 0)) {
    issues(`${label} must contain non-empty strings`);
  }
}

/**
 * Validate config shape and important leaf types; returns a list of issues.
 */
export function validateConfigShape(parsed: ConfigLike): string[] {
  const issues: string[] = [];
  const add: IssueCollector = (msg) => issues.push(msg);

  if (!isObject(parsed)) {
    issues.push("Config must be a JSON object");
    return issues;
  }

  // Auth modes
  if (!isObject(parsed.authModes)) add("authModes missing or not an object");
  if (isObject(parsed.authModes)) {
    ensureBoolean(parsed.authModes, "oauth", add);
    ensureBoolean(parsed.authModes, "simpleSignin", add);
    ensureBoolean(parsed.authModes, "domainSignin", add);
  }

  // Presence / WS
  if (!isObject(parsed.presence)) add("presence missing or not an object");
  if (isObject(parsed.presence)) {
    ensureNumber(parsed.presence, "snapshotSize", add, { min: 1 });
    ensureNumber(parsed.presence, "pingMs", add, { min: 1000 });
    ensureNumber(parsed.presence, "pageSize", add, { min: 1 });
    ensureNumber(parsed.presence, "maxConnections", add, { min: 1 });
    ensureNumber(parsed.presence, "maxStaleMs", add, { min: 1000 });
    ensureNumber(parsed.presence, "degradedMs", add, { min: 1000 });
    ensureNumber(parsed.presence, "queueWarn", add, { min: 0 });
    ensureNumber(parsed.presence, "queueCrit", add, { min: 0 });
  }

  // Retention
  if (!isObject(parsed.retention)) add("retention missing or not an object");

  // Roles
  if (parsed.roles !== undefined) {
    if (!isObject(parsed.roles)) add("roles must be an object when provided");
    if (isObject(parsed.roles) && parsed.roles.order !== undefined) {
      ensureStringArray(parsed.roles.order, "roles.order", add);
    }
    if (isObject(parsed.roles) && parsed.roles.labels !== undefined) {
      if (!isObject(parsed.roles.labels)) add("roles.labels must be an object when provided");
    }
  }

  // smsrelay3 policies (relay)
  if (parsed.relay !== undefined && !isObject(parsed.relay)) add("relay must be an object when provided");
  if (parsed.smsrelay3 !== undefined && !isObject(parsed.smsrelay3)) add("smsrelay3 must be an object when provided");

  // Contacts
  if (parsed.contacts !== undefined && !isObject(parsed.contacts)) add("contacts must be an object when provided");

  return issues;
}
