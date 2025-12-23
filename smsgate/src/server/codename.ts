import crypto from "crypto";

const ADJECTIVES = [
  "amethyst",
  "violet",
  "plasma",
  "nebula",
  "lunar",
  "static",
  "silent",
  "rapid",
  "gloss",
  "signal",
  "polar",
  "drift"
];

const NOUNS = [
  "relay",
  "harbor",
  "citadel",
  "signal",
  "tower",
  "stream",
  "anchor",
  "rivet",
  "orbit",
  "vault",
  "circuit",
  "terminal"
];

function pickIndex(seed: string, modulo: number, offset: number): number {
  const digest = crypto.createHash("sha256").update(seed).digest();
  return digest[offset] % modulo;
}

export function getServerCodename(seed: string): string {
  const adjective = ADJECTIVES[pickIndex(seed, ADJECTIVES.length, 0)];
  const noun = NOUNS[pickIndex(seed, NOUNS.length, 1)];
  const suffix = pickIndex(seed, 97, 2) + 3;
  return `${adjective}-${noun}-${suffix}`;
}
