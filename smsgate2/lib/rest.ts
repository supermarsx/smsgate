import { appConfig } from "./config";
import { http } from "./http";
import type { Event } from "./contracts";
import type { Session } from "./auth";

/**
 * Optional paging parameters for listing events.
 */
type ListEventsParams = {
  before?: string;
  limit?: number;
};

/**
 * Fetch events with optional cursor and limit.
 */
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

/**
 * Update the state of an event (claimed/verified/rejected).
 */
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

/**
 * Retrieve devices for the authenticated user.
 */
export async function listDevices(session: Session): Promise<any[]> {
  return http<any[]>(session, "/devices", { method: "GET" });
}

/**
 * Update a device friendly name.
 */
export async function updateDeviceName(session: Session, id: string, name: string): Promise<void> {
  await http<void>(session, `/devices/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

/**
 * Retrieve provisioned numbers.
 */
export async function listNumbers(session: Session): Promise<any[]> {
  return http<any[]>(session, "/numbers", { method: "GET" });
}

/**
 * Create a new number entry with optional label.
 */
export async function createNumber(session: Session, payload: { e164: string; label?: string }): Promise<any> {
  return http(session, "/numbers", { method: "POST", body: JSON.stringify(payload) });
}

/**
 * Assign a number to a user or device.
 */
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

/**
 * Remove number assignment.
 */
export async function unassignNumber(session: Session, e164: string): Promise<void> {
  await http<void>(session, `/numbers/${encodeURIComponent(e164)}/assign`, { method: "DELETE" });
}

/**
 * Update number metadata.
 */
export async function updateNumber(
  session: Session,
  e164: string,
  payload: { label?: string; shared?: boolean; defaultDeviceId?: string | null }
): Promise<void> {
  await http<void>(session, `/numbers/${encodeURIComponent(e164)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

/**
 * Delete a number entry.
 */
export async function deleteNumber(session: Session, e164: string): Promise<void> {
  await http<void>(session, `/numbers/${encodeURIComponent(e164)}`, { method: "DELETE" });
}

/**
 * Fetch users list.
 */
export async function listUsers(session: Session): Promise<any[]> {
  return http<any[]>(session, "/users", { method: "GET" });
}

/**
 * Change a user's role.
 */
export async function updateUserRole(session: Session, id: string, role: string): Promise<void> {
  await http<void>(session, `/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
}

/**
 * Force a user session logout.
 */
export async function forceLogoutUser(session: Session, id: string): Promise<void> {
  await http<void>(session, `/users/${id}/force-logout`, { method: "POST" });
}

/**
 * Unlock a user account.
 */
export async function unlockUser(session: Session, id: string): Promise<void> {
  await http<void>(session, `/users/${id}/unlock`, { method: "POST" });
}

/**
 * Disable a user account.
 */
export async function disableUser(session: Session, id: string): Promise<void> {
  await http<void>(session, `/users/${id}/disable`, { method: "POST" });
}

/**
 * Enable a previously disabled user account.
 */
export async function enableUser(session: Session, id: string): Promise<void> {
  await http<void>(session, `/users/${id}/enable`, { method: "POST" });
}

/**
 * Reset a user's password to a provided value.
 */
export async function resetUserPassword(session: Session, id: string, password: string): Promise<void> {
  await http<void>(session, `/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

/**
 * Map a device phone number for a user.
 */
export async function mapDevicePhone(session: Session, id: string, devicePhone: string): Promise<void> {
  await http<void>(session, `/users/${id}/device-phone`, { method: "POST", body: JSON.stringify({ devicePhone }) });
}

/**
 * Fetch diagnostics for a device.
 */
export async function fetchDiagnostics(session: Session, deviceId: string): Promise<any> {
  return http<any>(session, `/devices/${deviceId}/diagnostics`, { method: "GET" });
}

/**
 * Retrieve contact list.
 */
export async function fetchContacts(session: Session): Promise<any[]> {
  return http<any[]>(session, "/contacts", { method: "GET" });
}

/**
 * Toggle contact sync on or off.
 */
export async function toggleContactSync(session: Session, enabled: boolean): Promise<void> {
  await http<void>(session, "/contacts/toggle", { method: "POST", body: JSON.stringify({ enabled }) });
}

/**
 * Resolve a contact conflict with a given resolution.
 */
export async function resolveContactConflict(session: Session, conflictId: string, resolution: string): Promise<void> {
  await http<void>(session, `/contacts/conflicts/${conflictId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution })
  });
}

/**
 * Export contacts as a binary blob.
 */
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

/**
 * Fetch audit events.
 */
export async function getAudit(session: Session): Promise<any[]> {
  return http<any[]>(session, "/audit", { method: "GET" });
}

/**
 * Fetch login events.
 */
export async function getLoginEvents(session: Session): Promise<any[]> {
  return http<any[]>(session, "/login-events", { method: "GET" });
}

/**
 * Create a pairing session for device onboarding.
 */
export async function createPairingSession(session: Session): Promise<any> {
  return http(session, "/pairing/session", { method: "POST", body: JSON.stringify({}) });
}

/**
 * Retrieve a pairing session by id.
 */
export async function getPairingSession(session: Session, id: string): Promise<any> {
  return http<any>(session, `/pairing/session/${id}`, { method: "GET" });
}

/**
 * Toggle a device state (enable/disable/rotate-token).
 */
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

/**
 * Fetch the merged configuration with optional ETag caching.
 */
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

/**
 * Update configuration with optional ETag precondition.
 */
export async function updateConfig(session: Session, payload: ConfigPayload, etag?: string): Promise<ConfigPayload> {
  return http<ConfigPayload>(session, "/config", {
    method: "PATCH",
    headers: {
      ...(etag ? { "If-Match": etag } : {})
    },
    body: JSON.stringify(payload)
  });
}
