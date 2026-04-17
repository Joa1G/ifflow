import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
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

import { __resetApiClientForTests } from "../lib/api-client";
import {
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../stores/auth-store";
import { AuthBootstrap } from "../components/layout/auth-bootstrap";
import { useAuth } from "./use-auth";

const BASE = "http://localhost:8000";

const mockUser: UserMe = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Ana Souza",
  email: "ana@ifam.edu.br",
  siape: "7654321",
  sector: "PROAD",
  role: "ADMIN",
  status: "APPROVED",
  created_at: "2026-04-17T12:00:00Z",
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isHydrating: false });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
});
afterEach(() => {
  server.resetHandlers();
});

describe("useAuth", () => {
  it("sem sessão: isAuthenticated é false e os campos são nulos", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isHydrating).toBe(false);
  });

  it("com token e user: isAuthenticated é true", () => {
    useAuthStore.setState({ token: "tok", user: mockUser });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe("tok");
    expect(result.current.user).toEqual(mockUser);
  });

  it("isAuthenticated é false se há token mas user ainda não chegou", () => {
    // Cenário típico logo após rehydrate: token no localStorage, user
    // ainda sendo buscado via /auth/me.
    useAuthStore.setState({ token: "tok", user: null });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
  });

  it("login popula o store", () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.login("new-token", mockUser);
    });

    expect(useAuthStore.getState().token).toBe("new-token");
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it("logout limpa o store", () => {
    useAuthStore.setState({ token: "tok", user: mockUser });
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.logout();
    });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe("<AuthBootstrap />", () => {
  it("sem token persistido, renderiza children imediatamente", () => {
    render(
      <AuthBootstrap>
        <div>conteúdo protegido</div>
      </AuthBootstrap>,
    );

    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
    expect(screen.queryByText(/Carregando sessão/i)).not.toBeInTheDocument();
  });

  it("com token persistido e /auth/me ok, mostra loading e depois children", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockUser)),
    );
    useAuthStore.setState({ token: "valid-token" });

    render(
      <AuthBootstrap>
        <div>conteúdo protegido</div>
      </AuthBootstrap>,
    );

    // Loading aparece imediatamente porque havia token persistido.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/Carregando sessão/i)).toBeInTheDocument();
    expect(screen.queryByText("conteúdo protegido")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
    });

    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(screen.queryByText(/Carregando sessão/i)).not.toBeInTheDocument();
  });

  it("com token inválido, limpa sessão e renderiza children (fail-closed)", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_TOKEN", message: "Token inválido" } },
          { status: 401 },
        ),
      ),
    );
    useAuthStore.setState({ token: "bad-token" });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <AuthBootstrap>
        <div>conteúdo protegido</div>
      </AuthBootstrap>,
    );

    try {
      await waitFor(() => {
        expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
      });
    } finally {
      warnSpy.mockRestore();
    }

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });

  it("dispara hydrate() uma única vez no mount", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/auth/me`, () => {
        calls += 1;
        return HttpResponse.json(mockUser);
      }),
    );
    useAuthStore.setState({ token: "valid-token" });

    render(
      <AuthBootstrap>
        <div>filho</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText("filho")).toBeInTheDocument());
    expect(calls).toBe(1);
  });
});
