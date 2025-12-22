import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { serverConfig } from "../config";
import { getRuntime } from "./runtime";
import { isValidClientId, isValidToken } from "./auth";
import { broadcast, setWebSocketServer } from "./wsHub";
import { MessageRecord } from "./types";

type ClientState = {
  authed: boolean;
  isPhone: boolean;
};

type AuthMessage = {
  type: "auth";
  token: string;
  clientId?: string;
};

function parseMessage(data: WebSocket.RawData): AuthMessage | null {
  try {
    const parsed = JSON.parse(data.toString());
    if (parsed?.type !== "auth") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: serverConfig.server.wsPath });
  setWebSocketServer(wss);

  wss.on("connection", (ws) => {
    const state: ClientState = { authed: false, isPhone: false };
    const runtime = getRuntime();

    ws.on("message", async (data) => {
      if (state.authed) return;
      const auth = parseMessage(data);
      if (!auth) {
        ws.send(JSON.stringify({ type: "error", payload: "Invalid message" }));
        return;
      }
      if (!isValidToken(auth.token)) {
        ws.send(JSON.stringify({ type: "error", payload: "Invalid token" }));
        ws.close();
        return;
      }
      state.authed = true;
      state.isPhone = isValidClientId(auth.clientId);
      if (state.isPhone) {
        runtime.phoneConnections += 1;
        runtime.phoneOnline = runtime.phoneConnections > 0;
        broadcast({ type: "sourceStatus", payload: true });
      }

      const messages = await runtime.store.getMessages();
      ws.send(JSON.stringify({ type: "sourceStatus", payload: runtime.phoneOnline }));
      ws.send(JSON.stringify({ type: "baseMessages", payload: messages }));
      ws.send(JSON.stringify({ type: "keepMessages", payload: serverConfig.management.messages.keep }));
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
