import { z } from "zod";

/**
 * Validadores Zod para os formulários de autenticação.
 *
 * Espelham as regras do backend em `app/schemas/auth.py`. Se alguma regra
 * aqui divergir, a fonte da verdade é sempre o backend — o frontend
 * reprova antes só para dar feedback imediato ao usuário.
 *
 * Segurança: senhas nunca são trimadas, normalizadas ou transformadas.
 * Email é `.trim().toLowerCase()` porque comparações de email são
 * case-insensitive e espaço em branco acidental quebraria o login.
 */

const IFAM_DOMAIN = "@ifam.edu.br";

const emailField = z
  .string({ message: "Email é obrigatório" })
  .trim()
  .toLowerCase()
  .min(1, "Email é obrigatório")
  .email("Email inválido");

const ifamEmailField = emailField.refine(
  (email) => email.endsWith(IFAM_DOMAIN),
  { message: "O email deve pertencer ao domínio @ifam.edu.br" },
);

const passwordField = z
  .string({ message: "Senha é obrigatória" })
  .min(8, "A senha deve ter no mínimo 8 caracteres");

const requiredString = (label: string) =>
  z
    .string({ message: `${label} é obrigatório` })
    .trim()
    .min(1, `${label} é obrigatório`);

export const registerSchema = z
  .object({
    name: requiredString("Nome"),
    email: ifamEmailField,
    siape: requiredString("SIAPE"),
    sector: requiredString("Setor"),
    password: passwordField,
    password_confirmation: z.string({
      message: "Confirmação de senha é obrigatória",
    }),
  })
  .refine((data) => data.password === data.password_confirmation, {
    path: ["password_confirmation"],
    message: "As senhas não conferem",
  });

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ message: "Senha é obrigatória" })
    .min(1, "Senha é obrigatória"),
});

export const passwordResetRequestSchema = z.object({
  email: emailField,
});

export const passwordResetConfirmSchema = z
  .object({
    token: requiredString("Token"),
    new_password: passwordField,
    new_password_confirmation: z.string({
      message: "Confirmação de senha é obrigatória",
    }),
  })
  .refine((data) => data.new_password === data.new_password_confirmation, {
    path: ["new_password_confirmation"],
    message: "As senhas não conferem",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;
export type PasswordResetConfirmInput = z.infer<
  typeof passwordResetConfirmSchema
>;
