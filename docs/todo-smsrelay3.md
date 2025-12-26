# smsrelay3 - Exhaustive TODO

This list is scoped to the Android app refactor to match `docs/spec-smsrelay3.md` and the Graphite Glass design system.

## Architecture and packages
- DONE: Create package layout: `config`, `data`, `sync`, `presence`, `sim`, `reconcile`, `pairing`, `ui`, `util`.
- DONE: Add database bootstrap (Room + migrations) and a repository layer to isolate DAOs from services.
- DONE: Introduce a shared clock/UUID/ULID helper for deterministic IDs and testability.
- DONE: Add a centralized `AppRuntime` state holder for foreground/background/service mode, WS status, and last send/ACK metadata.

## Data model (Room)
- DONE: Implement DAOs for OutboundMessage, SmsRawStore, HeartbeatSample, SimSnapshot, ConfigState, LocalOverrides, LocalLogEntry.
- DONE: Add migrations for future schema changes (at least stub v1->v2).
- DONE: Implement pruning tasks driven by retention config (WorkManager).
- DONE: Add index/uniqueness rules for content hash + timestamp bucket to support reconciliation dedup.

## Pairing and provisioning
- DONE: Implement QR pairing screen and flow:
  - DONE: Scan QR and call `POST /api/v1/pairing/complete`.
  - DONE: Persist `device_id`, `device_token`, `config_version`.
  - DONE: Handle errors, retries, and expired tokens.
- DONE: Add secure storage for device token in Android Keystore (not SharedPreferences).
- DONE: Add pairing status UI and diagnostics entries.

## Remote configuration
- Build config client:
  - DONE: WS subscribe `DEVICE_SUBSCRIBE_CONFIG`.
  - Fallback periodic pull `GET /api/v1/device/config` with ETag.
- Implement config validation + atomic apply:
  - DONE: Persist ConfigState row.
  - DONE: Apply in-memory policy + notify services.
- Implement local overrides (allowlist + admin PIN gating).
- Implement config export/import (effective, remote-only, overrides).

## SMS capture
- Update BroadcastReceiver:
  - Parse multipart PDUs.
  - Capture subscription ID, SIM slot, ICCID, MSISDN if available.
  - Enqueue to Room and signal sync engine.
- Implement optional SMS provider reconciliation:
  - Fingerprint window scan.
  - Enqueue missing messages as `source=reconcile`.
  - Respect allowlist/denylist.

## Sync engine (perpetual sync)
- Implement queue state machine:
  - queued -> sending -> acked/failed.
  - Retry with backoff + jitter.
- Support single-send and batch send modes.
- Implement ACK processing and dedup reconciliation.
- Add offline handling + immediate flush on reconnect.
- Add WorkManager catch-up for best-effort mode.

## Presence and heartbeat
- Add heartbeat scheduler (configurable interval):
  - queue depth, RTT, ws state, network type, battery.
- Implement RTT measurement via heartbeat and WS ping.
- Update presence state based on heartbeat failures.

## SIM inventory
- Implement SIM polling and change detection.
- Send SIM inventory updates to syncserver.
- Store SimSnapshot history and expose in diagnostics.

## Contacts sync (optional)
- Implement READ_CONTACTS gated flow.
- Upload number->name mapping diff-based.
- Add config control + UI toggle + diagnostics.

## UI/UX (Graphite Glass)
- Replace current tabs with new screens:
  - Pairing
  - Status (default)
  - Diagnostics
  - Logs
  - Settings
- DONE: Build status indicators:
  - DONE: server connection state
  - DONE: last RTT
  - DONE: queue depth
  - DONE: last successful send
  - DONE: SIM summary
  - DONE: reconciliation status
- Implement Diagnostics list:
  - permissions status
  - DONE: service mode
  - OEM guidance
  - DONE: last 20 events and errors
  - config version and overrides summary
- Implement Logs view with filters + export + clear.
- DONE: Implement Settings with config export/import and quick links.

