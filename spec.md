# smsgate Full Application Specification

## 1. Purpose and Scope
- Provide a small, two-piece system that relays SMS messages from an Android device to a server.
- Allow multiple browser clients to view the latest received SMS messages in real time.
- Provide token-based access control for both phone-to-server and browser-to-server communications.
- Minimize operational overhead (no database required, simple configuration, easy to deploy).
- Preserve privacy by only sharing what is required to identify and route messages.

## 2. High-Level Architecture
- **smsrelay2 (Android app, Kotlin native)** listens for incoming SMS and forwards messages to the server.
- **smsgate (Next.js + ws server, TypeScript)** exposes HTTP API endpoints and a WebSocket channel.
- **smsgate web client** (Next.js React) authenticates via a token and receives messages over WebSocket.
- **Persistence adapters** optionally store message history in memory or JSON file storage.

## 3. Components
### 3.1 smsgate Server
- **Runtime**: Node.js with Next.js and ws.
- **Entry point**: `smsgate/server.ts`.
- **Config**: `smsgate/src/config.ts`.
- **Static assets**: `smsgate/public/` (CSS, images, sounds, lang JSON).
- **Persistence**: `smsgate/src/server/messageStore.ts`.

### 3.2 smsgate Web Client
- **Login page**: `smsgate/src/pages/index.tsx`.
- **Messages page**: `smsgate/src/pages/messages.tsx`.
- **Client configuration**: `smsgate/src/lib/config.ts`.
- **Token utilities**: `smsgate/src/lib/token.ts`.
- **WebSocket helpers**: `smsgate/src/lib/ws.ts`.
- **Localization loader**: `smsgate/src/lib/lang.ts` and JSON in `smsgate/public/lang/`.
- **Notification helpers**: browser notifications and audio alerts (configurable).

### 3.3 smsrelay2 Android App
- **Runtime**: Native Android (Kotlin).
- **Entry point**: `smsrelay2/android/app/src/main/java/com/smsrelay2/MainActivity.kt`.
- **Config**: EncryptedSharedPreferences via `ConfigStore` and Preference UI.
- **SMS receiver**: `smsrelay2/android/app/src/main/java/com/smsrelay2/SmsReceiver.kt`.
- **Foreground relay service**: `smsrelay2/android/app/src/main/java/com/smsrelay2/RelayForegroundService.kt`.
- **WorkManager uploader**: `smsrelay2/android/app/src/main/java/com/smsrelay2/SmsUploadWorker.kt`.
- **Remote provisioning**: `smsrelay2/android/app/src/main/java/com/smsrelay2/RemoteProvisioner.kt`.

## 4. Server Behavior (smsgate)
### 4.1 HTTP Endpoints
- `GET /`
  - Serves the login page (Next.js).
- `POST /api/token/check`
  - Requires `Authorization: Bearer <token>`.
  - Returns `Valid token` or `Invalid token`.
- `GET /api/messages/list`
  - Requires `Authorization: Bearer <token>`.
  - Returns `{ messages: [...] }` for sync reconciliation.
- `GET /api/messages/hash`
  - Requires `Authorization: Bearer <token>`.
  - Returns `{ hash: "<sha512>" }` for fast sync checks.
- `POST /api/push/message`
  - Requires `Authorization: Bearer <token>` and `x-clientid`.
  - Accepts JSON body: `{ number, date, message, receivedAtEpochMs?, device*?, extra? }`.
  - Sanitizes fields, stores message, broadcasts via WebSocket.
  - Always responds with an empty body (HTTP 200 if route is reached).
  - Marked legacy; phone relay uses WebSocket.
  - Disabled by default via server config.

### 4.2 HTTP Responses and Status Codes
- `POST /api/token/check` returns HTTP 200 with a plain text body.
- `GET /api/messages/list` and `GET /api/messages/hash` return HTTP 401 on invalid token.
- Sync endpoints return HTTP 404 when disabled by configuration.
- Legacy push returns HTTP 404 when disabled; otherwise returns HTTP 200 regardless of auth failure.

