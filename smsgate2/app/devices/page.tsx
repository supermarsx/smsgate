"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { listDevices, toggleDevice } from "../../lib/rest";

export default function DevicesPage() {
  const { session } = useSession();
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
        <div className="presence-list">
          {devices.map((d) => (
            <div key={d.id} className="presence-row spaced">
              <div>
                <div className="gg-value">{d.name ?? d.id}</div>
                <div className="muted">RTT: {d.rttMs ?? "—"} | Presence: {d.state ?? "unknown"}</div>
              </div>
              <div className="actions">
                <button className="ghost" onClick={() => handleAction(d.id, "enable")}>Enable</button>
                <button className="ghost" onClick={() => handleAction(d.id, "disable")}>Disable</button>
                <button className="ghost" onClick={() => handleAction(d.id, "rotate-token")}>Rotate token</button>
              </div>
            </div>
          ))}
          {!devices.length && !loading && <div className="muted">No devices yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
