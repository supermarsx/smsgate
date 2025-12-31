import { appConfig } from "./config";
import type { Session } from "./auth";

/**
 * Normalized HTTP error shape for API calls.
 */
export type HttpError = {
  status: number;
  message: string;
  code?: string;
};

/**
 * Fetch wrapper that injects auth headers and normalizes error responses.
 * @throws HttpError when the response is not ok.
 */
export async function http<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const traceId = crypto.randomUUID();
  const res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "x-correlation-id": traceId,
      ...(init.headers ?? {})
    },
    credentials: "include"
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: HttpError = {
      status: res.status,
      message: text || res.statusText,
      code: res.headers.get("x-error-code") ?? undefined
    };
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
