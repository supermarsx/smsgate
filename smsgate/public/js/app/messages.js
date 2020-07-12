// jshint esversion: 8

/*
  Main, socket and session handling
 */

/*
  jQuery object selectors
 */
var jq = {
    overlay: $('#overlay'),
    deviceWrapper: $('.device-wrapper'),
    status: $('.status'),
    titleNoSelect: $('.titlex.noselect'),
    containerX: $('.containerx'),
    clientStatus: $('#clientStatus'),
    sourceStatus: $('#sourceStatus'),
    close: $('#close'),
    closeConfirm: $('#close-confirm'),
    closeConfirmNo: $('#close-confirm-no'),
    closeConfirmYes: $('#close-confirm-yes'),
    delete: $('.delete'),
    pModalCardTitle: $('p.modal-card-title'),
    modalBackground: $('.modal-background'),
    classes: {
      hidden: 'is-hidden',
      isActive: 'is-active',
      isLoading: 'is-loading'
    }
  },
  trl = {
    s_serverconnecting: null,
    s_serverconnected: null,
    s_serverterminated: null,
    s_phoneterminated: null,
    s_serverreconnecting: null,
    s_phoneconnected: null,
    s_phonewaiting: null,
    s_closingsession: null
  };

var notificationSound;

// On document ready
$(document).ready(function() {
  injectLanguage();

  var {
    messages
  } = config.management;

  setupAudio();
  if (messages.hideClose) jq.close.addClass(jq.classes.hidden);

  // Overlay animation
  jq.overlay.delay(500).animate({
    opacity: 0
  }, 1000);

  setTimeout(() => {
    jq.overlay.css('z-index', 0);
  }, 1500);

  // Virtual device animation
  jq.deviceWrapper.delay(1000).animate({
    opacity: 1
  }, 1000);

  jq.status.delay(1600).animate({
    opacity: 1
  }, 1000);

  jq.titleNoSelect.delay(1700).animate({
    opacity: 1
  }, 1000);

  jq.containerX.delay(1800).animate({
    opacity: 1
  }, 1000);

  // Token verification
  if (config.authorization.sendLogin) {
    setTimeout(() => {
      sendLogin(getToken(config.authorization.storageName));
    }, 1500);
  }
});

$(function() {
  var {
    main
  } = config.management.request;
  var {
    messages,
    sound
  } = config.management;

  // Open socket.io connection
  socket = io({
    transportOptions: {
      polling: {
        extraHeaders: {
          Authorization: main.header1Prefix + getToken(config.authorization.storageName)
        }
      }
    }
  });
  jq.clientStatus.prop('class', 'connecting fast blink');
  jq.clientStatus.prop('title', trl.s_serverconnecting);

  /*
    On connect
   */
  if (messages.pushStatus) socket.on('connect', () => {
    jq.clientStatus.prop('class', 'connected slow blink');
    jq.clientStatus.prop('title', trl.s_serverconnected);
  });

  /*
  On disconnect
   */
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      socket.connect();
    }

    // Push connection status
    if (messages.pushStatus) {
      jq.clientStatus.prop('class', 'disconnected slow blink');
      jq.clientStatus.prop('title', trl.s_serverterminated);

      jq.sourceStatus.prop('class', 'disconnected slow blink');
      jq.sourceStatus.prop('title', trl.s_phoneterminated);
    }

  });

  /*
    On reconnect attempt
   */
  if (messages.pushStatus) socket.on('reconnect_attempt', (attemptNumber) => {
    jq.clientStatus.prop('class', 'connecting fast blink');
    jq.clientStatus.prop('title', trl.s_serverreconnecting);
  });

  /*
    Phone as source status
   */
  if (messages.pushStatus) socket.on('sourceStatus', (isOnline) => {
    if (isOnline === true) {
      jq.sourceStatus.prop('class', 'connected slow blink');
      jq.sourceStatus.prop('title', trl.s_phoneconnected);
    } else {
      jq.sourceStatus.prop('class', 'connecting normal blink');
      jq.sourceStatus.prop('title', trl.s_phonewaiting);
    }
  });

  /*
    On message reception
   */
  if (messages.pushMessages) socket.on('message', (data) => {
    messagePush(data.message, data.date, data.number);
    if (sound.enabled) playSound();
  });

  /*
  On base message reception
   */
  if (config.management.messages.pushBase) socket.on('baseMessages', (messages) => {
    for (var message in messages) {
      if (messages.hasOwnProperty(message)) {
        messagePush(messages[message].message, messages[message].date, messages[message].number);
      }
    }
  });

  /*
    On message history threshold
   */
  if (config.management.messages.keepfromServer) socket.on('keepMessages', (messages) => {
    config.keepMessages = messages;
  });
});

/*
  injectLanguage
    Injects JSON language file onto an object
 */
function injectLanguage() {
  var filePath = '/js/app/lang/' + config.language + '.json';
  $.getJSON(filePath, function(json) {
    for (var key in trl) {
      trl[key] = json[key];
    }
  });
}

/*
  playSound
    Plays notification sound asynchronously and simultaneously with other notifications
 */
function playSound() {
  var playPromise = notificationSound.cloneNode(true).play();
  if (playPromise !== undefined) {
    playPromise.then().catch(function(error) {});
  }
}

/*
  setupAudio
    Setup audio
 */
function setupAudio() {
  var {
    sound
  } = config.management;

  if (sound.enabled) notificationSound = new Audio(sound.path + sound.name + sound.fileExt);
}

/*
  Open session cancel confirmation
 */
jq.close.click(function() {
  jq.closeConfirm.addClass(jq.classes.isActive);
});

/*
  Close session cancel confirmation
 */
jq.closeConfirmNo.click(function() {
  jq.closeConfirm.removeClass(jq.classes.isActive);
});
jq.delete.click(function() {
  jq.closeConfirm.removeClass(jq.classes.isActive);
});

/*
  Confirm session cancel confirmation
 */
jq.closeConfirmYes.click(function() {
  var {
    paths
  } = config.management;
  var {
    authorization
  } = config;
  var {
    redirects
  } = paths;

  jq.closeConfirmYes.addClass(jq.classes.isLoading);
  jq.pModalCardTitle.html(trl.s_closingsession);
  jq.closeConfirmNo.animate({
    opacity: 0
  }, 250);
  jq.delete.animate({
    opacity: 0
  }, 250);
  jq.modalBackground.css('background-color', 'rgba(0,0,0,1)');
  socket.disconnect();
  destroyToken(authorization.storageName);
  jq.overlay.css('z-index', 50);
  jq.overlay.delay(1500).animate({
    opacity: 1
  }, 1000);
  setTimeout(function() {
    window.location.replace(paths.login);
  }, redirects.timing['1']);
});

/*
  sendLogin
    Sends a token check request to confirm theres a valid token stored
  parameters
    token (string) - Token authentication
 */
function sendLogin(token) {
  var {
    management
  } = config;
  var {
    paths
  } = management;
  var {
    main
  } = management.request;

  var xhr = new XMLHttpRequest();

  xhr.open(main.method, paths.tokenCheck, true);
  xhr.setRequestHeader(main.header1, main.header1Prefix + token);
  xhr.setRequestHeader(main.header2, main.header2Value);

  xhr.onreadystatechange = function() {

    if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {

      if (xhr.response == main.invalidToken) {
        jq.overlay.css('z-index', 2);
        jq.overlay.delay(500).animate({
          opacity: 1
        }, 1000);
        setTimeout(function() {
          window.location.replace(paths.login);
        }, paths.redirects.timing['2']);
      }

    }
  };

  xhr.send(); // Send request
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
