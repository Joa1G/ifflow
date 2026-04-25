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
import { useSectors } from "./use-sectors";

const BASE = "http://localhost:8000";

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
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => server.resetHandlers());

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useSectors", () => {
  it("retorna a lista de setores autenticados via Bearer", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${BASE}/sectors`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({
          sectors: [
            { id: "11111111-1111-4111-8111-111111111111", name: "PROAD", acronym: "PROAD" },
          ],
          total: 1,
        });
      }),
    );

    const { result } = renderHook(() => useSectors(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authHeader).toBe("Bearer t");
    expect(result.current.data?.total).toBe(1);
  });

  it("propaga ApiError em 401", async () => {
    server.use(
      http.get(`${BASE}/sectors`, () =>
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

    const { result } = renderHook(() => useSectors(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("UNAUTHENTICATED");
  });
});
