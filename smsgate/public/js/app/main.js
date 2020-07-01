// jshint esversion: 8

/*
  Main, socket and session handling
 */

$(document).ready(function() {
  // Overlay animation
  $('#overlay').delay(500).animate({
    opacity: 0
  }, 1000);

  setTimeout(() => {
    $('#overlay').css('z-index', 0);
  }, 1500);

  // Virtual device animation
  $('.device-wrapper').delay(1000).animate({
    opacity: 1
  }, 1000);

  $('.status').delay(1600).animate({
    opacity: 1
  }, 1000);

  $('.titlex.noselect').delay(1700).animate({
    opacity: 1
  }, 1000);

  $('.containerx').delay(1800).animate({
    opacity: 1
  }, 1000);

  // Token verification
  setTimeout(() => {
    sendLogin(getToken(config.storageName));
  }, 1500);
});

$(function() {
  // Open socket.io connection
  socket = io({
    transportOptions: {
      polling: {
        extraHeaders: {
          'authorization': 'Bearer ' + getToken(config.storageName)
        }
      }
    }
  });
  $('#clientStatus').prop('class', 'connecting fast blink');
  $('#clientStatus').prop('title', 'Establishing server connection...');

  /*
    On connect
   */
  if (config.pushStatus) socket.on('connect', () => {
    $('#clientStatus').prop('class', 'connected slow blink');
    $('#clientStatus').prop('title', 'Server connection established.');
  });

  /*
  On disconnect
   */
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      socket.connect();
    }

    if (config.pushStatus) {
      $('#clientStatus').prop('class', 'disconnected slow blink');
      $('#clientStatus').prop('title', 'Server connection terminated.');

      $('#sourceStatus').prop('class', 'disconnected slow blink');
      $('#sourceStatus').prop('title', 'Phone connection terminated.');
    }

  });

  /*
    On reconnect attempt
   */
  if (config.pushStatus) socket.on('reconnect_attempt', (attemptNumber) => {
    $('#clientStatus').prop('class', 'connecting fast blink');
    $('#clientStatus').prop('title', 'Reconnecting to server...');
  });

  /*
    Phone as source status
   */
  if (config.pushStatus) socket.on('sourceStatus', (isOnline) => {
    if (isOnline === true) {
      $('#sourceStatus').prop('class', 'connected slow blink');
      $('#sourceStatus').prop('title', 'Phone connection established.');
    } else {
      $('#sourceStatus').prop('class', 'connecting normal blink');
      $('#sourceStatus').prop('title', 'Waiting for phone to connect.');
    }
  });

  /*
    On message reception
   */
  if (config.pushMessages) socket.on('message', (data) => {
    messagePush(data.message, data.date, data.number);
  });

  /*
  On base message reception
   */
  if (config.pushBase) socket.on('baseMessages', (messages) => {
    for (var message in messages) {
      if (messages.hasOwnProperty(message)) {
        messagePush(messages[message].message, messages[message].date, messages[message].number);
      }
    }
  });

  /*
    On message history threshold
   */
  if (config.updateKeepMessages) socket.on('keepMessages', (messages) => {
    config.keepMessages = messages;
  });

});

/*
  Open session cancel confirmation
 */
$('#close').click(function() {
  $('#close-confirm').addClass('is-active');
});

/*
  Close session cancel confirmation
 */
$('#close-confirm-no').click(function() {
  $('#close-confirm').removeClass('is-active');
});
$('.delete').click(function() {
  $('#close-confirm').removeClass('is-active');
});

/*
  Confirm session cancel confirmation
 */
$('#close-confirm-yes').click(function() {
  $('#close-confirm-yes').addClass('is-loading');
  $('p.modal-card-title').html('Closing session...');
  $('#close-confirm-no').animate({
    opacity: 0
  }, 250);
  $('.delete').animate({
    opacity: 0
  }, 250);
  $('.modal-background').css('background-color', 'rgba(0,0,0,1)');
  socket.disconnect();
  destroyToken(config.storageName);
  $('#overlay').css('z-index', 50);
  $('#overlay').delay(1500).animate({
    opacity: 1
  }, 1000);
  setTimeout(function() {
    window.location.replace(config.paths.login);
  }, config.timing.redirect);
});

/*
  sendLogin
    Sends a token check request to confirm theres a valid token stored
  parameters
    token (string) - Token authentication
 */
function sendLogin(token) {

  var xhr = new XMLHttpRequest();

  xhr.open("POST", '/api/token/check', true);
  xhr.setRequestHeader('authorization', 'Bearer ' + token);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

  xhr.onreadystatechange = function() {

    if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {

      if (xhr.response == 'Invalid token') {
        $('#overlay').css('z-index', 2);
        $('#overlay').delay(500).animate({
          opacity: 1
        }, 1000);
        setTimeout(function() {
          window.location.replace(config.paths.login);
        }, config.timing.redirect2);
      }

    }
  };

  xhr.send();  // Send request
}

/*
  jQuery Replace class prototype
 */
(($) => {
  $.fn.replaceClass = (classes) => {
    var allClasses = classes.split(/\s+/).slice(0, 2);
    return this.each(() => {
      $(this).toggleClass(allClasses.join(' '));
    });
  };
})(jQuery);
