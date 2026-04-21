import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { components } from "../../types/api";
import { FlowViewer } from "./flow-viewer";

type ProcessFullFlow = components["schemas"]["ProcessFullFlow"];

const PROAD = {
  id: "sec-proad",
  name: "Pró-Reitoria de Administração",
  acronym: "PROAD",
};
const DRH = {
  id: "sec-drh",
  name: "Departamento de Recursos Humanos",
  acronym: "DRH",
};

const flow: ProcessFullFlow = {
  process: {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Solicitação de Capacitação",
  },
  steps: [
    {
      id: "s1",
      order: 1,
      sector: PROAD,
      title: "Autuar processo no SIPAC",
      description: "Abertura do processo pelo servidor.",
      responsible: "Servidor interessado",
      estimated_time: "1 dia útil",
      resources: [],
    },
    {
      id: "s2",
      order: 2,
      sector: DRH,
      title: "Análise dos requisitos",
      description: "Verificar elegibilidade conforme Lei 11.091/2005.",
      responsible: "Chefe de Divisão DRH",
      estimated_time: "5 dias úteis",
      resources: [],
    },
    {
      id: "s3",
      order: 3,
      sector: PROAD,
      title: "Consolidar parecer",
      description: "Consolidar análise e encaminhar ao Reitor.",
      responsible: "Coordenação PROAD",
      estimated_time: "2 dias úteis",
      resources: [],
    },
  ],
};

describe("<FlowViewer />", () => {
  it("renderiza uma swimlane por setor na ordem de primeira aparição", () => {
    render(<FlowViewer flow={flow} />);

    const swimlanes = screen.getAllByRole("group", { name: /raia/i });
    expect(swimlanes).toHaveLength(2);
    expect(swimlanes[0]).toHaveAccessibleName(/PROAD/);
    expect(swimlanes[1]).toHaveAccessibleName(/DRH/);
  });

  it("exibe todos os steps em ordem global numérica", () => {
    render(<FlowViewer flow={flow} />);

    expect(
      screen.getByRole("button", { name: /Etapa 1:/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Etapa 2:/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Etapa 3:/i }),
    ).toBeInTheDocument();
  });

  it("ordena raias pela primeira aparição mesmo com payload embaralhado", () => {
    // Embaralha a ordem de entrada: DRH (2), PROAD (3), PROAD (1). Após a
    // ordenação por `order`, PROAD aparece primeiro (tem o step 1) e DRH
    // depois — o viewer não pode depender da ordem do array recebido.
    const shuffled: ProcessFullFlow = {
      process: flow.process,
      steps: [flow.steps[1]!, flow.steps[2]!, flow.steps[0]!],
    };
    render(<FlowViewer flow={shuffled} />);

    const swimlanes = screen.getAllByRole("group", { name: /raia/i });
    expect(swimlanes[0]).toHaveAccessibleName(/PROAD/);
    expect(swimlanes[1]).toHaveAccessibleName(/DRH/);
    // Todos os 3 steps continuam presentes com seu próprio order preservado.
    expect(
      screen.getByRole("button", { name: /Etapa 1:.*Autuar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Etapa 2:.*Análise/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Etapa 3:.*Consolidar/i }),
    ).toBeInTheDocument();
  });

  it("propaga o click de um step para onSelectStep com o step correto", () => {
    const onSelectStep = vi.fn();
    render(<FlowViewer flow={flow} onSelectStep={onSelectStep} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Etapa 2:.*Análise/i }),
    );

    expect(onSelectStep).toHaveBeenCalledTimes(1);
    expect(onSelectStep).toHaveBeenCalledWith(flow.steps[1]);
  });

  it("renderiza marcadores de início e fim do fluxo", () => {
    render(<FlowViewer flow={flow} />);

    expect(
      screen.getByRole("separator", { name: /início do fluxo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: /fim do fluxo/i }),
    ).toBeInTheDocument();
  });
});
