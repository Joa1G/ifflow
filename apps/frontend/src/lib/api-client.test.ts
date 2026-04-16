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

import {
  __resetApiClientForTests,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  setAuthTokenProvider,
  setUnauthorizedHandler,
} from "./api-client";
import { ApiError } from "./api-error";

const BASE = "http://localhost:8000";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  __resetApiClientForTests();
});
afterAll(() => server.close());

describe("api-client — sucesso", () => {
  it("apiGet retorna o JSON parseado em 200", async () => {
    server.use(
      http.get(`${BASE}/ping`, () => HttpResponse.json({ message: "pong" })),
    );

    const data = await apiGet<{ message: string }>("/ping");
    expect(data).toEqual({ message: "pong" });
  });

  it("apiPost envia body JSON e retorna o resultado", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${BASE}/echo`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );

    const data = await apiPost<{ ok: boolean }>("/echo", { x: 1 });
    expect(data).toEqual({ ok: true });
    expect(receivedBody).toEqual({ x: 1 });
  });

  it("apiPatch envia PATCH com body", async () => {
    let method = "";
    server.use(
      http.patch(`${BASE}/items/1`, async ({ request }) => {
        method = request.method;
        return HttpResponse.json({ updated: true });
      }),
    );

    const data = await apiPatch<{ updated: boolean }>("/items/1", {
      name: "x",
    });
    expect(data).toEqual({ updated: true });
    expect(method).toBe("PATCH");
  });

  it("apiDelete retorna undefined em 204 No Content", async () => {
    server.use(
      http.delete(`${BASE}/items/1`, () => new HttpResponse(null, { status: 204 })),
    );

    const data = await apiDelete<undefined>("/items/1");
    expect(data).toBeUndefined();
  });

  it("normaliza path sem barra inicial", async () => {
    server.use(
      http.get(`${BASE}/no-slash`, () => HttpResponse.json({ ok: true })),
    );

    const data = await apiGet<{ ok: boolean }>("no-slash");
    expect(data).toEqual({ ok: true });
  });
});

describe("api-client — token de autenticação", () => {
  it("adiciona Authorization quando o provider retorna um token", async () => {
    let receivedAuth: string | null = null;
    server.use(
      http.get(`${BASE}/secure`, ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    setAuthTokenProvider(() => "fake-jwt-token");
    await apiGet("/secure");

    expect(receivedAuth).toBe("Bearer fake-jwt-token");
  });

  it("não adiciona Authorization quando o provider retorna null", async () => {
    let receivedAuth: string | null = "start-value";
    server.use(
      http.get(`${BASE}/anon`, ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiGet("/anon");

    expect(receivedAuth).toBeNull();
  });
});

describe("api-client — erros", () => {
  it("lança ApiError com code e message do envelope em 4xx", async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Email ou senha incorretos",
            },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(
      apiPost("/auth/login", { email: "x", password: "y" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "INVALID_CREDENTIALS",
      message: "Email ou senha incorretos",
      status: 401,
    });

    // Também verifica que é instância de ApiError (importante para
    // `if (err instanceof ApiError)` nos hooks).
    try {
      await apiPost("/auth/login", { email: "x", password: "y" });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });

  it("preserva details do envelope de erro", async () => {
    server.use(
      http.post(`${BASE}/things`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Campos inválidos",
              details: { field: "email" },
            },
          },
          { status: 422 },
        ),
      ),
    );

    try {
      await apiPost("/things", {});
      throw new Error("esperava ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("VALIDATION_ERROR");
      expect(apiErr.details).toEqual({ field: "email" });
    }
  });

  it("usa INTERNAL_ERROR quando a resposta de erro não é JSON", async () => {
    server.use(
      http.get(`${BASE}/broken`, () =>
        new HttpResponse("<html>500 internal</html>", {
          status: 500,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    try {
      await apiGet("/broken");
      throw new Error("esperava ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("INTERNAL_ERROR");
      expect(apiErr.status).toBe(500);
    }
  });

  it("usa INTERNAL_ERROR quando o envelope não tem code/message", async () => {
    server.use(
      http.get(`${BASE}/weird`, () =>
        HttpResponse.json({ not: "an envelope" }, { status: 500 }),
      ),
    );

    try {
      await apiGet("/weird");
      throw new Error("esperava ApiError");
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("INTERNAL_ERROR");
    }
  });
});

describe("api-client — handler de 401", () => {
  it("chama unauthorizedHandler quando code é UNAUTHENTICATED", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json(
          {
            error: {
              code: "UNAUTHENTICATED",
              message: "Token ausente",
            },
          },
          { status: 401 },
        ),
      ),
    );

    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(apiGet("/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("chama unauthorizedHandler quando code é INVALID_TOKEN", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_TOKEN",
              message: "Token inválido",
            },
          },
          { status: 401 },
        ),
      ),
    );

    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(apiGet("/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("NÃO chama unauthorizedHandler em 401 com outro code", async () => {
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

    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(apiPost("/auth/login", {})).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("emite warning quando não há handler registrado", async () => {
    server.use(
      http.get(`${BASE}/me`, () =>
        HttpResponse.json(
          { error: { code: "UNAUTHENTICATED", message: "x" } },
          { status: 401 },
        ),
      ),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(apiGet("/me")).rejects.toBeInstanceOf(ApiError);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("api-client — segurança", () => {
  it("nunca loga o token no console", async () => {
    server.use(
      http.get(`${BASE}/secure`, () => HttpResponse.json({ ok: true })),
    );

    setAuthTokenProvider(() => "super-secret-token-abc123");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await apiGet("/secure");

      const allCalls = [
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .flat()
        .map((arg) =>
          typeof arg === "string" ? arg : JSON.stringify(arg),
        )
        .join(" ");

      expect(allCalls).not.toContain("super-secret-token-abc123");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe("api-client — configuração", () => {
  it("lança erro claro se VITE_API_URL estiver ausente", async () => {
    const original = import.meta.env.VITE_API_URL;
    // @ts-expect-error — sobrescrevendo pelo teste
    import.meta.env.VITE_API_URL = "";

    try {
      await expect(apiGet("/x")).rejects.toThrow(/VITE_API_URL/);
    } finally {
      // @ts-expect-error — restaurando
      import.meta.env.VITE_API_URL = original;
    }
  });

  beforeEach(() => {
    // Sanity: por padrão o VITE_API_URL do ambiente de teste aponta
    // para http://localhost:8000 (CI) ou valor do .env local.
    expect(import.meta.env.VITE_API_URL).toBeTruthy();
  });
});