## Services and lifecycle
- Implement service modes:
  - DONE: foreground service
  - DONE: persistent background service
  - DONE: best-effort (WorkManager)
- Add boot receiver rehydration based on config.
- DONE: Add OEM guidance UI and shortcuts (MIUI, Huawei, Samsung, Oppo/Vivo).

## Security
- Store device token in Keystore-backed storage.
- Add optional TLS pinning (configurable).
- Redact SMS content in logs and exports by default.
- Add diagnostics export redaction and secret stripping.

## Telemetry and logging
- Structured logging categories:
  - pairing, sms_capture, sync_send, ack, retry, heartbeat, sim, config, reconcile, oem.
- Persist logs to Room + ring buffer in memory.
- Add log export with redaction.

## Testing
- Unit tests:
  - SMS parsing, multipart handling.
  - queue state machine.
  - backoff + retry.
  - SIM diff logic.
- Integration tests:
  - mock syncserver endpoints.
  - offline/online transitions.
  - WS config updates.
- End-to-end:
  - pairing -> ingest -> dashboard visibility.

## Docs and ops
- Update `readme.md` with smsrelay3 build/run steps.
- Document required permissions and optional permissions.
- Document configuration keys and defaults.
- Add troubleshooting guide for OEM battery restrictions.

## Build and release
- Update app icons and branding assets.
- Confirm min/target SDK and foreground service type.
- DONE: Add Proguard/R8 rules for Room + OkHttp.
- Validate APK builds on CI.

## Progress
- DONE: Room entities/DAOs scaffolding + database provider.
- DONE: Sync worker posting `/api/v1/ingest` + queue storage.
- DONE: Heartbeat + SIM inventory workers/schedulers.
- DONE: Config polling with ETag and policy-driven scheduling.
- DONE: Reconciliation worker + SMS provider scan.
- DONE: Pairing client storing device credentials.
- DONE: Status tab with core metrics.
- DONE: Diagnostics tab scaffold (permissions/config/heartbeat).
- DONE: App language selector + i18n strings (en-US/pt-PT/es-ES).
- DONE: Log persistence to Room + logs screen loads recent entries.
- DONE: Pairing tab + Settings container (export/import + system shortcuts).
- DONE: Removed legacy Configs fragment/layout and renamed tab to Settings.
- DONE: OEM shortcuts (notifications/autostart) + diagnostics export.
- DONE: Regenerated launcher icons from app-icon-concept.png.
- DONE: Log filtering + export redaction; diagnostics last error + overrides.
- DONE: Structured log levels/categories in sync/config/pairing/heartbeat/sim flows.
- DONE: Retention pruning worker for acked/heartbeat/sim/log/raw.
- DONE: Room indices + v1->v2 migration stub.
- DONE: SMS capture enriches SIM slot/ICCID/MSISDN (when permitted).
- DONE: realtime_mode policy gate for foreground service on boot.
- DONE: Local overrides stored on import and applied via allowlist (no PIN gating).
- DONE: Contacts sync worker (READ_CONTACTS gated).
- DONE: TLS pinning support via config (pins applied to HttpClient).
- DONE: Docs for permissions/config keys/OEM guide + readme update.
- DONE: Added unit tests for ConfigRepository defaults and LogExport redaction.
- DONE: Time/ID helpers and AppRuntime state holder.
- DONE: Build compile fixes (SmsReceiver subscription id, SyncWorker api path, Room schema warning).
- DONE: Tab icons + in-panel titles, logs clear action, and compact button styling.
- DONE: Theme selector (system/dark/light) + light/dark palettes per Graphite Glass spec.
- DONE: Permissions entry screen with required/optional checks and tab bar fixed-mode icons.
- DONE: Theme accent picker (cyan/indigo/mint/amber/rose) + service mode diagnostics + logs ordering fixes.
- DONE: Settings kill toggle for relay services + background relay service default start.
- DONE: Switched QR scanning to CameraX + ML Kit with lazy-loaded scan activity.
- DONE: QR scan overlay + camera error handling; tab preloading to reduce stalls.
