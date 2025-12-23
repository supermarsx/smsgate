import { initializeTokens } from "./auth";
import { createMessageStore, MessageStore } from "./messageStore";
import { createLoginGuard, LoginGuard } from "./loginGuard";
import { ensurePairingConfig, PairingConfig } from "./pairing";

/**
 * Global server runtime state cached across requests.
 */
type RuntimeState = {
  store: MessageStore;
  initialized: boolean;
  phoneOnline: boolean;
  phoneConnections: number;
  loginGuard: LoginGuard;
  pairingConfig: PairingConfig;
  authorization?: typeof import("../config").serverConfig.authorization;
};

declare global {
  // eslint-disable-next-line no-var
  var __SMSGATE_RUNTIME__: RuntimeState | undefined;
}

/**
 * Returns the singleton runtime, initializing it on first access.
 */
export function getRuntime(): RuntimeState {
  if (!global.__SMSGATE_RUNTIME__) {
    global.__SMSGATE_RUNTIME__ = {
      store: createMessageStore(),
      initialized: false,
      phoneOnline: false,
      phoneConnections: 0,
      loginGuard: createLoginGuard(),
      pairingConfig: ensurePairingConfig(),
      authorization: undefined
    };
  }
  if (!global.__SMSGATE_RUNTIME__.initialized) {
    initializeTokens();
    global.__SMSGATE_RUNTIME__.authorization = require("../config").serverConfig.authorization;
    global.__SMSGATE_RUNTIME__.initialized = true;
  }
  return global.__SMSGATE_RUNTIME__;
}
