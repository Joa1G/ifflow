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
  vi,
} from "vitest";

import { __resetApiClientForTests } from "../../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";
import { StepEditorDialog } from "./step-editor-dialog";

const BASE = "http://localhost:8000";
const PROCESS_ID = "11111111-1111-4111-8111-111111111111";
const SECTOR_ID = "22222222-2222-4222-8222-222222222222";

const sectorsPayload = {
  sectors: [{ id: SECTOR_ID, name: "PROAD", acronym: "PROAD" }],
  total: 1,
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

function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <StepEditorDialog
        processId={PROCESS_ID}
        step={null}
        nextOrder={1}
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe("<StepEditorDialog /> em modo create", () => {
  it("submete POST /processes/:id/steps com os campos preenchidos", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.get(`${BASE}/sectors`, () => HttpResponse.json(sectorsPayload)),
      http.post(
        `${BASE}/processes/${PROCESS_ID}/steps`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({});
        },
      ),
    );

    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    // Radix Select trigger é um <button role="combobox">; FormLabel
    // associa via htmlFor que não funciona para botões — então buscamos
    // o combobox como o único da página (Input order é spinbutton).
    await waitFor(() =>
      expect(screen.getByRole("combobox")).not.toBeDisabled(),
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /PROAD/i }));

    await user.type(screen.getByLabelText(/^Título$/i), "Autuar processo");
    await user.type(
      screen.getByLabelText(/Descrição/i),
      "Abertura do processo no SIPAC.",
    );
    await user.type(
      screen.getByLabelText(/Responsável/i),
      "Servidor interessado",
    );
    await user.type(screen.getByLabelText(/Tempo estimado/i), "1 dia");

    await user.click(screen.getByRole("button", { name: /Criar etapa/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(receivedBody).toMatchObject({
      sector_id: SECTOR_ID,
      order: 1,
      title: "Autuar processo",
      responsible: "Servidor interessado",
    });
  });
});