### 4.3 WebSocket
- **Path**: `/ws`
- **Auth**: client sends a JSON `{ type: "auth", token, clientId? }` message after connect.
- **Events emitted by server**:
  - `sourceStatus` (boolean): phone online/offline state.
  - `baseMessages` (array): last buffered messages.
  - `keepMessages` (number): message retention limit (server config).
  - `message` (object): new message payload.
  - `syncHash` (string): hash of current message buffer.
  - `smsAck` (no payload): acknowledgement for phone uploads.
  - `error` (string): error message for invalid or unauthorized requests.

### 4.4 Message Buffer
- Backed by a pluggable persistence adapter.
- Built-in adapters: in-memory and JSON file.
- Custom adapters can be added by implementing the MessageStore interface.
- Default retention is 10 messages with purge enabled.
- Purge removes oldest messages when buffer exceeds `management.messages.keep`.

### 4.5 Online/Offline Tracking
- Server considers a client with valid `x-clientid` a phone.
- On WebSocket auth with valid `clientId`, it marks the phone online.
- On disconnect, it updates phone-online state based on remaining phone connections.

### 4.6 Message Schema and Validation
- Required fields: `number`, `date`, `message`.
- Optional fields: `receivedAtEpochMs`, `deviceManufacturer`, `deviceModel`, `deviceSdkInt`, `extra`.
- `extra` is a flat object of string key/value pairs used for additional device or carrier metadata.
- Sanitization removes angle brackets and caps string length; invalid or empty metadata entries are dropped.

Example payload:
```
{
  "number": "+12025550123",
  "date": "14:02:11 25/12/2025",
  "message": "Your code is 123456",
  "receivedAtEpochMs": 1766642531000,
  "deviceManufacturer": "Samsung",
  "deviceModel": "SM-S918B",
  "deviceSdkInt": 34,
  "extra": {
    "simSlot": "1",
    "carrier": "ExampleTel"
  }
}
```

### 4.7 Sanitization and Limits
- All incoming strings are sanitized and capped at 500 characters.
- Metadata entries are limited to a fixed maximum count.
- Empty or null fields are dropped to keep payloads compact.

### 4.8 Hashing and Sync Strategy
- `syncHash` is a SHA-512 hash of the JSON-serialized message buffer.
- Web client only uses HTTP sync when WebSocket is disconnected and HTTP sync is enabled.
- Hash-based polling avoids downloading the full buffer unless it has changed.

## 5. Web Client Behavior
### 5.1 Login Flow
- On page load, optionally auto-checks token in storage.
- User enters access code; the client hashes the code + salt.
- Client calls `POST /api/token/check`.
- On success: redirects to `/messages`.
- On failure: shows error and returns to login form.

### 5.2 Token Storage
- Storage key: `config.authorization.storageName`.
- Uses `localStorage` if `usePersistent = true`, otherwise `sessionStorage`.
- `token.js` provides get/set/destroy utilities.

### 5.3 Token Hashing
- Default uses `crypto.subtle.digest("SHA-512")`.
- Falls back to `crypto-js` if WebCrypto is unavailable.
- Hash input is `password + salt` from `config.authorization.salt`.

### 5.4 Messages UI
- Connects to WebSocket and sends an auth message containing the token.
- Receives base messages and new messages in real time.
- Supports message inversion, auto-scroll to latest, and message purging.
- Plays notification sound if enabled.
- Optional browser notifications for new messages (permission required).
- Shows server/phone status indicators and a "Close session" action.
- Renders optional metadata entries if present on a message.
- Runs a periodic sync against `/api/messages/list` to reconcile any missed messages.
- Sync polling runs every 5-10 seconds and uses `/api/messages/hash` to skip full sync when unchanged, only when WS is disconnected.
- HTTP sync endpoints are disabled by default; enable only if needed for recovery.

### 5.5 Localization
- Strings are loaded from `/lang/<locale>.json`.
- Client auto-detects locale from the browser and falls back to `en_US`.

## 6. Android App Behavior (smsrelay2)
Target SDK is Android 10 (API 29) and app is intended for Android 10+ devices.
### 6.1 SMS Reception
- Android `BroadcastReceiver` listens for `SMS_RECEIVED`.
- For each received SMS:
  - Enqueues a WorkManager job to upload the message.
  - Starts the foreground relay service if enabled and not running.
  - Persists the SMS into a local outbox for resend if upload fails.

