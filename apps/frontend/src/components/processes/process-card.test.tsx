import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ProcessCard, type ProcessCardData } from "./process-card";

const baseProcess: ProcessCardData = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Solicitação de Capacitação",
  short_description: "Processo para pedido de afastamento para estudos.",
  category: "RH",
  estimated_time: "30 dias",
  step_count: 8,
};

function renderCard(process: ProcessCardData = baseProcess) {
  return render(
    <MemoryRouter>
      <ProcessCard process={process} />
    </MemoryRouter>,
  );
}

describe("<ProcessCard />", () => {
  it("renderiza título, descrição, tempo e quantidade de etapas", () => {
    renderCard();

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Solicitação de Capacitação",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Processo para pedido de afastamento para estudos."),
    ).toBeInTheDocument();
    expect(screen.getByText(/8 etapas/)).toBeInTheDocument();
    expect(screen.getByText(/30 dias/)).toBeInTheDocument();
  });

  it("exibe o label da categoria em português", () => {
    renderCard();
    expect(screen.getByText("Recursos Humanos")).toBeInTheDocument();
  });

  it("mapeia todas as categorias para labels em PT", () => {
    const labels: Array<[ProcessCardData["category"], string]> = [
      ["MATERIAIS", "Materiais"],
      ["FINANCEIRO", "Financeiro"],
      ["TECNOLOGIA", "Tecnologia"],
      ["INFRAESTRUTURA", "Infraestrutura"],
      ["CONTRATACOES", "Contratações"],
    ];

    for (const [category, expected] of labels) {
      const { unmount } = renderCard({ ...baseProcess, category });
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("usa '1 etapa' no singular quando step_count é 1", () => {
    renderCard({ ...baseProcess, step_count: 1 });
    expect(screen.getByText(/1 etapa(?!s)/)).toBeInTheDocument();
  });

  it("aponta o link para /processes/{id}", () => {
    renderCard();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/processes/11111111-2222-3333-4444-555555555555",
    );
  });

  it("mostra código de referência derivado do UUID", () => {
    renderCard();
    // 4 primeiros hex (sem hífens) em maiúsculas → "PROC-1111".
    expect(screen.getByText("PROC-1111")).toBeInTheDocument();
  });
});
