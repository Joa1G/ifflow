import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
import FollowingPage from "./following";

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";

const baseItem = {
  process_id: PROCESS_ID,
  process_title: "Solicitação de Capacitação",
  process_short_description: "Afastamento para estudos.",
  process_category: "RH" as const,
  process_status: "PUBLISHED" as const,
  completed_steps: 3,
  total_steps: 8,
  last_updated: "2026-05-06T10:00:00Z",
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
      <MemoryRouter initialEntries={["/processes/following"]}>
        <Routes>
          <Route path="/processes/following" element={<FollowingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<FollowingPage />", () => {
  it("renderiza titulo e linha por processo acompanhado, com link para o fluxo", async () => {
    server.use(
      http.get(`${BASE}/progress/mine`, () =>
        HttpResponse.json({ following: [baseItem] }),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Processos que acompanho",
      }),
    ).toBeInTheDocument();

    const row = await screen.findByRole("link", {
      name: /Continuar acompanhamento de Solicitação de Capacitação/i,
    });
    expect(row).toHaveAttribute("href", `/processes/${PROCESS_ID}/flow`);
    expect(row).toHaveTextContent(/3 de 8 etapas concluídas/i);
    expect(row).toHaveTextContent(/Recursos Humanos/i);
  });

  it("mostra '1 processo acompanhado' (singular) quando ha apenas um item", async () => {
    server.use(
      http.get(`${BASE}/progress/mine`, () =>
        HttpResponse.json({ following: [baseItem] }),
      ),
    );
    renderPage();

    expect(await screen.findByText(/1 processo acompanhado/i)).toBeInTheDocument();
  });

  it("mostra empty state com CTA Explorar processos quando lista vazia", async () => {
    server.use(
      http.get(`${BASE}/progress/mine`, () =>
        HttpResponse.json({ following: [] }),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: /Você ainda não acompanha nenhum processo/i,
      }),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Explorar processos/i });
    expect(cta).toHaveAttribute("href", "/");
  });

  it("mostra mensagem de erro quando o backend devolve 500", async () => {
    server.use(
      http.get(`${BASE}/progress/mine`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Erro inesperado.",
              details: {},
            },
          },
          { status: 500 },
        ),
      ),
    );
    renderPage();

    expect(
      await screen.findByText(/Erro ao carregar acompanhamentos/i),
    ).toBeInTheDocument();
  });

  it("rotula 'Sem etapas' quando o processo nao possui etapas", async () => {
    server.use(
      http.get(`${BASE}/progress/mine`, () =>
        HttpResponse.json({
          following: [{ ...baseItem, completed_steps: 0, total_steps: 0 }],
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText(/Sem etapas/i)).toBeInTheDocument();
  });
});
