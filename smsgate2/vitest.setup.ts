import { webcrypto } from "node:crypto";
import { TextEncoder as NodeTextEncoder } from "node:util";

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}

if (!globalThis.TextEncoder) {
  (globalThis as any).TextEncoder = NodeTextEncoder;
}
