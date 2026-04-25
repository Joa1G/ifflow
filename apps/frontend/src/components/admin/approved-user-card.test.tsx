import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
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

import { __resetApiClientForTests } from "../../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";
import type { components } from "../../types/api";
import { ApprovedUserCard } from "./approved-user-card";

type ApprovedUserView = components["schemas"]["ApprovedUserView"];
type UserRole = components["schemas"]["UserRole"];

const BASE = "http://localhost:8000";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SELF_ID = "99999999-9999-4999-8999-999999999999";

function makeUser(role: UserRole, id = USER_ID): ApprovedUserView {
  return {
    id,
    name: "Maria de Souza",
    email: "maria.souza@ifam.edu.br",
    siape: "1234567",
    sector: "PROAD",
    role,
    created_at: "2026-04-10T10:00:00Z",
  };
}

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

function renderCard(
  user: ApprovedUserView,
  currentUserId: string | null = null,
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ul>
        <ApprovedUserCard user={user} currentUserId={currentUserId} />
      </ul>
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("<ApprovedUserCard />", () => {
  it("renderiza monograma, nome, email, role badge e SIAPE/setor", () => {
    renderCard(makeUser("USER"));

    // Monograma de iniciais (primeira+última, ignora preposições "de")
    // — "Maria de Souza" → "MS".
    expect(screen.getByText("MS")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Maria de Souza" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("maria.souza@ifam.edu.br"),
    ).toBeInTheDocument();
    expect(screen.getByText("Servidor")).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.startsWith("SIAPE 1234567")),
    ).toBeInTheDocument();
  });

  it("USER mostra botão Promover; ADMIN mostra botão Rebaixar", () => {
    const { rerender } = renderCard(makeUser("USER"));
    expect(
      screen.getByRole("button", { name: /Promover a administrador/i }),
    ).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <ul>
          <ApprovedUserCard user={makeUser("ADMIN")} currentUserId={null} />
        </ul>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Rebaixar a servidor/i }),
    ).toBeInTheDocument();
  });

  it("SUPER_ADMIN não tem botão de ação — mostra nota institucional", () => {
    renderCard(makeUser("SUPER_ADMIN"));

    expect(
      screen.queryByRole("button", { name: /Promover/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rebaixar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Papel não gerenciado por este painel/i),
    ).toBeInTheDocument();
  });

  it("quando user.id === currentUserId, marca card como 'você' e desabilita o botão", () => {
    renderCard(makeUser("ADMIN", SELF_ID), SELF_ID);

    expect(screen.getByLabelText("Este é você")).toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: /Rebaixar a servidor/i,
    });
    expect(button).toBeDisabled();
    expect(
      screen.getByText("Não é possível alterar o próprio papel."),
    ).toBeInTheDocument();
  });

  it("clicar em Promover abre AlertDialog antes de chamar a API", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/super-admin/users/${USER_ID}/promote`, () => {
        called = true;
        return HttpResponse.json({ id: USER_ID, role: "ADMIN" });
      }),
    );

    const user = userEvent.setup();
    renderCard(makeUser("USER"));

    await user.click(
      screen.getByRole("button", { name: /Promover a administrador/i }),
    );

    expect(
      screen.getByRole("alertdialog", {
        name: /Promover a administrador\?/i,
      }),
    ).toBeInTheDocument();
    expect(called).toBe(false);

    await user.click(screen.getByRole("button", { name: /^Promover$/i }));
    await waitFor(() => expect(called).toBe(true));
  });

  it("Rebaixar dispara DemoteUser com o id correto", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/super-admin/users/${USER_ID}/demote`, () => {
        called = true;
        return HttpResponse.json({ id: USER_ID, role: "USER" });
      }),
    );

    const user = userEvent.setup();
    renderCard(makeUser("ADMIN"));

    await user.click(
      screen.getByRole("button", { name: /Rebaixar a servidor/i }),
    );
    await user.click(screen.getByRole("button", { name: /^Rebaixar$/i }));

    await waitFor(() => expect(called).toBe(true));
  });
});
