/**
 * Syncserver ↔ smsgate2 typed contracts (subset of docs/spec-smsgate2.md).
 */

export type EventState = "new" | "claimed" | "verified" | "rejected";

export type Event = {
  id: string;
  number: string;
  contactName?: string;
  sender?: string;
  content: string;
  createdAt: string;
  claimedBy?: string;
  claimedAt?: string;
  state: EventState;
  deviceId?: string;
  latencyMs?: number;
};

export type PresenceState = "online" | "degraded" | "offline" | "disabled";

export type PresenceUpdate = {
  deviceId: string;
  state: PresenceState;
  rttMs?: number;
  lastHeartbeatAt?: string;
  simSlots?: Array<{
    slotId: number;
    iccid?: string;
    msisdn?: string;
    label?: string;
  }>;
};

export type MetricsUpdate = {
  serverRttMs?: number;
  deviceRttMs?: number;
  ingestToDashboardMs?: {
    p50?: number;
    p95?: number;
    p99?: number;
  };
};

export type ConfigUpdate = {
  version: string;
  authModes: {
    oauth: boolean;
    simpleSignin: boolean;
    domainSignin: boolean;
  };
};

export type SnapshotPayload = {
  events: Event[];
  presence: PresenceUpdate[];
  metrics?: MetricsUpdate;
};

export type ServerToClient =
  | { type: "WELCOME" }
  | { type: "SNAPSHOT"; payload: SnapshotPayload }
  | { type: "EVENT_NEW"; payload: Event }
  | { type: "EVENT_UPDATE"; payload: Event }
  | { type: "EVENT_PAGE"; payload: Event[] }
  | { type: "PRESENCE_UPDATE"; payload: PresenceUpdate }
  | { type: "METRICS_UPDATE"; payload: MetricsUpdate }
  | { type: "CONTACT_UPDATE"; payload: { number: string; contactName: string } }
  | { type: "CONFIG_UPDATE"; payload: ConfigUpdate }
  | { type: "ERROR"; payload: string };

export type ClientToServer =
  | { type: "SUBSCRIBE"; payload?: { numbers?: string[] } }
  | { type: "PAGE"; payload: { before?: string; limit?: number } }
  | { type: "PING" };
