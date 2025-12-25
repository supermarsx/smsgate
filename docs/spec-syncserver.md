# syncserver — Full Product + Technical Spec

**syncserver** is the realtime core that ingests SMS events from **smsrelay3**, fans them out to **smsgate2** dashboards over WebSocket, tracks presence/latency, maintains hot state in Redis (with in‑memory fallback), persists selectively to a chosen database backend, and exposes a central configuration plane for the entire stack.

This spec is authoritative for:

- Realtime ingest + dedup + fanout
- WebSocket protocol (realtime + paging + config push)
- Authentication modes (oauth / simple\_signin / domain\_signin)
- Configurable roles & permissions
- Admin bootstrapping + mandatory admin 2FA
- Device pairing + device auth
- Presence + SIM inventory + multi‑SIM support
- Storage backends (Redis optional, DB adapters incl. JSON DB)
- Audit and login event logging

---

## 1) Goals

### 1.1 Core goals

- Deliver **sub‑second realtime** message propagation with a server target of:
  - ingest → hot store write + broadcast **p95 < 50ms** inside syncserver
- Provide **WS-first APIs** for:
  - realtime events
  - presence
  - SIM changes
  - paging (older/newer)
  - config updates
- Be **config-driven** with a `config.json` baseline + live updates via Admin UI.
- Provide **high trust controls**:
  - mandatory 2FA for admin
  - immutable audit log
- Support multiple storage backends and operate **without Redis** via automatic in-memory fallback.

### 1.2 Non-goals (v1)

- Multi-region active-active.
- Complex workflow engines.
- Heavy analytics.

---

## 2) High-Level Architecture

### 2.1 Components (inside syncserver)

- **HTTP/WS API Layer**
  - REST endpoints (admin + device + fallback)
  - WebSocket gateway (dashboards)
- **Auth & Sessions**
  - oauth, simple\_signin, domain\_signin
  - session issuance/validation
  - admin 2FA
- **RBAC Engine**
  - configurable roles + permissions
  - directory group mapping
- **Device Management**
  - QR pairing
  - device credential issuance
  - device naming, enable/disable
- **Ingest Pipeline**
  - validate device + number ownership
  - normalize + hash
  - dedup
  - hot-store write
  - broadcast
  - persistence policy enqueue
- **Presence & Metrics**
  - heartbeat ingestion
  - presence state evaluation
  - RTT tracking
- **SIM Inventory Manager**
  - multi-SIM discovery
  - diff + emit SIM\_\* events
- **Hot Store**
  - Redis-backed mode
  - in-memory fallback mode
- **Persistent Store**
  - adapters: JSON DB, SQLite, Postgres, MySQL
  - migrations where applicable
- **Audit + Login Log**
  - append-only audit stream
  - login events table
- **Config Plane**
  - config.json baseline
  - live updates w/ validation
  - WS config push to smsgate2 + smsrelay3

### 2.2 Data flow (fast path)

1. smsrelay3 sends ingest
2. syncserver validates → dedup → hot store write
3. syncserver broadcasts `EVENT_NEW` to WS clients
4. persistence policy optionally enqueues for DB write

---

## 3) Authentication Modes

### 3.1 Enabled auth modes

Configured centrally (and exposed to smsgate2 for button availability):

- `oauth` — OAuth/OIDC
- `simple_signin` — local credentials
- `domain_signin` — LDAP bind / AD

If a mode is disabled, its endpoints remain present but return a clear “disabled by config” error.

### 3.2 simple\_signin

- Password hashing: **Argon2id**
  - per-user random salt
  - global pepper in server config
  - configurable parameters
- Accounts can be locked on repeated failures (policy configured).

#### 3.2.1 Password policy (configurable)

Password policy is **enforced server-side** and applies to:
- simple_signin users
- bootstrap admin
- password change flows
- password reset flows

Passwords are **never retrievable**.

**Baseline defaults (recommended):**

**Length**
- `min_length`: 14
- `max_length`: 128

**Admin overrides**
- `admin_min_length`: 16
- `admin_min_entropy_bits`: 96

**Character classes**
- Require characters from **N of M classes** (default: 3 of 4):
  - uppercase (A–Z)
  - lowercase (a–z)
  - digits (0–9)
  - symbols (printable ASCII)

