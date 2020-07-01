// jshint esversion: 8

/*
  Login handling
 */

$(document).ready(function() {
  // Animate overlay
  $('#overlay').delay(500).animate({
    opacity: 0
  }, 1000);

  $('.container').delay(1500).animate({
    opacity: 1
  }, 1000);

  // Send token check
  if (config.sendLogin) setTimeout(() => {
    sendLogin(localStorage.getItem(config.storageName));
  }, 2500);
});

/*
  On login button click
 */
$('#login').on('click', async function() {
  var passwordHash = await sha512($('#password').val());
  setToken(config.storageName, passwordHash);
  sendLogin(passwordHash, true);
});

/*
  On password field focus
 */
if (!config.nulled.keypress) $('#password').keypress(function(e) {
  // If password field is focused and key is [ENTER]
  if (e.charCode == 13 && $('#password').is(":focus")) {
    $('#login').click();
  }
});

/*
  sendLogin
    Sends a token check request to confirm theres a valid token stored
  parameters
    token (string) - Token authentication
    viaButton (boolean) - Whether this been triggered by a button
 */
function sendLogin(token, viaButton = false) {
  var xhr = new XMLHttpRequest();

  xhr.open("POST", config.paths.tokenCheck, true);
  xhr.setRequestHeader('authorization', 'Bearer ' + token);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

  // On connection error
  xhr.onerror = function(e) {
    $('#password').addClass('is-hidden');
    $('#login').addClass('is-hidden');
    $('#token-error').removeClass('is-hidden');
    $('#password').val('');
    setTimeout(function() {
      $('#password').toggleClass('is-hidden');
      $('#login').toggleClass('is-hidden');
      $('#token-error').toggleClass('is-hidden');
      $('#password').focus();
    }, 3000);
  };

  xhr.onreadystatechange = function() {

    if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
      $('#token-check').addClass('is-hidden');

      // Valid token
      if (xhr.response == 'Valid token') {
        if (viaButton) {
          $('#password').addClass('is-hidden');
          $('#login').addClass('is-hidden');
          $('#token-valid').removeClass('is-hidden');
        } else {
          $('#token-saved').removeClass('is-hidden');
        }
        $('#overlay').delay(2000).css('z-index', 1).animate({
          opacity: 1
        }, 500);
        setTimeout(function() {
          window.location.replace(config.paths.messages);
        }, config.timing.redirect);
      }

      // Invalid token
      if (xhr.response == 'Invalid token') {
        if (viaButton) {
          $('#password').addClass('is-hidden');
          $('#login').addClass('is-hidden');
          $('#token-invalid').removeClass('is-hidden');
          $('#password').val('');
          setTimeout(function() {
            $('#password').toggleClass('is-hidden');
            $('#login').toggleClass('is-hidden');
            $('#token-invalid').toggleClass('is-hidden');
            $('#password').focus();
          }, 3000);

        } else {
          $('#password').removeClass('is-hidden');
          $('#login').removeClass('is-hidden');
        }
      }

    }
  };

  xhr.send(); // Send request
}
