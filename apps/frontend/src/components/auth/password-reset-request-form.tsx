import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { usePasswordResetRequestMutation } from "../../hooks/use-auth";
import { ApiError } from "../../lib/api-error";
import {
  passwordResetRequestSchema,
  type PasswordResetRequestInput,
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
import { Input } from "../ui/input";

/**
 * Formulário de solicitação de reset de senha.
 *
 * Segurança:
 *   - O backend responde SEMPRE 200 com mensagem genérica ("se o email
 *     estiver cadastrado..."), independente da existência da conta.
 *     Exibimos essa mensagem como veio — qualquer customização aqui
 *     vazaria a existência do email (REQ-004).
 *   - Após sucesso, trocamos a UI por um estado "email enviado" em vez
 *     de permitir resubmit imediato. Rate limit é do backend (3/hora),
 *     mas evitar spam de cliques é bom UX.
 */
export function PasswordResetRequestForm() {
  const mutation = usePasswordResetRequestMutation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: PasswordResetRequestInput) => {
    mutation.mutate(values, {
      onSuccess: (res) => {
        setSuccessMessage(res.message);
      },
      onError: (err) => {
        if (!(err instanceof ApiError)) {
          toast.error("Não foi possível enviar o pedido. Tente novamente.");
          return;
        }
        if (err.code === "RATE_LIMITED") {
          toast.error("Muitas tentativas. Aguarde alguns minutos.");
          return;
        }
        toast.error(err.message);
      },
    });
  };

  if (successMessage) {
    return (
      <div
        role="status"
        className="rounded-md border border-ifflow-rule bg-ifflow-bone/40 p-4 text-sm leading-relaxed text-ifflow-ink"
      >
        {successMessage}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
        aria-label="Formulário de recuperação de senha"
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
            "Enviar link de redefinição"
          )}
        </Button>
      </form>
    </Form>
  );
}
