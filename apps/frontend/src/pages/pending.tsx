import { Link } from "react-router-dom";

export default function PendingPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-dot-grid bg-ifflow-bone px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, transparent 0%, hsl(var(--ifflow-bone)) 85%)",
        }}
      />

      <div className="relative z-10 w-full max-w-xl text-center">
        <div
          className="mb-10 inline-flex h-12 w-12 items-center justify-center"
          aria-hidden
        >
          <span className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-sm bg-ifflow-green opacity-40" />
            <span className="relative inline-flex h-4 w-4 rounded-sm bg-ifflow-green" />
          </span>
        </div>

        <h1 className="font-serif text-4xl font-medium tracking-tight text-ifflow-ink md:text-5xl">
          Aguardando aprovação
        </h1>

        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-ifflow-muted">
          Seu cadastro foi recebido. Um administrador da PROAD precisa
          validar sua conta antes do primeiro acesso. Você será notificado
          por email assim que o processo for concluído.
        </p>

        <div
          className="mx-auto my-10 flex items-center justify-center gap-3"
          aria-hidden
        >
          <span className="h-px w-16 bg-ifflow-rule" />
          <span className="h-1 w-1 rounded-full bg-ifflow-rule" />
          <span className="h-px w-16 bg-ifflow-rule" />
        </div>

        <div className="flex flex-col items-center justify-center gap-4 text-sm sm:flex-row">
          <Link
            to="/"
            className="text-ifflow-muted underline-offset-4 hover:text-ifflow-ink hover:underline"
          >
            Voltar para a página inicial
          </Link>
          <span
            className="hidden text-ifflow-rule sm:inline"
            aria-hidden
          >
            ·
          </span>
          <Link
            to="/login"
            className="font-medium text-ifflow-green underline-offset-4 hover:underline"
          >
            Entrar com outra conta →
          </Link>
        </div>
      </div>
    </main>
  );
}
