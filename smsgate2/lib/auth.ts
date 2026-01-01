/**
 * @fileoverview Authentication helpers for smsgate2 UI (sessions, OAuth, PKCE, storage).
 */

import { appConfig, wsUrl } from "./config";
import { enqueueSmtpJob, smtpEnabled } from "./smtp-service";
import type { Locale } from "./i18n";

/**
 * Application role identifier. Server supplies concrete role values.
 */
export type Role = string;

/**
 * Authenticated user payload attached to a session.
 */
export type SessionUser = {
  id: string;
  name: string;
  email?: string;
  role: Role;
  authMode: "oauth" | "simple_signin" | "domain_signin";
  locale?: Locale;
  requires2fa?: boolean;
  requiresPasswordChange?: boolean;
  numbers?: string[];
};

/**
 * Session token container persisted locally and sent to the API/WS.
 */
export type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user: SessionUser;
};

const STORAGE_KEY = "smsgate2_session_v1";
const CODE_VERIFIER_KEY = "smsgate2_pkce_verifier";

// NOTE: Client-side session encryption key. In a real deployment this should
// be configured per-environment rather than hardcoded.
const SESSION_CRYPT_SECRET = "smsgate2_ui_session_secret_v1";
const SESSION_CRYPT_SALT = new TextEncoder().encode("smsgate2_session_salt_v1");

async function getSessionCryptoKey(): Promise<CryptoKey> {
  if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
    throw new Error("Web Crypto not available");
  }
  const enc = new TextEncoder();
  const secretKeyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(SESSION_CRYPT_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SESSION_CRYPT_SALT,
      iterations: 100_000,
      hash: "SHA-256"
    },
    secretKeyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof window === "undefined") {
    return "";
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof window === "undefined") {
    return new Uint8Array();
  }
  const binary = window.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encryptSession(session: Session): Promise<string> {
  const key = await getSessionCryptoKey();
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify(session));
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.byteLength);
  return bytesToBase64(combined);
}

