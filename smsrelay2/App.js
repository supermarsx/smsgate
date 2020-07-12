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

import {config, sha512wrapper} from './config'

console.log(config);
if (config.misc.listen) SmsListener.addListener((message) => {
  sendMessage(message);
});

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

  // Open a temporary socket.io to signal presence
  const socket = io(config.server.url, {
    transportOptions: {
      polling: {
        extraHeaders: {
          'x-clientid': config.authorization.header1value,
          authorization: config.authorization.header2prefix + config.authorization.token,
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
                URL: {config.server.url}{"\n"}
                x-clientid: {config.authorization.header1value.replace(/.(?=.{3,}$)/g, '*')}{"\n"}
                token: {config.authorization.token.substr(config.authorization.token.length - 10).replace(/.(?=.{5,}$)/g, '*')}{"\n"}
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Current Settings (fetch)</Text>
              <Text style={styles.sectionDescription}>
                URL: {config.server.url}{"\n"}
                x-clientid: {config.authorization.header1value.replace(/.(?=.{3,}$)/g, '*')}{"\n"}
                token: {config.authorization.token.substr(config.authorization.token.length - 10).replace(/.(?=.{5,}$)/g, '*')}{"\n"}
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
