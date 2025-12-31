import { describe, expect, it } from "vitest";
import { listDictionaries, SUPPORTED_LOCALES } from "../lib/i18n";

describe("i18n dictionaries", () => {
  it("have parity across locales", () => {
    const dicts = listDictionaries();
    const baseKeys = new Set(Object.keys(dicts[SUPPORTED_LOCALES[0]] ?? {}));
    SUPPORTED_LOCALES.forEach((loc) => {
      const dict = dicts[loc];
      expect(dict).toBeDefined();
      const keys = Object.keys(dict);
      expect(keys.length).toBeGreaterThan(0);
      baseKeys.forEach((k) => {
        expect(dict[k]).toBeDefined();
      });
      keys.forEach((k) => {
        expect(baseKeys.has(k)).toBe(true);
      });
    });
  });

  it("does not mutate dictionaries when listing", () => {
    const before = listDictionaries();
    before[SUPPORTED_LOCALES[0]]!.example_probe = "mutable" as never;
    const after = listDictionaries();
    expect(after[SUPPORTED_LOCALES[0]]?.example_probe).toBeUndefined();
  });
});
