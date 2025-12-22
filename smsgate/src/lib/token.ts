import { clientConfig } from "./config";
import CryptoJS from "crypto-js";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const storage = clientConfig.authorization.usePersistent ? localStorage : sessionStorage;
  return storage.getItem(clientConfig.authorization.storageName);
}

export function setToken(token: string): void {
  const storage = clientConfig.authorization.usePersistent ? localStorage : sessionStorage;
  storage.setItem(clientConfig.authorization.storageName, token);
}

export function clearToken(): void {
  const storage = clientConfig.authorization.usePersistent ? localStorage : sessionStorage;
  storage.removeItem(clientConfig.authorization.storageName);
}

export async function hashToken(input: string): Promise<string> {
  const value = input + clientConfig.authorization.salt;
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const buf = await window.crypto.subtle.digest("SHA-512", data);
    return Array.from(new Uint8Array(buf))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  return CryptoJS.SHA512(value).toString();
}
