"use client";

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { formatLatency, WsClient } from "../../lib/ws";
import type { Event, PresenceUpdate } from "../../lib/contracts";
import { listEvents } from "../../lib/rest";
import { useConfig } from "../../components/config-provider";
import { useStatus } from "../../components/status-context";

export default function DashboardPage() {
  const { session } = useSession();
  const { refresh: refreshConfig } = useConfig();
  const { setStatus } = useStatus();
  const [events, setEvents] = useState<Event[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceUpdate>>({});
  const [latency, setLatency] = useState<string>("—");
  const [clientRtt, setClientRtt] = useState<string>("—");
const [deviceRtt, setDeviceRtt] = useState<string>("—");
const [connected, setConnected] = useState(false);
const [lastError, setLastError] = useState<string | undefined>();
const [loadingPage, setLoadingPage] = useState(false);
const [hasMore, setHasMore] = useState(true);
const clientRef = useRef<WsClient | null>(null);
const scrollRef = useRef<HTMLDivElement | null>(null);
const SNAPSHOT_KEY = "smsgate2_snapshot";

const orderedEvents = useMemo(() => events.slice().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)), [events]);

useEffect(() => {
  if (!session) return;
    const client = new WsClient(session, {
      numbers: session.user.numbers,
      onConfigUpdate: () => refreshConfig()
    });
    clientRef.current = client;
    const unsubscribe = client.subscribe((state) => {
      setEvents(state.events);
      setPresence(state.presence);
      setLatency(formatLatency(state.metrics));
      setClientRtt(state.clientRttMs ? `${state.clientRttMs} ms` : "—");
      const deviceRtts = Object.values(state.presence)
        .map((p) => p.rttMs)
        .filter((rtt): rtt is number => typeof rtt === "number");
      setDeviceRtt(deviceRtts.length ? `${Math.min(...deviceRtts)} ms` : "—");
      setConnected(state.connected);
      setLastError(state.lastError);
      setHasMore(true);
      setStatus({
        connected: state.connected,
        ingestLatency: formatLatency(state.metrics),
        clientRtt: state.clientRttMs ? `${state.clientRttMs} ms` : "—",
        deviceRtt: deviceRtts.length ? `${Math.min(...deviceRtts)} ms` : "—",
        devicesOnline: Object.values(state.presence).filter((p) => p.state === "online").length,
        lastError: state.lastError
      });
    });
    client.connect();
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, [session]);

  // Load cached snapshot for offline/boot without WS
  useEffect(() => {
    if (events.length || presence && Object.keys(presence).length) return;
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { events?: Event[]; presence?: Record<string, PresenceUpdate> };
      if (parsed.events?.length) setEvents(parsed.events);
      if (parsed.presence) setPresence(parsed.presence);
    } catch {
      // ignore cache errors
    }
  }, [events.length, presence]);

  // Persist snapshot for offline view
  useEffect(() => {
    try {
      window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ events, presence }));
    } catch {
      // ignore
    }
  }, [events, presence]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      if (loadingPage || !hasMore) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (nearBottom) loadOlder();
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadingPage, hasMore, orderedEvents]);

  async function loadOlder() {
    if (!session) return;
    if (loadingPage) return;
    setLoadingPage(true);
    const oldest = orderedEvents[orderedEvents.length - 1];
    if (connected && clientRef.current) {
      clientRef.current.requestPage(oldest?.id, 25);
      setLoadingPage(false);
      return;
    }
    try {
      const older = await listEvents(session, { before: oldest?.id, limit: 25 });
      if (!older.length) setHasMore(false);
      setEvents((prev) => [...prev, ...older]);
    } catch {
      setLastError("REST fallback failed");
    } finally {
      setLoadingPage(false);
    }
  }

  if (!session) return null;

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Dashboard</div>
          <h1 className="gg-title">Realtime feed</h1>
          <p className="gg-subtitle">Streaming snapshot + new events with presence/latency chips.</p>
        </div>
        <section className="gg-section dashboard-grid">
          <div className="feed">
            <div className="feed-head">
              <span className={`status-dot ${connected ? "ok" : "warn"}`} />
              <span>{connected ? "Connected" : "Reconnecting..."}</span>
              {lastError && <span className="muted">Last error: {lastError}</span>}
            </div>
            <div className="phone-mock">
              <div className="phone-mock__screen" ref={scrollRef}>
                {orderedEvents.map((evt) => (
                  <div key={evt.id} className="msg-row">
                    <div className="msg-meta">
                      <span className="msg-number">{evt.number}</span>
                      <span className="msg-time">{new Date(evt.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="msg-body">{evt.content}</div>
                    {evt.state !== "new" && <span className="msg-pill">{evt.state}</span>}
                  </div>
                ))}
                {orderedEvents.length === 0 && <div className="muted">Waiting for snapshot...</div>}
                {loadingPage && <div className="muted">Loading older…</div>}
                {!hasMore && <div className="muted">End of history</div>}
              </div>
            </div>
          </div>
          <div className="side">
            <div className="metric-card">
              <div className="gg-label">Ingest → render</div>
              <div className="gg-value">{latency}</div>
            </div>
            <div className="metric-card">
              <div className="gg-label">Server RTT</div>
              <div className="gg-value">{clientRtt}</div>
            </div>
            <div className="metric-card">
              <div className="gg-label">Device RTT (min)</div>
              <div className="gg-value">{deviceRtt}</div>
            </div>
            <div className="metric-card">
              <div className="gg-label">Presence</div>
              <div className="presence-list">
                {Object.values(presence).map((p) => (
                  <div key={p.deviceId} className="presence-row">
                    <span className={`status-dot ${p.state === "online" ? "ok" : "warn"}`} />
                    <span>{p.deviceId}</span>
                    {p.rttMs && <span className="muted">{p.rttMs} ms</span>}
                  </div>
                ))}
                {Object.keys(presence).length === 0 && <div className="muted">No devices yet</div>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </ProtectedShell>
  );
}
