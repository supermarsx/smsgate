import { appConfig } from "./config";
import type { Session } from "./auth";

export type HttpError = {
  status: number;
  message: string;
  code?: string;
};

export async function http<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    credentials: "include"
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: HttpError = { status: res.status, message: text || res.statusText };
    // normalize a few common server error bodies
    try {
      const json = text ? JSON.parse(text) : null;
      if (json?.code) err.code = json.code;
      if (json?.message) err.message = json.message;
    } catch {
      // ignore parse errors
    }
    throw err;
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
