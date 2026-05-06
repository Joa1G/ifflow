import { Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { cn } from "../../lib/utils";
import { IfflowLogo } from "../brand/ifflow-logo";
import { Sidebar } from "./sidebar";

/**
 * Rotas com shell próprio (login, cadastro, recuperação, pendente).
 * Essas telas têm marca dentro do card e botões institucionais — mostrar
 * a topbar+sidebar em volta delas duplicaria o branding e geraria links
 * de "Entrar/Cadastrar" sobrepostos com o conteúdo da própria tela.
 */
const AUTH_SHELL_ROUTES = new Set([
  "/login",
  "/register",
  "/pending",
  "/reset-password",
  "/reset-password/confirm",
]);

const COLLAPSED_STORAGE_KEY = "ifflow:sidebar-collapsed";

/**
 * Hook que persiste o estado expandido/colapsado da sidebar em
 * localStorage. Lê de forma síncrona no primeiro render para evitar
 * flash de layout quando o usuário recarrega com a sidebar colapsada.
 *
 * SSR-safe: degrade pra `false` se `window` não existir (não temos SSR
 * hoje, mas o teste com jsdom mexe no `localStorage` real e essa
 * inicialização preguiçosa evita que outros testes vazem estado).
 */
function usePersistedCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return [collapsed, setCollapsed];
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();
  const isAuthShell = AUTH_SHELL_ROUTES.has(pathname);

  const [collapsed, setCollapsed] = usePersistedCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fecha o overlay automaticamente ao navegar — sem isso, clicar num
  // item da sidebar mobile deixa a tela coberta pelo backdrop até o
  // próximo toque.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Esc fecha o overlay mobile (acessibilidade básica de modal).
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  if (isAuthShell) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-ifflow-rule bg-ifflow-paper/95 px-3 backdrop-blur md:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ifflow-muted transition-colors hover:bg-secondary hover:text-ifflow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1 md:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
          <Link
            to="/"
            aria-label="IFFLOW — ir para o catálogo"
            className="flex items-center rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2"
          >
            <IfflowLogo size={22} compact />
          </Link>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ifflow-muted">
          PROAD · IFAM
        </span>
      </header>

      <div className="flex flex-1">
        <div
          className={cn(
            "sticky top-12 hidden h-[calc(100vh-3rem)] shrink-0 md:flex",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed(!collapsed)}
          />
        </div>

        {mobileOpen ? (
          <>
            <div
              role="presentation"
              aria-hidden
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            />
            <div
              id="mobile-sidebar"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              className="fixed inset-y-0 left-0 z-50 flex w-64 md:hidden"
            >
              <Sidebar collapsed={false} onClose={() => setMobileOpen(false)} />
            </div>
          </>
        ) : null}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
