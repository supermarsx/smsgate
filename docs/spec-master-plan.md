# Realtime Verification Stream

A time‑critical system for multiple corporate users to watch and verify a **live, always‑on** stream of incoming verification messages (banking, login, OTP-like events). Target: **sub‑second end‑to‑end**, with a **p95 < 200ms** “message arrives → visible on dashboard” on a healthy LAN/near‑region deployment.

This canvas contains:
- **Master Overarching Spec** (architecture, repo plan, security, performance)
- **Spec A — smsgate2 (Next.js + WS + OAuth)**
- **Spec B — syncserver (Rust Realtime Core + Presence + Redis Memory Layer)**
- **Spec C — smsrelay3 (Kotlin + QR Pairing + SMS Read + Presence + Perpetual Sync)**

---

## 1) Master Overarching Spec

### 1.1 Goals
- **Real‑time stream** of verification messages with **low latency** and **high reliability**.
- **Zero‑click stream**: after login, messages appear **immediately** on **smsgate2**.
- **Perpetual sync**: guarantee messages are eventually consistent across **smsrelay3 → syncserver → smsgate2** even across disconnects.
- **Presence module** to ensure phone connectivity is **live** and visible.
- **Connection status + latencies everywhere**:
  - Verifier sees **server connection**, **phone connection**, and **latency** indicators.
  - **smsrelay3** shows **server connection**, **phone‑to‑server latency**, queue depth.
- **Multi‑tenant ready** (at least org boundary), with **RBAC**.
- Users can have **one or more phone numbers/identifiers** assigned.
- Users can be **Managers** with elevated controls (pairing, assignments, audits).
- **syncserver always protected** (network + auth + hardening).
- Auth backends:
  - **Local JSON** (dev only), **SQLite** (small), **Postgres/MySQL** (prod)
  - **Active Directory integration** (LDAP bind)
  - **OAuth/OIDC** (SSO)

### 1.2 Non‑Goals (for v1 to stay fast)
- No complex workflow engine.
- No ML classification.
- No multi‑region active‑active initially (add later if needed).

### 1.3 Primary User Stories
1. **Verifier** logs in and instantly sees the latest messages updating in real time.
2. **Verifier** always sees:
   - **syncserver** connection (WS) status
   - **smsrelay3** phone/device connection status (presence)
   - Latency metrics (server RTT, device RTT, ingest→dashboard)
3. **Manager** pairs phones via QR in **smsgate2**, assigns numbers, monitors device presence and health.
4. **smsrelay3** continuously relays SMS messages with ACK/resend and offline queue.
5. System keeps **hot messages** in Redis and **persists only when needed**.

### 1.4 System Components

- **syncserver (Rust Sync Server — Core)**
  - Ingest from **smsrelay3**.
  - AuthN/AuthZ.
  - **Presence service** (heartbeat + latency measurements).
  - **Realtime fanout** to WebSocket clients (smsgate2).
  - **Redis memory layer** for hot events, cursors, presence, dedup.
  - **Selective persistence** to DB via policy.

- **smsgate2 (Next.js Web Dashboard — Client/Server)**
  - Always-on stream UI + admin management UI.
  - WS for stream + REST for management/backfill.
  - OAuth/OIDC login + session.

- **smsrelay3 (Android Relay App — Kotlin)**
  - **SMS Read mechanism only** (reads incoming SMS).
  - Durable local queue + ACK/resend.
  - Presence heartbeats including latency.
  - Fully automated QR pairing.

### 1.5 Realtime Data Flow
1. **smsrelay3** reads an incoming SMS.
2. **smsrelay3** sends **Ingest** to **syncserver**.
3. **syncserver**:
   - Validates device identity.
   - Normalizes + deduplicates.
   - Writes to **Redis hot store**.
   - Broadcasts to WS clients (**smsgate2**).
   - Optionally persists to DB based on policy.
4. **smsgate2** receives event and renders instantly.

