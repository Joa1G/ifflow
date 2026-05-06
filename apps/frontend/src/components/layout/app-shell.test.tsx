import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { AppShell } from "./app-shell";
import { __resetApiClientForTests } from "../../lib/api-client";
import {
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../../stores/auth-store";

const BASE = "http://localhost:8000";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isHydrating: false });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  server.use(
    http.get(`${BASE}/admin/users/pending`, () =>
      HttpResponse.json({ users: [], total: 0 }),
    ),
    http.get(`${BASE}/admin/processes`, () =>
      HttpResponse.json({ processes: [], total: 0 }),
    ),
  );
});

afterEach(() => server.resetHandlers());

function renderShell(path = "/") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell>
          <div data-testid="page">conteúdo da página</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<AppShell />", () => {
  it("rotas comuns: renderiza topbar (logo + selo PROAD) + sidebar + conteúdo", () => {
    renderShell("/");

    expect(
      screen.getByRole("link", { name: /IFFLOW.*ir para o cat/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/PROAD · IFAM/i)).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: /Navegação principal/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("rotas de auth: oculta topbar e sidebar (chrome próprio do shell de login/cadastro)", () => {
    renderShell("/login");

    expect(
      screen.queryByRole("link", { name: /IFFLOW.*ir para o cat/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: /Navegação principal/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it.each([
    "/login",
    "/register",
    "/pending",
    "/reset-password",
    "/reset-password/confirm",
  ])("rota %s não renderiza o chrome global", (path) => {
    renderShell(path);
    expect(
      screen.queryByRole("navigation", { name: /Navegação principal/i }),
    ).not.toBeInTheDocument();
  });

  it("toggle persiste o estado colapsado em localStorage", async () => {
    const user = userEvent.setup();
    renderShell("/");

    expect(localStorage.getItem("ifflow:sidebar-collapsed")).toBe("0");

    await user.click(screen.getByRole("button", { name: /Recolher menu/i }));
    expect(localStorage.getItem("ifflow:sidebar-collapsed")).toBe("1");

    await user.click(screen.getByRole("button", { name: /Expandir menu/i }));
    expect(localStorage.getItem("ifflow:sidebar-collapsed")).toBe("0");
  });

  it("hidrata estado colapsado a partir do localStorage no primeiro render", () => {
    localStorage.setItem("ifflow:sidebar-collapsed", "1");
    renderShell("/");

    expect(
      screen.getByRole("button", { name: /Expandir menu/i }),
    ).toBeInTheDocument();
  });

  it("hamburger mobile abre overlay com role=dialog e Esc fecha", async () => {
    const user = userEvent.setup();
    renderShell("/");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Abrir menu/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
