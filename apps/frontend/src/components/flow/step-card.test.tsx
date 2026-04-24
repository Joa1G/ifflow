import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { components } from "../../types/api";
import { StepCard } from "./step-card";

type FlowStepRead = components["schemas"]["FlowStepRead"];

const baseStep: FlowStepRead = {
  id: "step-1",
  order: 3,
  sector: { id: "sec-proad", name: "Pró-Reitoria de Administração", acronym: "PROAD" },
  title: "Autuar processo no SIPAC",
  description: "Abertura do processo eletrônico pelo servidor.",
  responsible: "Servidor interessado",
  estimated_time: "1 dia útil",
  resources: [],
};

describe("<StepCard />", () => {
  it("renderiza número, título, responsável e prazo", () => {
    render(<StepCard step={baseStep} />);

    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("Etapa")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Autuar processo no SIPAC" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Responsável: Servidor interessado/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Prazo: 1 dia útil/i)).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: /Etapa 3: Autuar processo no SIPAC/i }),
    ).toBeInTheDocument();
  });

  it("mantém o zero-padding no número mesmo com ordem acima de 9", () => {
    render(<StepCard step={{ ...baseStep, order: 12 }} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("chama onSelect com o step ao clicar em 'Ver detalhes'", () => {
    const onSelect = vi.fn();
    render(<StepCard step={baseStep} onSelect={onSelect} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Ver detalhes da etapa 3: Autuar processo no SIPAC/i,
      }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(baseStep);
  });

  it("não quebra quando onSelect não é fornecido", () => {
    render(<StepCard step={baseStep} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Ver detalhes da etapa 3/i }),
    );
  });

  it("esconde o parágrafo de descrição quando vazio", () => {
    render(<StepCard step={{ ...baseStep, description: "" }} />);
    expect(
      screen.queryByText("Abertura do processo eletrônico pelo servidor."),
    ).not.toBeInTheDocument();
  });

  it("renderiza o statusControl quando fornecido", () => {
    render(
      <StepCard
        step={baseStep}
        statusControl={<span data-testid="slot">SELECT</span>}
      />,
    );
    expect(screen.getByTestId("slot")).toBeInTheDocument();
  });
});
