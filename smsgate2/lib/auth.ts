import { appConfig, wsUrl } from "./config";
import type { Locale } from "./i18n";

export type Role = "viewer" | "verifier" | "manager" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  email?: string;
  role: Role;
  authMode: "oauth" | "simple_signin" | "domain_signin";
  locale?: Locale;
  requires2fa?: boolean;
  numbers?: string[];
};

export type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user: SessionUser;
};

const STORAGE_KEY = "smsgate2_session_v1";
const CODE_VERIFIER_KEY = "smsgate2_pkce_verifier";

type SignInResult = { session?: Session; requires2fa?: boolean; error?: string };

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

export function saveSession(session: Session | null, persistent = true): void {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const target = persistent ? window.localStorage : window.sessionStorage;
  target.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export async function loginSimple(username: string, password: string, mfaCode?: string): Promise<SignInResult> {
  try {
    const data = await apiFetch<SignInResult>("/auth/simple_signin", {
      method: "POST",
      body: JSON.stringify({ username, password, mfaCode })
    });
    if (data.session) saveSession(data.session, true);
    return data;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function loginDomain(
  username: string,
  password: string,
  domain?: string,
  mfaCode?: string
): Promise<SignInResult> {
  try {
    const data = await apiFetch<SignInResult>("/auth/domain_signin", {
      method: "POST",
      body: JSON.stringify({ username, password, domain, mfaCode })
    });
    if (data.session) saveSession(data.session, true);
    return data;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function refreshSession(refreshToken: string): Promise<Session | null> {
  try {
    const data = await apiFetch<{ session: Session }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    });
    if (data.session) saveSession(data.session, true);
    return data.session;
  } catch {
    clearSession();
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<void>("/auth/logout", { method: "POST" });
  } catch {
    // ignore client-side logout failure
  }
  clearSession();
}

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

function generateCodeVerifier(): string {
  const array = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  if (crypto?.subtle && typeof crypto.subtle.digest === "function") {
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(buffer));
  }
  try {
    const nodeCrypto = await import("node:crypto");
    const hash = nodeCrypto.createHash("sha256").update(data).digest("base64");
    return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    throw new Error("Unable to generate PKCE challenge");
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sessionExpiresSoon(session: Session, thresholdMs = 60_000): boolean {
  return session.expiresAt - Date.now() < thresholdMs;
}

export function wsAuthHeaders(session: Session | null): Record<string, string> {
  if (!session) return {};
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Role": session.user.role,
    "X-Client": "smsgate2",
    "X-WS-Endpoint": wsUrl()
  };
}
