import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { PasswordInput } from "./password-input";
import { useLoginMutation } from "../../hooks/use-auth";
import { ApiError } from "../../lib/api-error";
import { loginSchema, type LoginInput } from "../../lib/validators/auth";

/**
 * Formulário de login.
 *
 * Valida localmente com Zod (`loginSchema`) para dar feedback imediato.
 * O backend ainda é a autoridade — erros como INVALID_CREDENTIALS vêm
 * de lá e são traduzidos em toast ou navegação pelo switch de `code`.
 *
 * Segurança:
 *   - Campo senha é type="password", autoComplete="current-password".
 *   - A senha nunca é logada (errors do backend são tratados pelo code,
 *     não por inspecionar o conteúdo).
 *   - Redirect preserva `location.state.from` quando veio de rota
 *     protegida (F-07).
 */
export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useLoginMutation();

  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? "/";

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginInput) => {
    mutation.mutate(values, {
      onSuccess: () => {
        toast.success("Bem-vindo ao IFFLOW.");
        navigate(from, { replace: true });
      },
      onError: (err) => {
        if (!(err instanceof ApiError)) {
          toast.error("Não foi possível entrar. Tente novamente.");
          return;
        }
        switch (err.code) {
          case "INVALID_CREDENTIALS":
            toast.error("Email ou senha incorretos.");
            break;
          case "ACCOUNT_PENDING":
            navigate("/pending", { replace: true });
            break;
          case "ACCOUNT_REJECTED":
            toast.error(err.message);
            break;
          case "RATE_LIMITED":
            toast.error("Muitas tentativas. Aguarde um minuto.");
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
        aria-label="Formulário de login"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[11px] font-medium uppercase tracking-[0.1em] text-ifflow-muted">
                Email institucional
              </FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="nome.sobrenome@ifam.edu.br"
                  className="h-11 rounded-md border-ifflow-rule bg-transparent text-[15px] placeholder:text-ifflow-muted/60 focus-visible:ring-ifflow-green"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[11px] font-medium uppercase tracking-[0.1em] text-ifflow-muted">
                Senha
              </FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="current-password"
                  className="h-11 rounded-md border-ifflow-rule bg-transparent text-[15px] focus-visible:ring-ifflow-green"
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
              Entrando…
            </>
          ) : (
            "Entrar"
          )}
        </Button>
      </form>
    </Form>
  );
}
