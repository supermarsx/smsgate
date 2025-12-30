import { appConfig } from "./config";
import { http } from "./http";
import type { Event } from "./contracts";
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

export async function updateEventState(
  session: Session,
  id: string,
  state: "claimed" | "verified" | "rejected"
): Promise<Event> {
  return http<Event>(session, `/events/${id}/state`, {
    method: "POST",
    body: JSON.stringify({ state })
  });
}

export async function listDevices(session: Session): Promise<any[]> {
  return http<any[]>(session, "/devices", { method: "GET" });
}

export async function updateDeviceName(session: Session, id: string, name: string): Promise<void> {
  await http<void>(session, `/devices/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

export async function listNumbers(session: Session): Promise<any[]> {
  return http<any[]>(session, "/numbers", { method: "GET" });
}

export async function createNumber(session: Session, payload: { e164: string; label?: string }): Promise<any> {
  return http(session, "/numbers", { method: "POST", body: JSON.stringify(payload) });
}

export async function assignNumber(
  session: Session,
  e164: string,
  payload: { userId?: string; deviceId?: string }
): Promise<void> {
  await http<void>(session, `/numbers/${encodeURIComponent(e164)}/assign`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function unassignNumber(session: Session, e164: string): Promise<void> {
  await http<void>(session, `/numbers/${encodeURIComponent(e164)}/assign`, { method: "DELETE" });
}

export async function listUsers(session: Session): Promise<any[]> {
  return http<any[]>(session, "/users", { method: "GET" });
}

export async function updateUserRole(session: Session, id: string, role: string): Promise<void> {
  await http<void>(session, `/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export async function forceLogoutUser(session: Session, id: string): Promise<void> {
  await http<void>(session, `/users/${id}/force-logout`, { method: "POST" });
}

export async function unlockUser(session: Session, id: string): Promise<void> {
  await http<void>(session, `/users/${id}/unlock`, { method: "POST" });
}

export async function fetchDiagnostics(session: Session, deviceId: string): Promise<any> {
  return http<any>(session, `/devices/${deviceId}/diagnostics`, { method: "GET" });
}

export async function fetchContacts(session: Session): Promise<any[]> {
  return http<any[]>(session, "/contacts", { method: "GET" });
}

export async function toggleContactSync(session: Session, enabled: boolean): Promise<void> {
  await http<void>(session, "/contacts/toggle", { method: "POST", body: JSON.stringify({ enabled }) });
}

export async function exportContacts(session: Session): Promise<Blob> {
  const res = await fetch(`${appConfig.apiBaseUrl}/contacts/export`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    },
    credentials: "include"
  });
  if (!res.ok) throw new Error("Failed to export contacts");
  return await res.blob();
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

export async function getPairingSession(session: Session, id: string): Promise<any> {
  return http<any>(session, `/pairing/session/${id}`, { method: "GET" });
}

export async function toggleDevice(
  session: Session,
  id: string,
  action: "enable" | "disable" | "rotate-token"
): Promise<void> {
  await http<void>(session, `/devices/${id}/${action}`, { method: "POST" });
}

export type ConfigPayload = {
  version: string;
  data: Record<string, unknown>;
};

export async function fetchConfig(
  session: Session,
  etag?: string
): Promise<{ config?: ConfigPayload; etag?: string; notModified: boolean }> {
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
