// jshint esversion: 8

var express = require('express'),
  app = require('express')(),
  http = require('http').createServer(app),
  io = require('socket.io')(http),
  crypto = require('crypto');

// App configuration
var appVar = require('./config');

// Pre hash pins at startup
if (!appVar.authorization.token.useHashed) pushHashedPins();

// Use JSON and public static folder
app.use(express.json());
app.use(express.static('public', {
  extensions: appVar.server.extensions
}));

/*
  Check for token (bearer) authorization
 */
io.use((socket, next) => {
  if (socket.handshake.headers.authorization !== undefined) {
    var token = socket.handshake.headers.authorization.split(' ')[1];
    if (isValidToken(token)) {
      console.log('Token: Valid, socket');
      return next();
    }
  }
  return next((socket) => {
    console.log('Token: Invalid, socket');
    socket.emit('Invalid token');
    socket.disconnect();
  });
});

/*
  Get Index page from 'public' folder
 */
app.get('/', (req, res) => {
  res.sendFile(__dirname + appVar.server.paths.entry);
});

/*
  Phone ping
 */
/*
app.get('/api/ping', (req, res) => {
  console.log(req.headers);
});
*/

/*
app.all('*', function(){
  console.log('received');
  http.getConnections(function(error, count) {
    console.log(count);
});
});
*/

/*
  Push message API entry point
    Takes a valid token (bearer authorization header) and message object aswell as a valid client ID
 */
app.post(appVar.server.paths.api.messagePush, (req, res) => {
  var clientId = req.headers['x-clientid'],
    token = req.headers.authorization.split(' ')[1];
  //console.log(req.headers);
  //console.log(req.body);
  if (isValidCid(clientId) && isValidToken(token)) {
    var message = {
      number: sanitizeStr(req.body.number),
      date: sanitizeStr(req.body.date),
      message: sanitizeStr(req.body.message)
    };
    console.log('Phone: New message pushed');
    pushMessage(
      message.number,
      message.date,
      message.message
    );
    io.sockets.emit('message', message);
  }
  res.end();
});

/*
  API token check
    Takes a token (bearer authorization header) and checks its validity
 */
app.post(appVar.server.paths.api.tokenCheck, (req, res) => {
  //console.log(req.headers);
  var token = req.headers.authorization.split(' ')[1];
  //console.log(token);
  if (isValidToken(token)) {
    console.log('Token: Valid, API');
    res.send('Valid token');
  } else {
    console.log('Token: Invalid, API');
    res.send('Invalid token');
  }
});

/*
  On socket.io conection
 */
io.on('connection', (socket) => {
  var clientId = socket.handshake.headers['x-clientid'];

  console.log('Client: online');
  socket.emit('sourceStatus', appVar.buffer.isPhoneOnline);
  socket.emit('baseMessages', appVar.buffer.messages);
  socket.emit('keepMessages', appVar.management.messages.keep);

  /*
   If the given Client ID is valid, signal phone online temporarily
   */
  if (isValidCid(clientId)) {
    appVar.buffer.isPhoneOnline = true;
    socket.broadcast.emit('sourceStatus', appVar.buffer.isPhoneOnline);
    console.log('Phone: online');
  }

  /*
    On socket.io disconnection
   */
  socket.on('disconnect', (e, cid = clientId) => {
    if (isValidCid(cid)) { // If is valid client ID, phone
      appVar.buffer.isPhoneOnline = false;
      socket.broadcast.emit('sourceStatus', appVar.buffer.isPhoneOnline);
      console.log('Phone: offline');
    }
    console.log('Client: offline');
  });

});

/*
  HTTP port listener, server startup
 */
http.listen(appVar.server.port, () => {
  console.log('smsgate listening on *:' + appVar.server.port);
});

/*
  pushMessage
    Pushes message to the messages array
  parameters
    number (string) - Message origin
    date (string) - String formatted date and time of message reception
    message (string) - Plain message body
 */
function pushMessage(number, date, message) {
  appVar.buffer.messages.push({
    number: number,
    date: date,
    message: message
  });
  //console.log(appVar.buffer.messages);
  if (appVar.management.messages.purgeOld) purgeOld(); // Purges old messages
}

/*
  purgeMessage
    Purge a message on array
 */
function purgeMessage(position = 0) {
  console.log(`SMSGATE: Purging message ${position}`);
  if (position == 0) {
    appVar.buffer.messages.shift();
  } else {
    appVar.buffer.messages.splice(position);
  }
}

/*
  purgeOld
    Purge messages in excess to config
 */
function purgeOld() {
  //console.log('SMSGATE: Purging old messages');
  if (appVar.management.messages.keep !== 0) {
    while (appVar.buffer.messages.length > appVar.management.messages.keep) {
      purgeMessage();
    }
  }
}

/*
  testPushMessage
    Push a test message
 */
function testPushMessage() {
  pushMessage('+351 123 456 789', '00:01:00 01/01/1970', randomInteger(1000, 9999));
}

/*
  isValidCid
    Check if a given clientId is listed in allowedCids
  parameters
    clientId (string) - 'x-clientid' header
 */
function isValidCid(clientId) {
  for (var cid in appVar.authorization.token.clientId) {
    if (clientId == appVar.authorization.token.clientId[cid]) return true;
  }
  return false;
}

/*
  isValidToken
    Check if a given token is listed as valid token hashed
  parameters
    token (string) - Token used as (bearer) authorization header
 */
function isValidToken(token) {
  for (var pin in appVar.authorization.token.hashedCode) {
    if (token == appVar.authorization.token.hashedCode[pin]) return true;
  }
  return false;
}

/*
  sanitize
    Sanitize a given string
  parameters
    string (string) - String to sanitize
 */
function sanitizeStr(string) {
  return string.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 500);
}

/*
  randomInteger
    Generate a random integer with a lower and upper bound
  parameters
    min (integer) - Minimum integer
    max (integer) - Maximum integer
 */
function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/*
  hash
    Create sha512 hashed string with salt
  parameters
    string (string) - String to hash
 */
function hash(string) {
  return crypto.createHash('sha512').update(string + appVar.authorization.salt).digest('hex');
}

/*
  pushHashedPins
    Hash and push pins once
 */
function pushHashedPins() {
  for (var pin in appVar.authorization.token.accessCode) {
    appVar.authorization.token.hashedCode.push(hash(appVar.authorization.token.accessCode[pin]));
  }
}
