# smsgate2 / syncserver /smsrelay3

This monorepo contains the **new three-part stack** for realtime SMS verification streaming:

- **smsrelay3** (Android/Kotlin): captures SMS, keeps a durable queue, heartbeats presence/RTT, uploads SIM/contacts, and pulls config from syncserver.
- **syncserver** (Rust/Axum): core realtime service. Handles pairing, device auth, ingest, presence, WS fanout, admin REST, config plane, audit/login logs, and persistence.
- **smsgate2** (Next.js 16): web dashboard + admin console. Uses WS-first realtime feed plus REST for admin tables and config editing.

Specs live under `docs/spec-*.md`.

## Main specification/features (current stack)

- Native Android (Kotlin) relay with QR pairing, SIM inventory, contact upload, offline queue, presence/RTT.
- Rust/Axum syncserver with `/api/v1/*` REST + `/api/v1/ws` fanout; SCREAMING_SNAKE_CASE messages with `payload`.
- Realtime delivery: ingest -> WS broadcast with p95 target < 200ms dashboard-side.
- Event state lifecycle with `POST /api/v1/events/{id}/state` and `DELETE` undo back to `new`.
- Device admin actions: rename (PATCH alias), enable/disable, rotate-token, diagnostics.
- Config plane with ETag, versioned snapshots, and envelope `{version, auth_modes, roles, data{authModes,presence,retention,roles,contacts,relay}}`.
- CONTACT_UPDATE broadcasts (`{ number, contactName, updated_at }`) plus SIM_UPDATE and presence snapshots including SIM slots.
- Audit + login events REST, JSON DB/SQLite/Postgres/MySQL persistence, Redis hot store (memory fallback).

## Getting started (quick path)

1) **Clone**
```bash
git clone https://github.com/supermarsx/smsgate
cd smsgate
```

2) **Run services (dev)**
- With Docker (recommended for first run): see `docker-compose.yml` for Redis/DB/syncserver. Example:
```bash
docker compose up -d redis db
cd syncserver
cargo run
```
- Run smsgate2:
```bash
cd smsgate2
bun install
bun dev
```

3) **Open Android app**
```bash
cd smsrelay3/android
# open in Android Studio; run on device (Android 10+)
```

Bootstrap admin/device:
- syncserver default admin username: `smsgate-admin` (password set in config or first-login change).
- Device pairing: create session from smsgate2 `/devices` -> scan QR with smsrelay3 -> device receives token.
- Config fetch for device: `GET /api/v1/device/config` with `Authorization: Bearer <device_token>` and `x-device-id`.

Key endpoints (syncserver):
- REST: `/api/v1/events`, `/api/v1/events/{id}/state` (POST) and DELETE (undo), `/api/v1/devices`, `/api/v1/devices/{id}/{enable|disable|rotate-token}`, `/api/v1/device/sims`, `/api/v1/device/contacts`, `/api/v1/auth/*`, `/api/v1/config`, `/api/v1/audit`, `/api/v1/login-events`, `/api/v1/numbers`, `/api/v1/users`.
- WS: `/api/v1/ws` with header `Authorization: Bearer <session>` (query `token` also supported). Messages: SNAPSHOT, EVENT_NEW/UPDATE, PAGE, PRESENCE_UPDATE, SIM_UPDATE, CONTACT_UPDATE, CONFIG_UPDATE, METRICS_UPDATE, DEGRADED (notice), PONG/ERROR.

## App walkthrough (Android)

1) Open the app and grant SMS permissions.
2) Configure server URL, client ID, PIN, and salt in Settings.
3) Pair the device using a QR code from syncserver.
4) Ensure foreground relay mode is enabled if you need strict realtime delivery.
5) Send an SMS to the device and verify it appears in the web UI.

In-app settings (recommended):

- Settings > Behavior: enable SMS listener, foreground relay, start on boot, and WebSocket presence.
- Settings > Server: set Remote config URL (optional) plus auth header/value and signature header/secret if you secure provisioning.
  - Signature format: HMAC SHA-256 of the response body, sent as hex or `sha256=<hex>` in the chosen header.

Change the variables to suit your preferences, on these files:

```text
Android application: configure in-app settings or remote JSON
smsgate client config: ./smsgate/src/lib/config.ts
smsgate server config: ./smsgate/src/config.ts
```

### smsrelay3

smsrelay3 listens for incoming messages and forwards them to syncserver, compiling origin, body, and date/time (plus extra device metadata). Configuration is stored securely on device and can be provisioned remotely.

To build and run, open `smsrelay3/android` in Android Studio and run on a physical device (Android 10+).

## OEM and platform optimizations (Android)

To maximize SMS capture reliability, enable the app's foreground relay and apply OEM battery/auto-start exemptions. Menus vary by OS version; use the closest match.

Programmatic settings (in-app):

- Enable foreground service.
- Enable boot receiver.
- Enable WebSocket presence if you want a persistent online indicator.

## Permissions (Android app)

