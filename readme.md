# smsgate

smsgate is a small time, two piece portal software to receive messages from your android phone and forward them to a HTTP API and view them on a browser anywhere. This piece of software was created with the premise of several people in different locations being able to access the latest received messages from an android phone. A very common use case of this is for several people to access two step verification codes, single one time codes for different types of applications.

smsgate is divided in two parts: `smsgate` the Next.js + WebSocket server and `smsrelay3` the native Android (Kotlin) application. The Android app listens for SMS in the background and foreground, forwards messages to the server, and optionally maintains a WebSocket presence connection. The server interfaces with the browser client using WebSockets so connected users see incoming messages in real time.

## Visual Demo

1. Base scenario (failed login, valid login, message reception, close session, login with messages, saved session, invalid token redirect)


![smsgate](https://github.com/supermarsx/smsgate/raw/master/media/smsgate.gif)

2. Android application screenshot

<img src="https://github.com/supermarsx/smsgate/raw/master/media/smsrelay3.png" width=300px>

## Main specification/features

- Native Android (Kotlin) application
- Foreground and background sms listener
- Simple user interface
- Notification sound
- Next.js server + WebSockets
- Real-time sms reception (~ 1 second)
- Token based authentication, SHA-512 hash with salt (local/session storage)
- Pseudo uni-directional communications (reception only)
- Translation ready through simple json file

## Getting started

Clone this repository, install dependencies, add your variables and run.

```bash
Clone repository
$ git clone https://github.com/supermarsx/smsgate

Install smsgate dependencies
$ cd ./smsgate/smsgate
$ npm install

Open the Android app in Android Studio
$ cd ../smsrelay3/android
```

## App walkthrough (Android)
1) Open the app and grant SMS permissions.
2) Configure server URL, client ID, PIN, and salt in Settings.
3) Tap "Start foreground relay" to keep the service active.
4) Use "Provision from server" if you have a remote config URL.
5) Send an SMS to the device and verify it appears in the web UI.

In-app settings (recommended):
- Settings > Behavior: enable SMS listener, foreground relay, start on boot, and WebSocket presence.
- Settings > Server: set Remote config URL (optional) plus auth header/value and signature header/secret if you secure provisioning.
  - Signature format: HMAC SHA-256 of the response body, sent as hex or `sha256=<hex>` in the chosen header.

Change the variables to suit your preferences, on these files:

```
Android application: configure in-app settings or remote JSON
smsgate client config: ./smsgate/src/lib/config.ts
smsgate server config: ./smsgate/src/config.ts
```

### smsrelay3

smsrelay3 listens for incoming messages and forwards them to the server, compiling origin, body, and date/time (plus extra device metadata). Configuration is stored securely on device and can be provisioned remotely.

To build and run, open `smsrelay3/android` in Android Studio and run on a physical device (Android 10+).

## OEM and platform optimizations (Android)

To maximize SMS capture reliability, enable the app's foreground relay and apply OEM battery/auto-start exemptions. Menus vary by OS version; use the closest match.

Programmatic settings (in-app):
- Enable foreground service.
- Enable boot receiver.
- Enable WebSocket presence if you want a persistent online indicator.

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

### smsgate

smsgate receives messages from devices that are authenticated by the `authorization` and `x-clientid` headers included in every communication with the server. The server retains the latest messages it receives and broadcasts them to every connected client via WebSockets. Every connected client has to be authorized by using a valid token generated from the login page.

Server settings can be overridden via environment variables:
```
SMSGATE_PORT, SMSGATE_WS_PATH, SMSGATE_CLIENT_IDS, SMSGATE_ACCESS_CODES,
SMSGATE_USE_HASHED, SMSGATE_SALT, SMSGATE_MESSAGES_KEEP, SMSGATE_MESSAGES_PURGE,
SMSGATE_PERSISTENCE_TYPE, SMSGATE_PERSISTENCE_FILE,
SMSGATE_HTTP_LEGACY_PUSH, SMSGATE_HTTP_SYNC
```

Client settings can be overridden via Next.js public env vars:
```
NEXT_PUBLIC_SMS_LANG, NEXT_PUBLIC_SMS_SALT, NEXT_PUBLIC_SMS_STORAGE,
NEXT_PUBLIC_SMS_PERSISTENT, NEXT_PUBLIC_SMS_SEND_LOGIN, NEXT_PUBLIC_SMS_KEEP_LOCAL,
NEXT_PUBLIC_SMS_KEEP_FROM_SERVER, NEXT_PUBLIC_SMS_SHOW_LATEST, NEXT_PUBLIC_SMS_INVERT,
NEXT_PUBLIC_SMS_SYNC_MS, NEXT_PUBLIC_SMS_ENABLE_HTTP_SYNC,
NEXT_PUBLIC_SMS_SOUND, NEXT_PUBLIC_SMS_SOUND_NAME,
NEXT_PUBLIC_SMS_SOUND_PATH, NEXT_PUBLIC_SMS_SOUND_EXT
```

To run the smsgate server:

```
$ npm run dev
```

To build for production:

```
$ npm run build
$ npm run start
```

## Considerations

This application authentication only makes sense if used under TLS, it uses a salt and strong hashing algorithm to harden against potential rainbow tables against access codes. Using this over plain HTTP defeats the purpose of using a token as it can be easily obtained from raw network traffic.
Tokens cannot be created using "crypto.subtle.digest" over HTTP, for that you'll need enable insecure inside on config.
This application is made with modern browsers in mind, older browsers may encounter difficulties or may not function as expected. Chrome is the recommended browser as it implements all functionality in an ideal scenario but any other modern popular browser will probably work well.
A way of avoiding white screen flash when changing pages is implemented using prefetch/prerender functionality, Safari isn't supported.

## Tooling and dependencies

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
