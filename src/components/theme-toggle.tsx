"use client";

import { useEffect, useState } from "react";

type ThemePreference = "auto" | "light" | "dark";

const STORAGE_KEY = "loto-theme";

const getInitialTheme = (): ThemePreference => {
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "auto";
};

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => getInitialTheme());

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = preference === "auto"
        ? (mediaQuery.matches ? "dark" : "light")
        : preference;
      document.documentElement.setAttribute("data-theme", resolvedTheme);
    };

    applyTheme();
    if (preference !== "auto") return;
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [preference]);

  const selectPreference = (nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    window.localStorage.setItem(STORAGE_KEY, nextPreference);
  };

  const options: Array<{ value: ThemePreference; label: string; icon: string }> = [
    { value: "auto", label: "Auto", icon: "◒" },
    { value: "light", label: "Claro", icon: "☀" },
    { value: "dark", label: "Oscuro", icon: "☾" },
  ];

  return (
    <div className="theme-toggle fixed right-20 top-4 z-[100] rounded-xl" role="group" aria-label="Preferencia de tema">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => selectPreference(option.value)}
          aria-label={`Tema ${option.label}`}
          aria-pressed={preference === option.value}
          title={option.label}
          className="theme-option"
        >
          <span aria-hidden="true" className="theme-option-icon">{option.icon}</span>
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
