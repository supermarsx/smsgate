// jshint esversion: 8

/*
  Authorization token management
 */

/*
  getToken
    Gets token from local/session storage
  parameters
    storageName (string) - Local/session storage name
 */
function getToken(storageName) {
  if (config.debug.nulled.get) return null;
  if (!config.authorization.usePersistent) return sessionStorage.getItem(storageName);
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
  if (config.debug.nulled.set) return null;
  if (!config.authorization.usePersistent) return sessionStorage.setItem(storageName, token);
  return localStorage.setItem(storageName, token);
}

/*
  destroyToken
    Destroys tokens in local storage
  parameters
    storageName (string) - Local storage name
 */
function destroyToken(storageName) {
  if (config.debug.nulled.destroy) return null;
  if (!config.authorization.usePersistent) return sessionStorage.removeItem(storageName);
  return localStorage.removeItem(storageName);
}

/*
  sha512wrapped
    Hashes a string plus salt with SHA-512
  parameters
    str (string) - String to SHA-512 hash
 */
function sha512wrapped(str) {
  str = str + config.authorization.salt;
  if (config.debug.nulled.hash) return str;
  if (config.authorization.useInsecure) return sha512(str);
  return crypto.subtle.digest("SHA-512", new TextEncoder("utf-8").encode(str)).then(buf => {
    return Array.prototype.map.call(new Uint8Array(buf), x => (('00' + x.toString(16)).slice(-2))).join('');
  });
}
