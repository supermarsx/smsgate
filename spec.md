# smsgate Full Application Specification

## 1. Purpose and Scope
- Provide a small, two-piece system that relays SMS messages from an Android device to a server.
- Allow multiple browser clients to view the latest received SMS messages in real time.
- Provide token-based access control for both phone-to-server and browser-to-server communications.

## 2. High-Level Architecture
- **smsrelay2 (Android app, Kotlin native)** listens for incoming SMS and forwards messages to the server.
- **smsgate (Next.js + ws server, TypeScript)** exposes HTTP API endpoints and a WebSocket channel.
- **smsgate web client** (Next.js React) authenticates via a token and receives messages over WebSocket.

## 3. Components
### 3.1 smsgate Server
- **Runtime**: Node.js with Next.js and ws.
- **Entry point**: `smsgate/server.ts`.
- **Config**: `smsgate/src/config.ts`.
- **Static assets**: `smsgate/public/` (CSS, images, sounds, lang JSON).

### 3.2 smsgate Web Client
- **Login page**: `smsgate/src/pages/index.tsx`.
- **Messages page**: `smsgate/src/pages/messages.tsx`.
- **Client configuration**: `smsgate/src/lib/config.ts`.
- **Token utilities**: `smsgate/src/lib/token.ts`.
- **WebSocket helpers**: `smsgate/src/lib/ws.ts`.
- **Localization loader**: `smsgate/src/lib/lang.ts` and JSON in `smsgate/public/lang/`.

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
  - Accepts JSON body: `{ number, date, message, receivedAtEpochMs?, device*? }`.
  - Sanitizes fields, stores message, broadcasts via WebSocket.
  - Always responds with an empty body (HTTP 200 if route is reached).

### 4.2 WebSocket
- **Path**: `/ws`
- **Auth**: client sends a JSON `{ type: "auth", token, clientId? }` message after connect.
- **Events emitted by server**:
  - `sourceStatus` (boolean): phone online/offline state.
  - `baseMessages` (array): last buffered messages.
  - `keepMessages` (number): message retention limit (server config).
  - `message` (object): new message payload.

### 4.3 Message Buffer
- Backed by a pluggable persistence adapter.
- Built-in adapters: in-memory and JSON file.
- Custom adapters can be added by implementing the MessageStore interface.
- Default retention is 10 messages with purge enabled.
- Purge removes oldest messages when buffer exceeds `management.messages.keep`.

### 4.4 Online/Offline Tracking
- Server considers a client with valid `x-clientid` a phone.
- On WebSocket auth with valid `clientId`, it marks the phone online.
- On disconnect, it updates phone-online state based on remaining phone connections.

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
- Shows server/phone status indicators and a "Close session" action.
- Runs a periodic sync against `/api/messages/list` to reconcile any missed messages.
- Sync polling runs every 5-10 seconds and uses `/api/messages/hash` to skip full sync when unchanged, only when WS is disconnected.

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
- HTTP `POST /api/push/message` is sent with JSON body:
  - `number`: originating address
  - `date`: formatted as `HH:mm:ss dd/MM/yyyy`
  - `message`: message body
  - `receivedAtEpochMs`: SMS receipt time in epoch ms
  - `deviceManufacturer`, `deviceModel`, `deviceSdkInt`: device metadata
- Headers include:
  - `x-clientid` (configurable name/value)
  - `Authorization` (configurable name + prefix + token)
  - `Accept` and `Content-Type` (configurable)
  - `X-Device-*` metadata headers (manufacturer, model, sdk)

### 6.4 Token Generation
- Token = SHA-512 of `pin + salt`.
- Generated per request by `HashUtil`.
- Stored inputs (PIN and salt) are encrypted at rest.

### 6.5 Remote Provisioning
- Optional remote JSON config can be fetched by URL.
- Provisioning applies server/auth/feature settings atomically.

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

## 7. Authentication Model
- Server stores a list of allowed access codes and client IDs.
- Access codes are hashed with a salt at startup if `useHashed = false`.
- Incoming tokens are validated by comparing against the hashed list.
- `x-clientid` controls which devices are allowed to push messages and be treated as the phone.

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

### 8.2 Web Client Config (`smsgate/src/lib/config.ts`)
- `language`: language file key.
- `authorization.salt`: hashing salt.
- `authorization.storageName`: storage key for token.
- `authorization.sendLogin`: auto-check token on page load.
- `authorization.usePersistent`: localStorage vs sessionStorage.
- `management.messages`: UI retention/scroll settings (local keep defaults to 10).
- `management.sound`: sound selection and enablement.

### 8.3 Android App Config (native)
- Stored in EncryptedSharedPreferences; editable via in-app settings.
- `server_url`, `api_path`, `http_method`, `remote_config_url`.
- `client_id_header`, `client_id_value`, `auth_header`, `auth_prefix`.
- `accept_header`, `accept_value`, `content_type_header`, `content_type_value`.
- `pin`, `salt` (encrypted).
- `enable_listener`, `enable_foreground_service`, `enable_boot_receiver`, `enable_socket_presence`, `notification_enabled`.

## 9. Data Flow Summary
1. Android phone receives SMS.
2. smsrelay2 queues a WorkManager upload with metadata.
3. smsrelay2 foreground service (if enabled) maintains WebSocket presence.
4. smsrelay2 posts message to `/api/push/message`.
5. smsgate stores and broadcasts message to all connected clients.
6. Web clients append the message to the UI and optionally play a sound.

## 10. Storage and Persistence
- **Server**: in-memory or JSON file persistence (configurable). JSON uses `smsgate/data/messages.json` by default.
- **Browser**: token stored in local/session storage.
- **Android**: encrypted prefs store config and credentials; pending SMS are persisted to a local JSON outbox for resend.

## 11. Error Handling and Edge Cases
- Invalid token on WebSocket connection leads to an auth error and disconnect.
- Invalid token on login or messages page redirects back to login.
- If server is unavailable, login errors are shown and UI recovers after delay.
- If `keepMessages` is 0, message purge is disabled on client and server.
- OEM background limits can delay or block SMS processing until the app is whitelisted.

## 12. Security Considerations
- Intended to be used over TLS.
- Tokens are SHA-512 hashes with a salt.
- `useInsecure` is available for HTTP but reduces security.
- Client and server use shared access codes; no user-specific roles.
- Android app allows cleartext traffic for local HTTP servers; HTTPS is recommended.

## 13. Build and Run
### 13.1 Server
- Install deps in `smsgate/`.
- Start dev: `npm run dev` (from `smsgate/`).
- Build: `npm run build`.
- Start prod: `npm run start`.

### 13.2 Android
- Open `smsrelay2/android/` in Android Studio.
- Build with Gradle or Run on a device (Android 10+).

## 14. Non-Goals and Known Limitations
- No database-backed persistence beyond memory/JSON file adapters.
- No user management or per-user access controls.
- No outgoing SMS support.
- OEM-specific background limits (Samsung, Xiaomi, etc.) may still require manual whitelisting.
- UI is optimized for modern browsers; older browsers may have issues.