**Fast path objective:** smsrelay3 → syncserver ingest → Redis write + WS broadcast (DB optional / policy‑based).

### 1.6 Presence Module + Latency (Device Connectivity)

#### Presence states
- Online (healthy)
- Degraded (heartbeat lagging)
- Offline
- Disabled/blocked

#### Heartbeat payload (device → syncserver)
- `device_id`
- `client_time_ms`
- `battery_percent` (optional)
- `network_type` (wifi/cell/other) (optional)
- `app_version`
- `queue_depth`
- `last_sms_received_at_device_ms` (optional)
- **latency probes**:
  - `last_server_time_ms` (from previous response)
  - `measured_rtt_ms` (client-measured; optional)

#### Presence evaluation (syncserver)
- Online: last seen < 20s
- Degraded: 20–60s
- Offline: > 60s
- Stored in Redis with TTL.

#### Latency definitions
- **Server RTT (smsgate2 ↔ syncserver):** WS ping/pong (client measured)
- **Device RTT (smsrelay3 ↔ syncserver):** heartbeat response time or client-measured RTT
- **Ingest → dashboard:** `server_received_at` vs `dashboard_received_at` (client measured), optionally include `server_broadcast_at`

#### Dashboard indicators (always visible)
- WS status: Connected / Reconnecting / Offline
- Server RTT: p50, last, and a small sparkline (optional)
- Device presence summary: Online/Degraded/Offline counts
- For selected filters (or per assigned number): device status + device RTT

#### Android indicators (always visible)
- Server status: Connected / Degraded / Offline
- Device RTT (last)
- Queue depth
- Last successful ingest timestamp

### 1.7 Latency & Performance Targets
- **End‑to‑end (ingest → dashboard render):**
  - p50 < 80ms
  - p95 < 200ms
  - p99 < 400ms
- **WS fan‑out:** 5k concurrent viewers (tunable).
- **Ingest throughput:** 200 msg/s sustained, burst 2k msg/s.

### 1.8 Architecture Choices
- Rust: `axum` + `tokio`.
- WebSockets: native WS + broadcast channel.
- **Redis required** for hot cache, presence, cursors, dedup.
- DB: **Postgres** for prod.

Optional later: Redis Streams for stronger replay, NATS/Kafka for heavy fanout.

### 1.9 Storage & Retention Strategy (Redis-first)

#### Principle
- Keep hot, recent messages in Redis.
- Persist only when policy says so.

#### Redis usage
- Latest events per org: ring buffer
- Latest events per number: per-number list
- WS resume cursors: last-seen ULID per user/session
- Presence: per-device heartbeat key with TTL
- Dedup keys: short TTL

#### Persistence policy examples
Persist only:
- events that are **claimed/verified/rejected**
- events tagged compliance‑relevant
- events older than X minutes/hours (optional)
- audit‑relevant events

Non‑persisted events expire in Redis after 24–72h.

### 1.10 Security Model

#### Trust boundaries
- **syncserver:** core trust boundary
- **smsrelay3** devices: semi‑trusted
- **smsgate2** web clients: untrusted

#### AuthN/AuthZ
- Humans:
  - Local username/password
  - AD/LDAP bind
  - OAuth/OIDC
- Devices:
  - Token (MVP) or mTLS (later)

#### RBAC roles
- `viewer`: read stream
- `verifier`: claim/verify/reject
- `manager`: pairing + assignments + device controls + logs
- `admin`: system settings + OAuth config + retention

#### Auditing
- Immutable audit log for:
  - logins (success/fail)
  - pairing
  - assignments
  - verification actions
  - device disable/enable

### 1.11 OAuth/OIDC Module
- OIDC recommended (Azure AD / Entra ID, Keycloak, Okta, etc.).
- Role mapping:
  - v1 manual via admin UI
  - optional group mapping later
- Security:
  - enforce issuer/audience
  - state/nonce
  - short sessions + refresh

### 1.12 Data Model (Minimal v1)

