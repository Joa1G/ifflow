import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import App from "../App";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const routes: ReadonlyArray<readonly [string, string]> = [
  ["/", "HomePage"],
  ["/login", "LoginPage"],
  ["/register", "RegisterPage"],
  ["/reset-password", "ResetPasswordPage"],
  ["/processes/abc-123", "ProcessDetailPage"],
  ["/processes/abc-123/flow", "ProcessFlowPage"],
  ["/admin/users", "AdminUsersPage"],
  ["/admin/processes", "AdminProcessesPage"],
  ["/admin/processes/new", "ProcessEditorPage"],
  ["/admin/processes/xyz/edit", "ProcessEditorPage"],
  ["/super-admin/roles", "SuperAdminRolesPage"],
  ["/forbidden", "ForbiddenPage"],
  ["/rota-inexistente", "NotFoundPage"],
];

describe("<App />", () => {
  it.each(routes)("renderiza %s → %s", (path, expected) => {
    renderAt(path);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
