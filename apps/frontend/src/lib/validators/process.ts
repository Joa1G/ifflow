import { z } from "zod";

import type { components } from "../../types/api";

/**
 * Validators do editor admin de processos (F-22).
 *
 * Os enums vêm do tipo gerado do OpenAPI (`components["schemas"]["..."]`)
 * — `z.enum` precisa de um array literal, então duplicamos os valores aqui.
 * Um teste em `process.test.ts` garante que esses arrays estão alinhados
 * com o que o backend expõe; se um valor novo for adicionado lá, o teste
 * falha e nos lembra de atualizar este arquivo.
 */

const PROCESS_CATEGORIES = [
  "RH",
  "MATERIAIS",
  "FINANCEIRO",
  "TECNOLOGIA",
  "INFRAESTRUTURA",
  "CONTRATACOES",
] as const satisfies readonly components["schemas"]["ProcessCategory"][];

const RESOURCE_TYPES = [
  "DOCUMENT",
  "LEGAL_BASIS",
  "POP",
  "LINK",
] as const satisfies readonly components["schemas"]["ResourceType"][];

export { PROCESS_CATEGORIES, RESOURCE_TYPES };

/**
 * Schema dos metadados do processo — usado tanto na criação quanto na
 * edição. `requirements` aceita lista vazia (alguns processos não têm
 * pré-requisitos formais).
 */
export const processMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Título precisa de pelo menos 3 caracteres.")
    .max(200, "Título não pode ter mais de 200 caracteres."),
  short_description: z
    .string()
    .trim()
    .min(10, "Descrição curta precisa de pelo menos 10 caracteres.")
    .max(280, "Descrição curta não pode ter mais de 280 caracteres."),
  full_description: z
    .string()
    .trim()
    .min(20, "Descrição completa precisa de pelo menos 20 caracteres."),
  category: z.enum(PROCESS_CATEGORIES, {
    message: "Selecione uma categoria válida.",
  }),
  estimated_time: z
    .string()
    .trim()
    .min(1, "Informe o tempo estimado (ex: '30 a 45 dias').")
    .max(120),
  requirements: z
    .array(z.string().trim().min(1, "Requisito não pode ser vazio."))
    .max(20, "Máximo de 20 requisitos."),
});

export type ProcessMetadataInput = z.infer<typeof processMetadataSchema>;

/**
 * Schema de uma etapa individual do fluxo. `order` é número >= 1 — o
 * backend valida unicidade dentro do processo. `sector_id` é UUID.
 */
export const flowStepSchema = z.object({
  sector_id: z
    .string()
    .uuid("Selecione um setor válido."),
  order: z
    .number({ message: "Ordem precisa ser um número." })
    .int("Ordem precisa ser inteiro.")
    .min(1, "Ordem começa em 1."),
  title: z
    .string()
    .trim()
    .min(3, "Título da etapa precisa de pelo menos 3 caracteres.")
    .max(200),
  description: z
    .string()
    .trim()
    .min(10, "Descrição da etapa precisa de pelo menos 10 caracteres."),
  responsible: z
    .string()
    .trim()
    .min(2, "Informe o responsável.")
    .max(120),
  estimated_time: z
    .string()
    .trim()
    .min(1, "Informe o tempo estimado.")
    .max(60),
});

export type FlowStepInput = z.infer<typeof flowStepSchema>;

/**
 * Schema de recurso de etapa. `url` e `content` são mutuamente opcionais —
 * o backend não força regra dura no MVP (os admins cuidam disso
 * manualmente, ver schema StepResourceCreate). Forçamos pelo menos UM dos
 * dois aqui no frontend para evitar recurso "fantasma" sem conteúdo.
 */
export const stepResourceSchema = z
  .object({
    type: z.enum(RESOURCE_TYPES, { message: "Selecione um tipo." }),
    title: z
      .string()
      .trim()
      .min(2, "Título do recurso precisa de pelo menos 2 caracteres.")
      .max(200),
    url: z
      .string()
      .trim()
      .url("URL inválida.")
      .or(z.literal(""))
      .optional(),
    content: z.string().trim().optional(),
  })
  .refine(
    (data) => {
      const hasUrl = data.url !== undefined && data.url.length > 0;
      const hasContent =
        data.content !== undefined && data.content.length > 0;
      return hasUrl || hasContent;
    },
    {
      message: "Informe uma URL ou um conteúdo (pelo menos um dos dois).",
      path: ["url"],
    },
  );

export type StepResourceInput = z.infer<typeof stepResourceSchema>;
