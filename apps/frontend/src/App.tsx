import { Route, Routes, useLocation } from "react-router-dom";

import { AuthBootstrap } from "./components/layout/auth-bootstrap";
import { Header } from "./components/layout/header";
import { ProtectedRoute } from "./components/layout/protected-route";
import AdminProcessesPage from "./pages/admin/processes";
import ProcessEditorPage from "./pages/admin/process-editor";
import AdminUsersPage from "./pages/admin/users";
import ForbiddenPage from "./pages/forbidden";
import HomePage from "./pages/home";
import LoginPage from "./pages/login";
import MyProcessesPage from "./pages/my-processes";
import NotFoundPage from "./pages/not-found";
import PendingPage from "./pages/pending";
import ProcessDetailPage from "./pages/process-detail";
import ProcessFlowPage from "./pages/process-flow";
import RegisterPage from "./pages/register";
import ResetPasswordPage from "./pages/reset-password";
import ResetPasswordConfirmPage from "./pages/reset-password-confirm";
import SuperAdminRolesPage from "./pages/super-admin/roles";

// Rotas com shell próprio (logo e layout institucional no card).
// Mostrar o Header global em cima delas duplicaria a marca e criaria
// o anti-padrão de "Entrar" visível já dentro da tela de /login.
const AUTH_SHELL_ROUTES = new Set([
  "/login",
  "/register",
  "/pending",
  "/reset-password",
  "/reset-password/confirm",
]);

function AppShell() {
  const { pathname } = useLocation();
  const hideHeader = AUTH_SHELL_ROUTES.has(pathname);

  return (
    <>
      {!hideHeader && <Header />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pending" element={<PendingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/reset-password/confirm"
          element={<ResetPasswordConfirmPage />}
        />
        <Route
          path="/processes/new"
          element={
            <ProtectedRoute>
              <ProcessEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/processes/mine"
          element={
            <ProtectedRoute>
              <MyProcessesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/processes/:id" element={<ProcessDetailPage />} />
        <Route
          path="/processes/:id/edit"
          element={
            <ProtectedRoute>
              <ProcessEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/processes/:id/flow"
          element={
            <ProtectedRoute>
              <ProcessFlowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/processes"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <AdminProcessesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/processes/new"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <ProcessEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/processes/:id/edit"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <ProcessEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/roles"
          element={
            <ProtectedRoute requiredRole="SUPER_ADMIN">
              <SuperAdminRolesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthBootstrap>
      <AppShell />
    </AuthBootstrap>
  );
}
