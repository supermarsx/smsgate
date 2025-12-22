import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { serverConfig } from "../config";
import { getRuntime } from "./runtime";
import { isValidClientId, isValidToken } from "./auth";
import { broadcast, setWebSocketServer } from "./wsHub";
import { MessageRecord } from "./types";
import crypto from "crypto";
import { sanitizeMetadata, sanitizeStr } from "./sanitize";

/**
 * Per-connection authorization state.
 */
type ClientState = {
  authed: boolean;
  isPhone: boolean;
};

/**
 * Authentication payload from a client.
 */
type AuthMessage = {
  type: "auth";
  token: string;
  clientId?: string;
};

/**
 * SMS payload sent by a phone client.
 */
type SmsMessage = {
  type: "sms";
  payload: MessageRecord;
};

/**
 * Union of accepted inbound WebSocket messages.
 */
type ClientMessage = AuthMessage | SmsMessage;

/**
 * Parses inbound WebSocket JSON and narrows to known types.
 */
function parseMessage(data: WebSocket.RawData): ClientMessage | null {
  try {
    const parsed = JSON.parse(data.toString());
    if (parsed?.type === "auth") return parsed;
    if (parsed?.type === "sms") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Computes a hash to allow HTTP sync to detect changes.
 */
function computeHash(messages: MessageRecord[]): string {
  return crypto.createHash("sha512").update(JSON.stringify(messages)).digest("hex");
}

/**
 * Creates and wires the WebSocket server for real-time messages.
 */
export function createWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: serverConfig.server.wsPath });
  setWebSocketServer(wss);

  wss.on("connection", (ws) => {
    const state: ClientState = { authed: false, isPhone: false };
    const runtime = getRuntime();

    ws.on("message", async (data) => {
      const message = parseMessage(data);
      if (!message) {
        ws.send(JSON.stringify({ type: "error", payload: "Invalid message" }));
        return;
      }
      if (!state.authed) {
        if (message.type !== "auth") {
          ws.send(JSON.stringify({ type: "error", payload: "Auth required" }));
          return;
        }
        if (!isValidToken(message.token)) {
          ws.send(JSON.stringify({ type: "error", payload: "Invalid token" }));
          ws.close();
          return;
        }
        state.authed = true;
        state.isPhone = isValidClientId(message.clientId);
        if (state.isPhone) {
          runtime.phoneConnections += 1;
          runtime.phoneOnline = runtime.phoneConnections > 0;
          broadcast({ type: "sourceStatus", payload: true });
        }

        const messages = await runtime.store.getMessages();
        const hash = computeHash(messages);
        ws.send(JSON.stringify({ type: "sourceStatus", payload: runtime.phoneOnline }));
        ws.send(JSON.stringify({ type: "baseMessages", payload: messages }));
        ws.send(JSON.stringify({ type: "syncHash", payload: hash }));
        ws.send(JSON.stringify({ type: "keepMessages", payload: serverConfig.management.messages.keep }));
        return;
      }

      if (message.type === "sms" && state.isPhone) {
        const payload = message.payload ?? {};
        const sanitized: MessageRecord = {
          number: sanitizeStr(String(payload.number ?? "")),
          date: sanitizeStr(String(payload.date ?? "")),
          message: sanitizeStr(String(payload.message ?? "")),
          receivedAtEpochMs: payload.receivedAtEpochMs ? Number(payload.receivedAtEpochMs) : undefined,
          deviceManufacturer: payload.deviceManufacturer
            ? String(payload.deviceManufacturer)
            : undefined,
          deviceModel: payload.deviceModel ? String(payload.deviceModel) : undefined,
          deviceSdkInt: payload.deviceSdkInt ? Number(payload.deviceSdkInt) : undefined,
          extra: sanitizeMetadata(payload.extra)
        };
        await runtime.store.addMessage(sanitized);
        broadcast({ type: "message", payload: sanitized });
        const messages = await runtime.store.getMessages();
        const hash = computeHash(messages);
        broadcast({ type: "syncHash", payload: hash });
        ws.send(JSON.stringify({ type: "smsAck" }));
      }
    });

    ws.on("close", () => {
      if (state.authed && state.isPhone) {
        runtime.phoneConnections = Math.max(0, runtime.phoneConnections - 1);
        runtime.phoneOnline = runtime.phoneConnections > 0;
        broadcast({ type: "sourceStatus", payload: runtime.phoneOnline });
      }
    });
  });

  return wss;
}
