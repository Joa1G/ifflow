import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "./password-input";

describe("<PasswordInput />", () => {
  it("começa com type='password' e ícone 'Mostrar senha'", () => {
    render(<PasswordInput aria-label="senha" />);
    const input = screen.getByLabelText("senha") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(
      screen.getByRole("button", { name: "Mostrar senha" }),
    ).toBeInTheDocument();
  });

  it("alterna para type='text' ao clicar no olho", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="senha" />);
    const input = screen.getByLabelText("senha") as HTMLInputElement;

    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));

    expect(input.type).toBe("text");
    expect(
      screen.getByRole("button", { name: "Ocultar senha" }),
    ).toBeInTheDocument();
  });

  it("volta para type='password' ao clicar de novo", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="senha" />);
    const input = screen.getByLabelText("senha") as HTMLInputElement;
    const toggle = screen.getByRole("button");

    await user.click(toggle);
    await user.click(toggle);

    expect(input.type).toBe("password");
  });

  it("reflete estado via aria-pressed", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="senha" />);
    const toggle = screen.getByRole("button");

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("preserva o valor do input ao alternar visibilidade", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="senha" />);
    const input = screen.getByLabelText("senha") as HTMLInputElement;

    await user.type(input, "minhasenha");
    expect(input.value).toBe("minhasenha");

    await user.click(screen.getByRole("button"));
    expect(input.value).toBe("minhasenha");
  });
});
