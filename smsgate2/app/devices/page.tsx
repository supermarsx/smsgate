"use client";

import { useEffect, useRef, useState } from "react";
import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { createPairingSession, fetchDiagnostics, getPairingSession, listDevices, toggleDevice, updateDeviceName } from "../../lib/rest";

type PairingState = {
  state: "pending" | "waiting" | "completed" | "expired" | "error";
  detail?: string;
  deviceId?: string;
  expiresAt?: string;
  lastUpdate?: string;
};

type DeviceTone = "online" | "degraded" | "offline" | "neutral";

export default function DevicesPage() {
  const { session } = useSession();
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairing, setPairing] = useState<any | null>(null);
  const [pairingStates, setPairingStates] = useState<Record<string, PairingState>>({});
  const [diagnostics, setDiagnostics] = useState<Record<string, any>>({});
  const [qr, setQr] = useState<string | null>(null);
  const pairingTimers = useRef<Record<string, number>>({});
  if (!session) return null;

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    listDevices(session)
      .then(setDevices)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    return () => {
      Object.values(pairingTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function describeSimSlots(simSlots?: any[]): string {
    if (!simSlots?.length) return "-";
    return simSlots.map((s: any) => `${s.slotId ?? s.slot ?? "?"}:${s.msisdn ?? s.iccid ?? "-"}`).join(" | ");
  }

  function computeDeviceStatus(d: any): { label: string; tone: DeviceTone } {
    const lastHeartbeat = d.lastHeartbeat ?? d.lastHeartbeatAt ?? d.last_heartbeat ?? d.lastSeen;
    const lastTs = lastHeartbeat ? Date.parse(lastHeartbeat) : undefined;
    const age = lastTs ? Date.now() - lastTs : undefined;
    if (d.state === "disabled") return { label: "Disabled", tone: "neutral" };
    if (d.state === "offline" || (age && age > 5 * 60 * 1000)) return { label: "Offline", tone: "offline" };
    if (d.state === "degraded" || (age && age > 90 * 1000) || (d.rttMs && d.rttMs > 1500)) {
      return { label: "Degraded", tone: "degraded" };
    }
    return { label: "Online", tone: "online" };
  }

  function formatDate(ts?: string): string {
    if (!ts) return "-";
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) return ts;
    return parsed.toLocaleString();
  }

  function normalizePairingStatus(res: any): PairingState {
    const raw = (res?.status ?? res?.state ?? "").toString().toLowerCase();
    const expiresAt = res?.expiresAt ?? res?.expires_at;
    const deviceId = res?.deviceId ?? res?.device_id ?? res?.paired_device_id;
    const lastUpdate = res?.updatedAt ?? res?.updated_at ?? res?.last_event_at;
    const base: PairingState = { state: "waiting", expiresAt, deviceId, lastUpdate };
    const expiredByTime = expiresAt ? Date.parse(expiresAt) < Date.now() : false;
    if (raw.includes("error")) return { ...base, state: "error", detail: res?.error ?? res?.message };
    if (raw.includes("expire") || expiredByTime) return { ...base, state: "expired", detail: res?.error ?? "Expired" };
    if (raw.includes("complete") || raw.includes("paired") || raw.includes("done")) {
      return { ...base, state: "completed", detail: res?.note ?? res?.message };
    }
    if (raw.includes("wait")) return { ...base, state: "waiting", detail: res?.note ?? "Waiting for device" };
    return { ...base, state: "pending", detail: res?.note ?? "Pending scan" };
  }

  async function handleAction(id: string, action: "enable" | "disable" | "rotate-token") {
    if (!session) return;
    setError(null);
    try {
      await toggleDevice(session, id, action);
      const next = await listDevices(session);
      setDevices(next);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRename(id: string, name: string) {
    if (!session) return;
    setError(null);
    try {
      await updateDeviceName(session, id, name);
      const next = await listDevices(session);
      setDevices(next);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function setPairingStatus(id: string, next: PairingState) {
    setPairingStates((prev) => ({ ...prev, [id]: next }));
  }

  async function startPairing() {
    if (!session) return;
    setError(null);
    setLoading(true);
    Object.values(pairingTimers.current).forEach((timer) => window.clearTimeout(timer));
    pairingTimers.current = {};
    try {
      const res = await createPairingSession(session);
      setPairing(res);
      if (res?.qr) {
        setQr(res.qr);
      } else if (res?.pairing_url) {
        setQr(res.pairing_url);
      } else {
        setQr(null);
      }
      if (res?.id) {
        setPairingStatus(res.id, normalizePairingStatus(res));
        pollPairingStatus(res.id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pollPairingStatus(id: string) {
    if (!session) return;
    if (pairingTimers.current[id]) window.clearTimeout(pairingTimers.current[id]);
    try {
      const res = await getPairingSession(session, id);
      setPairing((prev) => (prev?.id === id ? { ...prev, ...res } : prev));
      const normalized = normalizePairingStatus(res);
      setPairingStatus(id, normalized);
      if (["completed", "expired", "error"].includes(normalized.state)) {
        return;
      }
    } catch (err) {
      setPairingStatus(id, { state: "error", detail: (err as Error).message });
      return;
    }
    pairingTimers.current[id] = window.setTimeout(() => pollPairingStatus(id), 2500);
  }

  function renderDiagnostics(deviceId: string) {
    const diag = diagnostics[deviceId];
    if (!diag) return null;
    const simSlots = diag.simSlots ?? diag.sim_slots ?? diag.sims;
    const network = diag.network ?? {};
    const health = diag.health ?? diag.status ?? diag.state;
    const battery = diag.batteryPct ?? diag.battery_pct ?? diag.battery;
    const storage = diag.storage ?? diag.storage_free ?? diag.freeStorage;
    const lastError = diag.lastError ?? diag.error;
    const appVersion = diag.appVersion ?? diag.version ?? diag.build;
    const signalValue = network.signal ?? (network.rssi !== undefined ? `${network.rssi} dBm` : "");
    const uptimeValue = diag.uptime !== undefined ? String(diag.uptime) : (diag.uptimeSec !== undefined ? `${diag.uptimeSec}s` : "");
    const storageValue = storage !== undefined ? `${storage}` : "";
    const cards: Array<{ title: string; rows: Array<{ label: string; value: string }> }> = [];
    const addCard = (title: string, rows: Array<{ label: string; value: string }>) =>
      cards.push({ title, rows: rows.filter((r) => r.value !== "" && r.value !== undefined && r.value !== null) });
    addCard("Health", [
      { label: "Status", value: health ?? "-" },
      { label: "Battery", value: battery !== undefined ? `${battery}%` : "" },
      { label: "Last error", value: lastError ?? "" },
      { label: "Updated", value: diag.updatedAt ?? diag.updated_at ?? "" }
    ]);
    addCard("Network", [
      { label: "Type", value: network.type ?? network.transport ?? "" },
      { label: "Signal", value: signalValue },
      { label: "Carrier", value: network.carrier ?? "" }
    ]);
    addCard("SIMs", [{ label: "Slots", value: describeSimSlots(simSlots) }]);
    addCard("App", [
      { label: "Version", value: appVersion ? String(appVersion) : "" },
      { label: "Uptime", value: uptimeValue },
      { label: "Storage", value: storageValue }
    ]);
    const visibleCards = cards.filter((c) => c.rows.length);
    return (
      <div className="diag-section">
        {visibleCards.length > 0 && (
          <div className="diag-grid">
            {visibleCards.map((card) => (
              <div key={`${deviceId}-${card.title}`} className="diag-card">
                <div className="diag-card__title">{card.title}</div>
                {card.rows.map((row) => (
                  <div key={row.label} className="diag-kv">
                    <span className="muted small">{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <details className="diag-block">
          <summary className="gg-label">Raw diagnostics</summary>
          <pre className="pairing-pre">{JSON.stringify(diag, null, 2)}</pre>
        </details>
      </div>
    );
  }

  const activePairingState = pairing?.id ? pairingStates[pairing.id] : undefined;
  const simLabel = (d: any) => describeSimSlots(d.sim_slots ?? d.simSlots);
  const queueDepth = (d: any) => {
    const val = d.queueDepth ?? d.queue_depth ?? d.queue;
    return val === null || val === undefined ? undefined : val;
  };

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Devices</div>
          <h1 className="gg-title">Device presence + pairing</h1>
          <p className="gg-subtitle">Watch pairing status in real time and inspect diagnostics with health badges.</p>
        </div>
        {error && <div className="login-error">Error: {error}</div>}
        {loading && <div className="muted">Loading...</div>}
        <div className="config-actions">
          <button className="login-submit" onClick={startPairing} disabled={loading}>Start pairing session</button>
          {pairing && (
            <div className="pairing-block">
              <div className="gg-label">Pairing session</div>
              <div className="actions">
                {pairing.id && (
                  <span
                    className={`badge ${
                      activePairingState?.state === "completed"
                        ? "online"
                        : activePairingState?.state === "expired"
                          ? "offline"
                          : activePairingState?.state === "error"
                            ? "degraded"
                            : "neutral"
                    }`}
                  >
                    {activePairingState?.state ?? "pending"}
                  </span>
                )}
                {activePairingState?.detail && <span className="muted small">{activePairingState.detail}</span>}
                {activePairingState?.expiresAt && <span className="muted small">Expires {formatDate(activePairingState.expiresAt)}</span>}
                {activePairingState?.deviceId && <span className="muted small">Device {activePairingState.deviceId}</span>}
              </div>
              <pre className="pairing-pre">{JSON.stringify(pairing, null, 2)}</pre>
              {qr && (
                <div className="qr-box">
                  <img alt="pairing-qr" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`} />
                  <div className="gg-value small">{qr}</div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="presence-list">
          {devices.map((d) => {
            const status = computeDeviceStatus(d);
            return (
              <div key={d.id} className="device-card">
                <div className="device-card__head">
                  <div className="device-card__meta">
                    <div className="gg-value">{d.name ?? d.id}</div>
                    <div className="muted small">{d.id}</div>
                    <div className="muted small">Last heartbeat: {formatDate(d.lastHeartbeat ?? d.lastHeartbeatAt)}</div>
                  </div>
                  <div className="actions">
                    <span className={`badge ${status.tone}`}>{status.label}</span>
                    {queueDepth(d) !== undefined && <span className="badge neutral">Queue {queueDepth(d)}</span>}
                  </div>
                </div>
                <div className="device-card__metrics">
                  <div className="kv">
                    <div className="gg-label">RTT</div>
                    <div className="gg-value">{d.rttMs ?? "-"}</div>
                  </div>
                  <div className="kv">
                    <div className="gg-label">Presence</div>
                    <div className="gg-value">{d.state ?? "unknown"}</div>
                  </div>
                  <div className="kv">
                    <div className="gg-label">SIMs</div>
                    <div className="gg-value">{simLabel(d)}</div>
                  </div>
                  <div className="kv">
                    <div className="gg-label">Numbers</div>
                    <div className="gg-value">{Array.isArray(d.numbers) ? d.numbers.join(", ") : d.assignedNumbers ?? "-"}</div>
                  </div>
                </div>
                <div className="filter-row">
                  <label className="gg-label">Rename</label>
                  <input
                    className="gg-input"
                    defaultValue={d.name}
                    onBlur={(e) => handleRename(d.id, e.target.value)}
                    placeholder="Friendly name"
                  />
                </div>
                <div className="actions">
                  <button className="ghost" onClick={() => handleAction(d.id, "enable")}>Enable</button>
                  <button className="ghost" onClick={() => handleAction(d.id, "disable")}>Disable</button>
                  <button className="ghost" onClick={() => handleAction(d.id, "rotate-token")}>Rotate token</button>
                  <button
                    className="ghost"
                    onClick={async () => {
                      if (!session) return;
                      setError(null);
                      try {
                        const data = await fetchDiagnostics(session, d.id);
                        setDiagnostics((prev) => ({ ...prev, [d.id]: data }));
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    Diagnostics
                  </button>
                </div>
                {renderDiagnostics(d.id)}
              </div>
            );
          })}
          {!devices.length && !loading && <div className="muted">No devices yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