#### Entities
- Organization: `id`, `name`
- User: `id`, `org_id`, `username`, `display_name`, `email`, `role`, `status`, `auth_source`, `password_hash?`, `last_login_*`
- LoginEvent: `id`, `org_id`, `user_id`, `timestamp`, `auth_source`, `ip`, `user_agent`, `result`, `reason`
- NumberAssignment: `id`, `org_id`, `e164_number`, `label`, `assigned_user_id?`, `is_shared`
- Device: `id`, `org_id`, `device_name`, `status`, `token_hash`, `last_seen_at`, `presence_state`, `last_rtt_ms?`
- DeviceNumberPermission: `device_id`, `org_id`, `e164_number`
- VerificationEvent:
  - `id` (ULID), `org_id`, `source` (android_sms), `received_at`, `broadcast_at?`
  - `device_id`, `e164_number`, `sender`, `content`, `content_hash`
  - `parsed_code?`, `metadata_json`, `state`, `claimed_by_user_id?`, `updated_at`, `persisted`
- AuditLog: `id`, `org_id`, `actor_user_id`, `action`, `target_type`, `target_id`, `timestamp`, `details_json`

#### Indexing
- VerificationEvent(org_id, received_at DESC)
- VerificationEvent(org_id, e164_number, received_at DESC)
- NumberAssignment(org_id, e164_number) unique
- LoginEvent(org_id, user_id, timestamp DESC)

### 1.13 Event Deduplication & Ordering
- Server receive time is the canonical order.
- Dedup key stored in Redis with TTL:
  - `(org_id, e164_number, content_hash, sender, floor(received_at/5s))`

### 1.14 Perpetual Sync Mechanism (Guarantee)
- **smsrelay3**:
  - durable local queue (Room)
  - per-message sequence or ULID
  - resend until ACK
- **syncserver**:
  - ACK with `event_id`
  - store immediately in Redis
- **smsgate2**:
  - WS live stream
  - periodic gap check via REST using cursor

### 1.15 APIs (High Level)

#### Pairing
- POST `/api/v1/pairing/session` (manager/admin)
- POST `/api/v1/pairing/complete` (device)

#### Ingest
- POST `/api/v1/ingest` (device)

#### Presence
- POST `/api/v1/presence/heartbeat` (device)

#### Stream
- GET `/api/v1/ws` (WebSocket)
  - Auto-subscribe based on assigned numbers
  - Pushes: `SNAPSHOT`, `EVENT_NEW`, `EVENT_UPDATE`, `PRESENCE_UPDATE`, `METRICS_UPDATE`

#### Management
- GET `/api/v1/events` (backfill)
- POST `/api/v1/events/{id}/claim|verify|reject`
- CRUD `/api/v1/users|numbers|devices`
- GET `/api/v1/login-events`

### 1.16 WebSocket Protocol (v1)

#### Server → Client
- `WELCOME`
- `SNAPSHOT`
- `EVENT_NEW` / `EVENT_UPDATE`
- `PRESENCE_UPDATE`
- `METRICS_UPDATE` (server time, heartbeat aggregates, etc.)
- `PONG`
- `ERROR`

### 1.17 Observability
- Metrics:
  - ingest rate, dedup rate
  - WS connections
  - presence state counts
  - latency histograms (server RTT, device RTT, ingest→dashboard)
  - Redis latency, DB latency

### 1.18 Deployment
- **syncserver** behind TLS proxy.
- Redis + Postgres.
- **smsgate2** internal node server.

### 1.19 Monorepo Layout
```
repo/
  apps/
    smsgate2/
    smsrelay3/
  services/
    syncserver/
  packages/
    protocol/
  infra/
    docker/
  docs/
```

---

## 2) Spec A — smsgate2 (Next.js + TypeScript + OAuth/OIDC)

### 2.1 Purpose
Always-on verifier dashboard + admin UI, with **explicit status and latency indicators**.

### 2.2 Pages
- `/login`
- `/stream` (default landing after login)
- `/devices` (presence, pairing)
- `/numbers` (assignments)
- `/users` (roles)
- `/audit`, `/logins`

