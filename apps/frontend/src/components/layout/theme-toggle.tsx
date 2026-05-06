import { Moon, Sun } from "lucide-react";

import { useTheme } from "../../lib/theme";

/**
 * Botão de alternância claro/escuro.
 *
 * Mostra Sun quando dark (clique → vai pra light) e Moon quando light.
 * Sem três estados (system) para o MVP — o `getInitialTheme` resolve a
 * preferência do sistema só no primeiro carregamento; depois vale a
 * última escolha explícita do usuário.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Mudar para tema claro" : "Mudar para tema escuro";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      className="flex h-8 w-8 items-center justify-center rounded-md text-ifflow-muted transition-colors hover:bg-secondary hover:text-ifflow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-1"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
