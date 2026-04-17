import { Link } from "react-router-dom";

import { RegisterForm } from "../components/auth/register-form";

export default function RegisterPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-dot-grid bg-ifflow-bone px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, transparent 0%, hsl(var(--ifflow-bone)) 85%)",
        }}
      />

      <div className="relative z-10 w-full max-w-xl">
        <div className="mb-10 text-center">
          <Link
            to="/"
            className="inline-block font-serif text-5xl font-medium tracking-tight text-ifflow-ink transition-opacity hover:opacity-70"
          >
            IFFLOW
          </Link>
          <p className="mt-2 text-sm text-ifflow-muted">
            Portal de processos administrativos · PROAD
          </p>
        </div>

        <div className="rounded-lg border border-ifflow-rule bg-ifflow-paper p-8 shadow-[0_1px_2px_rgba(15,27,18,0.04),0_12px_32px_-12px_rgba(15,27,18,0.08)]">
          <div className="mb-6">
            <h1 className="font-serif text-2xl font-medium tracking-tight text-ifflow-ink">
              Criar conta
            </h1>
            <p className="mt-1 text-sm text-ifflow-muted">
              Solicite seu acesso ao portal da PROAD. Um administrador validará
              seu cadastro.
            </p>
          </div>

          <RegisterForm />

          <div className="mt-6 flex items-center justify-end text-sm">
            <Link
              to="/login"
              className="font-medium text-ifflow-green underline-offset-4 hover:underline"
            >
              Já tenho conta →
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-ifflow-muted">
          Instituto Federal do Amazonas · Pró-Reitoria de Administração
        </p>
      </div>
    </main>
  );
}
