import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetApiClientForTests } from "../../lib/api-client";
import {
  type UserMe,
  useAuthStore,
  wireAuthStoreToApiClient,
} from "../../stores/auth-store";
import { ProtectedRoute } from "./protected-route";

type UserRole = UserMe["role"];

const baseUser: UserMe = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "Usuário Teste",
  email: "teste@ifam.edu.br",
  siape: "1111111",
  sector: "PROAD",
  role: "USER",
  status: "APPROVED",
  created_at: "2026-04-17T12:00:00Z",
};

function setSession(role: UserRole | null) {
  if (role === null) {
    useAuthStore.setState({ token: null, user: null, isHydrating: false });
  } else {
    useAuthStore.setState({
      token: "t",
      user: { ...baseUser, role },
      isHydrating: false,
    });
  }
}

function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)
    ?.from?.pathname;
  return (
    <div>
      <span>login page</span>
      <span data-testid="from">{from ?? ""}</span>
    </div>
  );
}

function renderAt(
  initialPath: string,
  requiredRole?: UserRole,
  targetPath = "/target",
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path={targetPath}
          element={
            <ProtectedRoute requiredRole={requiredRole}>
              <div>conteúdo protegido</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LocationProbe />} />
        <Route path="/forbidden" element={<div>forbidden page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isHydrating: false });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
});
afterEach(() => {
  useAuthStore.setState({ token: null, user: null, isHydrating: false });
});

describe("<ProtectedRoute />", () => {
  it("sem user autenticado, redireciona para /login", () => {
    setSession(null);
    renderAt("/target");

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("conteúdo protegido")).not.toBeInTheDocument();
  });

  it("preserva o pathname original em location.state.from", () => {
    setSession(null);
    renderAt("/target");

    expect(screen.getByTestId("from")).toHaveTextContent("/target");
  });

  it("user USER em rota que exige ADMIN é enviado para /forbidden", () => {
    setSession("USER");
    renderAt("/target", "ADMIN");

    expect(screen.getByText("forbidden page")).toBeInTheDocument();
    expect(screen.queryByText("conteúdo protegido")).not.toBeInTheDocument();
  });

  it("user ADMIN em rota ADMIN renderiza os children", () => {
    setSession("ADMIN");
    renderAt("/target", "ADMIN");

    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });

  it("user SUPER_ADMIN acessa rota ADMIN (hierarquia)", () => {
    setSession("SUPER_ADMIN");
    renderAt("/target", "ADMIN");

    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });

  it("user ADMIN em rota SUPER_ADMIN é enviado para /forbidden", () => {
    setSession("ADMIN");
    renderAt("/target", "SUPER_ADMIN");

    expect(screen.getByText("forbidden page")).toBeInTheDocument();
  });

  it("user USER em rota sem requiredRole renderiza os children", () => {
    setSession("USER");
    renderAt("/target");

    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });

  it("durante hidratação (isHydrating=true), não redireciona nem renderiza children", () => {
    useAuthStore.setState({ token: "t", user: null, isHydrating: true });
    renderAt("/target", "ADMIN");

    expect(screen.queryByText("conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden page")).not.toBeInTheDocument();
  });
});
