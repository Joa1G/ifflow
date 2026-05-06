import {
  Bookmark,
  ClipboardList,
  FilePlus2,
  Files,
  LayoutGrid,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAdminNotifications } from "../../hooks/use-admin-notifications";
import { useAuth } from "../../hooks/use-auth";
import { cn } from "../../lib/utils";
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

interface SidebarProps {
  /**
   * No mobile a sidebar é overlay e nunca colapsa — chega aqui sempre como
   * `false`. No desktop reflete o estado persistido em localStorage.
   */
  collapsed: boolean;
  /**
   * Callback para alternar o estado colapsado/expandido. No mobile o
   * AppShell troca esse handler por `onClose` e some com o botão.
   */
  onToggleCollapsed?: () => void;
  /**
   * Quando definido, troca o ícone do botão por um "fechar" (X) e usa
   * esse callback. Usado pelo overlay mobile.
   */
  onClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

/**
 * Monta as seções de navegação a partir do user autenticado e dos
 * contadores admin. Anônimos só veem "Catálogo" — qualquer outra rota
 * redireciona para /login pelo `ProtectedRoute`, então deixar visível
 * seria gerar bounces.
 */
function useNavSections(): NavSection[] {
  const { user, isAuthenticated } = useAuth();
  const { pendingUsersCount, pendingProcessesCount } = useAdminNotifications();

  const trabalhoItems: NavItem[] = [
    { id: "catalog", label: "Catálogo", icon: LayoutGrid, href: "/" },
  ];
  if (isAuthenticated) {
    trabalhoItems.push(
      {
        id: "mine",
        label: "Processos que criei",
        icon: Files,
        href: "/processes/mine",
      },
      {
        id: "following",
        label: "Processos que acompanho",
        icon: Bookmark,
        href: "/processes/following",
      },
      {
        id: "new",
        label: "Criar processo",
        icon: FilePlus2,
        href: "/processes/new",
      },
    );
  }

  const sections: NavSection[] = [
    { id: "work", title: "Trabalho", items: trabalhoItems },
  ];

  if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
    sections.push({
      id: "admin",
      title: "Administração",
      items: [
        {
          id: "admin-processes",
          label: "Processos (Admin)",
          icon: ClipboardList,
          href: "/admin/processes",
          badge: pendingProcessesCount > 0 ? pendingProcessesCount : undefined,
        },
        {
          id: "admin-users",
          label: "Usuários pendentes",
          icon: Shield,
          href: "/admin/users",
          badge: pendingUsersCount > 0 ? pendingUsersCount : undefined,
        },
      ],
    });
  }

  if (user?.role === "SUPER_ADMIN") {
    sections.push({
      id: "super",
      title: "Super admin",
      items: [
        {
          id: "roles",
          label: "Papéis & permissões",
          icon: ShieldCheck,
          href: "/super-admin/roles",
        },
      ],
    });
  }

  return sections;
}

/**
 * Resolve qual item está ativo a partir da URL atual. Itens com
 * `href === "/"` só batem com a raiz exata (caso contrário "Catálogo"
 * ficaria sempre ativo). Demais usam prefix-match para que sub-rotas
 * (`/admin/processes/new`, `/admin/processes/:id/edit`) destaquem o
 * item pai.
 */
function isItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ collapsed, onToggleCollapsed, onClose }: SidebarProps) {
  const sections = useNavSections();
  const { pathname } = useLocation();
  const { user, isAuthenticated } = useAuth();

  const ToggleIcon = onClose ? X : collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleAria = onClose
    ? "Fechar menu"
    : collapsed
      ? "Expandir menu"
      : "Recolher menu";
  const handleToggle = onClose ?? onToggleCollapsed;

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "flex h-full flex-col border-r border-ifflow-rule bg-ifflow-paper",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-12 items-center border-b border-ifflow-rule",
          collapsed ? "justify-center px-2" : "justify-between px-3",
        )}
      >
        {!collapsed ? (
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ifflow-muted">
            Menu
          </span>
        ) : null}
        {handleToggle ? (
          <button
            type="button"
            onClick={handleToggle}
            aria-label={toggleAria}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ifflow-muted transition-colors hover:bg-secondary hover:text-ifflow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1"
          >
            <ToggleIcon className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto py-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {sections.map((section, index) => (
          <div key={section.id} className={cn(index > 0 && "mt-5")}>
            {!collapsed ? (
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-ifflow-muted">
                {section.title}
              </div>
            ) : index > 0 ? (
              <div
                aria-hidden
                className="mx-2 my-2 h-px bg-ifflow-rule"
              />
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.id}>
                  <SidebarItem
                    item={item}
                    active={isItemActive(item.href, pathname)}
                    collapsed={collapsed}
                    onNavigate={onClose}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={cn("border-t border-ifflow-rule", collapsed ? "p-2" : "p-3")}>
        {isAuthenticated && user ? (
          <SidebarUserMenu user={user} collapsed={collapsed} />
        ) : (
          <SidebarAuthCtas collapsed={collapsed} onNavigate={onClose} />
        )}
      </div>
    </nav>
  );
}

interface SidebarItemProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarItem({ item, active, collapsed, onNavigate }: SidebarItemProps) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      aria-label={
        collapsed && item.badge
          ? `${item.label} (${item.badge} pendente${item.badge === 1 ? "" : "s"})`
          : undefined
      }
      className={cn(
        "relative flex items-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1",
        collapsed
          ? "h-10 w-10 mx-auto justify-center"
          : "h-9 gap-2.5 px-2.5",
        active
          ? "bg-secondary text-ifflow-ink"
          : "text-ifflow-muted hover:bg-secondary hover:text-ifflow-ink",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full bg-ifflow-green",
            collapsed ? "left-0 top-2 bottom-2 w-0.5" : "left-0 top-1.5 bottom-1.5 w-0.5",
          )}
        />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed ? (
        <span className="flex-1 truncate">{item.label}</span>
      ) : null}
      {!collapsed && item.badge ? (
        <span
          aria-hidden
          className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-sm bg-ifflow-green/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ifflow-green"
        >
          {item.badge}
        </span>
      ) : null}
      {collapsed && item.badge ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-ifflow-paper"
        />
      ) : null}
    </Link>
  );
}

interface SidebarUserMenuProps {
  user: UserMe;
  collapsed: boolean;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = trimmed[0];
  return first ? first.toUpperCase() : "?";
}

function SidebarUserMenu({ user, collapsed }: SidebarUserMenuProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast.success("Sessão encerrada.");
    navigate("/", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className={cn(
          "flex w-full items-center rounded-md text-sm font-medium text-ifflow-ink transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1",
          collapsed ? "h-10 w-10 mx-auto justify-center" : "gap-2.5 p-1.5",
        )}
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ifflow-green text-sm font-medium text-white"
        >
          {initialOf(user.name)}
        </span>
        {!collapsed ? (
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span className="truncate text-[13px] font-medium text-ifflow-ink">
              {user.name}
            </span>
            <span className="truncate text-[11px] text-ifflow-muted">
              {user.email}
            </span>
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? "right" : "top"}
        className="w-56"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-medium text-ifflow-ink">{user.name}</span>
          <span className="text-xs font-normal text-ifflow-muted">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="cursor-pointer text-ifflow-ink"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarAuthCtasProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarAuthCtas({ collapsed, onNavigate }: SidebarAuthCtasProps) {
  if (collapsed) {
    return (
      <Link
        to="/login"
        onClick={onNavigate}
        title="Entrar"
        aria-label="Entrar"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-ifflow-green text-white transition-colors hover:bg-ifflow-green-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1"
      >
        <LogIn className="h-4 w-4" aria-hidden />
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        asChild
        className="h-9 w-full bg-ifflow-green text-sm font-medium text-white hover:bg-ifflow-green-hover focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1"
      >
        <Link to="/login" onClick={onNavigate}>
          Entrar
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className="h-9 w-full border-ifflow-rule bg-transparent text-sm font-medium text-ifflow-ink hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1"
      >
        <Link to="/register" onClick={onNavigate}>
          Cadastrar
        </Link>
      </Button>
    </div>
  );
}
