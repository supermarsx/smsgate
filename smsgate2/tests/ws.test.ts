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
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({});
  }

  static last: FakeWebSocket | null = null;
}

const session: Session = {
  accessToken: "token",
  expiresAt: Date.now() + 60_000,
  user: { id: "u1", name: "Tester", role: "manager", authMode: "oauth" }
};

describe("WsClient", () => {
  beforeEach(() => {
    (globalThis as any).WebSocket = FakeWebSocket as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    FakeWebSocket.last = null;
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
