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
  adminProcessesListQueryKey,
  adminProcessQueryKey,
  useAdminProcess,
  useAdminProcessesList,
  useApproveProcess,
  useArchiveProcess,
  useCreateProcess,
  useCreateResource,
  useCreateStep,
  useDeleteResource,
  useDeleteStep,
  useSubmitProcessForReview,
  useUpdateProcess,
  useUpdateStep,
} from "./use-admin-processes";

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";
const STEP_ID = "22222222-2222-4222-8222-222222222222";
const RESOURCE_ID = "33333333-3333-4333-8333-333333333333";
const SECTOR_ID = "44444444-4444-4444-4444-444444444444";

const adminProcessPayload = {
  id: PROCESS_ID,
  title: "Solicitação de Capacitação",
  short_description: "Curta",
  full_description: "Completa",
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

const stepPayload = {
  id: STEP_ID,
  process_id: PROCESS_ID,
  sector: { id: SECTOR_ID, name: "PROAD", acronym: "PROAD" },
  order: 1,
  title: "Autuar",
  description: "Abertura",
  responsible: "Servidor",
  estimated_time: "1 dia",
};

const resourcePayload = {
  id: RESOURCE_ID,
  step_id: STEP_ID,
  type: "DOCUMENT" as const,
  title: "Formulário",
  url: "https://example.org/f.pdf",
  content: null,
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
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
});

