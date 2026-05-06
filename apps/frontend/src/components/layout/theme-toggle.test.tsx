import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "./theme-toggle";
import { THEME_STORAGE_KEY } from "../../lib/theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("<ThemeToggle />", () => {
  it("inicia em light: switch desligado e thumb deslocado para a direita (Moon coberta)", () => {
    render(<ThemeToggle />);
    const sw = screen.getByRole("switch", {
      name: /Mudar para tema escuro/i,
    });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("theme-toggle-thumb").className).toContain(
      "translate-x-6",
    );
  });

  it("clicar alterna para dark: aria-checked=true, thumb à esquerda e classe no <html>", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("switch", { name: /Mudar para tema escuro/i }),
    );

    const sw = screen.getByRole("switch", { name: /Mudar para tema claro/i });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("theme-toggle-thumb").className).toContain(
      "translate-x-0",
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("hidrata em dark se localStorage tiver 'dark' antes do mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    expect(
      screen.getByRole("switch", { name: /Mudar para tema claro/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
