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
import type { components } from "../../types/api";
import { StepResourcesList } from "./step-resources-list";

type StepResourceRead = components["schemas"]["StepResourceRead"];

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";
const STEP_ID = "22222222-2222-4222-8222-222222222222";
const RESOURCE_ID = "33333333-3333-4333-8333-333333333333";

const RESOURCE: StepResourceRead = {
  id: RESOURCE_ID,
  type: "DOCUMENT",
  title: "Formulário antigo",
  url: "https://old.example.com/form.pdf",
  content: null,
};

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

function renderList(resources: StepResourceRead[] = [RESOURCE]) {
  return render(
    <QueryClientProvider client={queryClient}>
      <StepResourcesList
        resources={resources}
        processId={PROCESS_ID}
        stepId={STEP_ID}
      />
    </QueryClientProvider>,
  );
}

describe("<StepResourcesList /> — edição inline", () => {
  it("clicar em editar abre o form pré-preenchido com os valores atuais", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(
      screen.getByRole("button", { name: /Editar recurso Formulário antigo/i }),
    );

    expect(
      screen.getByRole("form", { name: /Editar recurso/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Formulário antigo"),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://old.example.com/form.pdf"),
    ).toBeInTheDocument();
  });

  it("submeter envia PATCH e fecha o form ao retornar", async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.patch(
        `${BASE}/processes/${PROCESS_ID}/steps/${STEP_ID}/resources/${RESOURCE_ID}`,
        async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: RESOURCE_ID,
            step_id: STEP_ID,
            type: "DOCUMENT",
            title: "Formulário novo",
            url: "https://new.example.com/form.pdf",
            content: null,
          });
        },
      ),
    );

    const user = userEvent.setup();
    renderList();

    await user.click(
      screen.getByRole("button", { name: /Editar recurso Formulário antigo/i }),
    );

    const titleInput = screen.getByLabelText(/^Título$/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Formulário novo");

    await user.click(screen.getByRole("button", { name: /^Salvar$/i }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({
      type: "DOCUMENT",
      title: "Formulário novo",
      url: "https://old.example.com/form.pdf",
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("form", { name: /Editar recurso/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("clicar em cancelar volta para o card sem disparar PATCH", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(
      screen.getByRole("button", { name: /Editar recurso Formulário antigo/i }),
    );
    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));

    expect(
      screen.queryByRole("form", { name: /Editar recurso/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Editar recurso Formulário antigo/i }),
    ).toBeInTheDocument();
  });
});
