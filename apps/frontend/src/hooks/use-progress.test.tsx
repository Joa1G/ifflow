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
  progressQueryKey,
  useProgress,
  useUpdateStepStatus,
} from "./use-progress";

const BASE = "http://localhost:8000";

const PROCESS_ID = "11111111-1111-1111-1111-111111111111";
const STEP_ID = "22222222-2222-2222-2222-222222222222";

const progressPayload = {
  id: "33333333-3333-3333-3333-333333333333",
  process_id: PROCESS_ID,
  step_statuses: {
    [STEP_ID]: "PENDING",
    "44444444-4444-4444-4444-444444444444": "COMPLETED",
  },
  last_updated: "2026-04-21T10:00:00Z",
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

describe("useProgress", () => {
  it("chama GET /progress/{processId} autenticado e devolve o progresso", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${BASE}/progress/${PROCESS_ID}`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json(progressPayload);
      }),
    );

    const { result } = renderHook(() => useProgress(PROCESS_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authHeader).toBe("Bearer user-token");
    expect(result.current.data?.process_id).toBe(PROCESS_ID);
    expect(result.current.data?.step_statuses[STEP_ID]).toBe("PENDING");
  });

  it("não dispara requisição quando processId é undefined", async () => {
    let called = false;
    server.use(
      http.get(`${BASE}/progress/:processId`, () => {
        called = true;
        return HttpResponse.json(progressPayload);
      }),
    );

    const { result } = renderHook(() => useProgress(undefined), { wrapper });

    // Sem id a query fica em `idle` — seguindo o padrão de useProcess.
    expect(result.current.fetchStatus).toBe("idle");
    expect(called).toBe(false);
  });

  it("propaga ApiError 401 UNAUTHENTICATED quando o token é inválido", async () => {
    server.use(
      http.get(`${BASE}/progress/${PROCESS_ID}`, () =>
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

    const { result } = renderHook(() => useProgress(PROCESS_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("UNAUTHENTICATED");
    expect(result.current.error?.status).toBe(401);
  });
});

describe("useUpdateStepStatus", () => {
  it("envia PATCH com body {status} e invalida o cache do progresso ao concluir", async () => {
    let receivedBody: unknown = null;
    let patchUrl = "";
    server.use(
      http.patch(
        `${BASE}/progress/${PROCESS_ID}/steps/${STEP_ID}`,
        async ({ request }) => {
          patchUrl = request.url;
          receivedBody = await request.json();
          return HttpResponse.json({
            ...progressPayload,
            step_statuses: { ...progressPayload.step_statuses, [STEP_ID]: "COMPLETED" },
          });
        },
      ),
    );

    // Popula o cache com um valor conhecido para poder observar a invalidação.
    queryClient.setQueryData(progressQueryKey(PROCESS_ID), progressPayload);

    const { result } = renderHook(() => useUpdateStepStatus(), { wrapper });

    result.current.mutate({
      processId: PROCESS_ID,
      stepId: STEP_ID,
      status: "COMPLETED",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(patchUrl).pathname).toBe(
      `/progress/${PROCESS_ID}/steps/${STEP_ID}`,
    );
    expect(receivedBody).toEqual({ status: "COMPLETED" });

    // Após onSettled, a entrada fica marcada como stale e seria refetchada
    // no próximo mount. Como a query nunca foi montada pelo hook neste
    // teste (só usamos setQueryData), checar o estado via queryClient.
    const state = queryClient.getQueryState(progressQueryKey(PROCESS_ID));
    expect(state?.isInvalidated).toBe(true);
  });

  it("não envia user_id nem process_id no body (apenas o status)", async () => {
    let receivedBody: Record<string, unknown> = {};
    server.use(
      http.patch(
        `${BASE}/progress/${PROCESS_ID}/steps/${STEP_ID}`,
        async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(progressPayload);
        },
      ),
    );

    const { result } = renderHook(() => useUpdateStepStatus(), { wrapper });

    result.current.mutate({
      processId: PROCESS_ID,
      stepId: STEP_ID,
      status: "IN_PROGRESS",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Object.keys(receivedBody).sort()).toEqual(["status"]);
    expect(receivedBody.status).toBe("IN_PROGRESS");
  });

  it("invalida o cache mesmo quando a requisição falha", async () => {
    server.use(
      http.patch(
        `${BASE}/progress/${PROCESS_ID}/steps/${STEP_ID}`,
        () =>
          HttpResponse.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: "step_id não pertence ao process_id informado.",
                details: {},
              },
            },
            { status: 400 },
          ),
      ),
    );

    queryClient.setQueryData(progressQueryKey(PROCESS_ID), progressPayload);

    const { result } = renderHook(() => useUpdateStepStatus(), { wrapper });

    result.current.mutate({
      processId: PROCESS_ID,
      stepId: STEP_ID,
      status: "COMPLETED",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("VALIDATION_ERROR");
    const state = queryClient.getQueryState(progressQueryKey(PROCESS_ID));
    expect(state?.isInvalidated).toBe(true);
  });
});
