// jshint esversion: 8
// not tested, early draft

var socket;

start();

/*
  Phone connection test
 */
async function start() {
  socket = io({
    transportOptions: {
      polling: {
        extraHeaders: {
          'x-clientid': '#XCLIENTID1',
          authorization: 'Bearer ' + await sha512('#PIN1')
        }
      }
    }
  });
}

/*
  On send message click
 */
$("#sendmessage").click(async () => {
  console.log("Sending test message");
  fetch('/api/push/message', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-clientid': '#XCLIENTID1',
      authorization:  'Bearer ' + await sha512('#PIN1')
    },
    body: JSON.stringify({
      number: '+351 213 456 ' + randomInteger(100, 999),
      date: '01-01-2020 01:01:01',
      message: 'test ' + randomInteger(10000, 99999)
    })
  });
});

/*
  randomInteger
    Generate a random integer with a lower and upper bound
 */
function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/*
  sha512
    hashes a string plus salt with SHA 512
 */
function sha512(str) {
  return crypto.subtle.digest("SHA-512", new TextEncoder("utf-8").encode(str + config.authorization.salt)).then(buf => {
    return Array.prototype.map.call(new Uint8Array(buf), x => (('00' + x.toString(16)).slice(-2))).join('');
  });
}
