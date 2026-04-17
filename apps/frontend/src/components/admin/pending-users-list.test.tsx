import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
import {
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../../stores/auth-store";
import { PendingUsersList } from "./pending-users-list";

const BASE = "http://localhost:8000";

const userFixture = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "João da Silva",
  email: "joao.silva@ifam.edu.br",
  siape: "1234567",
  sector: "PROAD",
  created_at: "2026-04-10T10:00:00Z",
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let queryClient: QueryClient;

beforeEach(() => {
  useAuthStore.setState({
    token: "admin-token",
    user: null,
    isHydrating: false,
  });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});
afterEach(() => {
  server.resetHandlers();
});

function renderList() {
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingUsersList />
    </QueryClientProvider>,
  );
}

describe("<PendingUsersList />", () => {
  it("estado vazio: exibe mensagem de nenhum cadastro pendente", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [], total: 0 }),
      ),
    );

    renderList();

    await waitFor(() =>
      expect(
        screen.getByText(/nenhum cadastro pendente/i),
      ).toBeInTheDocument(),
    );
  });

  it("com dados: renderiza uma linha por cadastro", async () => {
    const segundo = {
      ...userFixture,
      id: "22222222-2222-2222-2222-222222222222",
      name: "Maria Souza",
      email: "maria.souza@ifam.edu.br",
    };

    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [userFixture, segundo], total: 2 }),
      ),
    );

    renderList();

    await waitFor(() =>
      expect(screen.getByText("João da Silva")).toBeInTheDocument(),
    );
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    // Cada linha tem um par de botoes aprovar/rejeitar.
    expect(screen.getAllByRole("button", { name: /aprovar/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /rejeitar/i })).toHaveLength(
      2,
    );
  });

  it("erro: exibe bloco de falha com botão 'Tentar de novo'", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Erro interno do servidor.",
              details: {},
            },
          },
          { status: 500 },
        ),
      ),
    );

    renderList();

    await waitFor(() =>
      expect(
        screen.getByText(/não foi possível carregar/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /tentar de novo/i }),
    ).toBeInTheDocument();
  });

  it("loading: exibe container acessível com aria-busy", () => {
    // Resposta pendente indefinidamente — deixa o componente em isLoading.
    server.use(
      http.get(
        `${BASE}/admin/users/pending`,
        () => new Promise(() => undefined),
      ),
    );

    renderList();

    expect(
      screen.getByLabelText(/carregando cadastros pendentes/i),
    ).toBeInTheDocument();
  });
});
