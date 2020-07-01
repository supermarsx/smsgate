// jshint esversion: 8
/**
 * @format
 */

import {
  AppRegistry
} from 'react-native';
import App from './App';
import {
  name as appName
} from './app.json';

// Register background message push
AppRegistry.registerHeadlessTask('RECEIVE_SMS', () =>
  require('./sms/RECEIVESMS')
);

AppRegistry.registerComponent(appName, () => App);
