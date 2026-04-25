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
  useApprovedUsers,
  useDemoteUser,
  usePromoteUser,
} from "./use-super-admin-users";

const BASE = "http://localhost:8000";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const userPayload = {
  id: USER_ID,
  name: "Maria de Souza",
  email: "maria.souza@ifam.edu.br",
  siape: "1234567",
  sector: "PROAD",
  role: "USER" as const,
  created_at: "2026-04-10T10:00:00Z",
};

const APPROVED_USERS_KEY = ["super-admin", "approved-users"] as const;

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

describe("useApprovedUsers", () => {
  it("busca a lista via GET /super-admin/users", async () => {
    server.use(
      http.get(`${BASE}/super-admin/users`, () =>
        HttpResponse.json({ users: [userPayload], total: 1 }),
      ),
    );

    const { result } = renderHook(() => useApprovedUsers(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.users[0]?.id).toBe(USER_ID);
  });

  it("propaga ApiError quando o backend devolve 403", async () => {
    server.use(
      http.get(`${BASE}/super-admin/users`, () =>
        HttpResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Apenas super administradores podem acessar.",
            },
          },
          { status: 403 },
        ),
      ),
    );

    const { result } = renderHook(() => useApprovedUsers(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("FORBIDDEN");
  });
});

describe("usePromoteUser", () => {
  it("chama POST /super-admin/users/:id/promote e invalida cache", async () => {
    let receivedUrl = "";
    server.use(
      http.post(
        `${BASE}/super-admin/users/${USER_ID}/promote`,
        ({ request }) => {
          receivedUrl = request.url;
          return HttpResponse.json({ id: USER_ID, role: "ADMIN" });
        },
      ),
    );

    queryClient.setQueryData(APPROVED_USERS_KEY, {
      users: [userPayload],
      total: 1,
    });

    const { result } = renderHook(() => usePromoteUser(), { wrapper });
    result.current.mutate(USER_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(receivedUrl).pathname).toBe(
      `/super-admin/users/${USER_ID}/promote`,
    );
    expect(result.current.data?.role).toBe("ADMIN");
    expect(
      queryClient.getQueryState(APPROVED_USERS_KEY)?.isInvalidated,
    ).toBe(true);
  });
});

describe("useDemoteUser", () => {
  it("chama POST /super-admin/users/:id/demote e invalida cache", async () => {
    server.use(
      http.post(`${BASE}/super-admin/users/${USER_ID}/demote`, () =>
        HttpResponse.json({ id: USER_ID, role: "USER" }),
      ),
    );

    queryClient.setQueryData(APPROVED_USERS_KEY, {
      users: [{ ...userPayload, role: "ADMIN" as const }],
      total: 1,
    });

    const { result } = renderHook(() => useDemoteUser(), { wrapper });
    result.current.mutate(USER_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.role).toBe("USER");
    expect(
      queryClient.getQueryState(APPROVED_USERS_KEY)?.isInvalidated,
    ).toBe(true);
  });

  it("invalida cache mesmo em erro de auto-rebaixamento (race entre tabs)", async () => {
    server.use(
      http.post(`${BASE}/super-admin/users/${USER_ID}/demote`, () =>
        HttpResponse.json(
          {
            error: {
              code: "CANNOT_DEMOTE_SELF",
              message: "Não é possível rebaixar a si mesmo.",
            },
          },
          { status: 403 },
        ),
      ),
    );

    queryClient.setQueryData(APPROVED_USERS_KEY, {
      users: [{ ...userPayload, role: "ADMIN" as const }],
      total: 1,
    });

    const { result } = renderHook(() => useDemoteUser(), { wrapper });
    result.current.mutate(USER_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryState(APPROVED_USERS_KEY)?.isInvalidated,
    ).toBe(true);
  });
});
