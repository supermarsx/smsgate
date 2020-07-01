# smsgate

smsgate is a small time, two piece portal software to receive messages from your android phone and forward them to a HTTP API and view them on a browser anywhere. This piece of software was created with the premise of several people in different locations being able to access the latest received messages from an android phone. A very common use case of this is for several people to access two step verification codes, single one time codes for different types of applications.

smsgate is divided in two parts: `smsgate` the socket.io/express server and `smsrelay2` the react-native android application. This includes an Android application in react-native that listens for sms messages both foreground and background but not when closed. This application executes a fetch request to the server once it receives a message pushing it to every connected client. There's also an express/socket.io server to interface with the users browsers, socket.io allows for clients to be connected to the server and receive any incoming messages in real time.

## Visual Demo

1. Base scenario

   1. Failed login

   2. Valid login

   3. Message receptions

   4. Close session

   5. New login, old messages   

   6. Saved session login

   7. Invalid token, direct message access redirect

![smsgate](https://github.com/eduardomota/smsgate/raw/master/media/smsgate.gif)

2. Android application screenshot

<img src="https://github.com/eduardomota/smsgate/raw/master/media/smsrelay2.png" width=300px>

## Main specification/features

- React-native android application
- Foreground and background sms listener
- Simple user interface
- Socket.io/Express server
- Real-time sms reception (< 1 second)
- Token based authentication, SHA-512 hash with salt
- Uni directional, message reception only application

## Getting started

Clone this repository, install dependencies, add your variables and run.

```bash
Clone repository
$ git clone https://github.com/eduardomota/smsgate

Install smsgate dependencies
$ cd ./smsgate/smsgate
$ npm install

Install smsrelay2 dependencies
$ cd ../smsrelay2/
$ npm install
```

Change the variables to suit your preferences,

Change on these files:

```
# Android application
./smsrelay2/App.js
./smsrelay2/sms/RECEIVESMS.js
# Socket.io/Express server
./smsgate/index.js
./smsgate/js/app/config.js
./smsgate/js/test.js
```

... the following strings:

```
#SOCKETIOHOST - smsgate server IP (local network ip)
#EXPRESSHOST - smsgate server IP (local network ip)
#PORT - smsgate server port
#XCLIENTID1 - client id, its the allowed client to push messages to the server, header 'x-clientid'
#PIN1 - First authorized pin/access code to authenticate
#PIN2 - Second authorized pin/access code to authenticate
#SALT - Hash salt, should be a long random string and be the same everywhere
1234567890abcdef_smstoken - Local storage name to store the token
```

### smsrelay2

smsrelay2 listens for incoming messages to then forward them to the server, on sending it compiles the origin (from), body (data within the message) and current date formatted as hh:mm:ss dd/mm/yyyy. These parameters can be changed in the code as needed. When opening the app the first time you'll notice that it contains an excerpt of the application configuration but redacted so its not readily visible but able to help troubleshooting issues at distance.

To launch the app, connect a physical device and type:

```
$ npx react-native run-android
```

### smsgate

smsgate receives messages from devices that are both authenticated by the `authorization`  and `x-clientid` headers included in every communication with the server. The server retains the latest 10 messages it receives and broadcasts using socket.io to every connected client. Every connected client has to be authorized by using a valid `authorization` header that is generated using the login page and inserting the correct access code, it then hashes the code with a salt and sets as its auth header.

To run the smsgate server type:

```
$ node ./index.js
```

## Considerations

This application authentication only makes sense if used under TLS, it uses a salt and strong hashing algorithm to harden against potential rainbow tables. Using this over plain HTTP nulls the objective of using the token as it can be easily obtained from raw network traffic.

## Built with

<a href="https://socket.io/"><img height=40px src="https://socket.io/css/images/logo.svg"></a>

<a href="https://expressjs.com/"><img height=40px src="https://upload.wikimedia.org/wikipedia/commons/6/64/Expressjs.png"></a>

<a href="https://reactnative.dev/"><img height=40px src="https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg"></a> React-native

<a href="https://jquery.org/"><img height=40px src="https://upload.wikimedia.org/wikipedia/sco/9/9e/JQuery_logo.svg"></a>

<a href="https://bulma.io/"><img height=40px src="https://bulma.io/images/made-with-bulma.png"></a>

## License

Distributed under MIT License. See `license.md` for more information.
