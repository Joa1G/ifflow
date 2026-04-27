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
import { useMyProcesses } from "./use-my-processes";

const BASE = "http://localhost:8000";

const ownProcess = {
  id: "11111111-1111-4111-8111-111111111111",
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

describe("useMyProcesses", () => {
  it("busca a lista do autor sem filtros via GET /processes/mine", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/processes/mine`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ processes: [ownProcess], total: 1 });
      }),
    );

    const { result } = renderHook(() => useMyProcesses(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(1);
    expect(new URL(receivedUrl).search).toBe("");
  });

  it("propaga filtros de status e category na query string", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/processes/mine`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ processes: [], total: 0 });
      }),
    );

    const { result } = renderHook(
      () => useMyProcesses({ status: "DRAFT", category: "RH" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const params = new URL(receivedUrl).searchParams;
    expect(params.get("status")).toBe("DRAFT");
    expect(params.get("category")).toBe("RH");
  });
});
