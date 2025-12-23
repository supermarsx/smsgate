import http from "http";
import next from "next";
import os from "os";
import qrcode from "qrcode-terminal";
import { createWebSocketServer } from "./src/server/ws";
import { serverConfig } from "./src/config";
import { getRuntime } from "./src/server/runtime";
import { getRollingPairingCode } from "./src/server/pairing";

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
  const runtime = getRuntime();

  server.listen(serverConfig.server.port, () => {
    // eslint-disable-next-line no-console
    console.log(`smsgate listening on *:${serverConfig.server.port}`);
    logPairingInfo(serverConfig.server.port, runtime.pairingConfig.pairingSecret);
  });
});

function logPairingInfo(port: number, secret: string): void {
  const ips = getLocalIpv4s();
  const code = getRollingPairingCode(secret);
  if (ips.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`Pairing code (rolling): ${code}`);
    return;
  }
  ips.forEach((ip) => {
    const url = `http://${ip}:${port}/api/pairing?code=${code}`;
    // eslint-disable-next-line no-console
    console.log(`Pairing URL (${ip}): ${url}`);
    qrcode.generate(url, { small: true });
  });
  // eslint-disable-next-line no-console
  console.log(`Pairing code (rolling): ${code}`);
}

function getLocalIpv4s(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  Object.values(interfaces).forEach((items) => {
    (items ?? []).forEach((info) => {
      if (info.family === "IPv4" && !info.internal) {
        ips.push(info.address);
      }
    });
  });
  return Array.from(new Set(ips));
}