### 6.2 Foreground Relay Service
- Optional persistent foreground service for maximum reliability.
- Maintains a WebSocket connection to mark the phone as online.
- Uses a persistent notification (can be silenced in settings).

### 6.3 Message Forwarding
- WebSocket `sms` message is sent with JSON payload:
  - `number`: originating address
  - `date`: formatted as `HH:mm:ss dd/MM/yyyy`
  - `message`: message body
  - `receivedAtEpochMs`: SMS receipt time in epoch ms
  - `deviceManufacturer`, `deviceModel`, `deviceSdkInt`: device metadata
  - `extra`: optional string map for additional metadata (carrier, SIM slot, etc.)
- Server responds with `smsAck` on successful store.

### 6.4 Token Generation
- Token = SHA-512 of `pin + salt`.
- Generated per request by `HashUtil`.
- Stored inputs (PIN and salt) are encrypted at rest.

### 6.5 Remote Provisioning
- Optional remote JSON config can be fetched by URL.
- Provisioning applies server/auth/feature settings atomically.
- Optional request auth can be set via a custom header/value.
- Optional response signature verification uses HMAC SHA-256 of the raw response body.
  - Signature is read from a configurable response header (hex or `sha256=<hex>`).

### 6.6 Pending Resend
- Pending SMS are stored in a local JSON outbox.
- On boot or app launch, a resend worker re-enqueues uploads for any pending items.

### 6.7 Permissions (Android)
Declared in `smsrelay2/android/app/src/main/AndroidManifest.xml`:
- `INTERNET`
- `RECEIVE_SMS`
- `READ_SMS`
- `WAKE_LOCK`
- `FOREGROUND_SERVICE`
- `RECEIVE_BOOT_COMPLETED`
- `SYSTEM_ALERT_WINDOW`

### 6.8 OEM and Platform Optimizations (Android)
OEM power management can delay or block background SMS processing unless the app is exempted.

Programmatic settings (in-app):
- `enable_foreground_service`: keep the relay in a persistent foreground service.
- `enable_boot_receiver`: re-enable relay after reboot.
- `enable_socket_presence`: maintain WebSocket presence for online status.

Samsung (One UI):
- Apps > smsrelay2 > Battery: set to Unrestricted.
- Battery and device care > Battery > Background usage limits: add smsrelay2 to Never sleeping apps.

Xiaomi (MIUI/HyperOS):
- Apps > Manage apps > smsrelay2 > Battery saver: No restrictions.
- Security app > Autostart: allow smsrelay2.
- Lock the app in Recents to prevent it from being killed.

Oppo (ColorOS):
- Battery > App battery management: set smsrelay2 to Unrestricted.
- Apps > Auto-launch: allow smsrelay2.
- Disable Sleep standby optimization if present.

## 7. Authentication Model
- Server stores a list of allowed access codes and client IDs.
- Access codes are hashed with a salt at startup if `useHashed = false`.
- Incoming tokens are validated by comparing against the hashed list.
- `x-clientid` controls which devices are allowed to push messages and be treated as the phone.
- Phone clients are treated as write-capable; browser clients are read-only.

## 8. Configuration
### 8.1 Server Config (`smsgate/src/config.ts`)
- `authorization.token.clientId`: list of allowed phone IDs.
- `authorization.token.accessCode`: list of allowed access codes.
- `authorization.token.useHashed`: if true, `hashedCode` is used directly.
- `authorization.salt`: salt for hashing.
- `server.port`: server port.
- `server.wsPath`: WebSocket path.
- `management.messages.keep`: server message retention limit.
- `management.messages.purgeOld`: enable auto-purge.
- `persistence.type`: `memory` or `json`.
- `persistence.filePath`: JSON storage file path.
- `http.enableLegacyPush`: enable or disable HTTP push endpoint.
- `http.enableSync`: enable or disable HTTP sync endpoints.

### 8.2 Web Client Config (`smsgate/src/lib/config.ts`)
- `language`: language file key.
- `authorization.salt`: hashing salt.
- `authorization.storageName`: storage key for token.
- `authorization.sendLogin`: auto-check token on page load.
- `authorization.usePersistent`: localStorage vs sessionStorage.
- `management.messages`: UI retention/scroll settings (local keep defaults to 10).
- `management.sound`: sound selection and enablement.
- `management.notifications`: browser notifications toggles and behavior.

