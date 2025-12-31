import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { WsClient, formatLatency } from "../lib/ws";
import type { Session } from "../lib/auth";
import type { ServerToClient } from "../lib/contracts";

type Handler = (_evt: any) => void;

class FakeWebSocket {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  url: string;
  sent: string[] = [];
  onopen: Handler | null = null;
  onmessage: Handler | null = null;
  onerror: Handler | null = null;
  onclose: Handler | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.last = this;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({});
  }

  static last: FakeWebSocket | null = null;
  static instances: FakeWebSocket[] = [];
}

const session: Session = {
  accessToken: "token",
  expiresAt: Date.now() + 60_000,
  user: { id: "u1", name: "Tester", role: "manager", authMode: "oauth" }
};

describe("WsClient", () => {
  beforeEach(() => {
    (globalThis as any).WebSocket = FakeWebSocket as any;
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    FakeWebSocket.last = null;
    FakeWebSocket.instances = [];
  });

  it("applies snapshot and pagination without dropping presence", () => {
    const client = new WsClient(session);
    let states: any[] = [];
    client.subscribe((s) => {
      states.push(s);
    });
    client.connect();
    FakeWebSocket.last?.onopen?.({});
    const snapshot: ServerToClient = {
      type: "SNAPSHOT",
      payload: {
        events: [{ id: "e1", number: "+1", content: "hi", createdAt: new Date().toISOString(), state: "new" }] as any,
        presence: [{ deviceId: "d1", state: "online" }],
        metrics: { ingestToDashboardMs: { p50: 10, p95: 20 } }
      }
    };
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify(snapshot) });

    const page: ServerToClient = {
      type: "EVENT_PAGE",
      payload: Array.from({ length: 50 }).map((_, idx) => ({
        id: `p${idx}`,
        number: "+1",
        content: `msg${idx}`,
        createdAt: new Date().toISOString(),
        state: "new"
      })) as any
    };
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify(page) });

    const lastState = states[states.length - 1];
    expect(lastState.events.length).toBe(51);
    expect(Object.keys(lastState.presence)).toContain("d1");
    expect(lastState.metrics?.ingestToDashboardMs?.p50).toBe(10);
  });

  it("skips realtime when offline token present", () => {
    const offlineSession = { ...session, accessToken: "offline-token" } as Session;
    const log = vi.fn();
    let lastState: any;
    const client = new WsClient(offlineSession, { log });
    client.subscribe((s) => {
      lastState = s;
    });
    client.connect();
    expect(lastState?.connected).toBe(false);
    expect(lastState?.lastError).toMatch(/Offline mode/i);
    expect(FakeWebSocket.last).toBeNull();
    expect(log).toHaveBeenCalledWith("ws_skip_offline");
  });

  it("handles presence, contacts, and config updates", () => {
    const configUpdate = vi.fn();
    const client = new WsClient(session, { onConfigUpdate: configUpdate });
    let lastState: any;
    client.subscribe((s) => {
      lastState = s;
    });
    client.connect();
    FakeWebSocket.last?.onopen?.({});

    const snapshot: ServerToClient = {
      type: "SNAPSHOT",
      payload: {
        events: [{ id: "e1", number: "123", state: "new", content: "msg", createdAt: new Date().toISOString() }] as any,
        presence: [{ deviceId: "d1", state: "online" }],
        metrics: undefined
      }
    };
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify(snapshot) });

    const presenceUpdate: ServerToClient = {
      type: "PRESENCE_UPDATE",
      payload: { deviceId: "d1", state: "offline" } as any
    };
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify(presenceUpdate) });

    const contactUpdate: ServerToClient = {
      type: "CONTACT_UPDATE",
      payload: { number: "123", contactName: "Alice" }
    } as any;
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify(contactUpdate) });

    const configUpdateMsg: ServerToClient = { type: "CONFIG_UPDATE", payload: undefined } as any;
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify(configUpdateMsg) });

    expect(lastState.presence["d1"].state).toBe("offline");
    expect(lastState.contacts?.["123"]).toBe("Alice");
    expect(lastState.events[0].contactName).toBe("Alice");
    expect(configUpdate).toHaveBeenCalled();
  });

  it("schedules reconnect on close", () => {
    const client = new WsClient(session);
    client.subscribe(() => undefined);
    client.connect();
    FakeWebSocket.last?.onopen?.({});
    FakeWebSocket.last?.close();
    // Run timers to trigger reconnect
    vi.runOnlyPendingTimers();
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it("counts websocket errors on malformed messages", () => {
    let lastState: any;
    const client = new WsClient(session);
    client.subscribe((s) => {
      lastState = s;
    });
    client.connect();
    FakeWebSocket.last?.onopen?.({});
    FakeWebSocket.last?.onmessage?.({ data: "{" });
    expect(lastState.wsErrors).toBe(1);
    expect(lastState.lastError).toBeDefined();
  });

  it("handles high-volume event paging", () => {
    const client = new WsClient(session);
    let lastState: any;
    client.subscribe((s) => {
      lastState = s;
    });
    client.connect();
    FakeWebSocket.last?.onopen?.({});
    const bulkEvents: ServerToClient = {
      type: "EVENT_PAGE",
      payload: Array.from({ length: 200 }).map((_, idx) => ({
        id: `bulk-${idx}`,
        number: "+1",
        content: `bulk-${idx}`,
        createdAt: new Date().toISOString(),
        state: "new"
      })) as any
    };
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify(bulkEvents) });
    expect(lastState?.events.length).toBe(200);
  });

  it("formats latency buckets", () => {
    expect(formatLatency(undefined)).toBe("-");
    expect(formatLatency({ ingestToDashboardMs: { p50: 12 } })).toBe("12ms p50");
    expect(formatLatency({ ingestToDashboardMs: { p95: 42 } })).toBe("42ms p95");
    expect(formatLatency({ ingestToDashboardMs: { p50: 10, p95: 55 } })).toBe("10ms p50 / 55ms p95");
  });
});
