import { initializeTokens } from "./auth";
import { createMessageStore, MessageStore } from "./messageStore";

type RuntimeState = {
  store: MessageStore;
  initialized: boolean;
  phoneOnline: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __SMSGATE_RUNTIME__: RuntimeState | undefined;
}

export function getRuntime(): RuntimeState {
  if (!global.__SMSGATE_RUNTIME__) {
    global.__SMSGATE_RUNTIME__ = {
      store: createMessageStore(),
      initialized: false,
      phoneOnline: false
    };
  }
  if (!global.__SMSGATE_RUNTIME__.initialized) {
    initializeTokens();
    global.__SMSGATE_RUNTIME__.initialized = true;
  }
  return global.__SMSGATE_RUNTIME__;
}
