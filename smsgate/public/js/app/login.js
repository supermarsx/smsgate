// jshint esversion: 8

/*
  Login handling
 */

/*
  jQuery object selectors, classes
 */
var jq = {
  overlay: $('#overlay'),
  container: $('.container'),
  login: $('#login'),
  password: $('#password'),
  tokenError: $('#token-error'),
  tokenCheck: $('#token-check'),
  tokenValid: $('#token-valid'),
  tokenSaved: $('#token-saved'),
  tokenInvalid: $('#token-invalid'),
  classes: {
    hidden: 'is-hidden'
  }
};

// On document ready
$(document).ready(function() {

  if (config.authorization.useInsecure) injectSHA512fn();

  // Animate overlay
  jq.overlay.delay(500).animate({
    opacity: 0
  }, 1000);

  jq.container.delay(1500).animate({
    opacity: 1
  }, 1000);

  // Send token check
  if (config.authorization.sendLogin) setTimeout(() => {
    sendLogin(localStorage.getItem(config.authorization.storageName));
  }, 2500);
});

/*
  On login button click
 */
jq.login.on('click', async function() {
  var passwordHash = await sha512wrapped(jq.password.val());
  setToken(config.authorization.storageName, passwordHash);
  sendLogin(passwordHash, true);
});

/*
  On password field focus
 */
if (!config.debug.nulled.keypress) jq.password.keypress(function(e) {
  // If password field is focused and key is [ENTER]
  if (e.charCode == 13 && jq.password.is(":focus")) {
    jq.login.click();
  }
});

/*
  injectSHA512fn
    Injects SHA512 alterntive hashing script onto the DOM, for HTTP
 */
function injectSHA512fn() {
  (function(d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) {
      return;
    }
    js = d.createElement(s);
    js.id = id;
    js.src = config.management.paths.sha512;
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'sha512-useInsecure'));
}

/*
  sendLogin
    Sends a token check request to confirm theres a valid token stored
  parameters
    token (string) - Token authentication
    viaButton (boolean) - Whether this been triggered by a button
 */
function sendLogin(token, viaButton = false) {
  var {
    management
  } = config;
  var {
    paths
  } = management;
  var {
    login
  } = management.request;

  var xhr = new XMLHttpRequest();

  xhr.open(login.method, paths.tokenCheck, true);
  xhr.setRequestHeader(login.header1, login.header1Prefix + token);
  xhr.setRequestHeader(login.header2, login.header2Value);

  // On connection error
  xhr.onerror = function(e) {
    jq.password.addClass(jq.classes.hidden);
    jq.login.addClass(jq.classes.hidden);
    jq.tokenError.removeClass(jq.classes.hidden);
    jq.password.val('');
    setTimeout(function() {
      jq.password.toggleClass(jq.classes.hidden);
      jq.login.toggleClass(jq.classes.hidden);
      jq.tokenError.toggleClass(jq.classes.hidden);
      jq.password.focus();
    }, 3000);
  };

  xhr.onreadystatechange = function() {

    if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
      jq.tokenCheck.addClass(jq.classes.hidden);

      // Valid token
      if (xhr.response == login.validToken) {
        if (viaButton) {
          jq.password.addClass(jq.classes.hidden);
          jq.login.addClass(jq.classes.hidden);
          jq.tokenValid.removeClass(jq.classes.hidden);
        } else {
          jq.tokenSaved.removeClass(jq.classes.hidden);
        }
        jq.overlay.delay(2000).css('z-index', 1).animate({
          opacity: 1
        }, 500);

        setTimeout(function() {
          window.location.replace(paths.messages);
        }, paths.redirects.timing['1']);
      }

      // Invalid token
      if (xhr.response == login.invalidToken) {
        if (viaButton) {
          jq.password.addClass(jq.classes.hidden);
          jq.login.addClass(jq.classes.hidden);
          jq.tokenInvalid.removeClass(jq.classes.hidden);
          jq.password.val('');
          setTimeout(function() {
            jq.password.toggleClass(jq.classes.hidden);
            jq.login.toggleClass(jq.classes.hidden);
            jq.tokenInvalid.toggleClass(jq.classes.hidden);
            jq.password.focus();
          }, 3000);

        } else {
          jq.password.removeClass(jq.classes.hidden);
          jq.login.removeClass(jq.classes.hidden);
        }
      }

    }
  };

  xhr.send(); // Send request
}