### 8.3 Android App Config (native)
- Stored in EncryptedSharedPreferences; editable via in-app settings.
- `server_url`, `api_path`, `http_method`, `remote_config_url`.
- `remote_config_auth_header`, `remote_config_auth_value`.
- `remote_config_signature_header`, `remote_config_signature_secret`.
- `client_id_header`, `client_id_value`, `auth_header`, `auth_prefix`.
- `accept_header`, `accept_value`, `content_type_header`, `content_type_value`.
- `pin`, `salt` (encrypted).
- `enable_listener`, `enable_foreground_service`, `enable_boot_receiver`, `enable_socket_presence`, `notification_enabled`.

## 9. Data Flow Summary
1. Android phone receives SMS.
2. smsrelay2 queues a WorkManager upload with metadata (device details and optional extra fields).
3. smsrelay2 foreground service (if enabled) maintains WebSocket presence.
4. smsrelay2 posts message to `/api/push/message`.
5. smsgate stores and broadcasts message to all connected clients.
6. Web clients append the message to the UI and optionally play a sound.

## 10. Storage and Persistence
- **Server**: in-memory or JSON file persistence (configurable). JSON uses `smsgate/data/messages.json` by default.
- **Browser**: token stored in local/session storage.
- **Android**: encrypted prefs store config and credentials; pending SMS are persisted to a local JSON outbox for resend.

## 11. Performance and Reliability
- Foreground relay and WorkManager ensure delivery under background limits.
- WebSocket is the primary real-time channel; HTTP sync is a fallback.
- Message retention is bounded by server and client keep limits.

## 12. Observability
- Server logs only startup messages by default.
- Client surfaces connection status via UI indicators.
- Phone presence is tracked via WebSocket auth and disconnect events.

## 13. Error Handling and Edge Cases
- Invalid token on WebSocket connection leads to an auth error and disconnect.
- Invalid token on login or messages page redirects back to login.
- If server is unavailable, login errors are shown and UI recovers after delay.
- If `keepMessages` is 0, message purge is disabled on client and server.
- OEM background limits can delay or block SMS processing until the app is whitelisted.
- Invalid or oversized metadata fields are ignored during sanitization.

## 14. Security Considerations
- Intended to be used over TLS.
- Tokens are SHA-512 hashes with a salt.
- `useInsecure` is available for HTTP but reduces security.
- Client and server use shared access codes; no user-specific roles.
- Android app allows cleartext traffic for local HTTP servers; HTTPS is recommended.
- Remote provisioning can be protected by auth headers and HMAC signatures.

## 15. Build and Run
### 15.1 Server
- Install deps in `smsgate/`.
- Start dev: `npm run dev` (from `smsgate/`).
- Build: `npm run build`.
- Start prod: `npm run start`.

### 15.2 Android
- Open `smsrelay2/android/` in Android Studio.
- Build with Gradle or Run on a device (Android 10+).

## 16. Tooling and Dependencies
### 16.1 Server (Node/Next.js)
- Runtime: Node.js with Next.js 14.2.5 and React 18.2.0.
- WebSockets: `ws` 8.17.0.
- Tooling: TypeScript 5.4.5, ts-node 10.9.2, ESLint 8.57.0.

### 16.2 Android (Gradle/Kotlin)
- Gradle: 9.2.1 (`gradle-9.2.1-all.zip`).
- Android Gradle Plugin: 8.6.1.
- Kotlin: 2.0.21.
- Java: 21 toolchain and bytecode target.
- SDK levels: min 29, target 34, compile 34.
- Key libraries: AndroidX Work 2.7.1, Security Crypto 1.1.0-alpha03, OkHttp 4.9.3.

## 17. Non-Goals and Known Limitations
- No database-backed persistence beyond memory/JSON file adapters.
- No user management or per-user access controls.
- No outgoing SMS support.
- OEM-specific background limits (Samsung, Xiaomi, etc.) may still require manual whitelisting.
- UI is optimized for modern browsers; older browsers may have issues.