- Required: `RECEIVE_SMS`, `READ_SMS`, `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`.
- Optional but recommended: `RECEIVE_BOOT_COMPLETED` (rehydrate on boot), `POST_NOTIFICATIONS` (foreground relay banner), `READ_PHONE_STATE` (SIM metadata), `CAMERA` (QR pairing), `READ_CONTACTS` (optional contact upload), `ACCESS_WIFI_STATE` (network diagnostics).
- The app requests required permissions on first launch and will surface a blocking entry page if missing.

## Configuration keys (defaults)

- Server: `server_url=https://syncserver.local`, `api_path=/api/v1/ingest`, `http_method=POST`, `ws_path=/api/v1/ws`.
- Auth: device token issued at pairing; headers `Authorization: Bearer <token>` and `x-device-id=<deviceId>`.
- Remote config (optional): `remote_config_url`, `remote_config_auth_header/value`, `remote_config_signature_header/secret`, `discovery_port=3000`.
- UI: `app_locale=system`, `app_theme=system`, `app_accent=cyan`.
- Features: `enableListener=true`, `enableForegroundService=true`, `enableBootReceiver=true`, `enableSocketPresence=true`, `notificationEnabled=true`, `servicesEnabled=true`.

## Troubleshooting (Android)

- Missed SMS on OEM devices: disable battery optimizations and allow auto-start; keep foreground relay enabled.
- Sync stalls after network loss: app auto-enqueues a catch-up sync when connectivity returns; you can also tap the Status tab's refresh.
- QR scan jank: camera is lazy-loaded; if issues persist, force-close and reopen Scan tab to re-init camera.

Samsung (One UI):

- Settings > Apps > smsrelay3 > Battery: set to Unrestricted.
- Settings > Battery and device care > Battery > Background usage limits: add smsrelay3 to Never sleeping apps.

Xiaomi (MIUI/HyperOS):

- Settings > Apps > Manage apps > smsrelay3 > Battery saver: No restrictions.
- Security app > Autostart: allow smsrelay3.
- Lock the app in Recents to prevent it from being killed.

Oppo (ColorOS):

- Settings > Battery > App battery management: set smsrelay3 to Unrestricted.
- Settings > Apps > Auto-launch: allow smsrelay3.
- Disable Sleep standby optimization if present.

### smsrelay3 docs

- Permissions: `docs/smsrelay3-permissions.md`
- Config keys: `docs/smsrelay3-config-keys.md`
- OEM battery guidance: `docs/smsrelay3-oem-guide.md`

### syncserver (Rust) quick config

- Config file default: `config/config.json` (or `SYNC_CONFIG_PRESET=dev|prod`, `SYNC_CONFIG_PATH`).
- Versioned snapshot: ETag = `"${version}"`; response shape matches smsgate2 UI (`version`, `auth_modes`, `roles`, `data{authModes,presence,retention,contacts,relay}`).
- Write updates via `PATCH /api/v1/config` (accepts UI envelope or raw partial config).
- Hot store: Redis by default (falls back to in-memory if unavailable).
- Persistence: JSON DB/SQLite/Postgres/MySQL selectable via config/env.

Run:
```bash
cd syncserver
cargo run
```

### smsgate2 (Next.js) quick config

- Base URL: `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:4000/api/v1`).
- WS path: `NEXT_PUBLIC_WS_PATH` (defaults `/api/v1/ws`); WS origin can be set via `NEXT_PUBLIC_WS_ORIGIN`.
- Auth modes are driven by syncserver config (`CONFIG_UPDATE` and `GET /api/v1/config`).

Run:
```bash
cd smsgate2
bun install
bun dev
```

## Considerations / Security

This application authentication only makes sense if used under TLS, it uses a salt and strong hashing algorithm to harden against potential rainbow tables against access codes. Using this over plain HTTP defeats the purpose of using a token as it can be easily obtained from raw network traffic.
Tokens cannot be created using "crypto.subtle.digest" over HTTP, for that you'll need enable insecure inside on config.
This application is made with modern browsers in mind, older browsers may encounter difficulties or may not function as expected. Chrome is the recommended browser as it implements all functionality in an ideal scenario but any other modern popular browser will probably work well.
A way of avoiding white screen flash when changing pages is implemented using prefetch/prerender functionality, Safari isn't supported.

## Tooling and dependencies (current)

Server:

- Node.js with Next.js 14.2.5 and React 18.2.0.
- WebSockets: `ws` 8.17.0.
- Tooling: TypeScript 5.4.5, ts-node 10.9.2, ESLint 8.57.0.

Android:

- Gradle: 9.2.1 (`gradle-9.2.1-all.zip`).
- Android Gradle Plugin: 8.6.1.
- Kotlin: 2.0.21.
- Java: 21 toolchain and bytecode target.
- Gradle runtime: requires JDK 17+ (set `JAVA_HOME` to a JDK 17/21 install).
- SDK levels: min 29, target 34, compile 34.
- Key libraries: AndroidX Work 2.7.1, Security Crypto 1.1.0-alpha03, OkHttp 4.9.3.

## Notes

### Translation

Just access `./smsgate/js/app/lang` and create a new `.json` language file, change key values to the target language accordingly and set it on the config file to use it.

### Regarding android compilation

Follow the general guide to export an APK with code signing from Android Studio or Gradle.

## License

Distributed under MIT License. See `license.md` for more information.