**Entropy**
- `min_entropy_bits`: 80
- Estimator must penalize repetition, sequences, and dictionary words.

**Forbidden patterns**
- Username, email, or obvious substrings
- Repeated characters beyond `max_repeat`
- Sequential patterns (numeric, alphabetic, keyboard walks)
- Known weak/breached passwords (denylist or hash lookup)

**Reuse protection**
- `history_size`: 5 (previous hashes rejected)

**Rate limiting & lockout**
- Progressive backoff
- Temporary lock after N failures

**Admin-specific enforcement**
- Forced password change on first login
- Password change invalidates all sessions
- Mandatory 2FA

All password policy changes are validated, applied immediately, and audited.

#### Password reset via email

- Passwords are never retrievable.
- Reset flow:
  - request reset → email token → set new password
- Requires SMTP config.

### 3.3 oauth (OIDC)

- OIDC code flow; tokens validated by issuer/audience.
- User mapping:
  - subject/email → internal user record
  - first login can auto-provision (policy-configurable)

### 3.4 domain\_signin (LDAP/AD)

- LDAP bind against configured server(s).
- Optional group fetching for RBAC mapping.
- Optional allowlist for UPN/email domain.

---

## 4) Admin Bootstrapping & 2FA

### 4.1 Embedded default admin

- On first startup, syncserver ensures a **bootstrap admin principal** exists.
- **The admin username is NOT hardcoded**.
- The initial admin username is **explicitly defined in ****`config.json`** (e.g. `auth.bootstrap_admin.username`).
- This username **must not be ****`admin`**** by default**; operators are required to choose a non-obvious value.
- Password for the bootstrap admin is:
  - either provided (hashed) in config
  - or auto-generated one-time and logged to console on first boot (policy-controlled)
- Bootstrap admin must:
  - change password on first login
  - complete mandatory 2FA setup

### 4.2 Mandatory admin 2FA

- Admin accounts require TOTP:
  - setup on first login
  - backup codes generated (hashed) and presented once
- 2FA enforcement is server-side and cannot be disabled for admin.

---

## 5) RBAC: Roles, Permissions, Group Mapping

### 5.1 Configurable roles

A role definition contains:

- `name`
- `precedence` (integer)
- `permissions[]`

Default bootstrap roles exist but are editable.

### 5.2 Permissions (suggested v1 set)

- `events.read`
- `events.claim`
- `events.verify`
- `events.reject`
- `devices.read`
- `devices.write`
- `devices.disable`
- `devices.rotate_token`
- `numbers.read`
- `numbers.write`
- `users.read`
- `users.write`
- `users.force_logout`
- `users.unlock`
- `config.read`
- `config.write`
- `audit.read`
- `logins.read`

### 5.3 Directory group mapping

- Many-to-one mapping of directory groups → role.
- Resolution: highest precedence role wins.
- Changes are audited.

---

## 6) Device Identity, Pairing, and Auth

### 6.1 Device auth (MVP)

- Token-based device authentication:
  - device token issued on successful pairing
  - stored hashed server-side
- Optional future upgrade: mTLS.

### 6.2 QR pairing flow

1. Manager/admin requests pairing session
2. syncserver returns pairing id + QR payload
3. smsrelay3 scans QR and completes pairing
4. syncserver returns device id + device token
5. smsrelay3 stores token in Android Keystore

### 6.3 Device naming and state

- Devices have:
  - `friendly_name`
  - `enabled` flag
  - `last_seen_at`
  - `last_rtt_ms`
  - `queue_depth`

---

## 7) Presence, Latency, and Health

### 7.1 Heartbeats

smsrelay3 sends heartbeat every N seconds:

- device id
- client time
- queue depth
- battery/network (optional)
- last successful ingest time
- optional client-measured RTT hints

### 7.2 Presence evaluation

- Online: < 20s
- Degraded: 20–60s
- Offline: > 60s

### 7.3 Latency metrics

- Dashboard RTT: WS ping/pong
- Device RTT: heartbeat RTT and/or client-measured RTT
- End-to-end: event timestamps

### 7.4 Health endpoints

