import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { components } from "../../types/api";
import { StepDetailModal } from "./step-detail-modal";

type FlowStepRead = components["schemas"]["FlowStepRead"];
type StepResourceRead = components["schemas"]["StepResourceRead"];

const PROAD = {
  id: "sec-proad",
  name: "Pró-Reitoria de Administração",
  acronym: "PROAD",
};

function makeStep(resources: StepResourceRead[] = []): FlowStepRead {
  return {
    id: "step-1",
    order: 3,
    sector: PROAD,
    title: "Autuar processo no SIPAC",
    description: "Abertura do processo eletrônico pelo servidor interessado.",
    responsible: "Servidor interessado",
    estimated_time: "1 dia útil",
    resources,
  };
}

function renderModal(step: FlowStepRead | null) {
  return render(
    <StepDetailModal
      step={step}
      open={step !== null}
      onOpenChange={() => {}}
    />,
  );
}

describe("<StepDetailModal />", () => {
  it("renderiza título, metadata e descrição", () => {
    renderModal(makeStep());

    expect(
      screen.getByRole("heading", { level: 2, name: "Autuar processo no SIPAC" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Pró-Reitoria de Administração/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Servidor interessado/)).toBeInTheDocument();
    expect(screen.getByText(/1 dia útil/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Abertura do processo eletrônico pelo servidor interessado.",
      ),
    ).toBeInTheDocument();
  });

  it("mostra a seção 'Documentos necessários' para recursos do tipo DOCUMENT", () => {
    renderModal(
      makeStep([
        {
          id: "r1",
          type: "DOCUMENT",
          title: "Formulário de afastamento",
          url: "https://ifam.edu.br/forms/afastamento.pdf",
          content: null,
        },
      ]),
    );

    expect(
      screen.getByRole("region", { name: /documentos necessários/i }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /formulário de afastamento/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://ifam.edu.br/forms/afastamento.pdf",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("mostra a seção 'Base legal' com citação quando há content sem URL", () => {
    renderModal(
      makeStep([
        {
          id: "r1",
          type: "LEGAL_BASIS",
          title: "Lei nº 11.091/2005, art. 96-A",
          url: null,
          content:
            "O servidor terá direito a afastamento para participar de programa de pós-graduação stricto sensu.",
        },
      ]),
    );

    expect(
      screen.getByRole("region", { name: /base legal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/O servidor terá direito a afastamento/i),
    ).toBeInTheDocument();
    // Citação não é link.
    expect(
      screen.queryByRole("link", { name: /11\.091/ }),
    ).not.toBeInTheDocument();
  });

  it("mostra a seção 'Procedimento operacional' para recursos do tipo POP", () => {
    renderModal(
      makeStep([
        {
          id: "r1",
          type: "POP",
          title: "POP-001 — Abertura de processo",
          url: "https://ifam.edu.br/pop/001",
          content: null,
        },
      ]),
    );

    expect(
      screen.getByRole("region", { name: /procedimento operacional/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /POP-001/i }),
    ).toBeInTheDocument();
  });

  it("esconde seções cujo tipo de recurso está vazio", () => {
    renderModal(
      makeStep([
        {
          id: "r1",
          type: "DOCUMENT",
          title: "Formulário",
          url: "https://example.org/f",
          content: null,
        },
      ]),
    );

    expect(
      screen.getByRole("region", { name: /documentos necessários/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /base legal/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /procedimento operacional/i }),
    ).not.toBeInTheDocument();
  });

  it("esconde a seção 'Descrição' quando a etapa não tem descrição", () => {
    renderModal({ ...makeStep(), description: "" });
    expect(
      screen.queryByRole("region", { name: /descrição/i }),
    ).not.toBeInTheDocument();
  });

  it("rejeita URL 'javascript:' — renderiza o recurso como texto", () => {
    renderModal(
      makeStep([
        {
          id: "r1",
          type: "DOCUMENT",
          title: "Formulário malicioso",
          url: "javascript:alert(1)",
          content: null,
        },
      ]),
    );

    expect(
      screen.queryByRole("link", { name: /formulário malicioso/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/formulário malicioso/i)).toBeInTheDocument();
  });

  it("rejeita URL 'data:' — renderiza como texto", () => {
    renderModal(
      makeStep([
        {
          id: "r1",
          type: "DOCUMENT",
          title: "PDF embutido",
          url: "data:application/pdf;base64,AAAA",
          content: null,
        },
      ]),
    );

    expect(
      screen.queryByRole("link", { name: /PDF embutido/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/PDF embutido/i)).toBeInTheDocument();
  });

  it("não renderiza o corpo quando step é null (modal fechado)", () => {
    renderModal(null);
    expect(
      screen.queryByRole("heading", { level: 2, name: /autuar/i }),
    ).not.toBeInTheDocument();
  });
});
