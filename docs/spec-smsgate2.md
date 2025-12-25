# smsgate2 — Full Product + Technical Spec

**smsgate2** is the web dashboard and admin console for viewing a realtime verification message feed (SMS-derived) and managing devices, users, assignments, and **system-wide configuration** for the whole stack.

It connects to **syncserver** via WebSocket (realtime + config push) and REST (management/backfill where needed).

Key principles:

- **Zero‑click realtime** — after login, the verifier sees the dashboard immediately.
- **Bulma-first UI** with a **glassy** look and **automatic light/dark mode**.
- **Content is never masked** (always visible).
- **Admin-configurable everything** — syncserver, smsrelay3, smsgate2 can be configured from the admin UI.

---

## 1) Objectives

### 1.1 Primary objectives

- Display a realtime dashboard of verification messages with **p95 < 200ms** dashboard delivery (client measured).
- Provide a **verifier-first** UX: no manual refresh, no manual subscription selection to see assigned numbers.
- Provide **admin/manager** tooling:
  - QR pairing for phones (smsrelay3)
  - device presence monitoring + device naming + device phone-number discovery
  - number assignment
  - user/role management (including domain/AD mapping)
  - login logs + audit views
  - AD/LDAP group-based RBAC mapping
  - **central configuration** for all services

### 1.2 Non-goals for initial release

- Complex analytics dashboards.
- Custom workflow automation.

---

## 2) Authentication & Authorization

### 2.1 Valid auth modes (feature flags)

Sign-in options are **enabled/disabled by configuration** (managed from Admin UI, persisted in syncserver config).

Supported modes:

- **oauth**: OAuth/OIDC (SSO)
- **simple\_signin**: local username/password
- **domain\_signin**: AD/LDAP bind (“domain login” style)

**UI rule:** show only the buttons for modes that are enabled.

### 2.2 Embedded default admin account

- syncserver ships with a default embedded admin account (e.g., `admin`).
- Admin password is stored using **Argon2id** with per-user salt and configurable memory/time parameters; a server-side **pepper** (env/secret store) is required for all password hashes.
- Admin must be prompted to change default password on first login.
- **Admin accounts must enroll 2FA** (TOTP or WebAuthn) before full access; non-admin 2FA is policy-driven but supported.
- Password recovery for `simple_signin` uses an **email one-time link** (no plain retrieval) that forces an immediate password reset and invalidates existing sessions.

### 2.3 Roles

- Roles are **configurable in syncserver config** (labels, privileges, and visibility), with the following defaults provided:
  - **viewer**: read-only dashboard
  - **verifier**: can claim/verify/reject events
  - **manager**: devices, pairing, assignments, logs, config (limited)
  - **admin**: everything (including auth-mode config)
- Highest-privilege resolution order is configurable; default remains admin > manager > verifier > viewer.

### 2.4 AD/LDAP group mapping (global RBAC grouping)

- syncserver is the source of truth for role mapping.
- A user can belong to multiple AD/LDAP groups.
- Role resolution is deterministic (highest privilege wins):
  - admin > manager > verifier > viewer

Example mapping (server-side config; **roles come from configurable role set**):

- `CN=smsgate2-admins,...` → admin (or configured equivalent)
- `CN=smsgate2-managers,...` → manager (or configured equivalent)
- `CN=smsgate2-verifiers,...` → verifier (or configured equivalent)
- default → viewer (or configured baseline)

---

## 3) Information Architecture

### 3.1 Routes

- `/login`
- `/dashboard` (default landing)
- `/devices`
- `/numbers`
- `/users`
- `/audit`
- `/logins`
- `/config` (admin; some manager read-only subsections)

### 3.2 Layout

- Left navigation (persistent)

  - Dashboard
  - Devices (manager+)
  - Numbers (manager+)
  - Users (manager+)
  - Audit (manager+)
  - Logins (manager+)
  - Config (admin; manager optional read-only)

- Top status bar (persistent)

  - Org
  - User + effective role
  - **Client ↔ syncserver status** (WebSocket)
  - **Client ↔ syncserver RTT (ms)**
  - **Phone ↔ syncserver status** (presence)
  - **Phone ↔ syncserver RTT (ms)**
  - **End-to-end latency** (ms) p50/p95 (rolling)

