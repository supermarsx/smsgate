declare module "qrcode-terminal" {
  type GenerateOptions = {
    small?: boolean;
  };

  type GenerateCallback = (qrcode: string) => void;

  export function generate(text: string, options?: GenerateOptions, callback?: GenerateCallback): void;
  export function setErrorLevel(level: "L" | "M" | "Q" | "H"): void;

  const defaultExport: {
    generate: typeof generate;
    setErrorLevel: typeof setErrorLevel;
  };

  export default defaultExport;
}
