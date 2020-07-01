/**
 * smsrelay2
 *  SMS Relay, Relays received messages to a HTTP API
 *
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React from 'react';

import {
  SafeAreaView,
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  ToastAndroid,
} from 'react-native';

import {
  Header,
  LearnMoreLinks,
  Colors,
  DebugInstructions,
  ReloadInstructions,
} from 'react-native/Libraries/NewAppScreen';

import SmsListener from './sms/index';

import io from 'socket.io-client/dist/socket.io.js';

import { sha512 } from 'react-native-sha512';

/*
  Application configuration
 */
var config = {
  socket: {
    url: 'http://#SOCKETIOHOST:#PORT',  // Server hostname and port
    'x-clientid': '#XCLIENTID1', // Client ID allowed from server
    authorization: 'Bearer ' + 'authorization', // Token authorization placeholder
  },
  fetch: {
    url: 'http://#EXPRESSHOST:#PORT/api/push/message', // Server hostname and port
    method: 'POST', // HTTP method
    headers: {
      authorization: 'Bearer ' + 'authorization', // Token authorization placeholder
      Accept: 'application/json', // Accept header
      'Content-Type': 'application/json', // Content type header
      'x-clientid': '#XCLIENTID1' // Client ID allowed from server
    },
  }
};

SmsListener.addListener((message) => {
  sendMessage(message);
});

// Null test, initializes configuration
sendMessage('', true);

/*
  sendMessage
    Sends a message to the API
  parameters
    message (object) - Message object containing origin and message body
    nulled (boolean) - Is this not a real message
 */
async function sendMessage(message, nulled = false) {
  var pin = '#PIN1', salt = '#SALT'; // Set pin and salt
  var authorization = (await sha512(pin + salt)); // Generate authorization token
  config = {
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

  // If is nulled end here
  if (nulled == true) {return}

  //console.log(config);

  // Open a temporary socket.io to signal presence
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

  // Compile Date Time variable
  message.date = new Date();
  message.date = padNumber(message.date.getHours()) + ':' +
    padNumber(message.date.getMinutes()) + ':' +
    padNumber(message.date.getSeconds()) + ' ' +
    padNumber(message.date.getDate()) + '/' +
    padNumber(message.date.getMonth()) + '/' +
    message.date.getFullYear();

  // Push new message via API
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

/*
  sendPing
    Send ping test
 */
/*
function sendPing() {
  var config = {
    fetch: {
      url: 'http://#EXPRESSHOST:#PORT/api/ping',
      method: 'GET',
      headers: {
        'x-clientid': '#XCLIENTID1',
        'x-clientext': makeId(5)
      },
    }
  };

  fetch(config.fetch.url, {
    method: config.fetch.method,
    headers: {
      'x-clientid': config.fetch.headers['x-clientid'],
      'x-clientext': config.fetch.headers['x-clientext']
    }
  });
}
*/

/*
  makeId
    Makes an random ID with a specified length
 */
/*
function makeId(length) {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}*/


const App: () => React$Node = () => {
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={styles.scrollView}>
          <View style={styles.body}>
            <View style={styles.sectionContainer}>
              <Text style={styles.appTitle}>smsrelay2</Text>
              <Text style={styles.sectionDescription}>
                This application listens to incoming sms messages and forwards to an http API even on background, enabling real-time communications.
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Current Settings (socket.io)</Text>
              <Text style={styles.sectionDescription}>
                URL: {config.socket.url}{"\n"}
                x-clientid: {config.socket['x-clientid'].replace(/.(?=.{3,}$)/g, '*')}{"\n"}
                token: {config.socket.authorization.substr(config.socket.authorization.length - 10).replace(/.(?=.{5,}$)/g, '*')}{"\n"}
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Current Settings (fetch)</Text>
              <Text style={styles.sectionDescription}>
                URL: {config.fetch.url}{"\n"}
                x-clientid: {config.fetch.headers['x-clientid'].replace(/.(?=.{3,}$)/g, '*')}{"\n"}
                token: {config.fetch.headers.authorization.substr(config.socket.authorization.length - 10).replace(/.(?=.{5,}$)/g, '*')}{"\n"}
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionDescription}>
                If the application is closed no more messages will be forwarded.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  body: {
    backgroundColor: Colors.grey,
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  appTitle: {
    fontSize: 32
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.black,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: Colors.dark,
  },
});

export default App;
