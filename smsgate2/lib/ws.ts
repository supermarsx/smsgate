/**
 * @fileoverview WebSocket client for realtime events, presence, and metrics.
 */

import { wsUrl } from "./config";
import type {
  ClientToServer,
  ServerToClient,
  SnapshotPayload,
  Event,
  PresenceUpdate,
  MetricsUpdate
} from "./contracts";
import type { Session } from "./auth";

/**
 * Live websocket state shared with subscribers.
 */
export type StreamState = {
  events: Event[];
  presence: Record<string, PresenceUpdate>;
  metrics?: MetricsUpdate;
  contacts?: Record<string, string>;
  connected: boolean;
  lastError?: string;
  cursor?: string;
  clientRttMs?: number;
  wsErrors?: number;
  reconnects?: number;
};

type Listener = (state: StreamState) => void;

type LogFn = (type: string, detail?: string) => void;

/**
 * Thin websocket client with reconnection, ping, and snapshot handling.
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private state: StreamState = {
    events: [],
    presence: {},
    contacts: {},
    connected: false
  };
  private reconnectAttempts = 0;
  private session: Session;
  private pingTimer: number | null = null;
  private visibilityPaused = false;
  private lastPingAt: number | null = null;
  private subscribedNumbers: string[] | undefined;
  private onConfigUpdate?: () => void;
  private wsErrors = 0;
  private reconnects = 0;
  private log?: LogFn;

  constructor(session: Session, opts?: { numbers?: string[]; onConfigUpdate?: () => void; log?: LogFn }) {
    this.session = session;
    this.subscribedNumbers = opts?.numbers;
    this.onConfigUpdate = opts?.onConfigUpdate;
    this.log = opts?.log;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  /**
   * Subscribe to state updates; returns an unsubscribe function.
   * @returns Function to unregister the listener.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(next: Partial<StreamState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l(this.state));
  }

  /**
   * Open (or reopen) the websocket connection respecting visibility and offline tokens.
   * @returns void
   */
  connect(): void {
    const offlineToken = this.session.accessToken.startsWith("offline-");
    if (offlineToken) {
      this.emit({ connected: false, lastError: "Offline mode: realtime disabled", wsErrors: this.wsErrors });
      this.log?.("ws_skip_offline");
      return;
    }
    if (this.visibilityPaused) return;
    if (this.ws) this.ws.close();
    const url = new URL(wsUrl());
    url.searchParams.set("token", this.session.accessToken);
    if (this.state.cursor) url.searchParams.set("resumeAfter", this.state.cursor);
    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit({ connected: true, lastError: undefined });
      this.log?.("ws_open");
      this.send({ type: "SUBSCRIBE", payload: { numbers: this.subscribedNumbers } });
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ServerToClient;
        this.handleMessage(data);
        if (this.lastPingAt) {
          const rtt = Date.now() - this.lastPingAt;
          this.emit({ clientRttMs: rtt });
          this.lastPingAt = null;
        }
      } catch (err) {
        this.wsErrors += 1;
        this.log?.("ws_message_error", (err as Error).message);
        this.emit({ lastError: (err as Error).message, wsErrors: this.wsErrors });
      }
    };

    this.ws.onerror = () => {
      this.wsErrors += 1;
      this.log?.("ws_error");
      this.emit({ lastError: "WebSocket error", wsErrors: this.wsErrors });
    };

    this.ws.onclose = () => {
      this.emit({ connected: false });
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.reconnects += 1;
      this.log?.("ws_close");
      this.emit({ reconnects: this.reconnects });
      this.scheduleReconnect();
    };
  }

  /**
   * Close the websocket and remove listeners.
   * @returns void
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    this.ws = null;
  }

  /**
   * Request a historical page of events.
   * @returns void
   */
  requestPage(before?: string, limit = 25): void {
    this.send({ type: "PAGE", payload: { before, limit } });
  }

  /**
   * Update subscribed numbers on the active connection.
   * @returns void
   */
  updateSubscription(numbers?: string[]) {
    this.subscribedNumbers = numbers;
    this.send({ type: "SUBSCRIBE", payload: { numbers } });
  }

  private send(message: ClientToServer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(msg: ServerToClient) {
    switch (msg.type) {
      case "WELCOME":
        this.send({ type: "PING" });
        break;
      case "SNAPSHOT":
        this.applySnapshot(msg.payload);
        break;
      case "EVENT_NEW":
        this.emit({ events: [msg.payload, ...this.state.events], cursor: msg.payload.id });
        break;
      case "EVENT_UPDATE":
        this.emit({
          events: this.state.events.map((ev) => (ev.id === msg.payload.id ? msg.payload : ev))
        });
        break;
      case "EVENT_PAGE":
        this.emit({ events: [...this.state.events, ...msg.payload] });
        break;
      case "PRESENCE_UPDATE":
        this.emit({
          presence: {
            ...this.state.presence,
            [msg.payload.deviceId]: msg.payload
          }
        });
        break;
      case "METRICS_UPDATE":
        this.emit({ metrics: msg.payload });
        break;
      case "CONTACT_UPDATE":
        this.emit({
          contacts: { ...(this.state.contacts ?? {}), [msg.payload.number]: msg.payload.contactName },
          events: this.state.events.map((ev) =>
            ev.number === msg.payload.number ? { ...ev, contactName: msg.payload.contactName } : ev
          )
        });
        break;
      case "CONFIG_UPDATE":
        if (this.onConfigUpdate) this.onConfigUpdate();
        break;
      case "ERROR":
        this.emit({ lastError: msg.payload });
        break;
      default:
        break;
    }
  }

  private applySnapshot(payload: SnapshotPayload) {
    const presenceMap: Record<string, PresenceUpdate> = {};
    payload.presence.forEach((p) => {
      presenceMap[p.deviceId] = p;
    });
    this.emit({
      events: payload.events,
      presence: presenceMap,
      metrics: payload.metrics,
      cursor: payload.events[0]?.id ?? this.state.cursor
    });
  }

  private scheduleReconnect() {
    if (this.session.accessToken.startsWith("offline-")) {
      this.log?.("ws_skip_offline_reconnect");
      return;
    }
    if (this.visibilityPaused) return;
    this.reconnectAttempts += 1;
    const backoff = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    window.setTimeout(() => this.connect(), backoff);
    this.log?.("ws_reconnect", `attempt=${this.reconnectAttempts}`);
    this.emit({ reconnects: this.reconnects });
  }

  private startPing() {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      this.lastPingAt = Date.now();
      this.send({ type: "PING" });
    }, 15_000);
  }

  private handleVisibilityChange = () => {
    if (typeof document === "undefined") return;
    this.visibilityPaused = document.hidden;
    if (!document.hidden && !this.state.connected) {
      this.connect();
    }
  };
}

/**
 * Format ingest latency percentiles for display.
 * @returns Formatted latency string or dash when missing.
 */
export function formatLatency(metrics?: MetricsUpdate): string {
  if (!metrics?.ingestToDashboardMs) return String.fromCharCode(45);
  const { p50, p95 } = metrics.ingestToDashboardMs;
  if (p50 && p95) return `${p50}ms p50 / ${p95}ms p95`;
  if (p50) return `${p50}ms p50`;
  if (p95) return `${p95}ms p95`;
  return String.fromCharCode(45);
}
