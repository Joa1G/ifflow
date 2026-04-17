import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { usePasswordResetConfirmMutation } from "../../hooks/use-auth";
import { ApiError } from "../../lib/api-error";
import {
  passwordResetConfirmSchema,
  type PasswordResetConfirmInput,
} from "../../lib/validators/auth";
import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { PasswordInput } from "./password-input";

const fieldLabelClass =
  "text-[11px] font-medium uppercase tracking-[0.1em] text-ifflow-muted";

const fieldInputClass =
  "h-11 rounded-md border-ifflow-rule bg-transparent text-[15px] placeholder:text-ifflow-muted/60 focus-visible:ring-ifflow-green";

interface PasswordResetConfirmFormProps {
  token: string;
}

/**
 * Formulário de confirmação de reset de senha.
 *
 * Recebe o `token` como prop (a página extrai do query string). O token não
 * é editável — vai como hidden no payload e nunca aparece em label, placeholder
 * ou console.
 *
 * Segurança:
 *   - O backend agrupa toda falha de token (inexistente / expirado / já usado)
 *     no code `INVALID_RESET_TOKEN` com a MESMA mensagem, para não dar pistas
 *     a quem tenta adivinhar. A UI espelha isso: nada de "token expirado"
 *     específico — só "inválido ou expirado".
 *   - `WEAK_PASSWORD` vira erro no campo `new_password`.
 *   - Em sucesso (204), limpamos estado local e redirecionamos para /login.
 */
export function PasswordResetConfirmForm({
  token,
}: PasswordResetConfirmFormProps) {
  const navigate = useNavigate();
  const mutation = usePasswordResetConfirmMutation();

  const form = useForm<PasswordResetConfirmInput>({
    resolver: zodResolver(passwordResetConfirmSchema),
    defaultValues: {
      token,
      new_password: "",
      new_password_confirmation: "",
    },
  });

  const onSubmit = (values: PasswordResetConfirmInput) => {
    mutation.mutate(values, {
      onSuccess: () => {
        toast.success("Senha redefinida. Faça login com a nova senha.");
        navigate("/login", { replace: true });
      },
      onError: (err) => {
        if (!(err instanceof ApiError)) {
          toast.error("Não foi possível redefinir a senha. Tente novamente.");
          return;
        }
        switch (err.code) {
          case "INVALID_RESET_TOKEN":
            toast.error(
              "Link inválido ou expirado. Solicite uma nova redefinição.",
            );
            break;
          case "WEAK_PASSWORD":
            form.setError("new_password", {
              type: "server",
              message: err.message || "Senha muito fraca.",
            });
            break;
          case "RATE_LIMITED":
            toast.error("Muitas tentativas. Aguarde alguns minutos.");
            break;
          default:
            toast.error(err.message);
        }
      },
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
        aria-label="Formulário de redefinição de senha"
      >
        <input type="hidden" {...form.register("token")} />

        <FormField
          control={form.control}
          name="new_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={fieldLabelClass}>Nova senha</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  className={fieldInputClass}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="new_password_confirmation"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={fieldLabelClass}>
                Confirmar nova senha
              </FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Repita a nova senha"
                  className={fieldInputClass}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="h-11 w-full rounded-md bg-ifflow-green font-medium tracking-wide text-white shadow-sm hover:bg-ifflow-green-hover focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Redefinindo…
            </>
          ) : (
            "Redefinir senha"
          )}
        </Button>
      </form>
    </Form>
  );
}
