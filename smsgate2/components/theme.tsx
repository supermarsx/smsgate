"use client";

/**
 * @fileoverview Theme provider for light/dark mode persistence and toggling.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "smsgate2_theme";

type ThemeContextValue = {
  theme: Theme;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => undefined
});

/**
 * Provides light/dark theme state and persists preference.
 * @returns Provider element for theme context.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") return setTheme(stored);
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    setTheme(prefersLight ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggle: () => setTheme((prev) => (prev === "dark" ? "light" : "dark"))
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to read and toggle the current theme.
 * @returns Theme context value with toggle handler.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
