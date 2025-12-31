# syncserver runbooks

## Redis outage fallback and recovery
- **Detect**: `/readyz` exposes `hot_store` = pending. WS clients also receive `Degraded` notice.
- **Fallback behavior**: server auto-falls back to in-memory hot store; events continue to flow but paging history resets to in-memory retention.
- **During outage**: keep syncserver up; do NOT restart unless necessary to avoid dropping in-memory events. Monitor `syncserver_ws_connections` and `syncserver_http_requests_total` to ensure traffic is still flowing.
- **Recovery**:
  1. Restore Redis availability.
  2. Restart syncserver (or roll a deploy) to rebind Redis. `/readyz` should show `hot_store=ok`.
  3. Verify WS degraded notice disappears on new connections; confirm paging functions across reconnect.
- **Migration back to Redis**: if you ran long on memory, only new events will live in Redis after restart; there is no backfill. Communicate to operators that only recent events remain.

## Hot-store migration back to Redis (planned maintenance)
- **Prepare**: Announce maintenance window; ensure devices can buffer briefly.
- **Steps**:
  1. Set `HOT_STORE_MODE=redis` (or config) pointing at the new Redis.
  2. Run a rolling restart; verify `/readyz` shows `hot_store=ok`.
  3. Validate ingest + WS paging using a test device.
- **Rollback**: switch `HOT_STORE_MODE=memory`, restart, and accept loss of historical pages during rollback window.

## Database migration / seeding
- Use the bundled tool: `cargo run --bin migrate` (or built binary `syncserver-migrate`) after updating config/env for DB URL/path.
- For JSON DB: tool is a no-op.
- For SQL (sqlite/postgres/mysql): tool will connect and ensure `events`, `audit_log`, and `login_events` tables exist. It is idempotent.
- Run before first boot or during deploys after DB schema changes.

## Cutover/compatibility with smsgate2/smsrelay3
- **Minimum versions**: requires smsgate2 supporting `CONFIG_UPDATE`, `EVENT_UPDATE`, `SIM_*`, and `CONFIG_SNAPSHOT` WS messages; smsrelay3 must send `device_id` + bearer token headers and optional `sims` in heartbeat payload.
- **Rolling cutover**: deploy syncserver, then upgrade smsgate2 frontends; smsrelay3 devices can be rotated gradually because pairing/device auth remains backward-compatible.
- **Config gating**: ensure roles/permissions in syncserver `config.json` align with smsgate2 UI expectations for auth modes and labels.

## Ops validation checklist (post-deploy)
- `/readyz` returns `ready` with storage/hot_store ok.
- `/metrics` exposes non-zero `syncserver_http_requests_total` and sane `syncserver_ws_connections`.
- Ingest a test SMS via `/api/v1/ingest`; observe `EVENT_NEW` on WS client and persistence in chosen backend.
- Heartbeat a device; presence should flip to `online`, metrics gauge should update RTT/queue depth, and SIM inventory should broadcast when provided.
