// jshint esversion: 8

/*
  loadLanguage
    Loads language strings from a JSON file onto the DOM
 */
function loadLanguage() {
  var filePath = '/js/app/lang/' + config.language + '.json';

  $.getJSON(filePath, function(json) {
    var elementsX = $('[trl]');

    passwordAttr = $('#password').attr('placeholder');
    if ($('#password').length) $('#password').attr('placeholder', json[passwordAttr]);

    $('[trl]').each(function(index) {
      var str = $(this).html().trim();
      $(this).html(json[str]);
    });
  });
}

loadLanguage();