afterEach(() => server.resetHandlers());

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAdminProcess", () => {
  it("busca o processo via GET /admin/processes/:id", async () => {
    server.use(
      http.get(`${BASE}/admin/processes/${PROCESS_ID}`, () =>
        HttpResponse.json(adminProcessPayload),
      ),
    );
    const { result } = renderHook(() => useAdminProcess(PROCESS_ID), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe(PROCESS_ID);
  });

  it("não dispara requisição quando processId é undefined", () => {
    const { result } = renderHook(() => useAdminProcess(undefined), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useCreateProcess", () => {
  it("envia POST /admin/processes e retorna o processo criado", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${BASE}/admin/processes`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(adminProcessPayload);
      }),
    );

    const { result } = renderHook(() => useCreateProcess(), { wrapper });

    result.current.mutate({
      title: "Novo",
      short_description: "Curta de teste",
      full_description: "Completa de teste do processo",
      category: "RH",
      estimated_time: "10 dias",
      requirements: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toMatchObject({ title: "Novo", category: "RH" });
  });
});

describe("useUpdateProcess", () => {
  it("envia PATCH /admin/processes/:id e invalida cache", async () => {
    server.use(
      http.patch(`${BASE}/admin/processes/${PROCESS_ID}`, () =>
        HttpResponse.json(adminProcessPayload),
      ),
    );

    queryClient.setQueryData(
      adminProcessQueryKey(PROCESS_ID),
      adminProcessPayload,
    );

    const { result } = renderHook(() => useUpdateProcess(), { wrapper });
    result.current.mutate({
      processId: PROCESS_ID,
      patch: { title: "Editado" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(adminProcessQueryKey(PROCESS_ID))?.isInvalidated,
    ).toBe(true);
  });
});

describe("useCreateStep / useUpdateStep / useDeleteStep", () => {
  it("create envia POST /admin/processes/:id/steps com sector_id+order", async () => {
    let body: unknown = null;
    server.use(
      http.post(
        `${BASE}/admin/processes/${PROCESS_ID}/steps`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(stepPayload);
        },
      ),
    );

    const { result } = renderHook(() => useCreateStep(), { wrapper });
    result.current.mutate({
      processId: PROCESS_ID,
      body: {
        sector_id: SECTOR_ID,
        order: 1,
        title: "Autuar",
        description: "Abertura",
        responsible: "Servidor",
        estimated_time: "1 dia",
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toMatchObject({ sector_id: SECTOR_ID, order: 1 });
  });

  it("update envia PATCH /admin/processes/:id/steps/:step_id", async () => {
    let url = "";
    server.use(
      http.patch(
        `${BASE}/admin/processes/${PROCESS_ID}/steps/${STEP_ID}`,
        ({ request }) => {
          url = request.url;
          return HttpResponse.json(stepPayload);
        },
      ),
    );

    const { result } = renderHook(() => useUpdateStep(), { wrapper });
    result.current.mutate({
      processId: PROCESS_ID,
      stepId: STEP_ID,
      patch: { title: "Editado" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(url).pathname).toBe(
      `/admin/processes/${PROCESS_ID}/steps/${STEP_ID}`,
    );
  });

  it("delete envia DELETE no endpoint correto e invalida o cache", async () => {
    server.use(
      http.delete(
        `${BASE}/admin/processes/${PROCESS_ID}/steps/${STEP_ID}`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    queryClient.setQueryData(
      adminProcessQueryKey(PROCESS_ID),
      adminProcessPayload,
    );

    const { result } = renderHook(() => useDeleteStep(), { wrapper });
    result.current.mutate({ processId: PROCESS_ID, stepId: STEP_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(adminProcessQueryKey(PROCESS_ID))?.isInvalidated,
    ).toBe(true);
  });
});

describe("useCreateResource / useDeleteResource", () => {
  it("create envia POST no endpoint aninhado de recursos", async () => {
    let url = "";
    let body: unknown = null;
    server.use(
      http.post(
        `${BASE}/admin/processes/${PROCESS_ID}/steps/${STEP_ID}/resources`,
        async ({ request }) => {
          url = request.url;
          body = await request.json();
          return HttpResponse.json(resourcePayload);
        },
      ),
    );

    const { result } = renderHook(() => useCreateResource(), { wrapper });
    result.current.mutate({
      processId: PROCESS_ID,
      stepId: STEP_ID,
      body: {
        type: "DOCUMENT",
        title: "Formulário",
        url: "https://example.org/f.pdf",
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(url).pathname).toBe(
      `/admin/processes/${PROCESS_ID}/steps/${STEP_ID}/resources`,
    );
    expect(body).toMatchObject({ type: "DOCUMENT" });
  });

  it("delete envia DELETE no endpoint do recurso", async () => {
    let url = "";
    server.use(
      http.delete(
        `${BASE}/admin/processes/${PROCESS_ID}/steps/${STEP_ID}/resources/${RESOURCE_ID}`,
        ({ request }) => {
          url = request.url;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    const { result } = renderHook(() => useDeleteResource(), { wrapper });
    result.current.mutate({
      processId: PROCESS_ID,
      stepId: STEP_ID,
      resourceId: RESOURCE_ID,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(url).pathname).toBe(
      `/admin/processes/${PROCESS_ID}/steps/${STEP_ID}/resources/${RESOURCE_ID}`,
    );
  });
});

describe("useAdminProcessesList", () => {
  it("busca a lista admin sem filtros via GET /admin/processes", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/admin/processes`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({
          processes: [adminProcessPayload],
          total: 1,
        });
      }),
    );

    const { result } = renderHook(() => useAdminProcessesList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(1);
    // Sem filtros, a query string deve estar vazia.
    expect(new URL(receivedUrl).search).toBe("");
  });

  it("propaga filtros de status e category na query string", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/admin/processes`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ processes: [], total: 0 });
      }),
    );

    const { result } = renderHook(
      () =>
        useAdminProcessesList({ status: "PUBLISHED", category: "RH" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const params = new URL(receivedUrl).searchParams;
    expect(params.get("status")).toBe("PUBLISHED");
    expect(params.get("category")).toBe("RH");
  });
});

describe("useSubmitProcessForReview", () => {
  it("envia POST submit-for-review e invalida lista + detalhe", async () => {
    server.use(
      http.post(
        `${BASE}/admin/processes/${PROCESS_ID}/submit-for-review`,
        () =>
          HttpResponse.json({ ...adminProcessPayload, status: "IN_REVIEW" }),
      ),
    );

    queryClient.setQueryData(
      adminProcessQueryKey(PROCESS_ID),
      adminProcessPayload,
    );
    queryClient.setQueryData(adminProcessesListQueryKey(), {
      processes: [adminProcessPayload],
      total: 1,
    });

    const { result } = renderHook(() => useSubmitProcessForReview(), {
      wrapper,
    });
    result.current.mutate({ processId: PROCESS_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryState(adminProcessQueryKey(PROCESS_ID))
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(adminProcessesListQueryKey())?.isInvalidated,
    ).toBe(true);
  });
});

describe("useApproveProcess", () => {
  it("envia POST approve e invalida caches admin + público", async () => {
    server.use(
      http.post(`${BASE}/admin/processes/${PROCESS_ID}/approve`, () =>
        HttpResponse.json({ ...adminProcessPayload, status: "PUBLISHED" }),
      ),
    );

    queryClient.setQueryData(["processes", { search: "", category: "ALL" }], {
      processes: [],
      total: 0,
    });

    const { result } = renderHook(() => useApproveProcess(), { wrapper });
    result.current.mutate({ processId: PROCESS_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // A lista pública também precisa revalidar — PUBLISHED faz o
    // processo aparecer para servidores.
    expect(
      queryClient.getQueryState([
        "processes",
        { search: "", category: "ALL" },
      ])?.isInvalidated,
    ).toBe(true);
  });
});

describe("useArchiveProcess", () => {
  it("envia DELETE /admin/processes/:id e invalida caches", async () => {
    server.use(
      http.delete(`${BASE}/admin/processes/${PROCESS_ID}`, () =>
        HttpResponse.json({ ...adminProcessPayload, status: "ARCHIVED" }),
      ),
    );

    queryClient.setQueryData(adminProcessesListQueryKey(), {
      processes: [adminProcessPayload],
      total: 1,
    });

    const { result } = renderHook(() => useArchiveProcess(), { wrapper });
    result.current.mutate({ processId: PROCESS_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("ARCHIVED");
    expect(
      queryClient.getQueryState(adminProcessesListQueryKey())?.isInvalidated,
    ).toBe(true);
  });
});
