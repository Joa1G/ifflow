import { AlertCircle, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { ApprovedUserCard } from "../../components/admin/approved-user-card";
import { useAuth } from "../../hooks/use-auth";
import { useApprovedUsers } from "../../hooks/use-super-admin-users";
import { ApiError } from "../../lib/api-error";
import type { components } from "../../types/api";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";

type ApprovedUserView = components["schemas"]["ApprovedUserView"];
type UserRole = components["schemas"]["UserRole"];

interface RoleGroupConfig {
  role: UserRole;
  code: string;
  title: string;
  emptyHint: string;
}

// Ordem top-down do organograma: SUPER_ADMIN no topo, USER na base.
// Seções vazias não renderizam — na prática SUPER_ADMIN sempre tem ao
// menos 1 (o próprio usuário logado).
const ROLE_GROUPS: ReadonlyArray<RoleGroupConfig> = [
  {
    role: "SUPER_ADMIN",
    code: "S.A.",
    title: "Super administradores",
    emptyHint: "Nenhum super administrador cadastrado.",
  },
  {
    role: "ADMIN",
    code: "ADM.",
    title: "Administradores",
    emptyHint: "Nenhum administrador no momento.",
  },
  {
    role: "USER",
    code: "SRV.",
    title: "Servidores",
    emptyHint: "Nenhum servidor comum aprovado.",
  },
];

/**
 * Tela super_admin de gestão de papéis (F-24).
 *
 * Fica atrás de `<ProtectedRoute requiredRole="SUPER_ADMIN">` em App.tsx.
 * A autorização real é no backend (ADR-008): mesmo que um usuário sem
 * permissão chegue aqui por bug, o endpoint devolve 403 e a query cai
 * em isError.
 *
 * Layout agrupado por papel (top-down do organograma) em vez de lista
 * linear — torna a estrutura institucional visível e facilita a
 * navegação visual de quem entra na página querendo ver "quem é admin?".
 */
export default function SuperAdminRolesPage() {
  const { user: currentUser } = useAuth();
  const query = useApprovedUsers();

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
      <div className="mx-auto max-w-5xl px-6 py-10 md:py-14">
        <nav
          aria-label="Caminho"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
        >
          Super admin <span aria-hidden>/</span> Papéis
        </nav>

        <header className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ifflow-ink md:text-4xl">
              Gestão de papéis
            </h1>
            <p className="mt-2 text-sm text-ifflow-muted">
              Promova servidores a administradores ou rebaixe administradores
              de volta a servidores. Mudanças valem imediatamente e o usuário
              afetado precisa fazer login de novo para ver os novos acessos.
            </p>
          </div>

          {query.data && (
            <span
              aria-live="polite"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-ifflow-rule bg-ifflow-paper px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-ifflow-green"
              />
              {query.data.total}{" "}
              {query.data.total === 1 ? "usuário" : "usuários"}
            </span>
          )}
        </header>

        <div className="mt-10">
          <RolesContent
            query={query}
            currentUserId={currentUser?.id ?? null}
          />
        </div>
      </div>
    </main>
  );
}

interface RolesContentProps {
  query: ReturnType<typeof useApprovedUsers>;
  currentUserId: string | null;
}

function RolesContent({ query, currentUserId }: RolesContentProps) {
  if (query.isPending) {
    return <RolesSkeleton />;
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Erro ao carregar usuários</AlertTitle>
        <AlertDescription>
          {query.error instanceof ApiError
            ? query.error.message
            : "Não foi possível carregar a lista de usuários. Tente novamente."}
        </AlertDescription>
      </Alert>
    );
  }

  const users = query.data.users;

  if (users.length === 0) {
    return <EmptyState />;
  }

  // Agrupamento por role + ordenação alfabética dentro de cada grupo.
  // Strings comparadas com locale pt-BR para tratar acentos.
  const byRole = new Map<UserRole, ApprovedUserView[]>();
  for (const user of users) {
    const bucket = byRole.get(user.role) ?? [];
    bucket.push(user);
    byRole.set(user.role, bucket);
  }
  for (const bucket of byRole.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  return (
    <div className="space-y-12 md:space-y-16">
      {ROLE_GROUPS.map((group) => {
        const bucket = byRole.get(group.role) ?? [];
        if (bucket.length === 0) return null;
        return (
          <section
            key={group.role}
            aria-labelledby={`role-section-${group.role}`}
            className="space-y-4"
          >
            <RoleSectionHeader
              code={group.code}
              title={group.title}
              count={bucket.length}
              headingId={`role-section-${group.role}`}
            />
            <ul className="space-y-3">
              {bucket.map((user) => (
                <ApprovedUserCard
                  key={user.id}
                  user={user}
                  currentUserId={currentUserId}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface RoleSectionHeaderProps {
  code: string;
  title: string;
  count: number;
  headingId: string;
}

function RoleSectionHeader({
  code,
  title,
  count,
  headingId,
}: RoleSectionHeaderProps) {
  return (
    <header className="flex items-baseline gap-3">
      <span
        aria-hidden
        className="font-mono text-xs font-medium tracking-[0.2em] text-ifflow-muted"
      >
        {code}
      </span>
      <span aria-hidden className="h-px flex-1 bg-ifflow-rule" />
      <h2
        id={headingId}
        className="font-serif text-xl font-medium text-ifflow-ink"
      >
        {title}
      </h2>
      <span className="font-mono text-xs font-medium tracking-[0.14em] text-ifflow-muted">
        {String(count).padStart(2, "0")}
      </span>
    </header>
  );
}

function RolesSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando usuários"
      className="space-y-12"
    >
      {Array.from({ length: 2 }).map((_, sectionIdx) => (
        <section key={sectionIdx} className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-12 bg-ifflow-rule/40" />
            <span aria-hidden className="h-px flex-1 bg-ifflow-rule" />
            <Skeleton className="h-5 w-40 bg-ifflow-rule/40" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, cardIdx) => (
              <Skeleton
                key={cardIdx}
                className="h-28 w-full rounded-md bg-ifflow-rule/40"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EmptyState() {
  // Empty state quase nunca acontece — o próprio super_admin logado já
  // conta. Se o banco estiver realmente vazio (erro raro), apontamos
  // para a próxima ação útil em vez de só dizer "vazio".
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ifflow-rule bg-ifflow-paper py-16 text-center">
      <Users className="mb-4 h-12 w-12 text-ifflow-muted" aria-hidden />
      <h3 className="font-serif text-lg font-medium text-ifflow-ink">
        Nenhum usuário aprovado ainda
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ifflow-muted">
        Aprove cadastros pendentes para que apareçam aqui.
      </p>
      <Button
        asChild
        variant="outline"
        className="mt-6 border-ifflow-rule"
      >
        <Link to="/admin/users">Ir para cadastros pendentes</Link>
      </Button>
    </div>
  );
}
