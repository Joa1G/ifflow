import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
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
import { AddResourceInlineForm } from "./add-resource-inline-form";

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";
const STEP_ID = "22222222-2222-4222-8222-222222222222";

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

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AddResourceInlineForm processId={PROCESS_ID} stepId={STEP_ID} />
    </QueryClientProvider>,
  );
}

describe("<AddResourceInlineForm />", () => {
  it("começa colapsado mostrando só o botão '+ Recurso'", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: /^Recurso$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: /Adicionar recurso/i }),
    ).not.toBeInTheDocument();
  });

  it("expandido, submete POST /processes/:id/steps/:stepId/resources com os campos válidos", async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(
        `${BASE}/processes/${PROCESS_ID}/steps/${STEP_ID}/resources`,
        async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: "33333333-3333-4333-8333-333333333333",
            step_id: STEP_ID,
            type: "DOCUMENT",
            title: "Formulário",
            url: "https://example.org/form.pdf",
            content: null,
          });
        },
      ),
    );

    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /^Recurso$/i }));

    await user.type(
      screen.getByLabelText(/^Título$/i),
      "Formulário de Solicitação",
    );
    await user.type(
      screen.getByLabelText(/^URL/i),
      "https://example.org/form.pdf",
    );
    await user.click(
      screen.getByRole("button", { name: /Adicionar recurso/i }),
    );

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({
      type: "DOCUMENT",
      title: "Formulário de Solicitação",
      url: "https://example.org/form.pdf",
    });

    // Após sucesso, o form colapsa de volta.
    await waitFor(() =>
      expect(
        screen.queryByRole("form", { name: /Adicionar recurso/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("bloqueia submit quando não há URL nem conteúdo", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /^Recurso$/i }));
    await user.type(screen.getByLabelText(/^Título$/i), "Algum título");
    await user.click(
      screen.getByRole("button", { name: /Adicionar recurso/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Informe uma URL ou um conteúdo/i),
      ).toBeInTheDocument(),
    );
  });
});
