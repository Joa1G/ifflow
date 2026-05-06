import { useId } from "react";

import { cn } from "../../lib/utils";

/**
 * Marca IFFLOW: par de cartões empilhados ("Stack Flow") + seta de fluxo.
 *
 * As cores fixas (azul + teal) vêm do brand book do mock em
 * `IFFLOW Menus.html` / `screens/brand.jsx`. Elas escapam dos tokens
 * `ifflow-*` do tema porque o logo é uma assinatura visual e precisa
 * ser estável independente do tema (light/dark) — mesmo padrão de
 * decisão que governos costumam usar em brasões.
 *
 * `mode="mono"` e `mono-dark` são versões para favicon / situações em
 * que o logo precisa colapsar para uma cor sólida (ex: rail colapsado
 * sobre fundo escuro).
 */
type LogoMode = "color" | "mono" | "mono-dark";

interface IfflowMarkProps {
  size?: number;
  mode?: LogoMode;
  className?: string;
}

const BRAND = {
  blue: "#2E6BE6",
  blueLite: "#5B8DF0",
  teal: "#1FB8A6",
};

export function IfflowMark({
  size = 28,
  mode = "color",
  className,
}: IfflowMarkProps) {
  const reactId = useId();
  const gradientId = `ifflow-mark-${reactId.replace(/:/g, "")}-gr`;

  const back =
    mode === "mono-dark"
      ? "rgba(255,255,255,0.35)"
      : mode === "mono"
        ? "rgba(0,0,0,0.35)"
        : BRAND.blue;
  const front =
    mode === "mono-dark"
      ? "#fff"
      : mode === "mono"
        ? "#111"
        : `url(#${gradientId})`;
  const arrow =
    mode === "mono-dark" ? "#fff" : mode === "mono" ? "#111" : BRAND.teal;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden
      className={cn("block shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={BRAND.blueLite} />
          <stop offset="100%" stopColor={BRAND.blue} />
        </linearGradient>
      </defs>
      <path
        d="M14 16 H42 L52 26 V60 a6 6 0 0 1 -6 6 H14 a6 6 0 0 1 -6 -6 V22 a6 6 0 0 1 6 -6 z"
        fill={back}
        opacity={mode === "color" ? "0.55" : "1"}
      />
      <path
        d="M28 24 H58 L70 36 V72 a6 6 0 0 1 -6 6 H28 a6 6 0 0 1 -6 -6 V30 a6 6 0 0 1 6 -6 z"
        fill={front}
      />
      <path
        d="M58 24 V36 H70"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M44 78 H78 L70 70 M78 78 L70 86"
        stroke={arrow}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface IfflowLogoProps {
  size?: number;
  mode?: LogoMode;
  /** Esconde o wordmark "ifflow" (útil em rail colapsado / favicon). */
  markOnly?: boolean;
  /** Quando false, mostra também a tagline abaixo do wordmark. */
  compact?: boolean;
  className?: string;
}

/**
 * Lockup completo do logo: marca + wordmark "ifflow" e tagline opcional.
 *
 * Modo `compact` (default) é o usado no topbar slim: marca + wordmark
 * lado a lado, sem tagline. Modo expandido (compact={false}) mostra a
 * tagline abaixo — adequado para tela de login / hero. `markOnly` reduz
 * para apenas a marca, útil quando a sidebar está colapsada.
 */
export function IfflowLogo({
  size = 28,
  mode = "color",
  markOnly = false,
  compact = true,
  className,
}: IfflowLogoProps) {
  if (markOnly) {
    return <IfflowMark size={size} mode={mode} className={className} />;
  }

  const wordColor =
    mode === "mono-dark" ? "text-white" : "text-ifflow-ink";
  const tagColor =
    mode === "mono-dark" ? "text-white/60" : "text-ifflow-muted";

  return (
    <span
      className={cn(
        "inline-flex items-center leading-none",
        compact ? "gap-2.5" : "gap-3",
        className,
      )}
    >
      <IfflowMark size={size} mode={mode} />
      <span className="inline-flex flex-col leading-none">
        <span
          className={cn(
            "font-bold tracking-[-0.045em]",
            wordColor,
          )}
          style={{ fontSize: compact ? 22 : Math.round(size * 0.95) }}
        >
          ifflow
        </span>
        {!compact ? (
          <span
            className={cn(
              "mt-1.5 text-[11px] font-normal tracking-[0.005em]",
              tagColor,
            )}
          >
            sistema de documentação processual
          </span>
        ) : null}
      </span>
    </span>
  );
}
