import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { __resetApiClientForTests } from "../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../stores/auth-store";
import ProcessFlowPage from "./process-flow";

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-1111-1111-111111111111";
const STEP_ID = "22222222-2222-2222-2222-222222222222";

const flowPayload = {
  process: { id: PROCESS_ID, title: "Solicitação de Capacitação" },
  steps: [
    {
      id: STEP_ID,
      order: 1,
      sector: {
        id: "sec-proad",
        name: "Pró-Reitoria de Administração",
        acronym: "PROAD",
      },
      title: "Autuar processo no SIPAC",
      description: "Abertura do processo eletrônico pelo servidor.",
      responsible: "Servidor interessado",
      estimated_time: "1 dia útil",
      resources: [],
    },
  ],
};

const progressPayload = {
  id: "prog-1",
  process_id: PROCESS_ID,
  step_statuses: { [STEP_ID]: "PENDING" },
  last_updated: "2026-04-21T10:00:00Z",
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: "t", user: null, isHydrating: false });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  server.resetHandlers();
});

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/processes/${PROCESS_ID}/flow`]}>
        <Routes>
          <Route path="/processes/:id/flow" element={<ProcessFlowPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<ProcessFlowPage /> — F-20", () => {
  it("exibe o texto literal do REQ-102 sobre o checklist pessoal", async () => {
    server.use(
      http.get(`${BASE}/processes/${PROCESS_ID}/flow`, () =>
        HttpResponse.json(flowPayload),
      ),
      http.get(`${BASE}/progress/${PROCESS_ID}`, () =>
        HttpResponse.json(progressPayload),
      ),
    );

    renderPage();

    // O aviso do REQ-102 não depende de dados da API carregarem — está
    // sempre visível no topo do fluxograma, para cobrir qualquer estado.
    expect(
      screen.getByText(
        /Este checklist é pessoal e não altera o processo oficial no SIPAC\. Use-o para acompanhar seu próprio andamento\./,
      ),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: /Fluxo:/i }),
      ).toBeInTheDocument(),
    );
  });

  it("mudar o status de uma etapa chama PATCH /progress e revalida o cache", async () => {
    const patchCalls: Array<{ url: string; body: unknown }> = [];

    server.use(
      http.get(`${BASE}/processes/${PROCESS_ID}/flow`, () =>
        HttpResponse.json(flowPayload),
      ),
      http.get(`${BASE}/progress/${PROCESS_ID}`, () =>
        HttpResponse.json(progressPayload),
      ),
      http.patch(
        `${BASE}/progress/${PROCESS_ID}/steps/${STEP_ID}`,
        async ({ request }) => {
          const body = await request.json();
          patchCalls.push({ url: request.url, body });
          return HttpResponse.json({
            ...progressPayload,
            step_statuses: { [STEP_ID]: "COMPLETED" },
          });
        },
      ),
    );

    const user = userEvent.setup();
    renderPage();

    const trigger = await screen.findByRole("combobox", {
      name: /Status da etapa: 1 — Autuar processo no SIPAC/i,
    });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: /Concluído/i }));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]?.body).toEqual({ status: "COMPLETED" });
    expect(new URL(patchCalls[0]!.url).pathname).toBe(
      `/progress/${PROCESS_ID}/steps/${STEP_ID}`,
    );
  });
});
