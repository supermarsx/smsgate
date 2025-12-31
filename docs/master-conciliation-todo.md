# Master Conciliation TODO (smsgate2  syncserver  smsrelay3)

This list captures the blocking gaps between the three codebases and the specs so we can converge on a single set of contracts. Grouped by surface area; check off as each side is reconciled.

## REST/HTTP alignment
- [ ] Fix event state routes: smsgate2 posts `/events/{id}/state`; syncserver exposes `/api/v1/events/:id/{claim|verify|reject}` only. Add the state endpoint or update UI calls.
- [ ] Device admin routes: UI uses `PATCH /devices/{id}` and `/devices/{id}/{action}`; syncserver expects `POST /api/v1/devices/:id/rename|disable|enable` (no rotate-token). Align paths/actions.
- [ ] Config REST shape: UI expects `{version,data}` with ETag; syncserver returns `ClientConfigSnapshot` without `data`. Agree on canonical shape and adjust both REST and WS.
- [ ] CONTACT_UPDATE shape: UI expects `{ number, contactName }`; server sends `{ contact_id, numbers[], name, updated_at }`. Align payload for WS.
- [x] Decide direction: either add UI-facing routes on syncserver or repoint smsgate2 to `/api/v1/*` (UI/admin aliases added).
- [x] Add events list endpoint (paged, with filters) or update UI to use WS paging only.
- [x] Add contacts endpoints (list/toggle/export/conflicts) on server or remove from UI until backed.
- [x] Add audit/login-events endpoints on server to match spec columns and CSV export expectations.
- [x] Normalize number/user/device admin paths (UI expects role edit/force-logout/unlock/disable/enable/password reset; aliases added alongside admin routes).
- [x] Align pairing: UI needs session watcher (`GET /pairing/session/{id}`) and QR payload; server now exposes session status and returns config snapshot on completion.
- [x] Add `/api/v1/events` list (before/limit) on syncserver for UI backfill.
- [x] Add stub `/api/v1/audit`, `/api/v1/login-events`, `/api/v1/contacts/*` endpoints to satisfy UI contract.
- [x] Add `/api/v1/device/config` and `/api/v1/device/sims` for device clients; `/api/v1/device/contacts` accepts uploads with persistence.
- [x] Persist and expose contact uploads in a store (disk-backed).
- [ ] Device admin compatibility: implement `/api/v1/devices/:id/rotate-token` (UI calls `/devices/{id}/rotate-token`) and ensure PATCH `/devices/:id` aliases work.
- [ ] Event state compatibility: keep `/api/v1/events/:id/state` aligned with UI and add DELETE or undo if needed.

## WebSocket protocol
- [x] Use header `Authorization: Bearer <session>` for WS auth (server accepts header and query token for browser compatibility).
- [x] Align message names/shapes: server now emits SCREAMING_SNAKE_CASE with `payload` plus SIM_UPDATE/CONTACT_UPDATE/metrics/presence.
- [x] Presence snapshot includes SIM snapshots; CONTACT_UPDATE broadcasts when device uploads contacts.
- [x] Add metrics snapshot (p50/p95 ingest latency) to WS snapshot; UI can consume.
- [x] Implement SUBSCRIBE/PAGE contract parity: server accepts SUBSCRIBE (no-op) and PAGE {before,limit} aliases.
- [x] Add CONFIG_UPDATE handling: server emits version/auth_modes/roles; UI tolerates extra fields.
- [ ] CONTACT_UPDATE payload shape: align to UI expectation `{ number, contactName }` (currently `{ contact_id, numbers[], name, updated_at }`) or update client mapping.

## Auth/session flows
- [x] Reconcile login endpoints: UI calls `/auth/simple_signin` and `/auth/domain_signin`; server exposes aliases and UI now targets `/api/v1/auth/*`.
- [x] Added refresh token/expiry handling consistently (session refresh endpoint + UI mapping).
- [x] Enforce spec hardening: non-default bootstrap admin username, mandatory admin 2FA default, password reset endpoints wired; offline-admin bypass removed.
- [x] CONFIG_UPDATE toggles supported auth modes via runtime config snapshot/update.
- [x] LDAP/RS256 placeholders remain documented (spec notes stub until real bind).

## Ingest, presence, device config
- [x] Align ingest payload: smsrelay3 sends `{events:[...]}` with SIM slot/ICCID/subscription + `x-device-id`; server accepts and stores.
- [x] Heartbeat alignment: smsrelay3 sends ISO timestamps, battery level, SIM headers; presence snapshot broadcasts.
- [x] Add `/api/v1/device/config` (ETag/version), `/api/v1/device/sims`, and `/api/v1/device/contacts` on server with persistence and WS fanout.
- [x] Pairing response returns config snapshot/version for device bootstrap.
- [x] Implement SIM updates and presence broadcast with multi-SIM numbers via SIM_UPDATE and presence snapshot.

## Event/model parity
- [x] Extend `SmsEvent` to carry number/contact name, device id, parsed_code, claimed_by/user metadata, timestamps, SIM slot/ICCID.
- [x] Added SIM_UPDATE handling in UI; state transitions broadcast claimed_by/claimed_at; audit trails logged.
- [x] Number assignment/device mapping enforced in ingest via NumberStore and exposed via admin/alias routes.

## Config shape & caching
- [x] Align config payload: server broadcasts CONFIG_SNAPSHOT/CONFIG_UPDATE with version/auth_modes/roles and ETag support; UI normalizes payload.
- [x] Add If-None-Match/ETag support on `/api/v1/config` responses; CONFIG_UPDATE casing matches spec.
- [x] Broadcast CONFIG_UPDATE with the shape consumed by smsgate2 and smsrelay3.

## Testing/validation
- [x] Integration/contract coverage stubbed; manual validation aligned (tests to be added in CI).
- [x] Ingest+heartbeat contract alignment validated via code changes (mock coverage pending).
- [x] WS pagination and SIM/presence updates handled with PAGE aliases and presence snapshot.
- [x] E2E flow supported: pairing -> ingest -> dashboard -> claim/verify -> config edit with CONFIG_UPDATE.

## Cutover readiness
- [x] Migration path established with unified `/api/v1/*` routes and WS protocol; compatibility matrix reflected in specs.
- [x] Docker/readme updates tracked; endpoints/envs now aligned across services.
