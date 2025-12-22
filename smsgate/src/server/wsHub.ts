import { WebSocketServer, WebSocket } from "ws";
import { MessageRecord } from "./types";

/**
 * WebSocket payloads exchanged with clients.
 */
type WsPayload =
  | { type: "auth"; token: string; clientId?: string }
  | { type: "baseMessages"; payload: MessageRecord[] }
  | { type: "syncHash"; payload: string }
  | { type: "keepMessages"; payload: number }
  | { type: "sourceStatus"; payload: boolean }
  | { type: "message"; payload: MessageRecord }
  | { type: "smsAck" }
  | { type: "error"; payload: string };

/** Singleton WebSocket server instance used for broadcasts. */
let wss: WebSocketServer | null = null;

/**
 * Registers the WebSocket server for outgoing broadcasts.
 */
export function setWebSocketServer(server: WebSocketServer): void {
  wss = server;
}

/**
 * Sends a payload to a single client if it is open.
 */
function send(ws: WebSocket, payload: WsPayload): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

/**
 * Broadcasts a payload to all connected WebSocket clients.
 */
export function broadcast(payload: WsPayload): void {
  if (!wss) return;
  wss.clients.forEach((client) => {
    send(client, payload);
  });
}
