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
import { ProcessRowActions } from "./process-row-actions";

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

function renderActions(
  status: ProcessStatus,
  mode: "admin" | "owner" = "admin",
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProcessRowActions process={makeProcess(status)} mode={mode} />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", {
      name: /Ações para Solicitação de Capacitação/i,
    }),
  );
  return user;
}

describe("<ProcessRowActions />", () => {
  it("DRAFT mostra Submeter para revisão e Arquivar; esconde Aprovar", async () => {
    renderActions("DRAFT");
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Editar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Submeter para revisão/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Arquivar/i }),
    ).toBeInTheDocument();
  });

  it("IN_REVIEW mostra Aprovar publicação; esconde Submeter", async () => {
    renderActions("IN_REVIEW");
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Aprovar publicação/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Submeter para revisão/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Arquivar/i }),
    ).toBeInTheDocument();
  });

  it("PUBLISHED só mostra Editar e Arquivar", async () => {
    renderActions("PUBLISHED");
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Editar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Arquivar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Submeter para revisão/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();
  });

  it("ARCHIVED só mostra Editar (sem ações de transição)", async () => {
    renderActions("ARCHIVED");
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Editar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Arquivar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Submeter para revisão/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();
  });

  it("Submeter para revisão chama POST /processes/:id/submit-for-review", async () => {
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

    renderActions("DRAFT");
    const user = await openMenu();
    await user.click(
      screen.getByRole("menuitem", { name: /Submeter para revisão/i }),
    );

    await waitFor(() => expect(called).toBe(true));
  });

  it("clicar em Arquivar abre AlertDialog antes de chamar a API", async () => {
    let called = false;
    server.use(
      http.delete(`${BASE}/processes/${PROCESS_ID}`, () => {
        called = true;
        return HttpResponse.json({
          ...makeProcess("PUBLISHED"),
          status: "ARCHIVED",
        });
      }),
    );

    renderActions("PUBLISHED");
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: /Arquivar/i }));

    // Dialog aparece e API ainda não foi chamada.
    expect(
      screen.getByRole("alertdialog", { name: /Arquivar este processo/i }),
    ).toBeInTheDocument();
    expect(called).toBe(false);

    await user.click(
      screen.getByRole("button", { name: /Arquivar processo/i }),
    );

    await waitFor(() => expect(called).toBe(true));
  });
});

describe('<ProcessRowActions mode="owner" />', () => {
  it("DRAFT em owner: Edit aponta para /processes/:id/edit, com Submeter e Arquivar", async () => {
    renderActions("DRAFT", "owner");
    await openMenu();

    const editar = screen.getByRole("menuitem", { name: /Editar/i });
    expect(editar).toHaveAttribute("href", `/processes/${PROCESS_ID}/edit`);
    expect(
      screen.getByRole("menuitem", { name: /Submeter para revisão/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Retirar da revisão/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Arquivar/i }),
    ).toBeInTheDocument();
  });

  it("IN_REVIEW em owner: clicar em Retirar da revisão chama POST /processes/:id/withdraw", async () => {
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

    renderActions("IN_REVIEW", "owner");
    const user = await openMenu();
    expect(
      screen.queryByRole("menuitem", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("menuitem", { name: /Retirar da revisão/i }),
    );

    await waitFor(() => expect(called).toBe(true));
  });

  it("PUBLISHED em owner: não mostra Arquivar (só admin pode)", async () => {
    renderActions("PUBLISHED", "owner");
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Editar/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Arquivar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Submeter para revisão/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Aprovar publicação/i }),
    ).not.toBeInTheDocument();
  });
});
