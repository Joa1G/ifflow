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

import { __resetApiClientForTests, apiGet } from "../lib/api-client";
import { ApiError } from "../lib/api-error";
import {
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "./auth-store";

const BASE = "http://localhost:8000";
const STORAGE_KEY = "ifflow-auth";

const mockUser: UserMe = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Fulano de Tal",
  email: "fulano@ifam.edu.br",
  siape: "1234567",
  sector: "PROAD",
  role: "USER",
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

describe("auth-store — ações síncronas", () => {
  it("setAuth preenche token e user", () => {
    useAuthStore.getState().setAuth("fake-token", mockUser);

    const state = useAuthStore.getState();
    expect(state.token).toBe("fake-token");
    expect(state.user).toEqual(mockUser);
  });

  it("setUser atualiza apenas o user", () => {
    useAuthStore.getState().setAuth("fake-token", mockUser);
    const updated: UserMe = { ...mockUser, name: "Ciclano" };

    useAuthStore.getState().setUser(updated);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(updated);
    expect(state.token).toBe("fake-token");
  });

  it("logout limpa token e user", () => {
    useAuthStore.getState().setAuth("fake-token", mockUser);

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });
});

describe("auth-store — persistência", () => {
  it("persiste APENAS o token no localStorage (partialize)", () => {
    useAuthStore.getState().setAuth("persisted-token", mockUser);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown> };
    expect(parsed.state).toEqual({ token: "persisted-token" });
    expect(parsed.state).not.toHaveProperty("user");
    expect(parsed.state).not.toHaveProperty("isHydrating");
  });

  it("nunca armazena senha nem user no localStorage", () => {
    useAuthStore.getState().setAuth("abc", mockUser);

    const raw = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(raw).not.toContain(mockUser.email);
    expect(raw).not.toContain(mockUser.name);
    expect(raw).not.toContain("password");
  });
});

describe("auth-store — hydrate", () => {
  it("sem token, não chama /auth/me e deixa isHydrating=false", async () => {
    let called = false;
    server.use(
      http.get(`${BASE}/auth/me`, () => {
        called = true;
        return HttpResponse.json(mockUser);
      }),
    );

    await useAuthStore.getState().hydrate();

    expect(called).toBe(false);
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isHydrating).toBe(false);
  });

  it("com token válido, chama /auth/me e preenche user", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockUser)),
    );

    useAuthStore.setState({ token: "valid-token" });

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.token).toBe("valid-token");
    expect(state.user).toEqual(mockUser);
    expect(state.isHydrating).toBe(false);
  });

  it("envia o token no header Authorization ao chamar /auth/me", async () => {
    let receivedAuth: string | null = null;
    server.use(
      http.get(`${BASE}/auth/me`, ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        return HttpResponse.json(mockUser);
      }),
    );

    useAuthStore.setState({ token: "jwt-xyz" });

    await useAuthStore.getState().hydrate();

    expect(receivedAuth).toBe("Bearer jwt-xyz");
  });

  it("com /auth/me retornando 401, limpa token e user", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_TOKEN", message: "Token inválido" } },
          { status: 401 },
        ),
      ),
    );

    useAuthStore.setState({ token: "expired-token", user: mockUser });

    // Suprime o console.warn do fluxo de hidratação falha.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await useAuthStore.getState().hydrate();
    } finally {
      warnSpy.mockRestore();
    }

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isHydrating).toBe(false);
  });

  it("com /auth/me retornando 500, limpa a sessão (fail-closed)", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Erro" } },
          { status: 500 },
        ),
      ),
    );

    useAuthStore.setState({ token: "any-token", user: mockUser });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await useAuthStore.getState().hydrate();
    } finally {
      warnSpy.mockRestore();
    }

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isHydrating).toBe(false);
  });
});

describe("auth-store — integração com api-client", () => {
  it("expõe o token atual ao api-client via setAuthTokenProvider", async () => {
    let receivedAuth: string | null = null;
    server.use(
      http.get(`${BASE}/whoami`, ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    useAuthStore.getState().setAuth("store-token", mockUser);
    await apiGet("/whoami");

    expect(receivedAuth).toBe("Bearer store-token");
  });

  it("faz logout automático quando o api-client recebe 401 UNAUTHENTICATED", async () => {
    server.use(
      http.get(`${BASE}/anything`, () =>
        HttpResponse.json(
          { error: { code: "UNAUTHENTICATED", message: "Token ausente" } },
          { status: 401 },
        ),
      ),
    );

    useAuthStore.getState().setAuth("about-to-be-cleared", mockUser);

    await expect(apiGet("/anything")).rejects.toBeInstanceOf(ApiError);

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });
});
