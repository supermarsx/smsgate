# smsrelay3 — Full Product + Technical Spec

**smsrelay3** is the native Android relay that reads inbound SMS in realtime, performs **perpetual sync** to **syncserver**, reports presence/latency, reports multi‑SIM inventory, and (optionally) uploads contact-name mappings to improve the dashboard experience in **smsgate2**.

Principles:

- **SMS read mechanism only** (BroadcastReceiver for inbound SMS + optional SMS provider read for reconciliation).
- **Fast path**: SMS received → local queue → immediate send → ACK.
- **Perpetual sync**: at-least-once delivery with dedup on server.
- **Remote config**: all behavior controlled from Admin UI via syncserver config, applied live.
- **Enterprise-friendly**: designed for internal/corporate distribution (MDM / sideload), not Play Store constraints.

---

## 1) Goals

### 1.1 Core goals

- Relay SMS-derived verification messages to syncserver with **minimal latency**.
- Maintain reliability through disconnects using a durable queue.
- Provide strong operational visibility:
  - server connectivity + RTT
  - queue depth
  - last successful send
  - heartbeat/presence state
- Support **multi-SIM** devices and SIM swaps with automatic detection and reporting.
- Support configuration updates in realtime.

### 1.2 Non-goals (v1)

- Sending SMS.
- Acting as the default SMS app.
- User-facing messaging UI.

---

## 2) System Context

### 2.1 Upstream/downstream

- Upstream source: Android SMS broadcast intent (`SMS_RECEIVED`).
- Downstream target: **syncserver** ingest, heartbeat, SIM inventory, optional contacts sync.

### 2.2 Trust model

- smsrelay3 runs on a managed corporate device (assumed semi-trusted).
- All network calls are authenticated using a device token provisioned via QR pairing.
- Device token is stored in **Android Keystore**.

---

## 3) App Architecture

### 3.1 Tech stack

- Kotlin
- Coroutines + Flow
- Room (durable local queue)
- WorkManager (retries, catch-up sync)
- OkHttp (HTTP + WS)
- Android Keystore (secrets)

### 3.2 Modules

- **Pairing & Provisioning**
- **Config Client** (pull + live updates)
- **SMS Capture**
- **Sync Engine** (send + ACK + retry)
- **Presence/Heartbeat**
- **SIM Inventory**
- **Diagnostics UI**
- **Optional Contacts Sync**

### 3.3 Threads / lifecycle

- SMS BroadcastReceiver triggers minimal work:
  - parse SMS payload
  - enqueue record in Room
  - signal Sync Engine

- Sync Engine execution modes (all configurable):

1) **Foreground service (strict realtime)**
- Persistent foreground notification
- Maintains best possible delivery latency
- Recommended for verification-critical installs

2) **Persistent background service (OEM-friendly)**
- Long-running service where allowed
- Uses partial wake locks + scheduled alarms as needed
- Falls back to WorkManager if killed

3) **Best-effort (battery-friendly)**
- No persistent service
- WorkManager handles catch-up
- Realtime WS kept only while app is in foreground

**Configurable mode** (via remote config):
- `realtime_mode`: `foreground_service` | `persistent_background` | `best_effort`

---

## 4) Permissions & Enterprise Notes

### 4.1 Required permissions

