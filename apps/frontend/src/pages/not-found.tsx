import { Link } from "react-router-dom";

/**
 * Página 404 (catch-all do React Router).
 *
 * Mantém o vocabulário visual das telas de auth (bg-dot-grid + bone +
 * radial fade) — quem cai aqui veio de uma URL inválida e o estado
 * "perdido" pede uma tela calma com saída clara para a Home.
 *
 * O código de erro (`404 · ROTA NÃO ENCONTRADA`) fica em mono pequeno
 * acima do heading: ancora o conteúdo, mas não rouba a cena.
 */
export default function NotFoundPage() {
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
          404 · Rota não encontrada
        </p>

        <h1 className="mt-6 font-serif text-4xl font-medium tracking-tight text-ifflow-ink md:text-5xl">
          Esta página não existe
        </h1>

        <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-ifflow-muted">
          O endereço que você abriu pode ter sido movido ou removido. Volte
          para o catálogo de processos para continuar.
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
      </div>
    </main>
  );
}
