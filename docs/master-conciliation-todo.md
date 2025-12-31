# Master Conciliation TODO (smsgate2  syncserver  smsrelay3)

This list captures the blocking gaps between the three codebases and the specs so we can converge on a single set of contracts. Grouped by surface area; check off as each side is reconciled.

## REST/HTTP alignment
- [ ] Decide direction: either add UI-facing routes on syncserver or repoint smsgate2 to `/api/v1/*` (current UI calls `/events`, `/devices`, `/numbers`, `/users`, `/contacts`, `/audit`, `/login-events`, `/pairing/session/:id` while syncserver only exposes `/api/v1/events/:id/{claim|verify|reject}`, `/api/v1/devices/*`, and admin CRUD under `/api/v1/admin/*`).
- [ ] Add events list endpoint (paged, with filters) or update UI to use WS paging only.
- [ ] Add contacts endpoints (list/toggle/export/conflicts) on server or remove from UI until backed.
- [ ] Add audit/login-events endpoints on server to match spec columns and CSV export expectations.
- [ ] Normalize number/user/device admin paths (UI expects role edit/force-logout/unlock/disable/enable/password reset; server supports a subset under `/api/v1/admin/users`/`/admin/numbers`).
- [ ] Align pairing: UI needs session watcher (`GET /pairing/session/{id}`) and QR payload; server currently only has create/complete at `/api/v1/pairing/session|complete`.
- [x] Add `/api/v1/events` list (before/limit) on syncserver for UI backfill.
- [x] Add stub `/api/v1/audit`, `/api/v1/login-events`, `/api/v1/contacts/*` endpoints to satisfy UI contract (data still empty; needs real persistence).

## WebSocket protocol
- [ ] Use header `Authorization: Bearer <session>` for WS auth (UI currently passes `?token=` query; server expects header).
- [ ] Align message names/shapes: UI expects `WELCOME|SNAPSHOT|EVENT_PAGE|PRESENCE_UPDATE|METRICS_UPDATE|CONTACT_UPDATE|CONFIG_UPDATE|ERROR`; server emits `Welcome|Snapshot|Page|PresenceUpdate|SimUpdate|ConfigUpdate|Degraded|Pong` with different casing/fields.
- [ ] Add metrics + presence arrays and SIM/number details to Snapshot payload per spec; include e2e latency stats for dashboard status bar.
- [ ] Implement SUBSCRIBE/PAGE contract parity: server currently supports `PageBefore/PageAfter`; UI sends `PAGE {before,limit}` and `SUBSCRIBE {numbers}`.
- [ ] Add CONFIG_UPDATE handling: either emit server-side diff with auth mode/role labels or adjust UI to new snapshot shape.

## Auth/session flows
- [ ] Reconcile login endpoints: UI calls `/auth/simple_signin` and `/auth/domain_signin`; server exposes `/api/v1/auth/login` with `AuthMode` in payload.
- [ ] Add refresh token/expiry handling consistently (UI assumes `accessToken/refreshToken`; server issues `session_token` only).
- [ ] Enforce spec hardening: non-default bootstrap admin username, mandatory admin 2FA, password reset endpoints matching UI (UI uses `/auth/password/change` + `/auth/password/reset-request`; server uses `/api/v1/auth/password_reset/*`).
- [ ] Remove/replace offline-admin bypass in UI; ensure CONFIG_UPDATE can toggle auth modes at runtime.
- [ ] Implement real LDAP bind + RS256/JWKS OAuth validation on server (spec gap).

## Ingest, presence, device config
- [ ] Align ingest payload: server expects `{ events:[{id?,device_id,number_e164,sender,content,device_received_at,source}] }` with `x-device-id` header; smsrelay3 now wraps events + headers but still needs full SIM/metadata per spec.
- [x] Heartbeat alignment: smsrelay3 now sends ISO timestamps, battery level, and `x-device-id`; SIM payload still pending on device side.
- [x] Add `/api/v1/device/config` (ETag/version) and `/api/v1/device/sims` on server; smsrelay3 now sends headers. Device contacts endpoint still missing.
- [ ] Add `/api/v1/device/contacts` on server, or repoint smsrelay3 to existing routes; include ETag and config versioning.
- [ ] Pairing response should return config snapshot/version for device bootstrap (currently only id/token).
- [ ] Implement SIM events (`SIM_*`) and presence broadcast with multi-SIM numbers for UI Devices page.

## Event/model parity
- [ ] Extend `SmsEvent` to carry number/contact name, device id, parsed_code, claimed_by/user metadata, and timestamps needed for dashboard latency chips.
- [ ] Ensure state transitions (claim/verify/reject) map to UI routes and audit entries; add REST/WS notifications for claimed-by labels.
- [ ] Expose number assignment/device mapping to support UI filters and ingest ownership checks.

## Config shape & caching
- [ ] Align config payload: UI expects `{ version, data: {...}, authModes }` with ETag; server returns `ClientConfigSnapshot` (presence/ingest/hot_store/roles). Decide canonical shape and adjust both UI client and server serializer.
- [ ] Add If-None-Match/ETag support on `/api/v1/config` responses.
- [ ] Broadcast CONFIG_UPDATE with the same shape consumed by smsgate2 and smsrelay3.

## Testing/validation
- [ ] Add integration tests for REST/WS contract compatibility (UI client against live syncserver).
- [ ] Add ingest+heartbeat contract tests with smsrelay3 mock to ensure headers/body are accepted.
- [ ] Add WS pagination tests for SNAPSHOT->PAGE flow and presence/SIM updates.
- [ ] E2E: pairing -> ingest -> dashboard visible, claim/verify, config edit round-trip with CONFIG_UPDATE.

## Cutover readiness
- [ ] Decide migration path (update clients vs expand server) and document the compatibility matrix.
- [ ] Update docker-compose/readmes with unified endpoints and env vars once contracts are fixed.
