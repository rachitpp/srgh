// Light/dark theme state. The actual colours live entirely in CSS variables
// (src/styles/theme.css); toggling the `dark` class on <html> re-themes the
// whole app. The choice is persisted and restored pre-paint by the inline
// script in index.html — this hook keeps React in sync and drives the toggle.
import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "sgrh-theme";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Stored choice if present, otherwise the OS preference. */
export function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark() ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* storage blocked (private mode) — the in-memory state still works */
    }
  }, [mode]);

  const toggle = () => setMode((m) => (m === "dark" ? "light" : "dark"));
  return { mode, toggle };
}
