import { Route, Routes } from "react-router-dom";

import AdminProcessesPage from "./pages/admin/processes";
import ProcessEditorPage from "./pages/admin/process-editor";
import AdminUsersPage from "./pages/admin/users";
import ForbiddenPage from "./pages/forbidden";
import HomePage from "./pages/home";
import LoginPage from "./pages/login";
import NotFoundPage from "./pages/not-found";
import ProcessDetailPage from "./pages/process-detail";
import ProcessFlowPage from "./pages/process-flow";
import RegisterPage from "./pages/register";
import ResetPasswordPage from "./pages/reset-password";
import SuperAdminRolesPage from "./pages/super-admin/roles";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/processes/:id" element={<ProcessDetailPage />} />
      <Route path="/processes/:id/flow" element={<ProcessFlowPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/processes" element={<AdminProcessesPage />} />
      <Route path="/admin/processes/new" element={<ProcessEditorPage />} />
      <Route path="/admin/processes/:id/edit" element={<ProcessEditorPage />} />
      <Route path="/super-admin/roles" element={<SuperAdminRolesPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