---

## 4) Realtime UX Requirements

### 4.1 Always-on dashboard

- On entering `/dashboard`:
  - Open WebSocket immediately.
  - Auto-subscribe using server-side assigned numbers.
  - Render `SNAPSHOT` first, then apply incremental updates.

### 4.2 Ordering + insertion

- Dashboard list order is **newest → oldest**.
- New events always appear at the top.

### 4.3 Initial load and infinite scroll

- Default initial load is **last 10 messages**.
- Infinite scroll loads older pages (default 25) as user scrolls down.
- Backfill sources:
  - **WebSocket paging is required**: client can request older pages over WS; server returns paged `SNAPSHOT`/`EVENT_PAGE` segments while keeping stream live.
  - REST fallback: `GET /events?before=<oldest_seen_id>&limit=...` only if WS paging unavailable or degraded.

### 4.4 Claimed behavior (greying)

- Verifier can mark a message as **Claimed**.
- Claimed messages are greyed out and show “Claimed by ” and timestamp.

### 4.5 Status indicators

Always visible:

- Client↔syncserver connection status + RTT
- Phone↔syncserver presence status + RTT
- End‑to‑end latency

---

## 5) Screens — Detailed Specs

## 5.1 Login (`/login`)

### Button availability (auth modes)

- If `oauth` enabled: show “Sign in with SSO”.
- If `simple_signin` enabled: show username/password form.
- If `domain_signin` enabled: show domain login form (username/password + optional domain field).

### Post-login routing

- All roles land on `/dashboard`.
- Navigation items render based on role.

---

## 5.2 Dashboard (`/dashboard`) — Phone Mockup Message Feed

### Core layout

- Main area contains an iPhone-like **phone mockup**.
- The mockup contains the message list.
- A side panel contains:
  - filters
  - quick stats
  - latency readouts

### Default behavior

- Auto-start after login.
- Load 10 latest messages by default.
- New messages appear on top.

### Event row (inside phone mockup)

- Timestamp (server)
- Contact name (if known) + number label + E.164
- Sender
- **Content (always visible; never masked)**
- Smart “code” control
- State badge: new/claimed/verified/rejected
- Claimed rendering: greyed out + “claimed by …”
- Device badge + presence badge
- Latency badge (e2e ms)

### Smart code selection + copy

- Prefer server-provided `parsed_code`.
- Else extract likely codes:
  - 4–10 digit numeric
  - 6–12 alphanumeric tokens
- UI shows a primary button:
  - **Copy "xyz123"**
- If multiple codes detected, show a compact selector.

### Actions (role-gated)

- Claim (verifier+)
- Verify (verifier+)
- Reject (verifier+)

### Infinite scroll behavior

- Fetch older messages when nearing bottom.
- Maintain scroll stability when new messages arrive.

---

## 5.3 Devices (`/devices`)

### Main goals

- View device presence
- Pair new devices via QR
- Disable/enable devices
- Name devices
- View device RTT + queue depth
- **Capture multiple device phone numbers (multi-SIM) and associate to users**
- **Auto-pull SIM/number changes from syncserver** and update UI live

### Device list view

- Friendly name (editable)
- Presence (online/degraded/offline)
- Last seen
- Device RTT (last/avg)
- Queue depth
- **Device phone number(s)** (multi-value, if reported)
- Assigned numbers count
- Actions: Disable/Enable, View details

### Device detail view

- Edit friendly name
- View current device phone number(s) (supports dual/triple SIM lists)
- View allowed ingest numbers
- Token rotation (admin)

### QR pairing flow (fully automated)

- Create pairing session → show QR → wait completion.
- After pairing completion:
  - device appears
  - admin/manager can name it
  - smsrelay3 begins pulling config

---

## 5.4 Numbers (`/numbers`)

### Features

- Create/edit number (label, E.164)
- Assign to user
- Mark as shared
- Associate a default device (optional)
- View which device(s) can ingest for this number
- View contact name mapping (optional)

---

