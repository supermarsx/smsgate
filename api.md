# smsgate API

## Base
- All endpoints are served by the smsgate server (Express + Socket.IO).
- Default port is defined in `smsgate/config.js`.
- Authentication uses `Authorization: Bearer <token>` where token is SHA-512 of `pin + salt`.

## HTTP Endpoints
### GET /
- Serves login UI (`/public/login.html`).

### POST /api/token/check
- Headers:
  - `Authorization: Bearer <token>`
- Body: none.
- Responses (plain text):
  - `Valid token`
  - `Invalid token`

### POST /api/push/message
- Headers:
  - `Authorization: Bearer <token>`
  - `x-clientid: <clientId>`
  - `Accept: application/json` (configurable in app)
  - `Content-Type: application/json` (configurable in app)
  - `X-Device-Manufacturer`, `X-Device-Model`, `X-Device-Sdk` (optional metadata)
- Body (JSON):
  - Required:
    - `number` (string) sender/origin.
    - `date` (string) formatted date.
    - `message` (string) body.
  - Optional (currently sent by native Android app):
    - `receivedAtEpochMs` (number) receipt timestamp.
    - `deviceManufacturer` (string).
    - `deviceModel` (string).
    - `deviceSdkInt` (number).
- Responses: empty body (HTTP 200 when route is reached).
- Server behavior:
  - Sanitizes `number`, `date`, `message`.
  - Stores up to `management.messages.keep`.
  - Broadcasts via Socket.IO.

## Socket.IO
### Auth Headers
- `Authorization: Bearer <token>`
- `x-clientid: <clientId>`

### Events
- `sourceStatus` (boolean): phone online/offline.
- `baseMessages` (array): server buffer on connect.
- `keepMessages` (number): server retention limit.
- `message` (object): `{ number, date, message }`.

## Static Resources
- `GET /login` (via extension mapping) => login UI.
- `GET /messages` => messages UI.

## Remote Provisioning (Android)
The Android app can fetch a remote JSON config from any URL. This is not a server endpoint by default, but it can be hosted as a static file under `smsgate/public/` if desired.

### Example config JSON
```json
{
  "server": {
    "url": "https://example.com:3000",
    "apiPath": "/api/push/message",
    "method": "POST"
  },
  "auth": {
    "clientIdHeader": "x-clientid",
    "clientId": "PHONE01",
    "authHeader": "Authorization",
    "authPrefix": "Bearer ",
    "acceptHeader": "Accept",
    "acceptValue": "application/json",
    "contentTypeHeader": "Content-Type",
    "contentTypeValue": "application/json",
    "pin": "1234",
    "salt": "SALT"
  },
  "features": {
    "enableListener": true,
    "enableForegroundService": true,
    "enableBootReceiver": true,
    "enableSocketPresence": true,
    "notificationEnabled": true
  }
}
```
