// jshint esversion: 8

/*
  Virtual phone functionality
 */

/*
  showLatestMessage
    Scrolls to the latest message available
  parameters
    elementId (string) - Element ID
 */
function showLatestMessage(elementId = 'messagesx') {
  var objDiv = document.getElementById(elementId);
  objDiv.scrollTop = objDiv.scrollHeight;
}

/*
  messagePush
    Pushes message to the container
  parameters
    message (string) - Message body
    date (string) - String formatted date time
    number (string) - Message origin
    element (string) - Element name
 */
function messagePush(message, date, number, element = '.containerx') {
  var originClass = 'fromThem',
    append = '<div class="messagex"><div class="' + originClass + '"><p class="origin noselect">' + number + '</br>' + date + '</p><p>' + message + '</p></div></div>';
  $(element + ' .messagesx').append(append);
  if (config.purgeOld) purgeOld();
  if (config.showLatestMessage) showLatestMessage();
}

/*
  purgeMessage
    Purge a message on array
  parameters
    position (integer) - Purges a message in specific position
 */
function purgeMessage(position = 0) {
  if (position == 0) {
    $('#messagesx').children().first().remove();
  } else {
    $('#messagesx :nth-child(' + position + ')').remove();
  }
}

/*
  purgeOld
    Purge messages in excess to config
 */
function purgeOld() {
  if (config.keepMessages !== 0) {
    while ($('#messagesx').children().length > config.keepMessages) {
      purgeMessage();
    }
  }
}

/*
  randomInteger
    Generate a random integer
  parameters
    min (integer) - Minimum integer
    max (integer) - Maximum integer
 */
function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/*
  messageTest
    Push a test message to the UI
  parameters
    tests (integer) - Number of tests to send
 */
function messageTest(tests = 1) {
  for (var i = 0; i < tests; i++) {
    messagePush('TEST ' + randomInteger(100000, 999999), Date.now(), '+351 123 456 789');
  }
}

/*
  When document is ready
 */
$(document).ready(function() {
  //messageTest(20);
});