## 5.5 Users (`/users`) — Expanded

### Purpose

Manage users, roles, assignments, and identity mappings.

### User list columns

- Display name
- Username / email
- Auth source (oauth/simple/domain)
- Effective role
- Status (active/disabled/locked)
- Last login time
- Failed login count (rolling window)
- Assigned numbers count
- Assigned devices count

### User detail capabilities

- Change role (admin/manager depending on policy)
- Disable/enable user
- Force logout sessions (admin)
- Reset local password (admin; only if simple\_signin enabled)
- User preferences: set preferred locale via dropdown (overrides auto-detect)
- View identity mapping:
  - OIDC subject / email
  - AD/LDAP dn + groups (read-only)
- Assignments:
  - assign/unassign numbers
  - associate device phone number(s) → user (see below)

### Device phone number association

- Devices may report a “device phone number” (SIM line / MSISDN if available).
- UI supports mapping:
  - Device phone number → User
- Purpose:
  - tie a physical phone identity to the user owning/operating it
  - improve audit clarity

---

## 5.6 Audit (`/audit`) — Expanded

### Purpose

Immutable audit trail for security and operational accountability.

### Filters

- Time range
- Actor user
- Action type
- Target type
- Device
- Number
- Result (success/fail)

### Required audited actions (minimum)

- Auth:
  - login success/fail
  - logout
  - token/session refresh
- RBAC:
  - role changes
  - AD/LDAP mapping changes
- Config:
  - auth mode enable/disable
  - config changes (diff summary)
- Devices:
  - pairing start/complete
  - rename
  - disable/enable
  - token rotation
- Numbers:
  - create/edit/delete
  - assignment changes
- Events:
  - claim/verify/reject
  - unclaim/undo (if supported)

### Row content

- Timestamp
- Actor
- Action
- Target
- Result
- Details (expandable JSON)

---

## 5.7 Logins (`/logins`) — Expanded

### Purpose

Operational visibility into authentication health.

### Filters

- Time range
- User
- Auth mode (oauth/simple/domain)
- Result (success/fail)
- IP / subnet
- Reason code

### Required fields per login event

- Timestamp
- User (or attempted username)
- Result
- Reason (invalid\_password / locked / disabled / idp\_error / ldap\_error / rate\_limited)
- Auth mode
- IP
- User agent
- Session id (opaque)
- Geo/ASN (optional; server-side enrichment)

### Admin actions from this page (optional)

- Disable user
- Unlock user
- Force logout

---

## 5.8 Config (`/config`) — Central Configuration Console

### Purpose

Allow **full configuration** of:

- **syncserver**
- **smsrelay3**
- **smsgate2**

All config changes are applied in realtime and audited.

### Sections

1. **Auth Modes**

- Enable/disable: oauth, simple\_signin, domain\_signin
- Configure OIDC issuer/client
- Configure LDAP host/baseDN/filters (and role mapping)

2. **RBAC Mapping**

- Group → role mapping table
- Conflict resolution rule (fixed to highest wins)

3. **Realtime & WS**

- snapshot size (default 10)
- WS ping interval
- max connections
- WS paging page size/backfill policy

4. **Retention**

- Redis TTLs
- DB persistence policy knobs
- **Memory fallback path when Redis is unavailable** (ephemeral cache with backpressure and explicit degraded-mode alerting)

5. **smsrelay3 policies**

- heartbeat interval
- retry backoff
- maximum queue
- allowed ingest formats

6. **Contact sync**

- enable/disable
- import/export mapping

### Config push model

- smsgate2 reads config initially on login and receives subsequent updates via WS:
  - `CONFIG_UPDATE`
- smsrelay3 continuously pulls config:
  - long-lived WS subscription OR periodic pull with ETag
  - on `CONFIG_UPDATE`, reloads policy immediately

---

## 6) Data Fetching Strategy (WS-first)

### 6.1 Principle

Use WebSocket for:

- realtime events
- presence
- config updates
- contact updates
- paged event backfill (older pages over WS without dropping the stream)

Use REST for:

- initial management tables (users/devices/numbers)
- exports
- **fallback for paging** only when WS channel is unavailable/degraded

