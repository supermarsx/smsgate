// jshint esversion: 8
import io from 'socket.io-client';

import { sha512 } from 'react-native-sha512';

module.exports = async (taskData) => {
  //console.log("HeadlessJs");
  //console.log(taskData);
  sendMessage(taskData);
};

/*
  sendMessage
    Sends a message to the API
  parameters
    message (object) - Message object containing origin and message body
 */
async function sendMessage(message) {
  var pin = '#PIN1', salt = '#SALT';
  var authorization = (await sha512(pin + salt));
  var config = {
    socket: {
      url: 'http://#SOCKETIOHOST:#PORT',
      'x-clientid': '#XCLIENTID1',
      authorization: 'Bearer ' + authorization,
    },
    fetch: {
      url: 'http://#EXPRESSHOST:#PORT/api/push/message',
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-clientid': '#XCLIENTID1'
      },
    }
  };

  //console.log(config);

  const socket = io(config.socket.url, {
    transportOptions: {
      polling: {
        extraHeaders: {
          'x-clientid': config.socket['x-clientid'],
          authorization: config.socket.authorization,
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

  fetch(config.fetch.url, {
    method: config.fetch.method,
    headers: {
      Accept: config.fetch.headers.Accept,
      'Content-Type': config.fetch.headers['Content-Type'],
      'x-clientid': config.fetch.headers['x-clientid'],
      authorization: config.fetch.headers.authorization
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
