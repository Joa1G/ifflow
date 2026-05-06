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
  it("inicia em light: mostra ícone Moon e aria-pressed=false", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", {
      name: /Mudar para tema escuro/i,
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("clicar alterna para dark, atualiza aria-pressed e classe no <html>", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: /Mudar para tema escuro/i }),
    );

    const sunButton = screen.getByRole("button", {
      name: /Mudar para tema claro/i,
    });
    expect(sunButton).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("hidrata em dark se localStorage tiver 'dark' antes do mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /Mudar para tema claro/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
