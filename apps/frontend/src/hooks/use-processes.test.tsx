import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
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
import {
  useProcess,
  useProcesses,
  useProcessFlow,
} from "./use-processes";

const BASE = "http://localhost:8000";

const processListItem = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Solicitação de Capacitação",
  short_description: "Processo para pedido de afastamento para estudos.",
  category: "RH",
  estimated_time: "30 dias",
  step_count: 5,
  access_count: 12,
};

const processDetail = {
  id: processListItem.id,
  title: processListItem.title,
  short_description: processListItem.short_description,
  full_description: "Descrição completa do processo de capacitação.",
  category: "RH",
  estimated_time: processListItem.estimated_time,
  requirements: ["Ter 3 anos de efetivo exercício"],
  step_count: processListItem.step_count,
  access_count: processListItem.access_count + 1,
};

const processFlow = {
  process: { id: processListItem.id, title: processListItem.title },
  steps: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      order: 1,
      sector: { id: "33333333-3333-3333-3333-333333333333", name: "PROAD" },
      title: "Abrir solicitação no SIPAC",
      description: "Iniciar o processo eletrônico.",
      responsible: "Servidor interessado",
      estimated_time: "1 dia",
      resources: [],
    },
  ],
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    token: "user-token",
    user: null,
    isHydrating: false,
  });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  server.resetHandlers();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useProcesses", () => {
  it("chama GET /processes sem query string quando não há filtros", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/processes`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ processes: [processListItem], total: 1 });
      }),
    );

    const { result } = renderHook(() => useProcesses(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.processes[0]?.title).toBe(
      "Solicitação de Capacitação",
    );
    expect(new URL(receivedUrl).search).toBe("");
  });

  it("envia o parâmetro search quando informado", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/processes`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ processes: [processListItem], total: 1 });
      }),
    );

    const { result } = renderHook(
      () => useProcesses({ search: "capacitação" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(receivedUrl).searchParams.get("search")).toBe("capacitação");
  });

  it("envia o parâmetro category quando informado", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/processes`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ processes: [processListItem], total: 1 });
      }),
    );

    const { result } = renderHook(() => useProcesses({ category: "RH" }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(receivedUrl).searchParams.get("category")).toBe("RH");
  });

  it("omite search quando o valor é string vazia ou só espaços", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/processes`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ processes: [], total: 0 });
      }),
    );

    const { result } = renderHook(() => useProcesses({ search: "   " }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(receivedUrl).searchParams.has("search")).toBe(false);
  });
});

describe("useProcess", () => {
  it("chama GET /processes/{id} e devolve o detalhe", async () => {
    server.use(
      http.get(`${BASE}/processes/${processDetail.id}`, () =>
        HttpResponse.json(processDetail),
      ),
    );

    const { result } = renderHook(() => useProcess(processDetail.id), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.full_description).toBe(
      "Descrição completa do processo de capacitação.",
    );
    expect(result.current.data?.step_count).toBe(5);
  });

  it("não dispara requisição quando id é undefined", async () => {
    let called = false;
    server.use(
      http.get(`${BASE}/processes/:id`, () => {
        called = true;
        return HttpResponse.json(processDetail);
      }),
    );

    const { result } = renderHook(() => useProcess(undefined), { wrapper });

    // Sem id, a query fica desabilitada — nunca entra em loading nem dispara.
    expect(result.current.fetchStatus).toBe("idle");
    expect(called).toBe(false);
  });
});

describe("useProcessFlow", () => {
  it("chama GET /processes/{id}/flow autenticado e devolve o envelope", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${BASE}/processes/${processFlow.process.id}/flow`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json(processFlow);
      }),
    );

    const { result } = renderHook(
      () => useProcessFlow(processFlow.process.id),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authHeader).toBe("Bearer user-token");
    expect(result.current.data?.steps).toHaveLength(1);
    expect(result.current.data?.steps[0]?.title).toBe(
      "Abrir solicitação no SIPAC",
    );
  });

  it("propaga ApiError 401 UNAUTHENTICATED quando token é inválido", async () => {
    server.use(
      http.get(`${BASE}/processes/${processFlow.process.id}/flow`, () =>
        HttpResponse.json(
          {
            error: {
              code: "UNAUTHENTICATED",
              message: "Autenticação necessária.",
              details: {},
            },
          },
          { status: 401 },
        ),
      ),
    );

    const { result } = renderHook(
      () => useProcessFlow(processFlow.process.id),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("UNAUTHENTICATED");
    expect(result.current.error?.status).toBe(401);
  });
});
