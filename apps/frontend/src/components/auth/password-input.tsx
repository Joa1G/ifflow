import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type ComponentProps } from "react";

import { cn } from "../../lib/utils";
import { Input } from "../ui/input";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

/**
 * Input de senha com toggle de visibilidade (ícone de olho).
 *
 * Alterna entre `type="password"` e `type="text"` via estado local.
 * A senha em si permanece no RHF/value do pai — nada aqui é logado,
 * persistido ou enviado pra lugar nenhum fora do form.
 *
 * O botão é tab-reachable (tabIndex padrão) para usuários de teclado
 * poderem acionar o toggle sem mouse.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const Icon = visible ? EyeOff : Eye;

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-ifflow-muted transition-colors hover:text-ifflow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green"
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  },
);