async function decryptSession(stored: string): Promise<Session | null> {
  try {
    const key = await getSessionCryptoKey();
    const combined = base64ToBytes(stored);
    if (combined.byteLength <= 12) return null;
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const dec = new TextDecoder();
    const json = dec.decode(new Uint8Array(decrypted));
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
}

type SignInResult = { session?: Session; requires2fa?: boolean; error?: string };
type PasswordChangeResult = {
  session?: Session;
  error?: string;
  requires2fa?: boolean;
  requiresPasswordChange?: boolean;
};

/**
 * Internal helper for JSON API calls with common headers.
 * @returns Parsed JSON response.
 * @throws Error when the response is not ok.
 */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    credentials: "include"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Persist a session to storage or clear it when null.
 * @param session Session to save; null clears both storage scopes.
 * @param persistent When true use localStorage, else sessionStorage.
 * @returns Promise<void>
 */
export async function saveSession(session: Session | null, persistent = true): Promise<void> {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  const target = persistent ? window.localStorage : window.sessionStorage;
  const encrypted = await encryptSession(session);
  target.setItem(STORAGE_KEY, encrypted);
}

/**
 * Load a session from sessionStorage or localStorage.
 * @returns Session when present; null otherwise.
 */
export async function loadSession(): Promise<Session | null> {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return decryptSession(raw);
}

/**
 * Remove any stored session data from both storage scopes.
 * @returns void
 */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Ask the backend to send a password reset email when SMTP is enabled.
 * @returns Result indicating whether the request was accepted.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message?: string }> {
  if (!smtpEnabled()) {
    return { ok: false, message: "SMTP disabled in configuration" };
  }
  try {
    await enqueueSmtpJob(() =>
      apiFetch<void>("/auth/password/reset-request", { method: "POST", body: JSON.stringify({ email }) })
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * Update a password using a reset token or the current password.
 * @returns Result of the password change attempt.
 */
export async function changePassword(payload: {
  token?: string;
  username?: string;
  currentPassword?: string;
  newPassword: string;
  mfaCode?: string;
}): Promise<PasswordChangeResult> {
  try {
    const data = await apiFetch<PasswordChangeResult>("/auth/password/change", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (data.session) saveSession(data.session, true);
    return data;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * Username/password login flow.
 * @returns Sign-in result including session or required actions.
 */
export async function loginSimple(
  username: string,
  password: string,
  _mfaCode?: string
): Promise<SignInResult & { requiresPasswordChange?: boolean; passwordChangeToken?: string }> {
  try {
    const res = await apiFetch<any>("/api/v1/auth/simple_signin", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    if (res.requiresPasswordChange) {
      return { requiresPasswordChange: true, passwordChangeToken: res.passwordChangeToken };
    }
    const session = normalizeSession(res, "simple_signin");
    if (session) saveSession(session, true);
    return { session };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * Domain login flow for AD/LDAP style auth.
 * @returns Sign-in result including session or required actions.
 */
export async function loginDomain(
  username: string,
  password: string,
  domain?: string,
  _mfaCode?: string
): Promise<SignInResult & { requiresPasswordChange?: boolean; passwordChangeToken?: string }> {
  try {
    const res = await apiFetch<any>("/api/v1/auth/domain_signin", {
      method: "POST",
      body: JSON.stringify({ username, password, domain })
    });
    if (res.requiresPasswordChange) {
      return { requiresPasswordChange: true, passwordChangeToken: res.passwordChangeToken };
    }
    const session = normalizeSession(res, "domain_signin");
    if (session) saveSession(session, true);
    return { session };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * Refresh an expiring session using a refresh token.
 * @returns Fresh session or null when refresh fails.
 */
export async function refreshSession(refreshToken: string): Promise<Session | null> {
  try {
    const data = await apiFetch<any>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ session_token: refreshToken })
    });
    const session = normalizeSession(data, "simple_signin");
    if (session) saveSession(session, true);
    return session ?? null;
  } catch {
    clearSession();
    return null;
  }
}

/**
 * Clear local state and best-effort notify the backend of logout.
 * @returns void
 */
export async function logout(): Promise<void> {
  try {
    const session = loadSession();
    await apiFetch<void>("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ session_token: session?.accessToken })
    });
  } catch {
    // ignore client-side logout failure
  }
  clearSession();
}

function normalizeSession(res: any, mode: SessionUser["authMode"]): Session | undefined {
  if (res?.session) return res.session as Session;
  if (res?.session_token && res?.user_id && res?.role && res?.expires_at) {
    return {
      accessToken: res.session_token,
      refreshToken: res.refresh_token ?? res.session_token,
      expiresAt: Date.parse(res.expires_at),
      user: {
        id: res.user_id,
        name: res.user_id,
        email: res.user_id,
        role: res.role,
        authMode: mode
      }
    };
  }
  return undefined;
}

/**
 * Build the OAuth authorization URL with PKCE challenge and persisted verifier.
 * @param redirectUri Where the IdP should return the user.
 * @param clientId OAuth client identifier (defaults to smsgate2-ui).
 * @returns Fully-qualified authorization URL.
 */
export async function buildOAuthAuthorizeUrl(redirectUri: string, clientId = "smsgate2-ui"): Promise<string> {
  const state = crypto.randomUUID();
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  window.localStorage.setItem(CODE_VERIFIER_KEY, verifier);

  const url = new URL("/auth/oauth/authorize", appConfig.apiBaseUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email offline_access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Exchange an OAuth code for a session using the stored PKCE verifier.
 * @returns Session when exchange succeeds, otherwise null/throws.
 */
export async function exchangeOAuthCode(code: string, redirectUri: string): Promise<Session | null> {
  const verifier = window.localStorage.getItem(CODE_VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier");
  try {
    const data = await apiFetch<{ session: Session }>("/auth/oauth/callback", {
      method: "POST",
      body: JSON.stringify({ code, redirectUri, codeVerifier: verifier })
    });
    if (data.session) saveSession(data.session, true);
    window.localStorage.removeItem(CODE_VERIFIER_KEY);
    return data.session;
  } catch (err) {
    throw new Error((err as Error).message);
  }
}

/**
 * Create a random hex PKCE verifier.
 * @returns PKCE verifier string.
 */
function generateCodeVerifier(): string {
  const array = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute the PKCE S256 challenge for a verifier.
 * @returns URL-safe base64 encoded SHA-256 hash.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  if (crypto?.subtle && typeof crypto.subtle.digest === "function") {
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(buffer));
  }
  throw new Error("Unable to generate PKCE challenge");
}

/**
 * Convert bytes to URL-safe base64 string.
 * @returns URL-safe base64.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * True when a session is within the expiration threshold.
 * @returns Whether the session expires within the threshold.
 */
export function sessionExpiresSoon(session: Session, thresholdMs = 60_000): boolean {
  return session.expiresAt - Date.now() < thresholdMs;
}

/**
 * Compose headers for websocket auth handshakes.
 * @returns Header map including Authorization and role metadata.
 */
export function wsAuthHeaders(session: Session | null): Record<string, string> {
  if (!session) return {};
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Role": session.user.role,
    "X-Client": "smsgate2",
    "X-WS-Endpoint": wsUrl()
  };
}
