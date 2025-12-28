import { appConfig, wsUrl } from "./config";
import type { ClientToServer, ServerToClient, SnapshotPayload, Event, PresenceUpdate, MetricsUpdate } from "./contracts";
import type { Session } from "./auth";

export type StreamState = {
  events: Event[];
  presence: Record<string, PresenceUpdate>;
  metrics?: MetricsUpdate;
  connected: boolean;
  lastError?: string;
  cursor?: string;
  clientRttMs?: number;
};

type Listener = (state: StreamState) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private state: StreamState = {
    events: [],
    presence: {},
    connected: false
  };
  private reconnectAttempts = 0;
  private session: Session;
  private pingTimer: number | null = null;
  private visibilityPaused = false;
  private lastPingAt: number | null = null;

  constructor(session: Session) {
    this.session = session;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

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

  connect(): void {
    if (this.visibilityPaused) return;
    if (this.ws) this.ws.close();
    const url = new URL(wsUrl());
    url.searchParams.set("token", this.session.accessToken);
    if (this.state.cursor) url.searchParams.set("resumeAfter", this.state.cursor);
    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit({ connected: true, lastError: undefined });
      this.send({ type: "SUBSCRIBE" });
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
        this.emit({ lastError: (err as Error).message });
      }
    };

    this.ws.onerror = () => {
      this.emit({ lastError: "WebSocket error" });
    };

    this.ws.onclose = () => {
      this.emit({ connected: false });
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.scheduleReconnect();
    };
  }

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

  requestPage(before?: string, limit = 25): void {
    this.send({ type: "PAGE", payload: { before, limit } });
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
          events: this.state.events.map((ev) =>
            ev.number === msg.payload.number ? { ...ev, contactName: msg.payload.contactName } : ev
          )
        });
        break;
      case "CONFIG_UPDATE":
        // TODO: trigger config reload once config client is wired.
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
    if (this.visibilityPaused) return;
    this.reconnectAttempts += 1;
    const backoff = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    window.setTimeout(() => this.connect(), backoff);
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

export function formatLatency(metrics?: MetricsUpdate): string {
  if (!metrics?.ingestToDashboardMs) return "—";
  const { p50, p95 } = metrics.ingestToDashboardMs;
  if (p50 && p95) return `${p50}ms p50 / ${p95}ms p95`;
  if (p50) return `${p50}ms p50`;
  if (p95) return `${p95}ms p95`;
  return "—";
}