- `android.permission.RECEIVE_SMS`
- `android.permission.READ_SMS`
- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.FOREGROUND_SERVICE` (if realtime\_mode=foreground\_service)

### 4.2 Optional permissions (feature-gated)

- `android.permission.READ_PHONE_STATE` (only if required for SIM identifiers on certain devices)
- `android.permission.READ_CONTACTS` (only if Contacts Sync enabled)

### 4.3 Distribution / policy reality

Android SMS permissions can be restricted in consumer distribution channels. smsrelay3 is designed for:

- corporate internal distribution
- device-owner/MDM environments
- explicit user/admin consent flows

---

## 5) Data Model (Local)

### 5.1 Room entities

#### OutboundMessage
- `id` (ULID or UUID)
- `device_id`
- `seq` (monotonic per device; persisted)
- `created_at_ms`
- `sms_received_at_ms`
- `sender` (originating address)
- `content`
- `content_hash`
- `sim_slot_index` (0..n)
- `subscription_id` (if available)
- `iccid` (if available)
- `msisdn` (best effort)
- `status` (queued | sending | acked | failed)
- `retry_count`
- `last_attempt_at_ms`
- `source` (broadcast | provider_scan | reconcile)

#### SmsRawStore (optional additional persistence)
Configurable additional persistence methods to increase reliability:
- `enabled` (by config)
- Stores minimal raw SMS metadata for reconciliation / forensic debugging (not a full inbox clone).

Fields:
- `id`
- `captured_at_ms`
- `provider_id` (if accessible)
- `sender`
- `content_hash`
- `length`
- `sim_slot_index`
- `subscription_id`
- `delivery_path` (broadcast/provider)

#### HeartbeatSample
- `id`
- `created_at_ms`
- `queue_depth`
- `network_type`
- `battery_percent`
- `last_success_send_at_ms`
- `last_rtt_ms`
- `ws_state`

#### SimSnapshot
- `captured_at_ms`
- `slot_index`
- `subscription_id`
- `iccid`
- `msisdn` (best effort)
- `carrier_name`
- `status` (active/inactive)

#### ConfigState
- `version`
- `etag`
- `last_applied_at_ms`
- `raw_json` (optional)

#### LocalOverrides
- `updated_at_ms`
- `raw_json` (only allowlisted keys)

#### LocalLogEntry (for Logs screen)
- `ts_ms`
- `level`
- `category`
- `message`
- `details_json` (optional)

### 5.2 Retention (local)

All retention is config-driven.

Defaults:
- OutboundMessage:
  - keep acked messages 24h then prune
  - keep failed messages until resolved or manual purge
- SmsRawStore:
  - keep 24h (or disabled)
- HeartbeatSample:
  - keep last 24h
- SimSnapshot:
  - keep last 7 days (optional)
- LocalLogEntry:
  - keep last 7 days or max size limit

Pruning runs as a WorkManager task.

---

## 6) Pairing & Provisioning

### 6.1 QR pairing (fully automated)

Flow:

1. Admin creates pairing session in smsgate2 → displays QR
2. smsrelay3 scans QR
3. smsrelay3 calls `POST /api/v1/pairing/complete` with pairing token
4. syncserver returns:
   - `device_id`
   - `device_token`
   - initial config snapshot (`config_version`, policy)
5. smsrelay3 stores device\_token in Android Keystore
6. smsrelay3 immediately starts:
   - config sync
   - heartbeat
   - SIM inventory report

### 6.2 Device identity

- Device ID is server-issued and immutable.
- Device friendly name is configured via admin UI (smsgate2) and pulled by the app.

---

## 7) Remote Configuration

### 7.1 Goals
- smsrelay3 must be fully controllable from Admin UI via syncserver.
- Config updates must apply **in realtime** without reinstall.
- Support **config export/import** and **local overrides** when permitted.

### 7.2 Config delivery methods

Primary (recommended):
- **WebSocket subscription**:
  - connect → send `DEVICE_SUBSCRIBE_CONFIG`
  - receive `CONFIG_UPDATE { version, patch/full }`

Fallback:
- Periodic pull with ETag:
  - `GET /api/v1/device/config` with `If-None-Match`

### 7.3 Local overrides (when allowed)

Remote provisioning may allow local tweaking for specific keys.

- Local overrides are stored in a separate local file/DB row (`LocalOverrides`).
- Effective config is computed as:
  - `effective = remote_config ⊕ local_overrides` (local takes precedence only for allowlisted keys)

Override permissions are controlled by remote config:
- `overrides.enabled` (bool)
- `overrides.allowlist[]` (list of keys)
- `overrides.require_admin_pin` (optional)

All override changes must be:
- logged locally
- visible in Diagnostics
- optionally reported to syncserver (`DEVICE_OVERRIDE_UPDATE`) if enabled

### 7.4 Config export / import

**Export**
- User can export:
  - current effective config
  - remote config
  - local overrides
- Export formats:
  - JSON (canonical)
  - optional: QR export for quick provisioning (future)

**Import**
- User can import config or overrides from a JSON file.
- Import is only allowed if `overrides.enabled=true`.
- Import must validate schema and only apply allowlisted keys.

### 7.5 Config application rules

- Validate schema (and signatures if enabled).
- Apply atomically:
  - persist new config state
  - swap policy in memory
- If invalid:
  - keep last known good config
  - report error in diagnostics

### 7.6 Config keys (device-relevant)

**Core**
- `realtime_mode` (foreground_service | persistent_background | best_effort)
- `heartbeat.interval_s`
- `heartbeat.degraded_after_s`
- `heartbeat.offline_after_s`

**Sync**
- `sync.retry.backoff_ms` (base, max)
- `sync.retry.max_attempts`
- `sync.queue.max_depth`
- `sync.batch.max_size`
- `sync.flush_on_connect` (bool)

**WS / Keepalive**
- `ws.keepalive_s`
- `ws.reconnect.backoff_ms` (base, max)

**SIM inventory**
- `sim.poll.interval_s`
- `sim.report.on_change_immediate` (bool)

**Reconciliation**
- `reconcile.enabled`
- `reconcile.window_minutes`
- `reconcile.interval_minutes`
- `reconcile.max_scan_count`

**Logging**
- `logging.enabled` (bool)
- `logging.level` (error|warn|info|debug)
- `logging.persist_to_disk` (bool)
- `logging.max_mb`
- `logging.redact_sms_content` (bool)

**Contacts**
- `contacts_sync.enabled`
- `contacts_sync.interval_s`

---

## 8) SMS Capture

### 8.1 Primary capture: SMS BroadcastReceiver

- Receiver listens to `android.provider.Telephony.SMS_RECEIVED`.
- Parse PDUs into messages; handle multipart messages.
- Extract:
  - sender/origin address
  - message body
  - timestamp
  - subscription ID / SIM slot index where available

### 8.2 Best-effort receiving line detection

Android does not always expose the receiving phone number (MSISDN). smsrelay3 will:

- identify SIM by `subscription_id` + `slot_index`
- capture `iccid` when available
- attempt MSISDN via `SubscriptionManager.getActiveSubscriptionInfoList()`:
  - `number` / `line1Number` when available

If MSISDN cannot be read, send SIM identifiers only and allow server-side mapping.

### 8.3 Reconciliation (configurable, recommended)

Goal: detect and recover from missed broadcasts / OEM delivery issues.

**Enabled by config**: `reconcile.enabled`.

Mechanism (safe + efficient):
- Maintain a rolling index of recently-seen message fingerprints:
  - fingerprint = `hash(sender + content + timestamp_bucket + sim_identifiers)`
- On a schedule (`reconcile.interval_minutes`):
  1) Query SMS content provider for messages in the last `reconcile.window_minutes`.
  2) For each candidate, compute fingerprint.
  3) If fingerprint not seen and not already queued/acked, enqueue as a **reconciled** message.

Controls (all configurable):
- `reconcile.window_minutes` (default 10)
- `reconcile.interval_minutes` (default 2)
- `reconcile.max_scan_count` (default 200)
- `reconcile.ignore_senders[]` (optional denylist)

Safety:
- Dedup is still server-side; reconciliation is best-effort.
- Reconciliation must not block the main thread.
- If READ_SMS permission is missing, reconciliation auto-disables and reports status.

Diagnostics:
- Count reconciled messages
- Last reconcile run time
- Last reconcile error

---

## 9) Sync Engine (Perpetual Sync)

### 9.1 Delivery guarantee

- smsrelay3 provides **at-least-once** delivery.
- syncserver performs dedup by content hash + time window + device seq.

### 9.2 Outbound state machine

- queued → sending → acked
- sending → failed (on max attempts)
- failed → queued (manual or config-triggered retry)

### 9.3 Send strategy

- Prefer immediate send upon enqueue when network is available.
- Send either:
  - single message per request (lowest latency)
  - small batches (max\_size) for catch-up

### 9.4 ACK semantics

- syncserver ACK returns:
  - `event_id`
  - `device_seq`
  - `server_received_at_ms`
- smsrelay3 marks message as acked.

### 9.5 Retry policy

- Exponential backoff with jitter.
- Respect `max_attempts` and `max_backoff_ms`.
- When offline:
  - hold queue
  - resume immediately on connectivity restored.

### 9.6 Transport choices

- Ingest over HTTPS REST (MVP) + persistent WS for config/presence.
- Optional future: device WS ingest stream.

---

## 10) Presence & Latency

### 10.1 Heartbeat payload

Sent every `heartbeat.interval_s`:

- `device_id`
- `client_time_ms`
- `queue_depth`
- `last_success_send_at_ms`
- `ws_state`
- `network_type`
- `battery_percent`
- `sim_summary_hash` (to detect SIM changes quickly)
- `measured_rtt_ms` (client-measured)

### 10.2 RTT measurement

- Measure RTT by:
  - heartbeat request/response roundtrip
  - optional WS ping/pong if device maintains WS

### 10.3 Presence reporting

- If heartbeat cannot be delivered, device shows degraded/offline locally.
- syncserver computes canonical presence state.

---

## 11) SIM Inventory (Multi-SIM)

### 11.1 Inventory capture

- Poll subscription state every `sim.poll.interval_s`.
- Capture:
  - active subscriptions
  - slot index
  - subscription id
  - ICCID (if accessible)
  - MSISDN (best effort)

### 11.2 Reporting

- Report to syncserver:
  - `POST /api/v1/device/sims`
- Also broadcast updates via heartbeat summary hash.

### 11.3 SIM change handling

- When SIM inventory changes:
  - immediately send updated inventory
  - log the change locally

---

## 12) Optional Contacts Sync

### 12.1 Purpose

Improve smsgate2 display by mapping sender numbers to contact names.

### 12.2 Controls

- Feature-gated by remote config: `contacts_sync.enabled`.
- Requires `READ_CONTACTS`.

### 12.3 Privacy

- Contacts sync should be scoped:
  - only upload phone number → display name mapping
  - avoid uploading full contact metadata
- Admin must explicitly enable.

### 12.4 Sync method

- Periodic diff-based upload:
  - compute hash over map
  - send only changes

---

## 13) UI / UX

### 13.1 Screens
- Pairing (scan QR)
- Status (default)
- Diagnostics (details)
- **Logs** (new)
- **Settings** (shortcuts + config tools)

### 13.2 Status screen (always visible indicators)
Must show:
- Server connection status (Connected / Degraded / Offline)
- Last RTT (ms)
- Queue depth
- Last successful send time
- Device name (from server) + device id
- SIM summary (slot count + best-effort numbers)
- Reconciliation status (enabled/last run)

Quick actions:
- **Open App Settings** (Android settings page)
- **Open Notification Settings**
- **Battery Optimization Exemption** shortcut (OEM dependent)
- **Export Config** / **Import Config** (if allowed)

### 13.3 Diagnostics screen
- Permissions status (SMS, Contacts if enabled)
- Service mode status (foreground/persistent/best-effort)
- OEM/Doze risk indicators
- Last 20 events state transitions (queued/sent/acked)
- Last 20 errors
- Current config version + last update time
- Local overrides summary (if enabled)
- Export diagnostics bundle (JSON) for support

### 13.4 Logs screen
- Live tail view of local logs (LocalLogEntry)
- Filters:
  - level
  - category
  - time range
- Actions:
  - copy selected lines
  - export logs (redacted)
  - clear logs (if allowed by config)

### 13.5 Settings screen
- Show effective config + remote config + local overrides
- Toggle local logging if allowed (config-driven)
- Manual sync trigger (flush queue now)
- Buttons to open:
  - App settings
  - Permission settings
  - Battery optimization settings
  - Autostart settings (OEM intents when possible)

---

## 14) Security

- Device token stored in Android Keystore.
- All traffic over TLS.
- Optional TLS pinning (configurable).
- Local DB encryption optional (SQLCipher) (configurable).
- Do not log SMS content in plaintext in production logs.
- Diagnostics export redacts secrets.

---

## 15) Logging & Observability (Device)

### 15.1 Structured logs
Log categories:
- pairing
- sms_capture
- sync_send
- ack
- retry
- heartbeat
- sim
- config
- reconcile
- oem

### 15.2 Logging controls (configurable)
- `logging.enabled` (default true)
- `logging.level` (default info)
- `logging.persist_to_disk` (default true)
- `logging.max_mb` (default 10)
- `logging.redact_sms_content` (default true in production)

Logging must support:
- in-memory ring buffer
- persistent LocalLogEntry store
- export redacted logs

### 15.3 OEM survival guidance (configurable)
To reduce background killing, smsrelay3 provides:
- foreground service mode (recommended)
- persistent background mode (best effort)
- WorkManager catch-up mode

The app should detect common OEM environments and surface guidance + shortcuts:
- Xiaomi/MIUI autostart
- Huawei battery management
- Samsung deep sleep
- Oppo/Vivo background restrictions

Configuration keys:
- `oem_hardening.enabled`
- `oem_hardening.show_guides`
- `oem_hardening.force_foreground_on_boot`

### 15.4 Boot persistence
If allowed by policy and permissions:
- register BOOT_COMPLETED receiver (enterprise installs)
- restart service according to `realtime_mode`
- audit locally that a reboot occurred

Debug mode may be enabled by remote config and must be time-limited.

---

## 16) Testing Strategy

- Unit tests:
  - SMS parsing
  - queue state machine
  - retry scheduling
  - SIM diff
- Integration tests:
  - mock syncserver
  - offline/online transitions
  - battery/doze behavior (best-effort)
- End-to-end:
  - pairing → ingest → dashboard visibility

---

## 17) Acceptance Criteria

- Reads SMS via BroadcastReceiver and enqueues immediately.
- Performs at-least-once sync with ACK.
- Reports presence and RTT.
- Supports multi-SIM inventory and reports changes.
- Pulls config from syncserver and applies updates live.
- Shows server status + latency + queue depth in the UI.
- Can export diagnostics without leaking secrets.

