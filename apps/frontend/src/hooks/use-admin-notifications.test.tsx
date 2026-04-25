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
import {
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../stores/auth-store";
import { useAdminNotifications } from "./use-admin-notifications";

const BASE = "http://localhost:8000";

const baseUser: UserMe = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Joana Teste",
  email: "joana@ifam.edu.br",
  siape: "1234567",
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

describe("useAdminNotifications", () => {
  it("USER comum: não dispara queries admin (gated por role)", async () => {
    // Sem registrar handler — se as queries disparassem, MSW abortaria
    // com `onUnhandledRequest: "error"` e o teste falharia. O `enabled`
    // do hook é o que precisamos exercitar.
    useAuthStore.setState({
      token: "tok",
      user: baseUser,
      isHydrating: false,
    });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper });

    expect(result.current.pendingUsersCount).toBe(0);
    expect(result.current.pendingProcessesCount).toBe(0);
    expect(result.current.total).toBe(0);

    // Aguardar um tick para garantir que nenhuma query disparou
    // (se disparasse, MSW reclamaria assincronamente).
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.total).toBe(0);
  });

  it("usuário não autenticado: também não dispara queries", async () => {
    useAuthStore.setState({ token: null, user: null, isHydrating: false });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper });

    expect(result.current.total).toBe(0);
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.total).toBe(0);
  });

  it("ADMIN: soma pending users + IN_REVIEW processes", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [], total: 3 }),
      ),
      http.get(`${BASE}/admin/processes`, ({ request }) => {
        const url = new URL(request.url);
        // Confere que o filtro IN_REVIEW está sendo enviado — sem ele
        // o badge contaria DRAFT/PUBLISHED/ARCHIVED também.
        expect(url.searchParams.get("status")).toBe("IN_REVIEW");
        return HttpResponse.json({ processes: [], total: 2 });
      }),
    );

    useAuthStore.setState({
      token: "tok",
      user: { ...baseUser, role: "ADMIN" },
      isHydrating: false,
    });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBe(5));
    expect(result.current.pendingUsersCount).toBe(3);
    expect(result.current.pendingProcessesCount).toBe(2);
  });

  it("ADMIN com zero pendências: total é 0", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [], total: 0 }),
      ),
      http.get(`${BASE}/admin/processes`, () =>
        HttpResponse.json({ processes: [], total: 0 }),
      ),
    );

    useAuthStore.setState({
      token: "tok",
      user: { ...baseUser, role: "ADMIN" },
      isHydrating: false,
    });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.total).toBe(0);
  });

  it("SUPER_ADMIN: também conta (gate é ADMIN ou SUPER_ADMIN)", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [], total: 1 }),
      ),
      http.get(`${BASE}/admin/processes`, () =>
        HttpResponse.json({ processes: [], total: 0 }),
      ),
    );

    useAuthStore.setState({
      token: "tok",
      user: { ...baseUser, role: "SUPER_ADMIN" },
      isHydrating: false,
    });

    const { result } = renderHook(() => useAdminNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBe(1));
  });
});
