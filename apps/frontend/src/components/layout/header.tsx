import { ClipboardList, LogOut, Shield, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "../../hooks/use-auth";
import type { UserMe } from "../../stores/auth-store";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/**
 * Header institucional com dropdown de perfil.
 *
 * Renderiza o logo à esquerda e, à direita:
 *   - Botão "Entrar" quando não há sessão.
 *   - Dropdown com avatar + dados do usuário quando autenticado.
 *
 * Segurança:
 *   - Os links "Painel Admin" / "Gerenciar papéis" aparecem só por role,
 *     mas isso é apenas UX. Quem o backend não autorizar vai tomar 403
 *     na rota (validação real é servidor-side, ADR-008 do CLAUDE.md).
 *   - Nada sensível é colocado no DOM além do que o usuário já vê em
 *     outras telas autenticadas (nome, email). Token não aparece aqui.
 */
export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success("Sessão encerrada.");
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-ifflow-rule bg-ifflow-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="font-serif text-2xl font-medium tracking-tight text-ifflow-ink transition-opacity hover:opacity-70"
        >
          IFFLOW
        </Link>

        {isAuthenticated && user ? (
          <UserMenu user={user} onLogout={handleLogout} />
        ) : (
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-md border-ifflow-rule bg-transparent px-4 text-sm font-medium text-ifflow-ink hover:bg-ifflow-bone focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2"
            >
              <Link to="/register">Cadastrar</Link>
            </Button>
            <Button
              asChild
              className="h-9 rounded-md bg-ifflow-green px-4 text-sm font-medium text-white hover:bg-ifflow-green-hover focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2"
            >
              <Link to="/login">Entrar</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = trimmed[0];
  return first ? first.toUpperCase() : "?";
}

interface UserMenuProps {
  user: UserMe;
  onLogout: () => void;
}

function UserMenu({ user, onLogout }: UserMenuProps) {
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const isSuperAdmin = user.role === "SUPER_ADMIN";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ifflow-green text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2"
      >
        <span aria-hidden>{initialsOf(user.name)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-medium text-ifflow-ink">
            {user.name}
          </span>
          <span className="text-xs font-normal text-ifflow-muted">
            {user.email}
          </span>
        </DropdownMenuLabel>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/admin/processes" className="cursor-pointer">
                <ClipboardList className="mr-2 h-4 w-4" aria-hidden />
                Processos (Admin)
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/admin/users" className="cursor-pointer">
                <Shield className="mr-2 h-4 w-4" aria-hidden />
                Usuários pendentes
              </Link>
            </DropdownMenuItem>
          </>
        )}
        {isSuperAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/super-admin/roles" className="cursor-pointer">
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
              Gerenciar papéis
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onLogout}
          className="cursor-pointer text-ifflow-ink"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