---

## 7) Internationalization

### 7.1 Supported locales

- pt-PT
- en-US
- es-ES

### 7.2 Automatic locale selection

- Choose from `navigator.languages` on first visit.
- Persist user choice.
- Users can change locale later via Settings/User profile dropdown; change applies immediately and is persisted.

---

## 8) UI Framework & Theming

### 8.1 Bulma + glass theme

- Bulma components: navbar, menu, card, table, tags, buttons, modal.
- Glass theme requirements:
  - translucent panels + backdrop blur
  - subtle borders
  - adaptive shadows

### 8.2 Auto light/dark mode

- Default: `prefers-color-scheme`.
- Optional user override.

---

## 9) API Contracts (smsgate2 ↔ syncserver)

### 9.1 REST (typed)

- Pairing
  - `POST /api/v1/pairing/session`
  - `GET /api/v1/pairing/session/{id}` (optional)
- Devices
  - `GET /api/v1/devices` (returns multi-SIM `numbers[]` and `sim_slots` metadata; hot-swapped SIM/number changes are reflected)
  - `PATCH /api/v1/devices/{id}` (name)
  - `POST /api/v1/devices/{id}/disable|enable|rotate-token`
- Numbers
  - `GET /api/v1/numbers`
  - `POST /api/v1/numbers` / `PATCH /api/v1/numbers/{id}`
  - `POST /api/v1/numbers/{e164}/assign`
- Users
  - `GET /api/v1/users`
  - `PATCH /api/v1/users/{id}`
  - `POST /api/v1/users/{id}/force-logout` (admin)
  - `POST /api/v1/users/{id}/unlock` (admin)
- Logs
  - `GET /api/v1/audit`
  - `GET /api/v1/login-events`
- Events
  - `GET /api/v1/events?after=...&limit=...&filters...`
  - `GET /api/v1/events?before=...&limit=...&filters...`
- Config
  - `GET /api/v1/config`
  - `PATCH /api/v1/config` (admin)

### 9.2 WebSocket

Connect: `GET /api/v1/ws`

Server → client:

- `WELCOME`
- `SNAPSHOT` (default last 10)
- `EVENT_PAGE` (paged older events over WS)
- `EVENT_NEW`
- `EVENT_UPDATE`
- `PRESENCE_UPDATE` (includes SIM/number changes so multi-SIM devices stay in sync)
- `METRICS_UPDATE`
- `CONTACT_UPDATE`
- `CONFIG_UPDATE`
- `ERROR`

Client → server:

- `SUBSCRIBE` (optional)
- `PAGE` (request older page; `before`/`limit`)
- `PING`

---

## 10) Acceptance Criteria (smsgate2)

- After login, `/dashboard` shows messages immediately (no extra clicks).
- Dashboard renders inside a phone mockup.
- Default loads 10 latest; older load on scroll.
- Content is never masked.
- Claim greys out a message and syncs to all viewers.
- Status bar shows:
  - client↔syncserver status + RTT
  - phone↔syncserver status + RTT
  - end‑to‑end latency
- Auth buttons only appear for enabled modes.
- Admin can configure smsgate2/syncserver/smsrelay3 from `/config`.
- Users, Audit, and Logins pages expose the expanded controls and filters.

---

## 11) Notes for syncserver (implementation requirements referenced by UI)

### 11.1 syncserver configuration baseline

- syncserver must support a **config.json** base configuration file (boot-time baseline).
- config can be overridden/updated via Admin UI and persisted.

### 11.2 JSON database option

- syncserver must support a **JSON database** option for small installs/dev:
  - store users/devices/numbers/config/audit/events (as per retention)
  - still use Redis hot store for realtime where available
- If Redis is unavailable, syncserver must **fallback to an in-memory hot store** with backpressure limits and emit degraded-mode telemetry/alerts.

### 11.3 Extensive server logging

- syncserver must emit structured logs:
  - auth attempts
  - config changes (diff summary)
  - device presence
  - ingest
  - ws connect/disconnect
  - errors with correlation ids

smsgate2 must surface key log-derived signals via Audit/Logins and status indicators.

