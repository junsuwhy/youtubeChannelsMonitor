import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AuthContext } from "../providers/AuthProvider";
import React from "react";

type UserRole = "viewer" | "content_admin" | "user_admin";

const renderWithRole = (role: UserRole | null, requiredRole?: UserRole) =>
  render(
    <AuthContext.Provider
      value={{
        isAuthenticated: true,
        role,
        canManageContent: role === "content_admin" || role === "user_admin",
        canManageUsers: role === "user_admin",
        login: async () => {},
        logout: () => {},
      }}
    >
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route path="/" element={<div>首頁</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute requiredRole={requiredRole}>
                <div>受保護內容</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

test("user_admin 可存取需要 user_admin 的路由", () => {
  renderWithRole("user_admin", "user_admin");
  expect(screen.getByText("受保護內容")).toBeInTheDocument();
});

test("viewer 無法存取需要 user_admin 的路由，重導到首頁", () => {
  renderWithRole("viewer", "user_admin");
  expect(screen.queryByText("受保護內容")).not.toBeInTheDocument();
  expect(screen.getByText("首頁")).toBeInTheDocument();
});

test("content_admin 可存取不需特殊 role 的路由", () => {
  renderWithRole("content_admin", undefined);
  expect(screen.getByText("受保護內容")).toBeInTheDocument();
});
