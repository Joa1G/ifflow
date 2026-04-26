import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
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
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";
import type { components } from "../../types/api";
import { ProcessTransitionBar } from "./process-transition-bar";

type ProcessAdminView = components["schemas"]["ProcessAdminView"];
type ProcessStatus = components["schemas"]["ProcessStatus"];

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";

function makeProcess(status: ProcessStatus): ProcessAdminView {
  return {
    id: PROCESS_ID,
    title: "Solicitação de Capacitação",
    short_description: "Curta",
    full_description: "Completa",
    category: "RH",
    estimated_time: "30 dias",
    requirements: [],
    status,
    access_count: 0,
    created_by: "00000000-0000-4000-8000-000000000000",
    approved_by: null,
    created_at: "2026-04-21T10:00:00Z",
    updated_at: "2026-04-21T10:00:00Z",
  };
}

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

function renderBar(status: ProcessStatus, mode: "admin" | "owner") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProcessTransitionBar process={makeProcess(status)} mode={mode} />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<ProcessTransitionBar />", () => {
  it("DRAFT owner: clicar em Submeter chama POST /processes/:id/submit-for-review", async () => {
    let called = false;
    server.use(
      http.post(
        `${BASE}/processes/${PROCESS_ID}/submit-for-review`,
        () => {
          called = true;
          return HttpResponse.json({
            ...makeProcess("DRAFT"),
            status: "IN_REVIEW",
          });
        },
      ),
    );

    const user = userEvent.setup();
    renderBar("DRAFT", "owner");

    expect(
      screen.getByRole("button", { name: /Arquivar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Submeter para revisão/i }),
    );

    await waitFor(() => expect(called).toBe(true));
  });

  it("IN_REVIEW owner: tem Retirar (não Aprovar) e dispara POST /withdraw", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/processes/${PROCESS_ID}/withdraw`, () => {
        called = true;
        return HttpResponse.json({
          ...makeProcess("IN_REVIEW"),
          status: "DRAFT",
        });
      }),
    );

    const user = userEvent.setup();
    renderBar("IN_REVIEW", "owner");

    expect(
      screen.queryByRole("button", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Submeter para revisão/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Retirar da revisão/i }),
    );

    await waitFor(() => expect(called).toBe(true));
  });

  it("IN_REVIEW admin: tem Aprovar publicação (não Retirar) e dispara POST /admin/processes/:id/approve", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/admin/processes/${PROCESS_ID}/approve`, () => {
        called = true;
        return HttpResponse.json({
          ...makeProcess("IN_REVIEW"),
          status: "PUBLISHED",
        });
      }),
    );

    const user = userEvent.setup();
    renderBar("IN_REVIEW", "admin");

    expect(
      screen.queryByRole("button", { name: /Retirar da revisão/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Aprovar publicação/i }),
    );

    await waitFor(() => expect(called).toBe(true));
  });
});
