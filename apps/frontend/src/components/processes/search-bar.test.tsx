import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchBar } from "./search-bar";

describe("<SearchBar /> — debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emite onDebouncedChange apenas após 300ms de inatividade", () => {
    const onDebouncedChange = vi.fn();

    render(<SearchBar onDebouncedChange={onDebouncedChange} />);
    onDebouncedChange.mockClear(); // descarta o disparo inicial com valor vazio

    const input = screen.getByRole("searchbox", { name: /buscar processos/i });
    fireEvent.change(input, { target: { value: "cap" } });

    expect(onDebouncedChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onDebouncedChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDebouncedChange).toHaveBeenCalledTimes(1);
    expect(onDebouncedChange).toHaveBeenLastCalledWith("cap");
  });

  it("não dispara intermediários enquanto o usuário continua digitando", () => {
    const onDebouncedChange = vi.fn();

    render(<SearchBar onDebouncedChange={onDebouncedChange} />);
    onDebouncedChange.mockClear();

    const input = screen.getByRole("searchbox", { name: /buscar processos/i });

    fireEvent.change(input, { target: { value: "c" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: "ca" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: "cap" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Ainda dentro da janela de debounce após o último caractere.
    expect(onDebouncedChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onDebouncedChange).toHaveBeenCalledTimes(1);
    expect(onDebouncedChange).toHaveBeenLastCalledWith("cap");
  });

  it("ao clicar em 'Limpar busca' emite string vazia no próximo tick de debounce", () => {
    const onDebouncedChange = vi.fn();

    render(
      <SearchBar
        initialValue="capacitação"
        onDebouncedChange={onDebouncedChange}
      />,
    );
    onDebouncedChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /limpar busca/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onDebouncedChange).toHaveBeenLastCalledWith("");
  });
});
