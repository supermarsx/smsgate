/*
  Application configuration
 */
var config = {
  language: 'en_US', // Language used, from lang/ folder
  authorization: {  // Authorization related
    useInsecure: false, // Create token over insecure connection, not recommended (default: false)
    salt: '#SALT', // Hash function salt
    storageName: '1234567890abcdef_smstoken', // Local storage/session name
    sendLogin: true, // Send token authorization, token check
    usePersistent: true // Use persistent local storage instead of session storage, best is session (default: false)
  },
  management: {
    messages: { // Message related
      keep: 0, // Amount of messages to keep (default: 0) [Get from server]
      keepfromServer: true, // Push 'messages to keep' from server (default: true)
      purgeOld: true, // Purge messages in excess of the defined to keep, false will keep all messages (default: true)
      showLatest: true, // Scroll to last message on the bottom at reception (default: true)
      invert: false, // Invert latest message, bottom to top instead of top to bottom, [true means messages go from bottom to the top, first is most recent] (default: false)
      pushBase: true, // Request old messages from server on entry (default: true)
      pushStatus: true, // Push connection status updates (default: true)
      pushMessages: true, // Push new incoming messages (default: true)
      hideClose: false // Hide close session button (default: false)
    },
    sound: { // Sound related
      enabled: false, // Enable annoying sound notification (default: false)
      name: 'gglass', // Sound name from sounds folder (more at sounds folder)
      path: '../../sounds/', // Relative sound files path
      fileExt: '.mp3' // Sound file extension
    },
    paths: { // Relative URL paths
      login: '/', // Login
      messages: '/messages', // Messages
      tokenCheck: '/api/token/check', // Token check
      sha512: '/js/sha512.min.js', // SHA512 alternative path for HTTP
      redirects: { // Redirects
        timing: { // Timing in ms
          1: 3000,
          2: 3000,
        }
      }
    },
    request: { // Request related
      main: { // Main/Messages panel
        method: 'POST',
        header1: 'Authorization',
        header1Prefix: 'Bearer ',
        header2: 'Content-Type',
        header2Value: 'application/x-www-form-urlencoded',
        invalidToken: 'Invalid token' // Just a centralized str
      },
      login: { // Login/Entry panel
        method: 'POST',
        header1: 'Authorization',
        header1Prefix: 'Bearer ',
        header2: 'Content-Type',
        header2Value: 'application/x-www-form-urlencoded',
        invalidToken: 'Invalid token', // Just a centralized str
        validToken: 'Valid token' // Just a centralized str
      }
    }
  },
  debug: { // Debugging 
    nulled: { // Nulls functions
      hash: false, // Hash function
      destroy: false, // Token destroy
      set: false, // Token set
      get: false, // Token get
      keypress: false // Null [ENTER] key
    }
  }
};

var socket;
