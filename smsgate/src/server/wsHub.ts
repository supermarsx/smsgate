import { WebSocketServer, WebSocket } from "ws";
import { MessageRecord } from "./types";

type WsPayload =
  | { type: "auth"; token: string; clientId?: string }
  | { type: "baseMessages"; payload: MessageRecord[] }
  | { type: "syncHash"; payload: string }
  | { type: "keepMessages"; payload: number }
  | { type: "sourceStatus"; payload: boolean }
  | { type: "message"; payload: MessageRecord }
  | { type: "smsAck" }
  | { type: "error"; payload: string };

let wss: WebSocketServer | null = null;

export function setWebSocketServer(server: WebSocketServer): void {
  wss = server;
}

function send(ws: WebSocket, payload: WsPayload): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export function broadcast(payload: WsPayload): void {
  if (!wss) return;
  wss.clients.forEach((client) => {
    send(client, payload);
  });
}
