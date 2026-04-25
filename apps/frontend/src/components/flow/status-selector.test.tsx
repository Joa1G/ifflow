import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StatusSelector } from "./status-selector";

describe("<StatusSelector />", () => {
  it("renderiza o label do status atual dentro do trigger", () => {
    render(
      <StatusSelector
        status="IN_PROGRESS"
        onChange={() => {}}
        stepLabel="1 — Autuar processo"
      />,
    );

    const trigger = screen.getByRole("combobox", {
      name: /Status da etapa: 1 — Autuar processo/i,
    });
    expect(trigger).toHaveTextContent(/Em andamento/i);
  });

  it("chama onChange com o novo status ao selecionar outra opção", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <StatusSelector
        status="PENDING"
        onChange={onChange}
        stepLabel="2 — Análise"
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: /Status da etapa: 2 — Análise/i }),
    );
    await user.click(screen.getByRole("option", { name: /Concluído/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("COMPLETED");
  });

  it("fica desabilitado enquanto isUpdating", () => {
    render(
      <StatusSelector
        status="PENDING"
        onChange={() => {}}
        stepLabel="3 — Parecer"
        isUpdating
      />,
    );

    expect(
      screen.getByRole("combobox", { name: /Status da etapa: 3 — Parecer/i }),
    ).toBeDisabled();
  });

  it("respeita prop disabled", () => {
    render(
      <StatusSelector
        status="PENDING"
        onChange={() => {}}
        stepLabel="4 — X"
        disabled
      />,
    );
    expect(
      screen.getByRole("combobox", { name: /Status da etapa: 4 — X/i }),
    ).toBeDisabled();
  });
});
