import { MessageRecord } from "../server/types";

export type WsMessage =
  | { type: "auth"; token: string; clientId?: string }
  | { type: "baseMessages"; payload: MessageRecord[] }
  | { type: "syncHash"; payload: string }
  | { type: "keepMessages"; payload: number }
  | { type: "sourceStatus"; payload: boolean }
  | { type: "message"; payload: MessageRecord }
  | { type: "smsAck" }
  | { type: "error"; payload: string };

export function getWebSocketUrl(): string {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}
