import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
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

import { RegisterForm } from "./register-form";
import { __resetApiClientForTests } from "../../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";

const BASE = "http://localhost:8000";

const validPayload = {
  name: "Joana Teste",
  email: "joana@ifam.edu.br",
  siape: "1234567",
  sector: "PROAD",
  password: "senhaforte123",
  password_confirmation: "senhaforte123",
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

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/pending" element={<LocationProbe />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<typeof validPayload> = {},
) {
  const data = { ...validPayload, ...overrides };
  await user.type(screen.getByLabelText(/Nome completo/i), data.name);
  await user.type(screen.getByLabelText(/Email institucional/i), data.email);
  await user.type(screen.getByLabelText(/SIAPE/i), data.siape);
  await user.type(screen.getByLabelText(/Setor/i), data.sector);
  await user.type(screen.getByLabelText(/^Senha$/i), data.password);
  await user.type(
    screen.getByLabelText(/Confirmar senha/i),
    data.password_confirmation,
  );
}

describe("<RegisterForm />", () => {
  it("form válido dispara mutation e redireciona para /pending", async () => {
    const user = userEvent.setup();
    let receivedBody: unknown = null;

    server.use(
      http.post(`${BASE}/auth/register`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(
          {
            id: "11111111-1111-1111-1111-111111111111",
            name: validPayload.name,
            email: validPayload.email,
            status: "PENDING",
            message: "Cadastro recebido. Aguarde aprovação do administrador.",
          },
          { status: 201 },
        );
      }),
    );

    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("/pending"),
    );

    expect(receivedBody).toEqual(validPayload);
  });

  it("erro EMAIL_ALREADY_EXISTS mostra mensagem no campo email", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/auth/register`, () =>
        HttpResponse.json(
          {
            error: {
              code: "EMAIL_ALREADY_EXISTS",
              message: "Email já cadastrado",
            },
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByText(/Este email já está cadastrado/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("validação local bloqueia email sem @ifam.edu.br", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillForm(user, { email: "joana@gmail.com" });
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByText(/domínio @ifam\.edu\.br/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });
});
