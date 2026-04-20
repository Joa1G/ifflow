import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
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
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../../stores/auth-store";
import { ProcessDetailModal } from "./process-detail-modal";

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-2222-3333-4444-555555555555";

const processDetail = {
  id: PROCESS_ID,
  title: "Solicitação de Capacitação",
  short_description: "Afastamento para cursos e especializações.",
  full_description:
    "Processo completo para solicitar afastamento visando cursos de pós-graduação, eventos e outras ações formativas.",
  category: "RH" as const,
  estimated_time: "Até 30 dias",
  requirements: [
    "Ter 3 anos de efetivo exercício",
    "Ter estágio probatório concluído",
  ],
  step_count: 8,
  access_count: 42,
};

const mockUser: UserMe = {
  id: "99999999-9999-9999-9999-999999999999",
  name: "Servidora Exemplo",
  email: "servidora@ifam.edu.br",
  siape: "0000123",
  sector: "PROAD",
  role: "USER",
  status: "APPROVED",
  created_at: "2026-04-17T12:00:00Z",
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isHydrating: false });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  server.resetHandlers();
});

function renderModal() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProcessDetailModal
          processId={PROCESS_ID}
          open
          onOpenChange={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<ProcessDetailModal />", () => {
  it("renderiza título, categoria, descrição, metadata e requisitos", async () => {
    server.use(
      http.get(`${BASE}/processes/${PROCESS_ID}`, () =>
        HttpResponse.json(processDetail),
      ),
    );

    renderModal();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: "Solicitação de Capacitação",
        }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("Recursos Humanos")).toBeInTheDocument();
    expect(screen.getByText(processDetail.full_description)).toBeInTheDocument();
    expect(screen.getByText("Até 30 dias")).toBeInTheDocument();
    expect(screen.getByText("8 etapas")).toBeInTheDocument();
    expect(screen.getByText("PROC-1111")).toBeInTheDocument();
    expect(
      screen.getByText("Ter 3 anos de efetivo exercício"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ter estágio probatório concluído"),
    ).toBeInTheDocument();
    // Pré-requisitos numerados (01, 02) em monospace.
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
  });

  it("mostra 'Fazer login para ver o fluxo' quando não autenticado e aponta para /login", async () => {
    server.use(
      http.get(`${BASE}/processes/${PROCESS_ID}`, () =>
        HttpResponse.json(processDetail),
      ),
    );

    renderModal();

    const cta = await screen.findByRole("link", {
      name: /fazer login para ver o fluxo/i,
    });
    expect(cta).toHaveAttribute("href", "/login");
    expect(
      screen.queryByRole("link", { name: /ver fluxo completo/i }),
    ).not.toBeInTheDocument();
  });

  it("mostra 'Ver fluxo completo' quando autenticado e aponta para /processes/:id/flow", async () => {
    useAuthStore.setState({ token: "t", user: mockUser, isHydrating: false });
    server.use(
      http.get(`${BASE}/processes/${PROCESS_ID}`, () =>
        HttpResponse.json(processDetail),
      ),
    );

    renderModal();

    const cta = await screen.findByRole("link", {
      name: /ver fluxo completo/i,
    });
    expect(cta).toHaveAttribute("href", `/processes/${PROCESS_ID}/flow`);
    expect(
      screen.queryByRole("link", { name: /fazer login/i }),
    ).not.toBeInTheDocument();
  });

  it("renderiza estado de erro quando o backend falha", async () => {
    server.use(
      http.get(`${BASE}/processes/${PROCESS_ID}`, () =>
        HttpResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Processo não encontrado ou não publicado.",
            },
          },
          { status: 404 },
        ),
      ),
    );

    renderModal();

    await waitFor(() =>
      expect(
        screen.getByText(/não foi possível carregar esta ficha/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/processo não encontrado ou não publicado/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /fechar/i }),
    ).toBeInTheDocument();
  });

  it("não dispara fetch quando o modal está fechado", () => {
    // Sem handler registrado — setupServer está configurado com
    // onUnhandledRequest: "error", então um fetch indevido quebraria o teste.
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProcessDetailModal
            processId={PROCESS_ID}
            open={false}
            onOpenChange={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Modal fechado não renderiza conteúdo no DOM.
    expect(
      screen.queryByRole("heading", { name: /solicitação/i }),
    ).not.toBeInTheDocument();
  });
});
