import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressSummary } from "./progress-summary";

describe("<ProgressSummary />", () => {
  function findPillCount(
    region: HTMLElement,
    statusLabel: string,
  ): string | null {
    const labelEl = within(region).getByText(statusLabel);
    // Estrutura: .flex-col > [span label, span "{count} de {total}"]
    const container = labelEl.parentElement;
    const countEl = container?.querySelector(
      "span.tabular-nums",
    ) as HTMLElement | null;
    // `textContent` junta os dois spans: "1 de 4".
    return countEl?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  }

  it("renderiza contagens por status baseadas no dicionário step_statuses", () => {
    render(
      <ProgressSummary
        totalSteps={4}
        lastUpdated="2026-04-24T12:00:00Z"
        stepStatuses={{
          a: "PENDING",
          b: "IN_PROGRESS",
          c: "COMPLETED",
          d: "COMPLETED",
        }}
      />,
    );

    const section = screen.getByRole("region", {
      name: /resumo do meu progresso/i,
    });
    expect(within(section).getByText("Aguardando")).toBeInTheDocument();
    expect(within(section).getByText("Em andamento")).toBeInTheDocument();
    expect(within(section).getByText("Concluído")).toBeInTheDocument();

    expect(findPillCount(section, "Aguardando")).toBe("1 de 4");
    expect(findPillCount(section, "Em andamento")).toBe("1 de 4");
    expect(findPillCount(section, "Concluído")).toBe("2 de 4");
  });

  it("conta etapas ausentes no JSONB como PENDING", () => {
    // 3 etapas no fluxo mas apenas 1 entrada no JSONB (backend ainda não
    // refletiu o auto-create, ou etapa recém-adicionada pelo admin).
    render(
      <ProgressSummary
        totalSteps={3}
        lastUpdated="2026-04-24T12:00:00Z"
        stepStatuses={{ a: "COMPLETED" }}
      />,
    );
    const section = screen.getByRole("region");
    // PENDING = 0 (do JSONB) + 2 (total − tracked) = 2
    expect(findPillCount(section, "Aguardando")).toBe("2 de 3");
    expect(findPillCount(section, "Concluído")).toBe("1 de 3");
  });

  it("exibe mensagem de fallback quando lastUpdated é null", () => {
    render(
      <ProgressSummary
        totalSteps={0}
        lastUpdated={null}
        stepStatuses={{}}
      />,
    );
    expect(screen.getByText(/Sem atualizações ainda/i)).toBeInTheDocument();
  });

  it("mostra skeleton enquanto isLoading", () => {
    const { container } = render(
      <ProgressSummary
        totalSteps={5}
        lastUpdated={null}
        stepStatuses={{}}
        isLoading
      />,
    );
    // Skeleton do shadcn é um div com classe própria — não tem role.
    // Verifico que o section principal NÃO apareceu.
    expect(
      screen.queryByRole("region", { name: /resumo do meu progresso/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
