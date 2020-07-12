// jshint esversion: 8

import {
  sha512
} from 'react-native-sha512';

/*
  Application configuration
 */
var config = {
  authorization: {  // Headers and authorization related
    header1: 'x-clientid',  // x-clientid header
    header1value: '#XCLIENTID1', // x-clientid header value
    header2: 'Authorization', // Authorization header
    header2prefix: 'Bearer ', // Auhtorization header value prefix
    header3: 'Accept', // Accept header
    header3value: 'application/json', // Accept header value
    header4: 'Content-Type', // Content-Type header
    header4value: 'application/json', // Content-Type header value
    pin: '#PIN1', // Access code string
    salt: '#SALT', // Access code hash salt
    token: '' // Hashed access code / token
  },
  server: { // Server connection related
    url: 'http://#SERVER:#PORT', // Server IP/hostname and port
    apiPath: '/api/push/message', // Push message API URL
    method: 'POST' // Request method
  },
  misc: { // Miscellaneous
    hash: true, // Hash access code
    listen: true // Enable background listener
  }
};

/*
  sha512wrapper
    SHA512 hashing wrapper
 */
export async function sha512wrapper(str) {
  return sha512(str);
}

module.exports = {
  config: config,
  sha512wrapper: sha512wrapper,
};
