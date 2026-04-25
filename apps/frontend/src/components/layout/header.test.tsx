import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
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

import { Header } from "./header";
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
});
afterEach(() => {
  server.resetHandlers();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{location.pathname}</div>;
}

function setUser(user: UserMe | null) {
  if (user) {
    useAuthStore.setState({ token: "t", user, isHydrating: false });
  } else {
    useAuthStore.setState({ token: null, user: null, isHydrating: false });
  }
}

function renderHeader(initialPath = "/") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Header />
        <Routes>
          <Route path="/" element={<LocationProbe />} />
          <Route path="/login" element={<LocationProbe />} />
          <Route path="/admin/users" element={<LocationProbe />} />
          <Route path="/super-admin/roles" element={<LocationProbe />} />
          <Route path="/something" element={<LocationProbe />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<Header />", () => {
  it("sem user: mostra botões Cadastrar e Entrar apontando para as respectivas rotas", () => {
    setUser(null);
    renderHeader();

    const cadastrar = screen.getByRole("link", { name: "Cadastrar" });
    expect(cadastrar).toBeInTheDocument();
    expect(cadastrar).toHaveAttribute("href", "/register");

    const entrar = screen.getByRole("link", { name: "Entrar" });
    expect(entrar).toBeInTheDocument();
    expect(entrar).toHaveAttribute("href", "/login");
    expect(
      screen.queryByRole("button", { name: /Menu do usuário/i }),
    ).not.toBeInTheDocument();
  });

  it("com user USER: mostra dropdown com nome e email, sem links admin", async () => {
    const user = userEvent.setup();
    setUser(baseUser);
    renderHeader();

    expect(
      screen.queryByRole("link", { name: "Entrar" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Menu do usuário/i }));

    expect(await screen.findByText(baseUser.name)).toBeInTheDocument();
    expect(screen.getByText(baseUser.email)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Sair/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Usuários pendentes/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Processos \(Admin\)/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Gerenciar papéis/i }),
    ).not.toBeInTheDocument();
  });

  it("com user ADMIN: mostra links admin mas não Gerenciar papéis", async () => {
    const user = userEvent.setup();
    setUser({ ...baseUser, role: "ADMIN" });
    renderHeader();

    await user.click(screen.getByRole("button", { name: /Menu do usuário/i }));

    expect(
      await screen.findByRole("menuitem", { name: /Processos \(Admin\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Usuários pendentes/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Gerenciar papéis/i }),
    ).not.toBeInTheDocument();
  });

  it("com user SUPER_ADMIN: mostra links admin e Gerenciar papéis", async () => {
    const user = userEvent.setup();
    setUser({ ...baseUser, role: "SUPER_ADMIN" });
    renderHeader();

    await user.click(screen.getByRole("button", { name: /Menu do usuário/i }));

    expect(
      await screen.findByRole("menuitem", { name: /Processos \(Admin\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Usuários pendentes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Gerenciar papéis/i }),
    ).toBeInTheDocument();
  });

  it("clicar em Sair chama logout e redireciona para /", async () => {
    const user = userEvent.setup();
    setUser(baseUser);
    renderHeader("/something");

    await user.click(screen.getByRole("button", { name: /Menu do usuário/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /Sair/i }),
    );

    await waitFor(() => {
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("/");
    expect(await screen.findByText(/Sessão encerrada/i)).toBeInTheDocument();
  });
});
