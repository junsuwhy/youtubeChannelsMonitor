import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test("redirects to /login when not authenticated", async ({ page }) => {
    // Clear any stored tokens
    await page.goto("/");
    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });

  test("shows error message on wrong credentials", async ({ page }) => {
    await page.route("**/api/auth/login*", route =>
      route.fulfill({ status: 400, json: { detail: "Incorrect username or password" } })
    );
    await page.goto("/login");
    await page.getByLabel("username").fill("wronguser");
    await page.getByLabel("password").fill("wrongpassword");
    await page.getByRole("button", { name: "登入" }).click();
    // Error message should appear
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("alert")).toContainText("帳號或密碼錯誤");
  });

  test("login page has correct form elements", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("username")).toBeVisible();
    await expect(page.getByLabel("password")).toBeVisible();
    await expect(page.getByRole("button", { name: "登入" })).toBeVisible();
  });
});