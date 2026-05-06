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
import { ApiError } from "../lib/api-error";
import { useAuthStore, wireAuthStoreToApiClient } from "../stores/auth-store";
import { useFollowing } from "./use-following";

const BASE = "http://localhost:8000";

const sampleItem = {
  process_id: "11111111-1111-4111-8111-111111111111",
  process_title: "Solicitação de Capacitação",
  process_short_description: "Curta",
  process_category: "RH" as const,
  process_status: "PUBLISHED" as const,
  completed_steps: 2,
  total_steps: 5,
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

describe("useFollowing", () => {
  it("busca a lista via GET /progress/mine e devolve o envelope `following`", async () => {
    let called = 0;
    server.use(
      http.get(`${BASE}/progress/mine`, () => {
        called += 1;
        return HttpResponse.json({ following: [sampleItem] });
      }),
    );

    const { result } = renderHook(() => useFollowing(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(called).toBe(1);
    expect(result.current.data?.following).toHaveLength(1);
    expect(result.current.data?.following[0]?.process_title).toBe(
      "Solicitação de Capacitação",
    );
  });

  it("propaga ApiError quando o backend devolve envelope de erro", async () => {
    server.use(
      http.get(`${BASE}/progress/mine`, () =>
        HttpResponse.json(
          {
            error: {
              code: "UNAUTHENTICATED",
              message: "Faça login novamente.",
              details: {},
            },
          },
          { status: 401 },
        ),
      ),
    );

    const { result } = renderHook(() => useFollowing(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.code).toBe("UNAUTHENTICATED");
  });
});
