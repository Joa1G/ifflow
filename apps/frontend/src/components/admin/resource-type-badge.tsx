import { Badge } from "../ui/badge";
import type { components } from "../../types/api";

type ResourceType = components["schemas"]["ResourceType"];

const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  DOCUMENT: "DOC",
  LEGAL_BASIS: "LEGAL",
  POP: "POP",
  LINK: "LINK",
};

/**
 * Badge de tipo de recurso usando typography (não cor) para diferenciar.
 * Cor é reservada às categorias de processo no IFFLOW; recursos só usam
 * label compacto monospace.
 */
export function ResourceTypeBadge({ type }: { type: ResourceType }) {
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-ifflow-rule font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ifflow-muted"
    >
      {RESOURCE_TYPE_LABEL[type]}
    </Badge>
  );
}
