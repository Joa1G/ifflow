import { Link, Navigate, useSearchParams } from "react-router-dom";

import { PasswordResetConfirmForm } from "../components/auth/password-reset-confirm-form";

/**
 * Tela de confirmação de reset de senha.
 *
 * Lê o token do query string. Sem token, não faz sentido estar aqui —
 * redirecionamos para `/reset-password` para o usuário começar o fluxo
 * do zero. O token é passado como prop para o form em vez de vir de um
 * `useSearchParams` lá dentro, para deixar o componente de form testável
 * sem depender de React Router ter um `?token=` montado.
 */
export default function ResetPasswordConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  if (!token) {
    return <Navigate to="/reset-password" replace />;
  }

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

      <div className="relative z-10 w-full max-w-md">
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
              Definir nova senha
            </h1>
            <p className="mt-1 text-sm text-ifflow-muted">
              Escolha uma nova senha de pelo menos 8 caracteres. Depois você
              poderá entrar normalmente.
            </p>
          </div>

          <PasswordResetConfirmForm token={token} />

          <div className="mt-6 flex items-center justify-end text-sm">
            <Link
              to="/login"
              className="font-medium text-ifflow-green underline-offset-4 hover:underline"
            >
              Voltar para login →
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
