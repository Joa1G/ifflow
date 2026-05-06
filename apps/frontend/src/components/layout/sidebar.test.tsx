import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Sidebar } from "./sidebar";
import { __resetApiClientForTests } from "../../lib/api-client";
import {
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../../stores/auth-store";

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
  // Mocks padrão do badge admin (a Sidebar dispara as queries assim que
  // monta para um user ADMIN/SUPER_ADMIN). Cada teste pode sobrescrever.
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

function setUser(user: UserMe | null) {
  if (user) {
    useAuthStore.setState({ token: "t", user, isHydrating: false });
  } else {
    useAuthStore.setState({ token: null, user: null, isHydrating: false });
  }
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{location.pathname}</div>;
}

interface RenderOptions {
  collapsed?: boolean;
  onToggle?: () => void;
  initialPath?: string;
}

function renderSidebar({
  collapsed = false,
  onToggle,
  initialPath = "/",
}: RenderOptions = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={onToggle ?? vi.fn()}
        />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<Sidebar />", () => {
  it("anônimo: mostra apenas Catálogo + CTAs Entrar e Cadastrar", () => {
    setUser(null);
    renderSidebar();

    const nav = screen.getByRole("navigation", { name: /Navegação principal/i });
    expect(within(nav).getByRole("link", { name: "Catálogo" })).toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: /Processos que criei/i }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByText(/Administração/i),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Cadastrar" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("USER autenticado: mostra atalhos de processos e dropdown de perfil, sem seção admin", async () => {
    const user = userEvent.setup();
    setUser(baseUser);
    renderSidebar();

    expect(
      screen.getByRole("link", { name: /Processos que criei/i }),
    ).toHaveAttribute("href", "/processes/mine");
    expect(
      screen.getByRole("link", { name: /Processos que acompanho/i }),
    ).toHaveAttribute("href", "/processes/following");
    expect(screen.getByRole("link", { name: /Criar processo/i })).toHaveAttribute(
      "href",
      "/processes/new",
    );
    expect(screen.queryByText(/Administração/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Menu do usuário/i }));
    // O email aparece em dois lugares quando expandido: o trigger (sempre
    // visível) e o dropdown (após o click). A verificação de que a segunda
    // cópia surgiu é a prova de que o menu abriu.
    await waitFor(() =>
      expect(screen.getAllByText(baseUser.email)).toHaveLength(2),
    );
    expect(screen.getByRole("menuitem", { name: /Sair/i })).toBeInTheDocument();
  });

  it("ADMIN: mostra seção Administração com badges quando há pendências", async () => {
    server.use(
      http.get(`${BASE}/admin/users/pending`, () =>
        HttpResponse.json({ users: [], total: 3 }),
      ),
      http.get(`${BASE}/admin/processes`, () =>
        HttpResponse.json({ processes: [], total: 2 }),
      ),
    );
    setUser({ ...baseUser, role: "ADMIN" });
    renderSidebar();

    const usersLink = await screen.findByRole("link", {
      name: /Usuários pendentes/i,
    });
    expect(usersLink).toHaveAttribute("href", "/admin/users");
    await waitFor(() => expect(usersLink).toHaveTextContent("3"));

    const processesLink = screen.getByRole("link", {
      name: /Processos \(Admin\)/i,
    });
    expect(processesLink).toHaveAttribute("href", "/admin/processes");
    await waitFor(() => expect(processesLink).toHaveTextContent("2"));

    // ADMIN não vê o item de super admin.
    expect(
      screen.queryByRole("link", { name: /Papéis & permissões/i }),
    ).not.toBeInTheDocument();
  });

  it("SUPER_ADMIN: vê seção Super admin e Papéis & permissões", () => {
    setUser({ ...baseUser, role: "SUPER_ADMIN" });
    renderSidebar();

    expect(
      screen.getByRole("link", { name: /Papéis & permissões/i }),
    ).toHaveAttribute("href", "/super-admin/roles");
  });

  it("destaca o item ativo (aria-current='page') conforme a rota", () => {
    setUser(baseUser);
    renderSidebar({ initialPath: "/processes/mine" });

    const mine = screen.getByRole("link", { name: /Processos que criei/i });
    expect(mine).toHaveAttribute("aria-current", "page");

    const catalog = screen.getByRole("link", { name: "Catálogo" });
    expect(catalog).not.toHaveAttribute("aria-current");
  });

  it("Catálogo só fica ativo na raiz exata, não em sub-rotas /processes/*", () => {
    setUser(baseUser);
    renderSidebar({ initialPath: "/processes/mine" });
    expect(
      screen.getByRole("link", { name: "Catálogo" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("colapsado: oculta os labels (rótulos vão pro `title`) mas mantém os links acessíveis", () => {
    setUser(baseUser);
    renderSidebar({ collapsed: true });

    const mine = screen.getByRole("link", { name: /Processos que criei/i });
    expect(mine).toHaveAttribute("title", "Processos que criei");
    // No estado colapsado, o texto visível some — `accessible name`
    // continua funcionando via `title`.
    expect(mine).not.toHaveTextContent("Processos que criei");
  });

  it("clicar no toggle chama onToggleCollapsed", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    setUser(baseUser);
    renderSidebar({ onToggle: toggle });

    await user.click(screen.getByRole("button", { name: /Recolher menu/i }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("colapsado: o toggle troca o aria-label para 'Expandir menu'", () => {
    setUser(baseUser);
    renderSidebar({ collapsed: true });
    expect(
      screen.getByRole("button", { name: /Expandir menu/i }),
    ).toBeInTheDocument();
  });

  it("clicar em Sair faz logout e mostra toast", async () => {
    const user = userEvent.setup();
    setUser(baseUser);
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /Menu do usuário/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Sair/i }));

    await waitFor(() => {
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
    });
    expect(await screen.findByText(/Sessão encerrada/i)).toBeInTheDocument();
  });
});
