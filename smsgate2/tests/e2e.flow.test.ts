import { describe, expect, it } from "vitest";

import { WsClient } from "../lib/ws";
import type { Session } from "../lib/auth";

class PassiveWebSocket {
  static OPEN = 1;
  readyState = PassiveWebSocket.OPEN;
  onopen: ((_evt: any) => void) | null = null;
  onmessage: ((_evt: any) => void) | null = null;
  onclose: ((_evt: any) => void) | null = null;
  onerror: ((_evt: any) => void) | null = null;
  sent: string[] = [];
  constructor() {
    PassiveWebSocket.last = this;
  }
  send(payload: string) {
    this.sent.push(payload);
  }
  close() {
    this.onclose?.({});
  }
  static last: PassiveWebSocket | null = null;
}

const session: Session = {
  accessToken: "token-e2e",
  expiresAt: Date.now() + 5 * 60_000,
  user: { id: "u1", name: "E2E User", role: "manager", authMode: "oauth" }
};

describe("mocked e2e flow", () => {
  it("walks login -> dashboard stream -> config update with reconnect", () => {
    (globalThis as any).WebSocket = PassiveWebSocket as any;
    const client = new WsClient(session, { numbers: ["+1555"] });
    let lastState: any = null;
    const unsub = client.subscribe((s) => {
      lastState = s;
    });
    client.connect();
    PassiveWebSocket.last?.onopen?.({});
    PassiveWebSocket.last?.onmessage?.({
      data: JSON.stringify({
        type: "SNAPSHOT",
        payload: { events: [], presence: [], metrics: { ingestToDashboardMs: { p50: 15 } } }
      })
    });
    expect(lastState?.connected).toBe(true);
    expect(lastState?.metrics?.ingestToDashboardMs?.p50).toBe(15);

    PassiveWebSocket.last?.onmessage?.({ data: JSON.stringify({ type: "CONFIG_UPDATE", payload: {} }) });
    PassiveWebSocket.last?.onclose?.({});
    expect(lastState?.connected).toBe(false);
    unsub();
  });
});
