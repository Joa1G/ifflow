/**
 * ApiError — exceção padrão para erros vindos da API.
 *
 * O backend do IFFLOW retorna erros no formato:
 *   { error: { code: "UPPER_SNAKE_CASE", message: "...", details?: {...} } }
 *
 * O `api-client` parseia esse envelope e lança uma instância desta classe.
 * Componentes e hooks devem capturar ApiError e ramificar por `err.code`
 * (ex: "INVALID_CREDENTIALS", "ACCOUNT_PENDING") ou mostrar `err.message`
 * como fallback — a mensagem já vem em português do backend.
 *
 * Veja `apps/frontend/docs/CONTRACTS.md` para a tabela completa de códigos.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;

    // Restaura a prototype chain para que `instanceof ApiError` funcione
    // mesmo após o TypeScript compilar `extends Error` para ES5.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
