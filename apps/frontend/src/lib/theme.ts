import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ifflow:theme";

/**
 * Resolve o tema inicial **fora** do ciclo do React (a parte síncrona do
 * hook). O script anti-FOUC em `index.html` aplica a classe `dark` no
 * `<html>` antes do React montar, então aqui só replicamos a mesma
 * lógica para sincronizar o estado em React.
 *
 * Ordem: localStorage > prefers-color-scheme > "light".
 */
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

/**
 * Aplica a classe `dark` no `<html>` e persiste a escolha. Centralizada
 * aqui para que o script anti-FOUC e o hook React partam da mesma
 * implementação (mantemos por convenção uma cópia reduzida no
 * `index.html`).
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export interface UseThemeResult {
  theme: Theme;
  toggle: () => void;
  setTheme: (next: Theme) => void;
}

/**
 * Hook de tema. Mantém o `<html class="dark">` em sincronia com o estado
 * em React e persiste a escolha em localStorage. O primeiro render já
 * encontra a classe correta porque o script anti-FOUC do `index.html`
 * aplica antes do bundle carregar — sem flash branco no reload.
 */
export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  return {
    theme,
    setTheme: setThemeState,
    toggle: () =>
      setThemeState((current) => (current === "dark" ? "light" : "dark")),
  };
}
