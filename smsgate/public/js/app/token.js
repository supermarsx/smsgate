// jshint esversion: 8

/*
  Authorization token management
 */

/*
  getToken
    Gets token from local storage
  parameters
    storageName (string) - Local storage name
 */
function getToken(storageName) {
  if (config.nulled.get) return null;
  return localStorage.getItem(storageName);
}

/*
  setToken
    Set tokens in local storage
  parameters
    storageName (string) - Local storage name
    token (string) - Authorization token
 */
function setToken(storageName, token) {
  if (config.nulled.set) return null;
  return localStorage.setItem(storageName, token);
}

/*
  destroyToken
    Destroys tokens in local storage
  parameters
    storageName (string) - Local storage name
 */
function destroyToken(storageName) {
  if (config.nulled.destroy) return null;
  return localStorage.removeItem(storageName);
}

/*
  sha512
    hashes a string plus salt with SHA-512
  parameters
    str (string) - String to SHA-512 hash
 */
function sha512(str) {
  if (config.nulled.hash) return str;
  return crypto.subtle.digest("SHA-512", new TextEncoder("utf-8").encode(str + config.salt)).then(buf => {
    return Array.prototype.map.call(new Uint8Array(buf), x => (('00' + x.toString(16)).slice(-2))).join('');
  });
}
