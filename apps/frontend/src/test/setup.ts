import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

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
