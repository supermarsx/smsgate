// jshint esversion: 8
import io from 'socket.io-client';

import { config, sha512wrapper } from '../config';

module.exports = async (taskData) => {
  //console.log("HeadlessJs");
  //console.log(taskData);
  sendMessage(taskData);
};

initialize();

/*
  initialize
    Initializes config, hashes pin
 */
async function initialize() {
  var { pin, salt, token } = config.authorization;
  config.authorization.token = await sha512wrapper(pin + salt);
}

/*
  sendMessage
    Sends a message to the API
  parameters
    message (object) - Message object containing origin and message body
 */
async function sendMessage(message) {
  console.log(config);

  const socket = io(config.server.url, {
    transportOptions: {
      polling: {
        extraHeaders: {
          'x-clientid': config.authorization.header1value,
          Authorization: config.authorization.header2prefix + config.authorization.token,
        }
      }
    }
  });

  message.date = new Date();
  message.date = padNumber(message.date.getHours()) + ':' +
    padNumber(message.date.getMinutes()) + ':' +
    padNumber(message.date.getSeconds()) + ' ' +
    padNumber(message.date.getDate()) + '/' +
    padNumber(message.date.getMonth()) + '/' +
    message.date.getFullYear();

  fetch(config.server.url + config.server.apiPath, {
    method: config.server.method,
    headers: {
      Accept: config.authorization.header3value,
      'Content-Type': config.authorization.header4value,
      'x-clientid': config.authorization.header1value,
      Authorization: config.authorization.header2prefix + config.authorization.token
    },
    body: JSON.stringify({
      number: message.originatingAddress,
      date: message.date,
      message: message.body
    })
  });
}

/*
  padNumber
    Pad a number to 2 integers
  parameters
    number (integer) - Pads a single digit to double digit number with preceding zero
 */
function padNumber(number) {
  return ("0" + number).slice(-2);
}
