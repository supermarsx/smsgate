import { describe, expect, it } from "vitest";
import { mapWsErrorKey } from "../lib/status";

describe("mapWsErrorKey", () => {
  it("maps offline hint", () => {
    expect(mapWsErrorKey("Offline mode: realtime disabled")).toBe("wsOfflineMode");
  });

  it("maps websocket errors", () => {
    expect(mapWsErrorKey("WebSocket error")).toBe("wsErrorGeneric");
  });

  it("maps network/fetch errors", () => {
    expect(mapWsErrorKey("Failed to fetch")).toBe("wsNetworkError");
    expect(mapWsErrorKey("NetworkError when attempting to fetch resource")).toBe("wsNetworkError");
  });

  it("returns undefined for unknown messages", () => {
    expect(mapWsErrorKey("Some other error")).toBeUndefined();
    expect(mapWsErrorKey(undefined)).toBeUndefined();
  });
});
