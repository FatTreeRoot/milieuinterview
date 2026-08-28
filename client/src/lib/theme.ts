import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "milieu-theme";

/** Light by default; a manual choice is remembered. */
function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Private browsing or blocked storage. Fall through to the default.
  }
  return "light";
}

/**
 * The class goes on <html>. Inherited properties resolve on the element that
 * declares them, so putting it lower would leave text painted with the light
 * value it already inherited.
 */
function apply(theme: Theme): void {
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the choice is not worth interrupting anyone.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle };
}
