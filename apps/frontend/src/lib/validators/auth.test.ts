import { describe, expect, it } from "vitest";

import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
} from "./auth";

const validRegister = {
  name: "João Silva",
  email: "joao.silva@ifam.edu.br",
  siape: "1234567",
  sector: "PROAD",
  password: "senhaforte123",
  password_confirmation: "senhaforte123",
};

describe("registerSchema", () => {
  it("aceita input válido", () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it("normaliza email para lowercase e remove espaços", () => {
    const parsed = registerSchema.parse({
      ...validRegister,
      email: "  JOAO.SILVA@IFAM.EDU.BR  ",
    });
    expect(parsed.email).toBe("joao.silva@ifam.edu.br");
  });

  it("rejeita email fora do domínio @ifam.edu.br", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "joao@gmail.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "email");
      expect(issue?.message).toMatch(/@ifam\.edu\.br/);
    }
  });

  it("rejeita email malformado antes de checar domínio", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "nao-eh-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "email"),
      ).toBe(true);
    }
  });

  it("rejeita senha com menos de 8 caracteres", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      password: "1234567",
      password_confirmation: "1234567",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "password");
      expect(issue?.message).toMatch(/8 caracteres/);
    }
  });

  it("rejeita quando password_confirmation não bate", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      password: "senhaforte123",
      password_confirmation: "senhaoutra123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "password_confirmation",
      );
      expect(issue?.message).toBe("As senhas não conferem");
    }
  });

  it("rejeita campos ausentes", () => {
    const result = registerSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(
        expect.arrayContaining([
          "name",
          "email",
          "siape",
          "sector",
          "password",
          "password_confirmation",
        ]),
      );
    }
  });

  it("rejeita campos de texto vazios ou só espaços", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      name: "   ",
      siape: "",
      sector: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(
        expect.arrayContaining(["name", "siape", "sector"]),
      );
    }
  });

  it("não trima a senha (preserva espaços intencionais)", () => {
    const parsed = registerSchema.parse({
      ...validRegister,
      password: "  senhaforte  ",
      password_confirmation: "  senhaforte  ",
    });
    expect(parsed.password).toBe("  senhaforte  ");
    expect(parsed.password_confirmation).toBe("  senhaforte  ");
  });
});

describe("loginSchema", () => {
  it("aceita input válido", () => {
    const result = loginSchema.safeParse({
      email: "user@ifam.edu.br",
      password: "qualquersenha",
    });
    expect(result.success).toBe(true);
  });

  it("aceita email de qualquer domínio (backend valida)", () => {
    const result = loginSchema.safeParse({
      email: "user@outrodominio.com",
      password: "qualquersenha",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita email malformado", () => {
    const result = loginSchema.safeParse({
      email: "nao-eh-email",
      password: "senha12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita senha vazia", () => {
    const result = loginSchema.safeParse({
      email: "user@ifam.edu.br",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Senha é obrigatória");
    }
  });

  it("rejeita campos ausentes", () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("passwordResetRequestSchema", () => {
  it("aceita email válido", () => {
    expect(
      passwordResetRequestSchema.safeParse({
        email: "user@ifam.edu.br",
      }).success,
    ).toBe(true);
  });

  it("rejeita email malformado", () => {
    expect(
      passwordResetRequestSchema.safeParse({ email: "xyz" }).success,
    ).toBe(false);
  });

  it("rejeita email ausente", () => {
    expect(passwordResetRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("passwordResetConfirmSchema", () => {
  const validConfirm = {
    token: "abc123",
    new_password: "novasenha8",
    new_password_confirmation: "novasenha8",
  };

  it("aceita input válido", () => {
    expect(passwordResetConfirmSchema.safeParse(validConfirm).success).toBe(
      true,
    );
  });

  it("rejeita token vazio", () => {
    const result = passwordResetConfirmSchema.safeParse({
      ...validConfirm,
      token: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita senha com menos de 8 caracteres", () => {
    const result = passwordResetConfirmSchema.safeParse({
      ...validConfirm,
      new_password: "1234567",
      new_password_confirmation: "1234567",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "new_password"),
      ).toBe(true);
    }
  });

  it("rejeita quando confirmação não bate", () => {
    const result = passwordResetConfirmSchema.safeParse({
      ...validConfirm,
      new_password_confirmation: "outra_senha",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "new_password_confirmation",
      );
      expect(issue?.message).toBe("As senhas não conferem");
    }
  });

  it("rejeita campos ausentes", () => {
    const result = passwordResetConfirmSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
