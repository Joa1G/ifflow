import { Clock, ExternalLink, User } from "lucide-react";

import type { components } from "../../types/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Separator } from "../ui/separator";

type FlowStepRead = components["schemas"]["FlowStepRead"];
type StepResourceRead = components["schemas"]["StepResourceRead"];

interface StepDetailModalProps {
  step: FlowStepRead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Aceita apenas schemas considerados seguros para abrir em um <a href>.
 * URLs vindas da API NÃO são confiáveis — um admin malicioso (ou um copy
 * & paste infeliz) pode cadastrar `javascript:` e explorar o click do
 * usuário. React já protege contra JS-URLs em href, mas a defesa extra
 * aqui também cobre `data:` e esquemas arbitrários.
 */
function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function StepDetailModal({
  step,
  open,
  onOpenChange,
}: StepDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl gap-0 overflow-hidden p-0">
        {step ? <ModalBody step={step} /> : <ModalEmpty />}
      </DialogContent>
    </Dialog>
  );
}

function ModalEmpty() {
  return (
    <div className="px-6 pb-5 pt-6">
      <DialogHeader className="sr-only">
        <DialogTitle>Detalhes da etapa</DialogTitle>
        <DialogDescription>
          Nenhuma etapa selecionada.
        </DialogDescription>
      </DialogHeader>
    </div>
  );
}

function ModalBody({ step }: { step: FlowStepRead }) {
  const paddedOrder = String(step.order).padStart(2, "0");
  const documents = step.resources.filter((r) => r.type === "DOCUMENT");
  const legalBasis = step.resources.filter((r) => r.type === "LEGAL_BASIS");
  const pops = step.resources.filter((r) => r.type === "POP");

  return (
    <div className="overflow-y-auto">
      <div className="px-6 pb-5 pt-6">
        <div className="flex items-center justify-between gap-4">
          <EyebrowRule
            label={`Etapa ${paddedOrder} · ${step.sector.acronym}`}
          />
          <span
            aria-hidden
            className="font-mono text-xs tracking-wider text-muted-foreground"
          >
            {step.sector.acronym}
          </span>
        </div>

        <DialogHeader className="mt-5 space-y-3 text-left">
          <DialogTitle className="text-2xl font-semibold leading-[1.2] tracking-tight">
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {step.sector.name}
          </DialogDescription>
        </DialogHeader>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <User aria-hidden className="h-3.5 w-3.5" />
            <dt className="sr-only">Responsável</dt>
            <dd>
              <span className="font-medium text-foreground">Responsável:</span>{" "}
              {step.responsible}
            </dd>
          </div>
          <div className="inline-flex items-center gap-2">
            <Clock aria-hidden className="h-3.5 w-3.5" />
            <dt className="sr-only">Prazo</dt>
            <dd>
              <span className="font-medium text-foreground">Prazo:</span>{" "}
              {step.estimated_time}
            </dd>
          </div>
        </dl>

        <Separator className="my-5" />

        {step.description ? (
          <Section label="Descrição">
            <p className="text-[15px] leading-[1.7] text-foreground/90">
              {step.description}
            </p>
          </Section>
        ) : null}

        {documents.length > 0 ? (
          <Section label="Documentos necessários">
            <ResourceList resources={documents} variant="link" />
          </Section>
        ) : null}

        {legalBasis.length > 0 ? (
          <Section label="Base legal">
            <ResourceList resources={legalBasis} variant="citation" />
          </Section>
        ) : null}

        {pops.length > 0 ? (
          <Section label="Procedimento operacional">
            <ResourceList resources={pops} variant="link" />
          </Section>
        ) : null}

        <p
          aria-hidden
          className="mt-6 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50"
        >
          PROAD · IFAM
        </p>
      </div>
    </div>
  );
}

function EyebrowRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="h-3.5 w-0.5 rounded-sm bg-primary" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-0" aria-label={label}>
      <EyebrowRule label={label} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ResourceList({
  resources,
  variant,
}: {
  resources: StepResourceRead[];
  variant: "link" | "citation";
}) {
  return (
    <ol className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
      {resources.map((resource, index) => (
        <li key={resource.id} className="contents">
          <span className="font-mono text-xs leading-[1.7] text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <ResourceItem resource={resource} variant={variant} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function ResourceItem({
  resource,
  variant,
}: {
  resource: StepResourceRead;
  variant: "link" | "citation";
}) {
  const hasSafeUrl = resource.url !== null && isSafeHref(resource.url);

  if (hasSafeUrl && resource.url) {
    return (
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-start gap-1.5 text-sm font-medium leading-[1.5] text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
      >
        <span>{resource.title}</span>
        <ExternalLink
          aria-hidden
          className="mt-[3px] h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
        />
      </a>
    );
  }

  if (variant === "citation") {
    return (
      <div>
        <p className="text-sm font-medium text-foreground">{resource.title}</p>
        {resource.content ? (
          <blockquote className="mt-1 border-l-2 border-border pl-3 text-sm italic leading-[1.6] text-muted-foreground">
            {resource.content}
          </blockquote>
        ) : null}
      </div>
    );
  }

  // Variante "link" sem URL válida — mostra o título como texto inerte.
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{resource.title}</p>
      {resource.content ? (
        <p className="mt-1 text-sm leading-[1.6] text-muted-foreground">
          {resource.content}
        </p>
      ) : null}
    </div>
  );
}
