import { describe, expect, it } from "vitest";

import { queryClient } from "./query-client";

describe("queryClient (F-04)", () => {
  it("aplica os defaults acordados: retry=1, refetchOnWindowFocus=false, staleTime=30s", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.staleTime).toBe(30_000);
  });
});
