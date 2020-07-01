/*
  Application configuration
 */
var config = {
  salt: '#SALT',  // Hash salt
  storageName: '1234567890abcdef_smstoken', // Local storage name
  keepMessages: 0, // Amount of messages to keep
  purgeOld: true, // Purge old messages
  showLatestMessage: true, // Show latest message on push
  sendLogin: true, // Send token authorization check
  pushBase: true, // Push base/old messages from server
  pushStatus: true, // Push status updates
  updateKeepMessages: true, // Updates messages to keep from server
  pushMessages: true, // Push new messages from the server,
  nulled: { // Nulls different functions
    hash: false, // Hash
    destroy: false, // Token destroy
    set: false, // Token set
    get: false, // Token get,
    keypress: false // Null [enter key]
  },
  paths: {
    login: '/',
    messages: '/messages',
    tokenCheck: '/api/token/check'
  },
  timing: {
    redirect: 3000,
    redirect2: 3000
  }
};

var socket;
