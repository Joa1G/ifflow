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

import { PasswordResetRequestForm } from "./password-reset-request-form";
import { __resetApiClientForTests } from "../../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";

const BASE = "http://localhost:8000";
const GENERIC_MESSAGE =
  "Se o email estiver cadastrado, um link de redefinição foi enviado.";

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

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PasswordResetRequestForm />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<PasswordResetRequestForm />", () => {
  it("em sucesso mostra a mensagem genérica do backend e esconde o form", async () => {
    const user = userEvent.setup();
    let receivedBody: unknown = null;

    server.use(
      http.post(
        `${BASE}/auth/request-password-reset`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({ message: GENERIC_MESSAGE });
        },
      ),
    );

    renderForm();

    await user.type(
      screen.getByLabelText(/Email institucional/i),
      "joana@ifam.edu.br",
    );
    await user.click(
      screen.getByRole("button", { name: /Enviar link de redefinição/i }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      GENERIC_MESSAGE,
    );
    expect(
      screen.queryByRole("button", { name: /Enviar link de redefinição/i }),
    ).not.toBeInTheDocument();
    expect(receivedBody).toEqual({ email: "joana@ifam.edu.br" });
  });

  it("validação local bloqueia email inválido", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Email institucional/i), "xxx");
    await user.click(
      screen.getByRole("button", { name: /Enviar link de redefinição/i }),
    );

    expect(await screen.findByText(/Email inválido/i)).toBeInTheDocument();
  });

  it("em RATE_LIMITED exibe mensagem específica", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/auth/request-password-reset`, () =>
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
    await user.click(
      screen.getByRole("button", { name: /Enviar link de redefinição/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Muitas tentativas/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
