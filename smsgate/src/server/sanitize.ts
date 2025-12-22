export function sanitizeStr(input: string): string {
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 500);
}
