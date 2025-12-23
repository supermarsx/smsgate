declare module "qrcode-terminal" {
  export type GenerateOptions = {
    small?: boolean;
  };

  export type GenerateCallback = (qrcode: string) => void;

  export function generate(text: string, options?: GenerateOptions, callback?: GenerateCallback): void;
  export function setErrorLevel(level: "L" | "M" | "Q" | "H"): void;

  const qrcodeTerminal: {
    generate: typeof generate;
    setErrorLevel: typeof setErrorLevel;
  };

  export default qrcodeTerminal;
}
