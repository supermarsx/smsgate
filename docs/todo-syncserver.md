# syncserver - Exhaustive TODO

## Current state (gap check)
- [x] New `syncserver/` Rust crate scaffolded with Axum/Tokio, env-driven host/port, and `/healthz` + `/readyz` JSON endpoints.
- [ ] No auth/RBAC, device pairing, ingest pipeline, hot store, or persistence implemented yet.
- [ ] No WebSocket gateway, config plane, audit/login logging, or admin/user/number APIs exist.

## Foundations & scaffolding
- [x] Set up lint/format/test baseline (`cargo fmt`, `clippy` alias, unit/integration test harness); CI workflow pending.
- [x] Add shared error type (thiserror/anyhow) and response mapping for HTTP/WS.
- [x] Implement configuration loader (config.json + env overrides + secrets) with validation and defaults.
- [x] Define shared domain models and typed contracts (events, presence, config, pairing, users, numbers, audit, login events).
- [x] Add structured logging/tracing bootstrap with env-based filter.
- [x] Wire metrics exporter (Prometheus) and `/metrics` endpoint.
- [x] Containerize server (Dockerfile + compose service alongside Redis/DB) and document env vars.

## Auth & identity
- [ ] Implement OAuth/OIDC login + callbacks with issuer/audience validation.
- [ ] Implement simple_signin with Argon2id (per-user salt + global pepper), lockout, and password policy.
- [ ] Implement domain_signin (LDAP/AD bind, optional group fetch, allowlist).
- [ ] Add session issuance/validation (cookie/bearer) with expiry, CSRF protections, and refresh.
- [ ] Enforce mandatory admin 2FA (TOTP setup, backup codes, step-up for sensitive actions).
- [ ] Implement password reset flow (email tokens) and bootstrap admin credential path.

## RBAC & roles
- [ ] Define configurable roles/permissions with precedence and labels.
- [ ] Implement directory group -> role mapping resolver with audit trail.
- [ ] Enforce permission checks across REST/WS endpoints; return role metadata for smsgate2 gating.

## Device pairing & credentials
- [ ] Implement pairing session endpoints (`/api/v1/pairing/session`, `/complete`) that emit QR payloads.
- [ ] Issue device ids/tokens (hashed server-side) and rotation endpoints; enforce enable/disable state.
- [ ] Provide device rename/disable/enable endpoints and diagnostics fetch stub.
- [ ] Add bootstrap seeding for initial pairing/admin device policy.

## Config plane
- [ ] Load baseline `config.json` with versioning and validation.
- [ ] Implement PATCH config with validation + audit + persistence.
- [ ] Broadcast config updates to WS clients (smsgate2) and device clients (smsrelay3).
- [ ] Expose effective config snapshot for smsgate2 to gate auth modes and role labels.

## Ingest & event pipeline
- [ ] Implement `/api/v1/ingest` with device auth, normalization, and dedup TTL keys.
- [ ] Compute content hash + optional parsed_code extraction for OTPs.
- [ ] Append events to hot store ring buffer and emit `EVENT_NEW` over WS.
- [ ] Implement state transitions (`claim/verify/reject`) with validation + audit + broadcast.
- [x] Support batch ingest and backpressure hints to devices.
- [ ] Add policy-based persistence enqueue for compliance/retention rules.

## Presence, metrics, SIM inventory
- [ ] Implement `/api/v1/presence/heartbeat` ingestion with RTT + queue depth.
- [ ] Compute presence states (online/degraded/offline) and broadcast `PRESENCE_UPDATE`.
- [ ] Track SIM inventory diffs and emit `SIM_*` events + audit.
- [ ] Surface metrics to smsgate2 status bar (WS RTT, device RTT, end-to-end latency).

## WebSocket gateway & paging
- [ ] Implement WS handshake/auth, resume cursor, ping/pong, and connection limits.
- [ ] Serve `WELCOME` + initial `SNAPSHOT` with default limit; honor subscriptions (numbers/states/sources).
- [ ] Implement paging (`PAGE_BEFORE`/`PAGE_AFTER`) with anchors and retention windows.
- [ ] Broadcast `EVENT_UPDATE`, `PRESENCE_UPDATE`, `SIM_*`, `CONFIG_UPDATE`, `CONTACT_UPDATE`.
- [ ] Handle degraded modes (Redis down) with fallback notices + WS downgrade behavior.

## Storage: hot store + persistence
- [ ] Implement Redis-backed hot store (ring buffers, presence TTLs, dedup keys, cursors).
- [ ] Implement in-memory fallback hot store with graceful switch + rehydration toggle.
- [ ] Implement JSON DB adapter (append-only logs with locking) for small installs.
- [ ] Implement SQL adapters (SQLite/Postgres/MySQL) with migrations for events/audit/login/users/devices/numbers/config.
- [ ] Wire persistence worker respecting policy, retention, and pruning tasks.

## Audit, logging, observability
- [ ] Implement structured audit log (actor/action/target/result/details/correlation id).
- [ ] Implement login event log with IP/UA/mode/result + 2FA status.
- [ ] Add structured log categories (auth/ingest/paging/presence/sim/config/storage).
- [ ] Wire OpenTelemetry traces/spans around ingest + WS broadcast paths.
- [ ] Upgrade `/readyz` to include dependency checks (Redis/DB/config) and surface degraded state.

## Admin & management APIs
- [ ] CRUD endpoints for users/numbers/roles/rbac-mapping with validation + pagination.
- [ ] Force logout/unlock endpoints for users.
- [ ] Number assign/unassign endpoints with validation and audit.
- [ ] Device diagnostics endpoint for smsgate2 per spec.

## Testing & quality
- [ ] Unit tests for config loader, auth hashing/policy, dedup logic, hot store ring buffer.
- [ ] Integration tests for ingest -> WS fanout, paging, presence transitions, SIM diffing.
- [ ] End-to-end tests with smsgate2 + smsrelay3 mocks (Wiremock or in-process stubs).
- [ ] Load tests for WS fanout/pagination + ingest throughput (target p95 < 50ms internal).
- [ ] Security tests for auth mode toggles, session fixation, CSRF, and rate limiting.
- [ ] CI pipeline for fmt/clippy/test/build + container image + vulnerability scan.

## Operations & release
- [x] Build Docker image with minimal base + non-root user; publish compose profile with Redis/DB.
- [ ] Provide migration tool/command for DB adapters and config seeding.
- [x] Document environment variables, config keys, and failure modes.
- [ ] Add runbooks for Redis outage fallback/recovery and hot-store migration back to Redis.
- [ ] Publish cutover plan + compatibility matrix with smsgate2 and smsrelay3 versions.
