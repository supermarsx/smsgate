# smsgate

smsgate is a small time, two piece portal software to receive messages from your android phone and forward them to a HTTP API and view them on a browser anywhere. This piece of software was created with the premise of several people in different locations being able to access the latest received messages from an android phone. A very common use case of this is for several people to access two step verification codes, single one time codes for different types of applications.

smsgate is divided in two parts: `smsgate` the socket.io/express server and `smsrelay2` the native Android (Kotlin) application. The Android app listens for SMS in the background and foreground, forwards messages to the server, and optionally maintains a Socket.IO presence connection. The server interfaces with the browser client using Socket.IO so connected users see incoming messages in real time.

## Visual Demo

1. Base scenario (failed login, valid login, message reception, close session, login with messages, saved session, invalid token redirect)


![smsgate](https://github.com/eduardomota/smsgate/raw/master/media/smsgate.gif)

2. Android application screenshot

<img src="https://github.com/eduardomota/smsgate/raw/master/media/smsrelay2.png" width=300px>

## Main specification/features

- Native Android (Kotlin) application
- Foreground and background sms listener
- Simple user interface
- Notification sound
- Socket.io/Express server
- Real-time sms reception (~ 1 second)
- Token based authentication, SHA-512 hash with salt (local/session storage)
- Pseudo uni-directional communications (reception only)
- Translation ready through simple json file

## Getting started

Clone this repository, install dependencies, add your variables and run.

```bash
Clone repository
$ git clone https://github.com/eduardomota/smsgate

Install smsgate dependencies
$ cd ./smsgate/smsgate
$ npm install

Open the Android app in Android Studio
$ cd ../smsrelay2/android
```

## App walkthrough (Android)
1) Open the app and grant SMS permissions.
2) Configure server URL, client ID, PIN, and salt in Settings.
3) Tap "Start foreground relay" to keep the service active.
4) Use "Provision from server" if you have a remote config URL.
5) Send an SMS to the device and verify it appears in the web UI.

Change the variables to suit your preferences, on these files:

```
Android application: configure in-app settings or remote JSON
Express/socketio client: ./smsgate/js/app/config.js
Express/socketio server: ./smsgate/config.js
Express/socketio client/phone test: ./smsgate/js/test.js
```

### smsrelay2

smsrelay2 listens for incoming messages and forwards them to the server, compiling origin, body, and date/time (plus extra device metadata). Configuration is stored securely on device and can be provisioned remotely.

To build and run, open `smsrelay2/android` in Android Studio and run on a physical device (Android 10+).

### smsgate

smsgate receives messages from devices that are both authenticated by the `authorization`  and `x-clientid` headers included in every communication with the server. The server retains the latest 10 messages it receives and broadcasts using socket.io to every connected client. Every connected client has to be authorized by using a valid `authorization` header that is generated using the login page and inserting the correct access code, it then hashes the code with a salt and sets as its auth header.

To run the smsgate server type:

```
$ node ./index.js
```

## Considerations

This application authentication only makes sense if used under TLS, it uses a salt and strong hashing algorithm to harden against potential rainbow tables against access codes. Using this over plain HTTP defeats the purpose of using a token as it can be easily obtained from raw network traffic.
Tokens cannot be created using "crypto.subtle.digest" over HTTP, for that you'll need enable insecure inside on config.
This application is made with modern browsers in mind, older browsers may encounter difficulties or may not function as expected. Chrome is the recommended browser as it implements all functionality in an ideal scenario but any other modern popular browser will probably work well.
A way of avoiding white screen flash when changing pages is implemented using prefetch/prerender functionality, Safari isn't supported.

## Notes

### Translation

Just access `./smsgate/js/app/lang` and create a new `.json` language file, change key values to the target language accordingly and set it on the config file to use it.

### Regarding android compilation

Follow the general guide to export an APK with code signing from Android Studio or Gradle.

## Built with

<a href="https://socket.io/"><img height=40px src="https://socket.io/css/images/logo.svg"></a>

<a href="https://expressjs.com/"><img height=40px src="https://upload.wikimedia.org/wikipedia/commons/6/64/Expressjs.png"></a>

<a href="https://kotlinlang.org/"><img height=40px src="https://upload.wikimedia.org/wikipedia/commons/7/74/Kotlin_Icon.png"></a> Kotlin

<a href="https://jquery.org/"><img height=40px src="https://upload.wikimedia.org/wikipedia/sco/9/9e/JQuery_logo.svg"></a>

<a href="https://bulma.io/"><img height=40px src="https://bulma.io/images/made-with-bulma.png"></a>

## License

Distributed under MIT License. See `license.md` for more information.
