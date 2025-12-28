import { appConfig } from "./config";
import { http } from "./http";
import type { Event, PresenceUpdate } from "./contracts";
import type { Session } from "./auth";

type ListEventsParams = {
  before?: string;
  limit?: number;
};

export async function listEvents(session: Session, params: ListEventsParams = {}): Promise<Event[]> {
  const url = new URL(`${appConfig.apiBaseUrl}/events`);
  if (params.before) url.searchParams.set("before", params.before);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  const data = await http<{ events?: Event[] } | Event[]>(session, url.pathname + url.search, {
    method: "GET"
  });
  if (Array.isArray((data as any).events)) return (data as any).events as Event[];
  if (Array.isArray(data)) return data as Event[];
  return [];
}

export async function listDevices(session: Session): Promise<any[]> {
  return http<any[]>(session, "/devices", { method: "GET" });
}

export async function listNumbers(session: Session): Promise<any[]> {
  return http<any[]>(session, "/numbers", { method: "GET" });
}

export async function listUsers(session: Session): Promise<any[]> {
  return http<any[]>(session, "/users", { method: "GET" });
}

export async function getAudit(session: Session): Promise<any[]> {
  return http<any[]>(session, "/audit", { method: "GET" });
}

export async function getLoginEvents(session: Session): Promise<any[]> {
  return http<any[]>(session, "/login-events", { method: "GET" });
}

export async function createPairingSession(session: Session): Promise<any> {
  return http(session, "/pairing/session", { method: "POST", body: JSON.stringify({}) });
}

export async function toggleDevice(session: Session, id: string, action: "enable" | "disable" | "rotate-token"): Promise<void> {
  await http<void>(session, `/devices/${id}/${action}`, { method: "POST" });
}

export type ConfigPayload = {
  version: string;
  data: Record<string, unknown>;
};

export async function fetchConfig(session: Session, etag?: string): Promise<{ config?: ConfigPayload; etag?: string; notModified: boolean }> {
  const res = await fetch(`${appConfig.apiBaseUrl}/config`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "If-None-Match": etag ?? ""
    },
    credentials: "include"
  });
  if (res.status === 304) return { notModified: true };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Config fetch failed: ${res.status}`);
  }
  const nextEtag = res.headers.get("ETag") ?? undefined;
  const config = (await res.json()) as ConfigPayload;
  return { config, etag: nextEtag, notModified: false };
}

export async function updateConfig(session: Session, payload: ConfigPayload, etag?: string): Promise<ConfigPayload> {
  return http<ConfigPayload>(session, "/config", {
    method: "PATCH",
    headers: {
      ...(etag ? { "If-Match": etag } : {})
    },
    body: JSON.stringify(payload)
  });
}
