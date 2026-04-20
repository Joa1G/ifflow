import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface SearchBarProps {
  /**
   * Valor inicial do campo (lido apenas no mount — controle externo
   * do termo efetivamente buscado fica com o `onDebouncedChange`).
   */
  initialValue?: string;
  /** Placeholder do input. */
  placeholder?: string;
  /**
   * Disparado depois de `debounceMs` sem digitação. É ele que deve
   * alimentar o hook `useProcesses` no componente pai.
   */
  onDebouncedChange: (value: string) => void;
  /** Intervalo de debounce em ms. Padrão: 300 (REQ da F-15). */
  debounceMs?: number;
}

/**
 * Input de busca com debounce. A responsabilidade de filtragem fica
 * com quem consumir `onDebouncedChange` — o componente apenas amortece
 * a digitação pra evitar um refetch por tecla.
 */
export function SearchBar({
  initialValue = "",
  placeholder = "Buscar por processo, etapa ou setor",
  onDebouncedChange,
  debounceMs = 300,
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const callbackRef = useRef(onDebouncedChange);

  // Mantemos a ref atualizada pra que o timeout não capture uma versão
  // estale do callback se o pai trocar a função entre renders.
  useEffect(() => {
    callbackRef.current = onDebouncedChange;
  }, [onDebouncedChange]);

  useEffect(() => {
    const handle = setTimeout(() => {
      callbackRef.current(value);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [value, debounceMs]);

  const clear = () => setValue("");

  return (
    <div className="relative w-full">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Buscar processos"
        className="h-12 border-border bg-card pl-11 pr-12 text-base shadow-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0"
      />
      {value.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={clear}
          aria-label="Limpar busca"
          className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
