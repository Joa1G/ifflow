import { PendingUsersList } from "../../components/admin/pending-users-list";
import { useAdminPendingUsers } from "../../hooks/use-admin-users";

/**
 * Tela admin de moderação de cadastros.
 *
 * Fica atrás de `<ProtectedRoute requiredRole="ADMIN">` em App.tsx — se
 * o usuário não for ADMIN/SUPER_ADMIN, nem chega aqui. Independente
 * disso, a autorização real é no backend (ADR-008).
 *
 * A página lê o contador da mesma query que a lista consome — o
 * TanStack Query deduplica, então não há round-trip extra. Isso mantém
 * o badge "X pendentes" sincronizado com o que a lista mostra.
 */
export default function AdminUsersPage() {
  const query = useAdminPendingUsers();
  const total = query.data?.total;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
      <div className="mx-auto max-w-5xl px-6 py-10 md:py-14">
        <nav
          aria-label="Caminho"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
        >
          Admin <span aria-hidden>/</span> Cadastros pendentes
        </nav>

        <header className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ifflow-ink md:text-4xl">
              Cadastros pendentes
            </h1>
            <p className="mt-2 text-sm text-ifflow-muted">
              Cadastros em ordem de chegada. Aprovar libera o acesso ao
              portal; rejeitar bloqueia o email e impede novas tentativas
              sem intervenção administrativa.
            </p>
          </div>

          <span
            aria-live="polite"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-ifflow-rule bg-ifflow-paper px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-ifflow-green"
            />
            {total ?? "—"} pendentes
          </span>
        </header>

        <section className="mt-8 overflow-hidden rounded-lg border border-ifflow-rule bg-ifflow-paper shadow-[0_1px_2px_rgba(15,27,18,0.04),0_12px_32px_-12px_rgba(15,27,18,0.08)]">
          <PendingUsersList />
        </section>
      </div>
    </main>
  );
}
