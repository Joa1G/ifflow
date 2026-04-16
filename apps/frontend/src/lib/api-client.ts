import { ApiError } from "./api-error";

/**
 * Cliente HTTP do IFFLOW.
 *
 * Responsabilidades:
 *   - Resolver a base URL a partir de `import.meta.env.VITE_API_URL`
 *   - Injetar `Authorization: Bearer <token>` quando houver token disponível
 *     (via provider registrado — a F-05 plugará o Zustand auth-store aqui)
 *   - Parsear a resposta JSON em sucesso
 *   - Parsear o envelope de erro `{ error: { code, message, details } }`
 *     e lançar `ApiError`
 *   - Devolver `INTERNAL_ERROR` quando a resposta de erro não for JSON válido
 *
 * Nenhum componente deve chamar `fetch` diretamente — sempre usar as
 * funções exportadas daqui. Isso garante tratamento consistente de auth
 * e erros.
 */

type TokenProvider = () => string | null;

/**
 * Callback chamado quando o backend devolve 401 com `UNAUTHENTICATED`
 * ou `INVALID_TOKEN`. Na F-05 o auth-store registra um handler que
 * limpa token e redireciona. Enquanto isso, apenas emitimos um warning.
 */
type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider = () => null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registra a função que fornece o token JWT atual ao api-client.
 * O auth-store (F-05) deve chamar isto no bootstrap do app.
 */
export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

/**
 * Registra um callback invocado quando o backend indica que o token
 * não é mais válido (401 UNAUTHENTICATED / INVALID_TOKEN). Esperado
 * ser usado pelo auth-store para fazer logout automático.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

/**
 * Reinicia os providers — usado apenas em testes para isolar o estado
 * do módulo entre casos.
 */
export function __resetApiClientForTests(): void {
  tokenProvider = () => null;
  unauthorizedHandler = null;
}

function getBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_URL;
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error(
      "VITE_API_URL não está configurada. Verifique o .env na raiz do monorepo.",
    );
  }
  return baseUrl.replace(/\/+$/, "");
}

function buildUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getBaseUrl()}${normalized}`;
}

function buildHeaders(hasBody: boolean): Headers {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }
  const token = tokenProvider();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

interface BackendErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  let payload: BackendErrorEnvelope | null = null;
  try {
    payload = (await response.json()) as BackendErrorEnvelope;
  } catch {
    // Resposta não é JSON válido (ex: HTML de erro 500 do proxy).
    return new ApiError({
      code: "INTERNAL_ERROR",
      message: "Erro inesperado no servidor. Tente novamente em instantes.",
      status: response.status,
    });
  }

  const envelope = payload?.error;
  const code =
    typeof envelope?.code === "string" && envelope.code.length > 0
      ? envelope.code
      : "INTERNAL_ERROR";
  const message =
    typeof envelope?.message === "string" && envelope.message.length > 0
      ? envelope.message
      : "Erro inesperado. Tente novamente.";

  return new ApiError({
    code,
    message,
    status: response.status,
    details: envelope?.details,
  });
}

function handleAuthError(error: ApiError): void {
  if (error.status !== 401) return;
  if (error.code !== "UNAUTHENTICATED" && error.code !== "INVALID_TOKEN") {
    return;
  }
  if (unauthorizedHandler) {
    unauthorizedHandler();
  } else {
    // F-05 ainda não implementada: apenas avisar nos logs de dev.
    console.warn(
      "[api-client] Token inválido/expirado (status 401). " +
        "Nenhum handler de logout registrado ainda (F-05 pendente).",
    );
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const hasBody = body !== undefined;
  const init: RequestInit = {
    method,
    headers: buildHeaders(hasBody),
  };
  if (hasBody) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path), init);

  if (!response.ok) {
    const apiError = await parseErrorResponse(response);
    handleAuthError(apiError);
    throw apiError;
  }

  // 204 No Content e similares: não há corpo pra parsear.
  if (response.status === 204) {
    return undefined as T;
  }

  // Se a resposta veio sem Content-Type JSON, tentamos parsear mesmo assim
  // (o backend do IFFLOW sempre retorna JSON em 2xx).
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError({
      code: "INTERNAL_ERROR",
      message: "Resposta do servidor não pôde ser interpretada.",
      status: response.status,
    });
  }
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body ?? {});
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body ?? {});
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}
