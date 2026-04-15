import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("renderiza um heading com o nome do projeto", () => {
    render(<h1>IFFLOW</h1>);
    expect(
      screen.getByRole("heading", { name: /ifflow/i }),
    ).toBeInTheDocument();
  });
});
