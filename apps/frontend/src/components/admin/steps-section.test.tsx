import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { __resetApiClientForTests } from "../../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";
import type { components } from "../../types/api";
import { StepsSection } from "./steps-section";

type FlowStepRead = components["schemas"]["FlowStepRead"];
type StepResourceRead = components["schemas"]["StepResourceRead"];

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";
const SECTOR_ID = "22222222-2222-4222-8222-222222222222";
const STEP_ID = "33333333-3333-4333-8333-333333333333";

const SECTOR = {
  id: SECTOR_ID,
  name: "PROAD",
  acronym: "PROAD",
};

const RESOURCE_OLD: StepResourceRead = {
  id: "44444444-4444-4444-8444-444444444444",
  type: "DOCUMENT",
  title: "Recurso original",
  url: "https://example.com/old.pdf",
  content: null,
};

const RESOURCE_NEW: StepResourceRead = {
  id: "55555555-5555-4555-8555-555555555555",
  type: "LINK",
  title: "Recurso recém adicionado",
  url: "https://example.com/new",
  content: null,
};

function buildStep(resources: StepResourceRead[]): FlowStepRead {
  return {
    id: STEP_ID,
    order: 1,
    sector: SECTOR,
    title: "Autuar processo",
    description: "Abertura no SIPAC.",
    responsible: "Solicitante",
    estimated_time: "1 dia",
    resources,
  };
}

const server = setupServer(
  http.get(`${BASE}/sectors`, () =>
    HttpResponse.json({ sectors: [SECTOR], total: 1 }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: "t", user: null, isHydrating: false });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
});

afterEach(() => server.resetHandlers());

describe("<StepsSection /> — sincronização do modal com refetch", () => {
  it("modal aberto reflete novos resources após a prop steps mudar", async () => {
    // Cenário: usuário abre o modal de uma etapa, dispara mutation de
    // recurso (create/update/delete) → cache do TanStack Query invalida →
    // page recarrega `steps` com a versão fresca. O modal precisa exibir
    // o estado novo SEM o usuário fechar/reabrir.
    const user = userEvent.setup();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <StepsSection
          processId={PROCESS_ID}
          steps={[buildStep([RESOURCE_OLD])]}
          isLoading={false}
          editable
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^Editar$/i }));

    expect(
      await screen.findByText("Recurso original"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Recurso recém adicionado")).not.toBeInTheDocument();

    // Simula refetch após mutation: novo array de objetos para o React
    // perceber a mudança referencial (TanStack Query sempre devolve novo
    // objeto após invalidate).
    rerender(
      <QueryClientProvider client={queryClient}>
        <StepsSection
          processId={PROCESS_ID}
          steps={[buildStep([RESOURCE_OLD, RESOURCE_NEW])]}
          isLoading={false}
          editable
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Recurso recém adicionado"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Recurso original")).toBeInTheDocument();
  });
});
