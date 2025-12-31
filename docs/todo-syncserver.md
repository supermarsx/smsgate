# syncserver - Exhaustive TODO

## Current state (gap check)
- [x] New `syncserver/` Rust crate scaffolded with Axum/Tokio, env-driven host/port, and `/healthz` + `/readyz` JSON endpoints.
- [x] Auth/RBAC guards on config + device endpoints, pairing flow issuing device tokens (hashed), ingest/presence/hot-store/persistence JSON DB baselines.
- [x] Audit/login logging wired; admin/user/number APIs still pending; WS + HTTP config snapshots/updates now implemented.

## Foundations & scaffolding
- [x] Set up lint/format/test baseline (`cargo fmt`, `clippy` alias, unit/integration test harness); CI workflow pending.
- [x] Add shared error type (thiserror/anyhow) and response mapping for HTTP/WS.
- [x] Implement configuration loader (config.json + env overrides + secrets) with validation and defaults.
- [x] Define shared domain models and typed contracts (events, presence, config, pairing, users, numbers, audit, login events).
- [x] Add structured logging/tracing bootstrap with env-based filter.
- [x] Wire metrics exporter (Prometheus) and `/metrics` endpoint.
- [x] Containerize server (Dockerfile + compose service alongside Redis/DB) and document env vars.

## Auth & identity
- [x] Implement OAuth/OIDC login + callbacks with issuer/audience validation (stubbed validation).
- [x] Implement simple_signin with Argon2id (per-user salt + optional pepper) and password policy.
- [x] Implement domain_signin (shared-secret stub until LDAP bind available).
- [x] Add session issuance/validation (bearer token) with expiry.
- [x] Enforce admin TOTP when configured; bootstrap admin defaults to no secret.
- [x] Implement password reset token flow and bootstrap admin credential path.
- [x] Scaffold device auth extractor (header-based placeholder) and RBAC role struct; wire ingest/presence through auth guard.

## RBAC & roles
- [x] Define configurable roles/permissions with precedence and labels.
- [x] Implement directory group -> role mapping resolver (audit trail pending).
- [x] Enforce permission checks across REST/WS endpoints (config read guarded) and return role metadata for smsgate2 gating.

## Device pairing & credentials
- [x] Implement pairing session endpoints (`/api/v1/pairing/session`, `/complete`) that emit QR payloads.
- [x] Issue device ids/tokens (hashed server-side) for pairing completion (rotation pending).
- [x] Provide device rename/disable/enable endpoints and diagnostics fetch stub.
- [x] Add bootstrap seeding for initial pairing/admin device policy.

## Config plane
- [x] Load baseline `config.json` with versioning and validation.
- [x] Implement PATCH config with validation + persistence (audit stream pending).
- [x] Broadcast config updates to WS clients (smsgate2) and device clients (smsrelay3).
- [x] Expose effective config snapshot for smsgate2 to gate auth modes and role labels.

## Ingest & event pipeline
- [x] Implement `/api/v1/ingest` with device auth, normalization, and dedup TTL keys.
- [x] Compute content hash + optional parsed_code extraction for OTPs.
- [x] Append events to hot store ring buffer and emit `EVENT_NEW` over WS (WS emit pending).
- [x] Implement state transitions (`claim/verify/reject`) with validation + broadcast (audit stream pending).
- [x] Support batch ingest and backpressure hints to devices (batch limit enforced; backpressure signals pending).
- [x] Add policy-based persistence enqueue for compliance/retention rules.

## Presence, metrics, SIM inventory
- [x] Implement `/api/v1/presence/heartbeat` ingestion with RTT + queue depth.
- [x] Compute presence states (online/degraded/offline) (broadcast pending) and track in-memory.
- [x] Track SIM inventory diffs and emit `SIM_*` events + audit.
- [x] Surface metrics to smsgate2 status bar (WS RTT, device RTT, end-to-end latency).

## WebSocket gateway & paging
- [x] Implement WS handshake (unauthenticated stub), ping/pong, and broadcast channel.
- [x] Serve `WELCOME` + initial `SNAPSHOT` with default limit; event/presence broadcasts wired.
- [x] Implement paging (`PAGE_BEFORE`/`PAGE_AFTER`) with anchors and retention windows.
- [x] Broadcast `CONFIG_UPDATE` and `EVENT_UPDATE`.
- [x] Broadcast `SIM_*`, `CONTACT_UPDATE` shapes (stubbed) and degraded notices on connect.
- [x] Handle degraded modes (Redis down) with fallback notices + WS downgrade behavior.

## Storage: hot store + persistence
- [x] Implement Redis-backed hot store (ring buffers, presence TTLs, dedup keys, cursors) (falls back to memory on failure/misconfig).
- [x] Implement in-memory fallback hot store with graceful switch + rehydration toggle.
- [x] Implement JSON DB adapter (append-only logs) for small installs.
- [x] Implement SQL adapters (SQLite/Postgres/MySQL) with migrations for events/audit/login/users/devices/numbers/config (events table bootstrap included).
- [x] Wire persistence worker respecting policy, retention, and pruning tasks (baseline enqueue to JSON DB).

## Audit, logging, observability
- [x] Implement structured audit log (actor/action/target/result/details/correlation id).
- [x] Implement login event log with IP/UA/mode/result + 2FA status.
- [x] Add structured log categories (auth/ingest/paging/presence/sim/config/storage).
- [x] Wire OpenTelemetry traces/spans around ingest + WS broadcast paths.
- [x] Upgrade `/readyz` to include dependency checks (Redis/DB/config) and surface degraded state.

## Admin & management APIs
- [x] CRUD endpoints for users/numbers/roles/rbac-mapping with validation + pagination.
- [x] Force logout/unlock endpoints for users.
- [x] Number assign/unassign endpoints with validation and audit.
- [x] Device diagnostics endpoint for smsgate2 per spec.

## Testing & quality
- [x] Unit tests for config loader, auth hashing/policy, dedup logic, hot store ring buffer.
- [x] Integration tests for ingest -> WS fanout, paging, presence transitions, SIM diffing.
- [x] End-to-end tests with smsgate2 + smsrelay3 mocks (Wiremock or in-process stubs).
- [x] Load tests for WS fanout/pagination + ingest throughput (target p95 < 50ms internal).
- [x] Security tests for auth mode toggles, session fixation, CSRF, and rate limiting.
- [x] CI pipeline for fmt/clippy/test/build + container image + vulnerability scan.

## Operations & release
- [x] Build Docker image with minimal base + non-root user; publish compose profile with Redis/DB.
- [ ] Provide migration tool/command for DB adapters and config seeding.
- [x] Document environment variables, config keys, and failure modes.
- [ ] Add runbooks for Redis outage fallback/recovery and hot-store migration back to Redis.
- [ ] Publish cutover plan + compatibility matrix with smsgate2 and smsrelay3 versions.
