import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

import App from "../App";
import { __resetApiClientForTests } from "../lib/api-client";
import {
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../stores/auth-store";

const BASE = "http://localhost:8000";

const mockSuperAdmin: UserMe = {
  id: "99999999-9999-9999-9999-999999999999",
  name: "Super Admin",
  email: "sa@ifam.edu.br",
  siape: "0000001",
  sector: "PROAD",
  role: "SUPER_ADMIN",
  status: "APPROVED",
  created_at: "2026-04-17T12:00:00Z",
};

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
    defaultOptions: { queries: { retry: false } },
  });
});
afterEach(() => {
  server.resetHandlers();
});

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("<App /> — rotas públicas", () => {
  const stubRoutes: ReadonlyArray<readonly [string, string]> = [
    ["/", "HomePage"],
    ["/processes/abc-123", "ProcessDetailPage"],
    ["/forbidden", "ForbiddenPage"],
    ["/rota-inexistente", "NotFoundPage"],
  ];

  it.each(stubRoutes)("renderiza %s → %s", (path, expected) => {
    renderAt(path);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("renderiza /login → LoginPage (real)", () => {
    renderAt("/login");
    expect(
      screen.getByRole("heading", { level: 1, name: "Entrar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("renderiza /register → RegisterPage (real)", () => {
    renderAt("/register");
    expect(
      screen.getByRole("heading", { level: 1, name: "Criar conta" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: /cadastro/i }),
    ).toBeInTheDocument();
  });

  it("renderiza /pending → PendingPage", () => {
    renderAt("/pending");
    expect(
      screen.getByRole("heading", { level: 1, name: /Aguardando aprovação/i }),
    ).toBeInTheDocument();
  });

  it("renderiza /reset-password → ResetPasswordPage (real)", () => {
    renderAt("/reset-password");
    expect(
      screen.getByRole("heading", { level: 1, name: "Recuperar senha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: /recuperação de senha/i }),
    ).toBeInTheDocument();
  });

  it("/reset-password com ?token= redireciona para /reset-password/confirm", () => {
    renderAt("/reset-password?token=abc123");
    expect(
      screen.getByRole("heading", { level: 1, name: "Definir nova senha" }),
    ).toBeInTheDocument();
  });

  it("renderiza /reset-password/confirm com token → página real", () => {
    renderAt("/reset-password/confirm?token=abc123");
    expect(
      screen.getByRole("heading", { level: 1, name: "Definir nova senha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: /redefinição de senha/i }),
    ).toBeInTheDocument();
  });

  it("/reset-password/confirm sem token redireciona para /reset-password", () => {
    renderAt("/reset-password/confirm");
    expect(
      screen.getByRole("heading", { level: 1, name: "Recuperar senha" }),
    ).toBeInTheDocument();
  });
});

describe("<App /> — rotas protegidas (autenticado como SUPER_ADMIN)", () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: "t",
      user: mockSuperAdmin,
      isHydrating: false,
    });
    server.use(
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockSuperAdmin)),
    );
  });

  const protectedRoutes: ReadonlyArray<readonly [string, string]> = [
    ["/processes/abc-123/flow", "ProcessFlowPage"],
    ["/admin/processes", "AdminProcessesPage"],
    ["/admin/processes/new", "ProcessEditorPage"],
    ["/admin/processes/xyz/edit", "ProcessEditorPage"],
    ["/super-admin/roles", "SuperAdminRolesPage"],
  ];

  it.each(protectedRoutes)("renderiza %s → %s", async (path, expected) => {
    renderAt(path);
    await waitFor(() =>
      expect(screen.getByText(expected)).toBeInTheDocument(),
    );
  });

  it("renderiza /admin/users → AdminUsersPage (real)", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [], total: 0 }),
      ),
    );
    renderAt("/admin/users");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Cadastros pendentes" }),
      ).toBeInTheDocument(),
    );
  });
});

describe("<App /> — rotas protegidas sem autenticação", () => {
  it("redireciona /admin/users para /login", () => {
    renderAt("/admin/users");
    expect(
      screen.getByRole("heading", { level: 1, name: "Entrar" }),
    ).toBeInTheDocument();
  });

  it("redireciona /super-admin/roles para /login", () => {
    renderAt("/super-admin/roles");
    expect(
      screen.getByRole("heading", { level: 1, name: "Entrar" }),
    ).toBeInTheDocument();
  });

  it("redireciona /processes/:id/flow para /login", () => {
    renderAt("/processes/abc/flow");
    expect(
      screen.getByRole("heading", { level: 1, name: "Entrar" }),
    ).toBeInTheDocument();
  });
});

describe("<App /> — rotas protegidas com role insuficiente", () => {
  beforeEach(() => {
    const regular: UserMe = { ...mockSuperAdmin, role: "USER" };
    useAuthStore.setState({ token: "t", user: regular, isHydrating: false });
    server.use(
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(regular)),
    );
  });

  it("USER em /admin/users é enviado para /forbidden", async () => {
    renderAt("/admin/users");
    await waitFor(() =>
      expect(screen.getByText("ForbiddenPage")).toBeInTheDocument(),
    );
  });

  it("USER em /super-admin/roles é enviado para /forbidden", async () => {
    renderAt("/super-admin/roles");
    await waitFor(() =>
      expect(screen.getByText("ForbiddenPage")).toBeInTheDocument(),
    );
  });
});