### 2.3 Stream UX (Zero‑click)
- Auto-connect WS on page load.
- Auto-subscribe to assigned numbers.
- Render snapshot instantly, then real-time updates.

### 2.4 Status + Latency UX (Verifier)
Always visible on `/stream`:
- **syncserver connection status**: Connected/Reconnecting/Offline
- **syncserver RTT (ms)**: last + rolling average
- **smsrelay3 phone connection status**:
  - aggregated: Online/Degraded/Offline counts
  - per-number badge shows device presence + last device RTT
- **End-to-end latency (ms)**: last/p50/p95 (client measured)

### 2.5 Manager UX
- Device pairing: generate QR, show countdown, device auto appears.
- Device health: presence status, last seen, device RTT, queue depth, disable/enable.

---

## 3) Spec B — syncserver (Rust Realtime Core + Presence + Redis)

### 3.1 Purpose
Authoritative core: ingest, store hot in Redis, broadcast, presence, selective persistence.

### 3.2 Key Responsibilities
- Ingest endpoint + ACK
- Dedup via Redis TTL keys
- Hot store in Redis (ring buffer)
- WS fanout with auto-subscribe
- Presence heartbeat + evaluation
- Metrics emission (`METRICS_UPDATE` + /metrics endpoint)
- Persistence policy worker

### 3.3 Redis Keys (suggested)
- `org:{id}:events` (list/ring)
- `org:{id}:num:{e164}:events`
- `org:{id}:dedup:{hash}` (TTL)
- `org:{id}:presence:{device_id}` (TTL)
- `org:{id}:cursor:{user_id}`
- `org:{id}:persist_queue` (list/stream)

---

## 4) Spec C — smsrelay3 (Kotlin + QR Pairing + SMS Read)

### 4.1 Capture Mechanism (Mandatory)
- **SMS Read only**.
- Uses Android’s SMS receiving mechanisms (BroadcastReceiver for `SMS_RECEIVED`) and reads message content.
- Requires sensitive permissions:
  - `RECEIVE_SMS`
  - `READ_SMS`
  - (optional) `READ_PHONE_STATE` only if strictly needed for device identifiers (avoid if possible).

> Note: this has store/policy implications depending on distribution method. For corporate/MDM/internal distribution this is typically acceptable.

### 4.2 Core Features
- QR pairing (scan once, auto-provision)
- Durable queue (Room)
- ACK/resend
- Presence heartbeat with latency
- Always-visible connection status UI

### 4.3 App UI Requirements (Verifier-grade visibility)
Always visible in app:
- **syncserver connection status** (Connected/Degraded/Offline)
- **Device RTT** (last/avg)
- **Queue depth**
- **Last successful send** timestamp
- Diagnostics screen (manager/admin only): recent errors, permission status, last 20 sends.

### 4.4 Perpetual Sync
- Every SMS becomes a queued item.
- Send includes `seq` and `device_time_ms`.
- Wait for ACK.
- Retry on failure, drain on reconnect.

---

## 5) Implementation Checklist (First Week MVP)

### Day 1–2
- docker-compose: Postgres + Redis + **syncserver** + **smsgate2**.
- **syncserver**: pairing + ingest → Redis + WS.

### Day 3
- presence + latency probes + dashboard indicators.

### Day 4
- auth: OIDC basic + RBAC + login event logging.

### Day 5
- **smsrelay3**: SMS read receiver + queue + send + ACK.

### Day 6–7
- persistence policy worker + hardening + load test.

---

## 6) Definition of Done (MVP)
- After login, **smsgate2** auto-streams messages (no extra clicks).
- Verifier sees **syncserver** status, **smsrelay3** phone status, and latencies.
- **smsrelay3** uses **SMS read** and shows connection status + latencies.
- Perpetual sync prevents message loss.
- Redis-first storage keeps DB clean.
- Login events + audit trail implemented.

