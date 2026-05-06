import { Moon, Sun } from "lucide-react";

import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";

/**
 * Pill switch claro/escuro inspirado em toggles físicos: pílula com
 * fundo + bolinha (thumb) que desliza. A bolinha sempre cobre o ícone
 * do tema **inativo**, deixando exposto o ícone do tema ativo —
 * convenção "o ícone visível é o tema atual" usada em apps de produto.
 *
 * Cores via tokens: `bg-secondary` (pílula) e `bg-foreground` (thumb)
 * já invertem entre claro/escuro pelo `.dark` do CSS, sem if/else de
 * cor — uma única classe atende as duas variantes.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Mudar para tema claro" : "Mudar para tema escuro";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      className="relative h-7 w-[52px] shrink-0 rounded-full border border-ifflow-rule bg-secondary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2 focus-visible:ring-offset-ifflow-paper"
    >
      <Sun
        aria-hidden
        className="absolute left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground"
      />
      <Moon
        aria-hidden
        className="absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground"
      />
      <span
        aria-hidden
        data-testid="theme-toggle-thumb"
        className={cn(
          "absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-foreground shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-out",
          isDark ? "translate-x-0" : "translate-x-6",
        )}
      />
    </button>
  );
}
