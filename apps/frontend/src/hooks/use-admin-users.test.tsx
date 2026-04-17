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
  useAdminPendingUsers,
  useApproveUserMutation,
  useRejectUserMutation,
} from "./use-admin-users";

const BASE = "http://localhost:8000";

const pendingUserFixture = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "João da Silva",
  email: "joao.silva@ifam.edu.br",
  siape: "1234567",
  sector: "PROAD",
  created_at: "2026-04-15T10:00:00Z",
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    token: "admin-token",
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

describe("useAdminPendingUsers", () => {
  it("chama GET /admin/users/pending e devolve a lista", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [pendingUserFixture], total: 1 }),
      ),
    );

    const { result } = renderHook(() => useAdminPendingUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.users[0]?.email).toBe(
      "joao.silva@ifam.edu.br",
    );
  });

  it("propaga ApiError com code quando backend responde erro", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Voce nao tem permissao para esta acao.",
              details: {},
            },
          },
          { status: 403 },
        ),
      ),
    );

    const { result } = renderHook(() => useAdminPendingUsers(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("FORBIDDEN");
  });
});

describe("useApproveUserMutation", () => {
  it("chama POST /admin/users/{id}/approve e invalida a query", async () => {
    let getCalls = 0;
    server.use(
      http.get(`${BASE}/admin/users/pending`, () => {
        getCalls += 1;
        return HttpResponse.json({ users: [pendingUserFixture], total: 1 });
      }),
      http.post(
        `${BASE}/admin/users/${pendingUserFixture.id}/approve`,
        () =>
          HttpResponse.json({ id: pendingUserFixture.id, status: "APPROVED" }),
      ),
    );

    const query = renderHook(() => useAdminPendingUsers(), { wrapper });
    await waitFor(() => expect(query.result.current.isSuccess).toBe(true));
    expect(getCalls).toBe(1);

    const { result } = renderHook(() => useApproveUserMutation(), { wrapper });
    await result.current.mutateAsync(pendingUserFixture.id);

    // onSettled invalida — a query refaz automaticamente.
    await waitFor(() => expect(getCalls).toBe(2));
  });
});

describe("useRejectUserMutation", () => {
  it("envia reason no body quando informado", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(
        `${BASE}/admin/users/${pendingUserFixture.id}/reject`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            id: pendingUserFixture.id,
            status: "REJECTED",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRejectUserMutation(), { wrapper });
    await result.current.mutateAsync({
      userId: pendingUserFixture.id,
      reason: "SIAPE nao confere",
    });

    expect(receivedBody).toEqual({ reason: "SIAPE nao confere" });
  });

  it("envia body vazio quando reason e omitido", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(
        `${BASE}/admin/users/${pendingUserFixture.id}/reject`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            id: pendingUserFixture.id,
            status: "REJECTED",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRejectUserMutation(), { wrapper });
    await result.current.mutateAsync({ userId: pendingUserFixture.id });

    // Sem reason: body e objeto vazio, nao contem o campo `reason`.
    expect(receivedBody).toEqual({});
  });

  it("invalida a query de pending users em sucesso", async () => {
    let getCalls = 0;
    server.use(
      http.get(`${BASE}/admin/users/pending`, () => {
        getCalls += 1;
        return HttpResponse.json({ users: [pendingUserFixture], total: 1 });
      }),
      http.post(
        `${BASE}/admin/users/${pendingUserFixture.id}/reject`,
        () =>
          HttpResponse.json({ id: pendingUserFixture.id, status: "REJECTED" }),
      ),
    );

    const query = renderHook(() => useAdminPendingUsers(), { wrapper });
    await waitFor(() => expect(query.result.current.isSuccess).toBe(true));
    expect(getCalls).toBe(1);

    const mutation = renderHook(() => useRejectUserMutation(), { wrapper });
    await mutation.result.current.mutateAsync({
      userId: pendingUserFixture.id,
    });

    await waitFor(() => expect(getCalls).toBe(2));
  });
});
