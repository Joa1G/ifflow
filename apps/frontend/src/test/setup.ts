import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom não implementa window.matchMedia (usado por useTheme/getInitialTheme
// e pelo script anti-FOUC do index.html). O stub abaixo retorna sempre
// `matches: false` (= preferência light no sistema) para ter comportamento
// determinístico nos testes; quem quiser testar o caminho "preferência
// dark" sobrescreve esse mock no escopo do teste.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  // Função simples (não vi.fn) para que `vi.restoreAllMocks` em testes
  // não zere a implementação e quebre quem rodar depois — restoreAllMocks
  // restaura para a "original", que com vi.fn vazio devolveria undefined.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom não implementa Pointer Events (hasPointerCapture etc.) e
// scrollIntoView, mas o Radix Select (shadcn Select usado em F-20)
// depende deles ao abrir o dropdown. Os stubs abaixo são no-ops — só
// precisamos que o método exista para o handler do Radix não estourar.
// Fora dos testes, o browser real provê as implementações nativas.
if (typeof window !== "undefined") {
  const proto = window.HTMLElement.prototype;
  if (typeof proto.hasPointerCapture !== "function") {
    proto.hasPointerCapture = () => false;
  }
  if (typeof proto.setPointerCapture !== "function") {
    proto.setPointerCapture = () => {};
  }
  if (typeof proto.releasePointerCapture !== "function") {
    proto.releasePointerCapture = () => {};
  }
  if (typeof proto.scrollIntoView !== "function") {
    proto.scrollIntoView = () => {};
  }
}
