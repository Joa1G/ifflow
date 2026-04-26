import type { ApiError } from "./api-error";

/**
 * Mapeia códigos de erro das transições de processo para textos
 * contextuais em pt-BR. Usado pelos botões de transição (linha da
 * tabela e barra do editor).
 *
 * Os códigos vêm do backend em CONTRACTS.md; mensagens já chegam em
 * pt-BR, mas alguns merecem um texto mais útil que cite o efeito
 * concreto do erro.
 */
export function transitionErrorMessage(
  err: ApiError,
  fallback: string,
): string {
  switch (err.code) {
    case "PROCESS_NOT_FOUND":
      return "Processo não encontrado. A lista foi atualizada.";
    case "PROCESS_INVALID_STATUS":
    case "INVALID_STATUS_TRANSITION":
      return "O processo já mudou de estado. Atualizando a lista…";
    case "PROCESS_NOT_OWNED":
      return "Você não é o autor deste processo.";
    case "PROCESS_LOCKED_IN_REVIEW":
      return "Processo está em revisão. Use 'Retirar da revisão' para editar.";
    case "PROCESS_ARCHIVE_REQUIRES_ADMIN":
      return "Apenas um administrador pode arquivar este processo.";
    default:
      return err.message || fallback;
  }
}
