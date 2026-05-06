import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  getInitialTheme,
  THEME_STORAGE_KEY,
  useTheme,
} from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  // O setup global mocka matchMedia retornando matches=false. Os testes
  // que precisam simular preferência dark do sistema sobrescrevem aqui.
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getInitialTheme", () => {
  it("retorna 'light' por padrão (sem preferência salva nem do sistema)", () => {
    expect(getInitialTheme()).toBe("light");
  });

  it("respeita o valor salvo em localStorage acima da preferência do sistema", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    // Mesmo com sistema light, localStorage manda.
    expect(getInitialTheme()).toBe("dark");
  });

  it("usa preferência do sistema (prefers-color-scheme: dark) se não há valor salvo", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query.includes("dark"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
    expect(getInitialTheme()).toBe("dark");
  });

  it("ignora valores inválidos no localStorage e cai para 'light'", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon-purple");
    expect(getInitialTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("adiciona a classe 'dark' no <html> quando passar 'dark'", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("remove a classe 'dark' quando passar 'light'", () => {
    document.documentElement.classList.add("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("useTheme", () => {
  it("inicializa com o valor de getInitialTheme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    // E também aplica no DOM no primeiro effect.
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggle alterna entre light e dark e persiste em localStorage", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme define um valor específico", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
