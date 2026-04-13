"use client";

import { startTransition, useEffect, useState } from "react";
import {
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  type ThemeMode,
  isThemeMode,
  resolveTheme,
} from "./theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(mode, prefersDark);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const metaColors: Record<string, string> = {
    light: "#f6efe5",
    dark: "#0d1420",
    forest: "#0c1b16",
    sunrise: "#fbefe2",
  };

  root.dataset.themeMode = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme =
    resolved === "light" || resolved === "sunrise" ? "light" : "dark";

  metaTheme?.setAttribute("content", metaColors[resolved] ?? metaColors.dark);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if ((document.documentElement.dataset.themeMode ?? "system") === "system") {
        applyTheme("system");
      }
    };

    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    applyTheme(mode);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [mode]);

  return (
    <div className="theme-switcher" role="group" aria-label="Theme">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`theme-switcher__button ${
            mode === option.id ? "theme-switcher__button--active" : ""
          }`}
          aria-pressed={mode === option.id}
          title={option.description}
          onClick={() => {
            startTransition(() => {
              setMode(option.id);
            });
          }}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
