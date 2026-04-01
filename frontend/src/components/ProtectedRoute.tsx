import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import type { UserRole } from "../providers/AuthProvider";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 0,
  content_admin: 1,
  user_admin: 2,
};

export function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: UserRole;
}) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && (!role || ROLE_HIERARCHY[role] < ROLE_HIERARCHY[requiredRole])) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
