"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { createPairingSession, fetchDiagnostics, listDevices, toggleDevice } from "../../lib/rest";
import { updateDeviceName } from "../../lib/rest";

export default function DevicesPage() {
  const { session } = useSession();
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairing, setPairing] = useState<any | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, any>>({});
  const [qr, setQr] = useState<string | null>(null);
  if (!session) return null;

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    listDevices(session)
      .then(setDevices)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  async function handleAction(id: string, action: "enable" | "disable" | "rotate-token") {
    if (!session) return;
    await toggleDevice(session, id, action);
    const next = await listDevices(session);
    setDevices(next);
  }

  async function handleRename(id: string, name: string) {
    if (!session) return;
    await updateDeviceName(session, id, name);
    const next = await listDevices(session);
    setDevices(next);
  }

  async function startPairing() {
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      const res = await createPairingSession(session);
      setPairing(res);
      if (res?.qr) {
        setQr(res.qr);
      } else if (res?.pairing_url) {
        setQr(res.pairing_url);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Devices</div>
          <h1 className="gg-title">Device presence + pairing</h1>
          <p className="gg-subtitle">List devices with presence state, RTT, SIM inventory, and pairing actions.</p>
        </div>
        {error && <div className="login-error">Error: {error}</div>}
        {loading && <div className="muted">Loading...</div>}
        <div className="config-actions">
          <button className="login-submit" onClick={startPairing} disabled={loading}>Start pairing session</button>
          {pairing && (
            <div className="pairing-block">
              <div className="gg-label">Pairing session</div>
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
          {devices.map((d) => (
            <div key={d.id} className="presence-row spaced">
              <div>
                <div className="gg-value">{d.name ?? d.id}</div>
                <div className="muted">RTT: {d.rttMs ?? "—"} | Presence: {d.state ?? "unknown"}</div>
                {Array.isArray(d.sim_slots) && (
                  <div className="muted">
                    SIMs: {d.sim_slots.map((s: any) => `${s.slotId}:${s.msisdn ?? s.iccid ?? "-"}`).join(" , ")}
                  </div>
                )}
                <div className="muted">Last heartbeat: {d.lastHeartbeat ?? "—"}</div>
                <div className="filter-row">
                  <label className="gg-label">Rename</label>
                  <input
                    className="gg-input"
                    defaultValue={d.name}
                    onBlur={(e) => handleRename(d.id, e.target.value)}
                  />
                </div>
                {diagnostics[d.id] && (
                  <details className="diag-block" open>
                    <summary className="gg-label">Diagnostics</summary>
                    <pre className="pairing-pre">{JSON.stringify(diagnostics[d.id], null, 2)}</pre>
                  </details>
                )}
              </div>
              <div className="actions">
                <button className="ghost" onClick={() => handleAction(d.id, "enable")}>Enable</button>
                <button className="ghost" onClick={() => handleAction(d.id, "disable")}>Disable</button>
                <button className="ghost" onClick={() => handleAction(d.id, "rotate-token")}>Rotate token</button>
                <button
                  className="ghost"
                  onClick={async () => {
                    if (!session) return;
                    const data = await fetchDiagnostics(session, d.id);
                    setDiagnostics((prev) => ({ ...prev, [d.id]: data }));
                  }}
                >
                  Diagnostics
                </button>
              </div>
            </div>
          ))}
          {!devices.length && !loading && <div className="muted">No devices yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
