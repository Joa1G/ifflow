import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relative-time";

const now = new Date("2026-04-24T12:00:00Z");

describe("formatRelativeTime", () => {
  it("retorna 'agora mesmo' para diferenças menores que 45s", () => {
    expect(
      formatRelativeTime("2026-04-24T11:59:30Z", now),
    ).toBe("agora mesmo");
  });

  it("formata minutos no passado", () => {
    // 3 min atrás → "há 3 minutos" (exato depende do locale)
    const out = formatRelativeTime("2026-04-24T11:57:00Z", now);
    expect(out).toMatch(/3\s+minutos?/);
    expect(out.toLowerCase()).toContain("há");
  });

  it("formata horas no passado", () => {
    const out = formatRelativeTime("2026-04-24T10:00:00Z", now);
    expect(out).toMatch(/2\s+horas?/);
  });

  it("formata dias no passado", () => {
    // `Intl.RelativeTimeFormat` com `numeric: "auto"` usa termos
    // contextuais do pt-BR ("ontem", "anteontem") em vez de "há N dias"
    // nos casos próximos. Aceitamos qualquer um dos dois formatos.
    const out = formatRelativeTime("2026-04-22T12:00:00Z", now);
    expect(out).toMatch(/(2\s+dias?|anteontem)/i);
  });

  it("retorna string vazia para ISO inválida", () => {
    expect(formatRelativeTime("não-é-data", now)).toBe("");
  });
});
