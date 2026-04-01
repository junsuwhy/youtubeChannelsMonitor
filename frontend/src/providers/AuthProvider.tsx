import React, { createContext, useContext, useState } from "react";
import { login as apiLogin } from "../lib/api";
import api from "../lib/api";

export type UserRole = "viewer" | "content_admin" | "user_admin";

export interface AuthContextType {
  isAuthenticated: boolean;
  role: UserRole | null;
  canManageContent: boolean;
  canManageUsers: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem("access_token")
  );
  const [role, setRole] = useState<UserRole | null>(
    () => localStorage.getItem("user_role") as UserRole | null
  );

  const login = async (username: string, password: string) => {
    const data = await apiLogin(username, password);
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    setIsAuthenticated(true);

    const meRes = await api.get("/auth/me");
    const userRole: UserRole = meRes.data.role;
    setRole(userRole);
    localStorage.setItem("user_role", userRole);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_role");
    setIsAuthenticated(false);
    setRole(null);
  };

  const canManageContent = role === "content_admin" || role === "user_admin";
  const canManageUsers = role === "user_admin";

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, role, canManageContent, canManageUsers, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
