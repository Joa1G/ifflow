import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
import MyProcessesPage from "./my-processes";

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";

const ownProcess = {
  id: PROCESS_ID,
  title: "Capacitação 2026",
  short_description: "Curta",
  full_description: "Completa.",
  category: "RH" as const,
  estimated_time: "30 dias",
  requirements: [],
  status: "DRAFT" as const,
  access_count: 0,
  created_by: "00000000-0000-4000-8000-000000000000",
  approved_by: null,
  created_at: "2026-04-21T10:00:00Z",
  updated_at: "2026-04-21T10:00:00Z",
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

afterEach(() => server.resetHandlers());

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/processes/mine"]}>
        <Routes>
          <Route path="/processes/mine" element={<MyProcessesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<MyProcessesPage />", () => {
  it("renderiza tabela quando GET /processes/mine devolve processos do autor", async () => {
    server.use(
      http.get(`${BASE}/processes/mine`, () =>
        HttpResponse.json({ processes: [ownProcess], total: 1 }),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Meus processos" }),
    ).toBeInTheDocument();
    // O link da linha aponta para o editor owner-mode (não /admin/*).
    const titleLinks = await screen.findAllByRole("link", {
      name: /Capacitação 2026/i,
    });
    expect(titleLinks[0]).toHaveAttribute("href", `/processes/${PROCESS_ID}/edit`);
  });

  it("mostra empty state com CTA Criar processo quando lista do autor vazia", async () => {
    server.use(
      http.get(`${BASE}/processes/mine`, () =>
        HttpResponse.json({ processes: [], total: 0 }),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: /Você ainda não criou processos/i,
      }),
    ).toBeInTheDocument();
    // A página renderiza dois CTAs (header + empty state), ambos apontando
    // para /processes/new. Aceitamos os dois e validamos o destino.
    const ctas = screen.getAllByRole("link", { name: /Criar processo/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/processes/new");
    }
    // Default sem filtro ativo: empty state é o "zero" e não o "filtrado".
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          level: 3,
          name: /Nenhum processo encontrado/i,
        }),
      ).not.toBeInTheDocument(),
    );
  });
});
