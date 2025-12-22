export const clientConfig = {
  language: "en_US",
  authorization: {
    salt: "#SALT",
    storageName: "1234567890abcdef_smstoken",
    usePersistent: true,
    sendLogin: true
  },
  management: {
    messages: {
      keep: 0,
      keepFromServer: true,
      showLatest: true,
      invert: false
    },
    sound: {
      enabled: false,
      name: "gglass",
      path: "/sounds/",
      fileExt: ".mp3"
    }
  }
};
