/**
 * Formata um timestamp ISO como tempo relativo em português ("há 3 minutos").
 *
 * Usa `Intl.RelativeTimeFormat` para não adicionar dependência (date-fns etc.).
 * Escolha da menor unidade "humana": se <60s → segundos, <60min → minutos,
 * <24h → horas, <30d → dias, senão meses/anos.
 *
 * `now` é injetável para facilitar testes determinísticos.
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const diffSec = Math.round((then.getTime() - now.getTime()) / 1000);
  const absSec = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (absSec < 45) return "agora mesmo";
  if (absSec < 60 * 60) return rtf.format(Math.round(diffSec / 60), "minute");
  if (absSec < 60 * 60 * 24)
    return rtf.format(Math.round(diffSec / (60 * 60)), "hour");
  if (absSec < 60 * 60 * 24 * 30)
    return rtf.format(Math.round(diffSec / (60 * 60 * 24)), "day");
  if (absSec < 60 * 60 * 24 * 365)
    return rtf.format(Math.round(diffSec / (60 * 60 * 24 * 30)), "month");
  return rtf.format(Math.round(diffSec / (60 * 60 * 24 * 365)), "year");
}
