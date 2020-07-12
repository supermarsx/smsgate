/*
  Application configuration
 */
var appVar = {
  authorization: {  // Authorization related
    token: {
      clientId: ['#XCLIENTID1'],  // Allowed clientIDs, phones that can push messages
      accessCode: ['#PIN1', '#PIN2'], // Allowed access codes to login and see messages
      hashedCode: [], // Hashed access codes
      useHashed: false, // Use hashed access codes directly, preferred in production
    },
    salt: '#SALT' // Hash salt
  },
  server: {
    port: 3000, // Server port
    extensions: ['html'], // Express server extensions, hides .html extension in the url
    paths: {
      entry: '/public/login.html', // Root/entry point file
      api: {
        tokenCheck: '/api/token/check', // Token check path
        messagePush: '/api/push/message' // Message push path
      }
    }
  },
  buffer: { // Intermediate storage
    messages: [], // Received messages
    isPhoneOnline: false  // Is phone(s) online
  },
  management: {
    messages: { // Related to messages
      keep: 10, // Amount of messages to keep on the server (default: 10)
      purgeOld: true, // Purge old messages if they exceed the amount to keep, false means keep all messages (default: true)
    }
  }
};

module.exports = appVar;
