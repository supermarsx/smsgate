const env = (key: string, fallback: string): string => {
  if (typeof process === "undefined") return fallback;
  return (process.env[key] as string) ?? fallback;
};

const envNumber = (key: string, fallback: number): number => {
  const value = env(key, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const envBool = (key: string, fallback: boolean): boolean => {
  const value = env(key, fallback ? "true" : "false");
  return value === "true" || value === "1";
};

export const clientConfig = {
  language: env("NEXT_PUBLIC_SMS_LANG", "auto"),
  authorization: {
    salt: env("NEXT_PUBLIC_SMS_SALT", "#SALT"),
    storageName: env("NEXT_PUBLIC_SMS_STORAGE", "1234567890abcdef_smstoken"),
    usePersistent: envBool("NEXT_PUBLIC_SMS_PERSISTENT", true),
    sendLogin: envBool("NEXT_PUBLIC_SMS_SEND_LOGIN", true)
  },
  management: {
    messages: {
      keep: envNumber("NEXT_PUBLIC_SMS_KEEP_LOCAL", 10),
      keepFromServer: envBool("NEXT_PUBLIC_SMS_KEEP_FROM_SERVER", true),
      showLatest: envBool("NEXT_PUBLIC_SMS_SHOW_LATEST", true),
      invert: envBool("NEXT_PUBLIC_SMS_INVERT", false),
      syncIntervalMs: envNumber("NEXT_PUBLIC_SMS_SYNC_MS", 7000)
    },
    sound: {
      enabled: envBool("NEXT_PUBLIC_SMS_SOUND", false),
      name: env("NEXT_PUBLIC_SMS_SOUND_NAME", "gglass"),
      path: env("NEXT_PUBLIC_SMS_SOUND_PATH", "/sounds/"),
      fileExt: env("NEXT_PUBLIC_SMS_SOUND_EXT", ".mp3")
    },
    notifications: {
      enabled: envBool("NEXT_PUBLIC_SMS_NOTIFICATIONS", false),
      requestOnLoad: envBool("NEXT_PUBLIC_SMS_NOTIF_REQUEST", false),
      onlyWhenUnfocused: envBool("NEXT_PUBLIC_SMS_NOTIF_UNFOCUSED", true)
    }
  }
};
