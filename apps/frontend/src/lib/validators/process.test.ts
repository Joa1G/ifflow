import { describe, expect, it } from "vitest";

import {
  PROCESS_CATEGORIES,
  RESOURCE_TYPES,
  flowStepSchema,
  processMetadataSchema,
  stepResourceSchema,
} from "./process";
import type { components } from "../../types/api";

describe("processMetadataSchema", () => {
  const valid = {
    title: "Solicitação de Capacitação",
    short_description: "Afastamento para estudos.",
    full_description: "Processo completo de pedido de afastamento para cursos.",
    category: "RH" as const,
    estimated_time: "30 a 45 dias",
    requirements: ["Ser servidor efetivo", "Ter chefia imediata"],
  };

  it("aceita input válido", () => {
    expect(processMetadataSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita título curto", () => {
    const out = processMetadataSchema.safeParse({ ...valid, title: "X" });
    expect(out.success).toBe(false);
  });

  it("rejeita categoria inválida", () => {
    const out = processMetadataSchema.safeParse({
      ...valid,
      category: "OUTRA",
    });
    expect(out.success).toBe(false);
  });

  it("aceita lista vazia de requisitos", () => {
    const out = processMetadataSchema.safeParse({ ...valid, requirements: [] });
    expect(out.success).toBe(true);
  });

  it("rejeita requisito vazio na lista", () => {
    const out = processMetadataSchema.safeParse({
      ...valid,
      requirements: ["válido", ""],
    });
    expect(out.success).toBe(false);
  });

  it("trim em strings: 'X  ' equivale a 'X' para min length", () => {
    const out = processMetadataSchema.safeParse({
      ...valid,
      title: "  X  ",
    });
    // Após trim → "X" (1 caractere) → falha o min(3).
    expect(out.success).toBe(false);
  });
});

describe("flowStepSchema", () => {
  const valid = {
    // UUID v4 válido (versão 4, variant 8 — exige Zod 4 estrito).
    sector_id: "11111111-1111-4111-8111-111111111111",
    order: 1,
    title: "Autuar processo no SIPAC",
    description: "Abertura do processo eletrônico pelo servidor.",
    responsible: "Servidor interessado",
    estimated_time: "1 dia útil",
  };

  it("aceita input válido", () => {
    expect(flowStepSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita sector_id que não é UUID", () => {
    const out = flowStepSchema.safeParse({ ...valid, sector_id: "abc-123" });
    expect(out.success).toBe(false);
  });

  it("rejeita order < 1", () => {
    expect(flowStepSchema.safeParse({ ...valid, order: 0 }).success).toBe(
      false,
    );
    expect(flowStepSchema.safeParse({ ...valid, order: -1 }).success).toBe(
      false,
    );
  });

  it("rejeita order não-inteiro", () => {
    expect(flowStepSchema.safeParse({ ...valid, order: 1.5 }).success).toBe(
      false,
    );
  });
});

describe("stepResourceSchema", () => {
  it("aceita recurso só com url", () => {
    const out = stepResourceSchema.safeParse({
      type: "DOCUMENT",
      title: "Formulário",
      url: "https://example.org/form.pdf",
    });
    expect(out.success).toBe(true);
  });

  it("aceita recurso só com content (ex: base legal inline)", () => {
    const out = stepResourceSchema.safeParse({
      type: "LEGAL_BASIS",
      title: "Lei 8.112/1990",
      content: "Art. 87 — concessão de licença para capacitação...",
    });
    expect(out.success).toBe(true);
  });

  it("rejeita recurso sem URL nem content", () => {
    const out = stepResourceSchema.safeParse({
      type: "LINK",
      title: "Algum link",
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const messages = out.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/URL ou um conteúdo/);
    }
  });

  it("rejeita URL inválida", () => {
    const out = stepResourceSchema.safeParse({
      type: "LINK",
      title: "Site",
      url: "não-é-url",
    });
    expect(out.success).toBe(false);
  });

  it("aceita string vazia em url se houver content", () => {
    const out = stepResourceSchema.safeParse({
      type: "LEGAL_BASIS",
      title: "Lei 8.112",
      url: "",
      content: "Texto da lei",
    });
    expect(out.success).toBe(true);
  });
});

describe("alinhamento com OpenAPI", () => {
  // Testes de regressão: se o backend adicionar um novo valor ao enum,
  // este teste falha e nos avisa para atualizar o array literal.
  type ApiCategory = components["schemas"]["ProcessCategory"];
  type ApiResourceType = components["schemas"]["ResourceType"];

  it("PROCESS_CATEGORIES cobre todos os valores do tipo OpenAPI", () => {
    // Coleta todos os valores literais do tipo via type-checking exhaustive:
    // se a função abaixo não compila, é porque algum case está faltando.
    const exhaustive = (cat: ApiCategory): ApiCategory => {
      switch (cat) {
        case "RH":
        case "MATERIAIS":
        case "FINANCEIRO":
        case "TECNOLOGIA":
        case "INFRAESTRUTURA":
        case "CONTRATACOES":
          return cat;
      }
    };
    // Em runtime, valida que cada um está no array literal.
    for (const cat of PROCESS_CATEGORIES) {
      expect(typeof exhaustive(cat)).toBe("string");
    }
    expect(PROCESS_CATEGORIES.length).toBe(6);
  });

  it("RESOURCE_TYPES cobre todos os valores do tipo OpenAPI", () => {
    const exhaustive = (t: ApiResourceType): ApiResourceType => {
      switch (t) {
        case "DOCUMENT":
        case "LEGAL_BASIS":
        case "POP":
        case "LINK":
          return t;
      }
    };
    for (const t of RESOURCE_TYPES) {
      expect(typeof exhaustive(t)).toBe("string");
    }
    expect(RESOURCE_TYPES.length).toBe(4);
  });
});
