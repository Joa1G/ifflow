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

import { PasswordResetConfirmForm } from "./password-reset-confirm-form";
import { __resetApiClientForTests } from "../../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";

const BASE = "http://localhost:8000";
const TOKEN = "tok-reset-abc";

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
      <MemoryRouter initialEntries={["/reset-password/confirm"]}>
        <Routes>
          <Route
            path="/reset-password/confirm"
            element={<PasswordResetConfirmForm token={TOKEN} />}
          />
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password = "novasenha123",
  confirmation = "novasenha123",
) {
  await user.type(screen.getByLabelText(/^Nova senha$/i), password);
  await user.type(screen.getByLabelText(/Confirmar nova senha/i), confirmation);
  await user.click(screen.getByRole("button", { name: /Redefinir senha/i }));
}

describe("<PasswordResetConfirmForm />", () => {
  it("em sucesso envia token + senha e redireciona para /login", async () => {
    const user = userEvent.setup();
    let receivedBody: unknown = null;

    server.use(
      http.post(`${BASE}/auth/reset-password`, async ({ request }) => {
        receivedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderForm();
    await fillAndSubmit(user);

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("/login"),
    );

    expect(receivedBody).toEqual({
      token: TOKEN,
      new_password: "novasenha123",
      new_password_confirmation: "novasenha123",
    });
  });

  it("validação local bloqueia senhas que não conferem", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user, "novasenha123", "outra-senha123");

    expect(
      await screen.findByText(/As senhas não conferem/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("em INVALID_RESET_TOKEN mostra mensagem genérica e não redireciona", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/auth/reset-password`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_RESET_TOKEN",
              message: "Token de redefinicao invalido ou expirado.",
            },
          },
          { status: 400 },
        ),
      ),
    );

    renderForm();
    await fillAndSubmit(user);

    expect(
      await screen.findByText(/Link inválido ou expirado/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("em WEAK_PASSWORD exibe erro no campo nova senha", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/auth/reset-password`, () =>
        HttpResponse.json(
          {
            error: {
              code: "WEAK_PASSWORD",
              message: "Senha muito comum. Escolha outra.",
            },
          },
          { status: 400 },
        ),
      ),
    );

    renderForm();
    await fillAndSubmit(user);

    expect(
      await screen.findByText(/Senha muito comum/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });
});
