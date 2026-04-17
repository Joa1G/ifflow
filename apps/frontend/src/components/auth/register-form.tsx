import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useRegisterMutation } from "../../hooks/use-auth";
import { ApiError } from "../../lib/api-error";
import { registerSchema, type RegisterInput } from "../../lib/validators/auth";
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

const fieldLabelClass =
  "text-[11px] font-medium uppercase tracking-[0.1em] text-ifflow-muted";

const fieldInputClass =
  "h-11 rounded-md border-ifflow-rule bg-transparent text-[15px] placeholder:text-ifflow-muted/60 focus-visible:ring-ifflow-green";

/**
 * Formulário de cadastro institucional.
 *
 * Valida localmente com Zod (`registerSchema`) antes de enviar ao backend.
 * Erros de validação do servidor caem no campo correspondente via
 * `form.setError` — o usuário corrige no lugar em vez de ver só um toast.
 *
 * Segurança:
 *   - Senhas usam `PasswordInput` (type="password") com
 *     `autoComplete="new-password"` — evita que gerenciadores sugiram
 *     uma credencial existente num formulário de criação.
 *   - Nada do conteúdo da senha é logado ou inspecionado; erros são
 *     decididos pelo `code` do ApiError.
 *   - NÃO há login automático após cadastro: o backend cria o user em
 *     status PENDING e o fluxo redireciona para /pending, onde o usuário
 *     aguarda aprovação do administrador.
 */
export function RegisterForm() {
  const navigate = useNavigate();
  const mutation = useRegisterMutation();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      siape: "",
      sector: "",
      password: "",
      password_confirmation: "",
    },
  });

  const onSubmit = (values: RegisterInput) => {
    mutation.mutate(values, {
      onSuccess: () => {
        toast.success(
          "Cadastro recebido. Aguarde aprovação do administrador.",
        );
        navigate("/pending", { replace: true });
      },
      onError: (err) => {
        if (!(err instanceof ApiError)) {
          toast.error("Não foi possível enviar o cadastro. Tente novamente.");
          return;
        }
        switch (err.code) {
          case "EMAIL_ALREADY_EXISTS":
            form.setError("email", {
              type: "server",
              message: "Este email já está cadastrado.",
            });
            break;
          case "INVALID_EMAIL_DOMAIN":
            form.setError("email", {
              type: "server",
              message: "O email deve pertencer ao domínio @ifam.edu.br.",
            });
            break;
          case "WEAK_PASSWORD":
            form.setError("password", {
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
        aria-label="Formulário de cadastro"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={fieldLabelClass}>
                  Nome completo
                </FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="name"
                    placeholder="João da Silva"
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={fieldLabelClass}>
                  Email institucional
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="nome.sobrenome@ifam.edu.br"
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
            name="siape"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={fieldLabelClass}>SIAPE</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="1234567"
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
            name="sector"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={fieldLabelClass}>Setor</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="off"
                    placeholder="PROAD"
                    className={fieldInputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={fieldLabelClass}>Senha</FormLabel>
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
          name="password_confirmation"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={fieldLabelClass}>
                Confirmar senha
              </FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Repita a senha"
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
              Enviando…
            </>
          ) : (
            "Criar conta"
          )}
        </Button>
      </form>
    </Form>
  );
}
