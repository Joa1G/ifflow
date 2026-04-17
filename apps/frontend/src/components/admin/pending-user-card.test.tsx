import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";

import { PendingUserCard } from "./pending-user-card";

const userFixture = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "João da Silva",
  email: "joao.silva@ifam.edu.br",
  siape: "1234567",
  sector: "PROAD",
  created_at: "2026-04-10T10:00:00Z",
};

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

function renderCard(index = 0) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ul>
        <PendingUserCard user={userFixture} index={index} />
      </ul>
    </QueryClientProvider>,
  );
}

describe("<PendingUserCard />", () => {
  it("exibe os dados do usuário com numeração", () => {
    renderCard(0);

    expect(screen.getByText("João da Silva")).toBeInTheDocument();
    expect(screen.getByText("joao.silva@ifam.edu.br")).toBeInTheDocument();
    // Numeração "01." (primeiro da fila).
    expect(screen.getByText("01.")).toBeInTheDocument();
    // SIAPE e setor em uma linha unica.
    expect(
      screen.getByText((content) =>
        content.startsWith("SIAPE 1234567"),
      ),
    ).toBeInTheDocument();
  });

  it("clicar em Aprovar abre o dialog de aprovação", async () => {
    const user = userEvent.setup();
    renderCard(0);

    await user.click(screen.getByRole("button", { name: /aprovar/i }));

    expect(
      screen.getByRole("heading", { name: /aprovar cadastro/i }),
    ).toBeInTheDocument();
  });

  it("clicar em Rejeitar abre o dialog de rejeição com campo de motivo", async () => {
    const user = userEvent.setup();
    renderCard(0);

    await user.click(screen.getByRole("button", { name: /rejeitar/i }));

    expect(
      screen.getByRole("heading", { name: /rejeitar cadastro/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
  });
});
