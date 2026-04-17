import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
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

import { LoginForm } from "./login-form";
import { __resetApiClientForTests } from "../../lib/api-client";
import {
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../../stores/auth-store";

const BASE = "http://localhost:8000";

const mockUser: UserMe = {
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

function renderForm({
  initialPath = "/login",
  state,
}: {
  initialPath?: string;
  state?: unknown;
} = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[state ? { pathname: initialPath, state } : initialPath]}
      >
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/pending" element={<LocationProbe />} />
          <Route path="/" element={<LocationProbe />} />
          <Route path="/dashboard" element={<LocationProbe />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<LoginForm />", () => {
  it("renderiza campos de email, senha e botão Entrar", () => {
    renderForm();
    expect(screen.getByLabelText(/Email institucional/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Senha$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("bloqueia submit quando email é inválido (validação local)", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Email institucional/i), "xxx");
    await user.type(screen.getByLabelText(/^Senha$/i), "qualquersenha");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/Email inválido/i)).toBeInTheDocument();
  });

  it("bloqueia submit com senha vazia", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(/Senha é obrigatória/i),
    ).toBeInTheDocument();
  });

  it("em sucesso, salva token + user no store e redireciona para /", async () => {
    const user = userEvent.setup();
    let receivedBody: unknown = null;

    server.use(
      http.post(`${BASE}/auth/login`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          access_token: "tok-abc",
          token_type: "bearer",
          expires_in: 86400,
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            role: mockUser.role,
            sector: mockUser.sector,
          },
        });
      }),
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockUser)),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("/"),
    );

    expect(receivedBody).toEqual({
      email: "joana@ifam.edu.br",
      password: "senha123",
    });
    expect(useAuthStore.getState().token).toBe("tok-abc");
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it("redireciona para location.state.from quando veio de rota protegida", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json({
          access_token: "tok",
          token_type: "bearer",
          expires_in: 86400,
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            role: mockUser.role,
            sector: mockUser.sector,
          },
        }),
      ),
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockUser)),
    );

    renderForm({ state: { from: { pathname: "/dashboard" } } });

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("/dashboard"),
    );
  });

  it("em erro INVALID_CREDENTIALS exibe toast e não redireciona", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Credenciais inválidas",
            },
          },
          { status: 401 },
        ),
      ),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(/Email ou senha incorretos/i),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("em erro ACCOUNT_PENDING redireciona para /pending", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            error: {
              code: "ACCOUNT_PENDING",
              message: "Aguardando aprovação",
            },
          },
          { status: 403 },
        ),
      ),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("/pending"),
    );
  });

  it("em erro ACCOUNT_REJECTED exibe a mensagem do backend", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            error: {
              code: "ACCOUNT_REJECTED",
              message:
                "Sua conta foi rejeitada. Entre em contato com o administrador.",
            },
          },
          { status: 403 },
        ),
      ),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(/conta foi rejeitada/i),
    ).toBeInTheDocument();
  });

  it("em erro RATE_LIMITED exibe mensagem específica", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "Rate limit" } },
          { status: 429 },
        ),
      ),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(/Muitas tentativas/i),
    ).toBeInTheDocument();
  });

  it("em erro desconhecido exibe mensagem do backend", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "UNKNOWN_ERROR", message: "Algo específico deu errado" } },
          { status: 500 },
        ),
      ),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(/Algo específico deu errado/i),
    ).toBeInTheDocument();
  });

  it("desabilita o botão enquanto a mutation está pendente", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/login`, async () => {
        await delay(100);
        return HttpResponse.json({
          access_token: "t",
          token_type: "bearer",
          expires_in: 86400,
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            role: mockUser.role,
            sector: mockUser.sector,
          },
        });
      }),
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockUser)),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.type(screen.getByLabelText(/^Senha$/i), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const button = await screen.findByRole("button", { name: /Entrando/i });
    expect(button).toBeDisabled();

    // Esperar o fluxo completo (login + /auth/me) para evitar requests
    // disparando após o teardown de afterEach (que reseta os handlers).
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("/"),
    );
  });
});
