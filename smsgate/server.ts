import http from "http";
import next from "next";
import { createWebSocketServer } from "./src/server/ws";
import { serverConfig } from "./src/config";

/**
 * Bootstraps the Next.js server and WebSocket relay.
 */
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  createWebSocketServer(server);

  server.listen(serverConfig.server.port, () => {
    // eslint-disable-next-line no-console
    console.log(`smsgate listening on *:${serverConfig.server.port}`);
  });
});
