import { Link } from "react-router-dom";

import { useAuth } from "../hooks/use-auth";

/**
 * Tela 403 — usuário autenticado tentou acessar uma rota fora do seu role.
 *
 * Disparada pelo `<ProtectedRoute>` quando o user logado não tem a role
 * necessária. Como a autorização real é do backend (ADR-008), esta tela
 * é só feedback de UX — explica que o acesso é restrito e oferece a saída
 * mais provável (voltar à Home).
 *
 * Visualmente espelha NotFound: mesma "lápide" institucional. Para quem
 * está logado, mostra o nome no rodapé como confirmação de qual sessão
 * está ativa — útil quando o servidor tem múltiplas contas e errou na
 * que escolheu.
 */
export default function ForbiddenPage() {
  const { user } = useAuth();

  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-dot-grid bg-ifflow-bone px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, transparent 0%, hsl(var(--ifflow-bone)) 85%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ifflow-muted">
          403 · Acesso restrito
        </p>

        <h1 className="mt-6 font-serif text-4xl font-medium tracking-tight text-ifflow-ink md:text-5xl">
          Sem permissão para esta área
        </h1>

        <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-ifflow-muted">
          Esta página é restrita a administradores do portal. Se você
          deveria ter acesso, peça a um administrador da PROAD para revisar
          seu papel.
        </p>

        <div
          className="mx-auto my-10 flex items-center justify-center gap-3"
          aria-hidden
        >
          <span className="h-px w-16 bg-ifflow-rule" />
          <span className="h-1 w-1 rounded-full bg-ifflow-rule" />
          <span className="h-px w-16 bg-ifflow-rule" />
        </div>

        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-md bg-ifflow-green px-5 py-2.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-ifflow-green-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2"
        >
          Voltar para a página inicial
        </Link>

        {user ? (
          <p className="mt-8 text-xs text-ifflow-muted">
            Sessão atual:{" "}
            <span className="font-medium text-ifflow-ink">{user.name}</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
