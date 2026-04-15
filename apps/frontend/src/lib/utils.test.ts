import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("concatena classes truthy", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("descarta valores falsy", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("dedupa classes Tailwind conflitantes mantendo a última", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
