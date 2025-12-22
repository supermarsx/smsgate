import { clientConfig } from "./config";

export type Translations = Record<string, string>;

export async function loadTranslations(): Promise<Translations> {
  const res = await fetch(`/lang/${clientConfig.language}.json`);
  if (!res.ok) {
    return {};
  }
  return res.json();
}
