// jshint esversion: 8

var express = require('express'),
  app = require('express')(),
  http = require('http').createServer(app),
  io = require('socket.io')(http),
  crypto = require('crypto');

/*
  Application configuration
 */
var appVar = {
  isPhoneOnline: false, // Is phone online
  connectedClients: 0, // Connected clients
  allowedCids: ['#XCLIENTID1'], // Allowed client IDs, phones that can push messages
  allowedPins: ['#PIN1', '#PIN2'], // Allowed pin codes to login and see messages
  hashedPins: [], // Hash array including pre hashed pins
  serverPort: 3000, // Express server port
  keepMessages: 10, // Maximum amount of messages to keep on the server
  purgeOld: true, // Purge old messages on new message
  messages: [], // Messages
  salt: '#SALT', // Salt to hash tokens with
  extensions: ['html'] // Express extensions, don't show extension on the window url
};

// Pre hash pins at startup
pushHashedPins();

// Use JSON and public static folder
app.use(express.json());
app.use(express.static('public', {extensions: appVar.extensions}));

/*
  Check for token (bearer) authorization
 */
io.use((socket, next) => {
  if (socket.handshake.headers.authorization !== undefined) {
    var token = socket.handshake.headers.authorization.split(' ')[1];
    //console.log(token);
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

// Catch all request debug
/*
app.all('*', function(req, res) {
  console.log(req);
});*/

/*
  Get Index page from 'public' folder
 */
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
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
  Push message API entry point
    Takes a valid token (bearer authorization header) and message object aswell as a valid client ID
 */
app.post('/api/push/message', (req, res) => {
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
});

/*
  API token check
    Takes a token (bearer authorization header) and checks its validity
 */
app.post('/api/token/check', (req, res) => {
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
  socket.emit('sourceStatus', appVar.isPhoneOnline);
  socket.emit('baseMessages', appVar.messages);
  socket.emit('keepMessages', appVar.keepMessages);

  /*
   If the given Client ID is valid, signal phone online temporarily
   */
  if (isValidCid(clientId)) {
    appVar.isPhoneOnline = true;
    socket.broadcast.emit('sourceStatus', appVar.isPhoneOnline);
    console.log('Phone: online');
  }

  /*
    On socket.io disconnection
   */
  socket.on('disconnect', (e, cid = clientId) => {
    if (isValidCid(cid)) {  // If is valid client ID, phone
      appVar.isPhoneOnline = false;
      socket.broadcast.emit('sourceStatus', appVar.isPhoneOnline);
      console.log('Phone: offline');
    }
    console.log('Client: offline');
  });

});

/*
  HTTP port listener, server startup
 */
http.listen(appVar.serverPort, () => {
  console.log('smsgate listening on *:' + appVar.serverPort);
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
  appVar.messages.push({
    number: number,
    date: date,
    message: message
  });
  if (appVar.purgeOld) purgeOld(); // Purges old messages
}

/*
  purgeMessage
    Purge a message on array
 */
function purgeMessage(position = 0) {
  if (position == 0) {
    appVar.messages.shift();
  } else {
    appVar.messages.splice(position);
  }
}

/*
  purgeOld
    Purge messages in excess to config
 */
function purgeOld() {
  if (appVar.keepMessages !== 0) {
    while (appVar.messages.length > appVar.keepMessages) {
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
  for (var cid in appVar.allowedCids) {
    if (clientId == appVar.allowedCids[cid]) return true;
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
  for (var pin in appVar.hashedPins) {
    if (token == appVar.hashedPins[pin]) return true;
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
  return crypto.createHash('sha512').update(string + appVar.salt).digest('hex');
}

/*
  pushHashedPins
    Hash and push pins once
 */
function pushHashedPins() {
  for (var pin in appVar.allowedPins) {
    appVar.hashedPins.push(hash(appVar.allowedPins[pin]));
  }
}
