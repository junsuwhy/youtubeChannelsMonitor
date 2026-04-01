import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "./Layout";
import { AuthContext } from "../providers/AuthProvider";
import React from "react";

type UserRole = "viewer" | "content_admin" | "user_admin";

const renderLayout = (role: UserRole | null) =>
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
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    </AuthContext.Provider>
  );

test("viewer 看不到使用者管理連結", () => {
  renderLayout("viewer");
  expect(screen.queryByText("使用者管理")).not.toBeInTheDocument();
});

test("user_admin 看得到使用者管理連結", () => {
  renderLayout("user_admin");
  expect(screen.getByText("使用者管理")).toBeInTheDocument();
});

test("content_admin 看不到使用者管理連結", () => {
  renderLayout("content_admin");
  expect(screen.queryByText("使用者管理")).not.toBeInTheDocument();
});