- `GET /healthz` basic
- `GET /readyz` dependency checks
- `GET /metrics` (Prometheus)

---

## 8) Multi-SIM / SIM Inventory

### 8.1 SIM model

A device reports zero or more SIM entries:

- `slot_index` (0..n)
- `iccid` (if available)
- `msisdn` (phone number if available)
- `carrier_name` (optional)
- `last_seen_at`
- `status` (active/inactive)

### 8.2 Reporting

- smsrelay3 periodically calls:
  - `POST /api/v1/device/sims`
- or includes SIM inventory in heartbeat payload.

### 8.3 Diff and events

syncserver diffs last-known SIM inventory and emits:

- `SIM_ADDED`
- `SIM_REMOVED`
- `SIM_CHANGED` (e.g., slot re-assigned, number changed)

These are broadcast to dashboards and recorded in audit logs.

---

## 9) Ingest Pipeline (SMS Events)

### 9.1 Ingest request

- Source: `android_sms`
- Required fields:
  - device id
  - device seq or ULID
  - received\_at\_device (optional)
  - server will set `server_received_at`
  - sender
  - content
  - (optional) e164 if smsrelay3 can determine
  - metadata

### 9.2 Normalization

- Normalize whitespace
- Compute `content_hash`
- Attempt code parsing → `parsed_code` (optional)

### 9.3 Dedup

- Dedup keys stored in hot store with TTL
- At-least-once ingest allowed; duplicates suppressed

### 9.4 Event states

- `new`
- `claimed`
- `verified`
- `rejected`

State transitions are validated, audited, and broadcast via `EVENT_UPDATE`.

---

## 10) Hot Store: Redis + In-Memory Fallback

### 10.1 HotStore interface

syncserver implements an internal interface:

- append event
- fetch latest
- fetch before/after cursor
- set/get dedup keys
- presence set/get
- config version set/get

### 10.2 Redis-backed mode (preferred)

- Redis holds:
  - ring buffers per org
  - per-number lists
  - presence TTL keys
  - dedup TTL keys
  - cursors

### 10.3 In-memory fallback mode

When Redis is unavailable:

- syncserver switches to in-memory ring buffers and TTL maps.
- paging still works within the in-memory retention window.
- admin UI shows degraded backend status.
- once Redis returns, syncserver can:
  - continue in-memory until manual switch, or
  - auto-migrate hot buffers back to Redis (configurable).

---

## 11) Persistence & Database Backends

### 11.1 Policy-based persistence

- Default: keep events in hot store; persist only when:
  - event is claimed/verified/rejected
  - compliance tags match
  - retention threshold reached

A background worker writes persisted events to DB.

### 11.2 Database adapters

- `json_db` — single file or folder of JSON files (dev/small installs)
- `sqlite`
- `postgres`
- `mysql`

### 11.3 JSON DB format (v1)

- Append-only log files for audit and events
- Separate JSON documents for users/devices/numbers/config
- Atomic writes (write temp then rename)
- File locking to prevent corruption

---

## 12) WebSocket Protocol (Dashboards + Paging + Config)

### 12.1 Connection

- `GET /api/v1/ws`
- Auth via session cookie or short-lived WS token.

### 12.2 Server → client messages

- `WELCOME`
- `SNAPSHOT { events[], limit, newest_id, oldest_id }`
- `EVENT_NEW { event }`
- `EVENT_UPDATE { id, patch }`
- `PRESENCE_UPDATE { devices[] }`
- `SIM_ADDED|SIM_REMOVED|SIM_CHANGED`
- `CONTACT_UPDATE` (optional)
- `CONFIG_UPDATE { version, patch }`
- `PAGE { direction, anchor_id, events[], oldest_id, newest_id }`
- `ERROR`

### 12.3 Client → server messages

- `SUBSCRIBE { numbers?, states?, sources? }` (optional; default assigned)
- `PAGE_BEFORE { anchor_id, limit }`
- `PAGE_AFTER { anchor_id, limit }`
- `PING`

### 12.4 Default paging behavior

- Initial SNAPSHOT limit defaults to **10** (configurable).
- Paging limit defaults to **25**.
- Ordering is always newest → oldest on the client.

---

## 13) REST API (Admin/Device/Fallback)

### 13.1 Auth

