// jshint esversion: 8

/*
  Virtual phone functionality
 */

/*
  jQuery Objects selector
 */

var jq = {
  messagesx: $('#messagesx')
};

/*
  showLatestMessage
    Scrolls to the latest message available
  parameters
    elementId (string) - Element ID
 */
function showLatestMessage(elementId = 'messagesx') {
  var objDiv = document.getElementById(elementId);
  if (config.management.messages.invert) {
    objDiv.scrollTop = 0;
  } else {
    objDiv.scrollTop = objDiv.scrollHeight;
  }
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
  var {
    messages
  } = config.management;

  var originClass = 'fromThem',
    append = '<div class="messagex"><div class="' + originClass + '"><p class="origin noselect">' + number + '</br>' + date + '</p><p>' + message + '</p></div></div>';
  if (messages.invert) {
    $(element + ' .messagesx').prepend(append);
  } else {
    $(element + ' .messagesx').append(append);
  }
  if (messages.purgeOld) purgeOld();
  if (messages.showLatest) showLatestMessage();
}

/*
  purgeMessage
    Purge a message on array
  parameters
    position (integer) - Purges a message in specific position
 */
function purgeMessage(position = 0) {
  if (position == 0) {
    if (config.management.messages.invert) {
      $('#messagesx').children().last().remove();
    } else {
      $('#messagesx').children().first().remove();
    }    
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