- `POST /api/v1/auth/login` (simple\_signin)
- `POST /api/v1/auth/domain-login` (domain\_signin)
- `GET /api/v1/auth/oidc/*` (oauth callbacks if hosted)
- `POST /api/v1/auth/2fa/verify`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

### 13.2 Pairing + devices

- `POST /api/v1/pairing/session`
- `POST /api/v1/pairing/complete`
- `GET /api/v1/devices`
- `PATCH /api/v1/devices/{id}` (rename)
- `POST /api/v1/devices/{id}/disable|enable|rotate-token`

### 13.3 Device reporting

- `POST /api/v1/ingest`
- `POST /api/v1/presence/heartbeat`
- `POST /api/v1/device/sims`

### 13.4 Users, numbers, roles

- `GET/POST/PATCH /api/v1/users`
- `POST /api/v1/users/{id}/force-logout`
- `POST /api/v1/users/{id}/unlock`
- `GET/POST/PATCH /api/v1/numbers`
- `POST /api/v1/numbers/{e164}/assign`
- `GET/POST/PATCH /api/v1/roles`
- `GET/POST/PATCH /api/v1/rbac-mapping`

### 13.5 Audit + logins

- `GET /api/v1/audit`
- `GET /api/v1/login-events`

### 13.6 Config

- `GET /api/v1/config`
- `PATCH /api/v1/config`

---

## 14) Configuration System

### 14.1 config.json baseline

- syncserver loads `config.json` at boot.
- Config has a `version` and `last_updated_at`.
- Live updates:
  - validated
  - applied
  - persisted
  - broadcast via WS `CONFIG_UPDATE`

### 14.2 Config structure (high level)

- `auth.modes` (enabled list)
- `auth.oidc` settings
- `auth.ldap` settings
- `auth.password_hash` parameters
- `auth.pepper` secret
- `auth.2fa` policy
- `rbac.roles`
- `rbac.group_mapping`
- `ws.snapshot_limit`, `ws.max_connections`, `ws.ping_interval`
- `presence.thresholds`
- `storage.hotstore` (redis|memory)
- `storage.redis` settings
- `storage.db` backend settings (json/sqlite/postgres/mysql)
- `retention` and `persistence_policy`
- `smtp` settings
- `logging` settings

---

## 15) Audit & Login Event Model

### 15.1 Audit log

- append-only
- includes:
  - actor
  - action
  - target
  - result
  - details
  - correlation id

### 15.2 Login events

- records:
  - attempted identity
  - mode
  - result + reason
  - ip, ua
  - 2FA status

---

## 16) Logging, Tracing, Observability

### 16.1 Logging requirements

- Structured JSON logs
- Correlation IDs across request/WS events
- Log categories:
  - auth
  - ingest
  - paging
  - presence
  - sim
  - config
  - storage backend switches

### 16.2 Metrics

- WS connections, reconnects
- ingest throughput
- dedup hit rate
- hot store latency
- persistence latency
- presence counts

### 16.3 Tracing

- OpenTelemetry export optional

---

## 17) Performance & Scaling

### 17.1 Concurrency model

- Tokio runtime
- broadcast channels per org
- per-connection backpressure

### 17.2 Backpressure

- per-client send queue cap
- drop/close slow clients
- paging responses chunked if large

### 17.3 Limits

Configurable:

- max WS connections
- max events in hot store ring buffer
- max paging limit

---

## 18) Security Hardening

- TLS everywhere
- rate limiting for auth endpoints
- lockout policy for simple\_signin
- CSRF protection for admin REST (if used by browser)
- secrets not logged
- device tokens rotated
- admin-only config changes

---

## 19) Acceptance Criteria

- Supports oauth/simple\_signin/domain\_signin with mode toggles.
- Argon2id + salt + pepper for local passwords.
- Mandatory admin TOTP 2FA.
- Configurable roles + permissions + directory mapping.
- QR pairing issues device token.
- Multi-SIM inventory tracked and emits SIM\_\* events.
- Redis-backed hot store with automatic in-memory fallback.
- WS protocol supports snapshot + paging before/after.
- Policy-based persistence to DB adapters including JSON DB.
- Extensive structured logs + audit + login events.

