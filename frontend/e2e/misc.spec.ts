import { test, expect } from '@playwright/test';

test.describe('Misc Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set fake tokens to bypass login redirect
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fake-token');
      localStorage.setItem('refresh_token', 'fake-refresh');
    });
  });

  function stubMiscApis(page: Parameters<Parameters<typeof test>[1]>[0]) {
    return async () => {
      await page.route('**/api/auth/refresh*', route =>
        route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
      );
      await page.route('**/api/stats/overview*', route =>
        route.fulfill({ json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 } })
      );
      await page.route('**/api/misc/quota/daily*', route =>
        route.fulfill({ json: { items: [] } })
      );
      await page.route('**/api/misc/channels/daily-additions*', route =>
        route.fulfill({ json: { items: [] } })
      );
      await page.route('**/api/misc/videos/daily-new*', route =>
        route.fulfill({ json: { items: [] } })
      );
      await page.route('**/api/system/logs*', route =>
        route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } })
      );
      await page.route('**/api/videos*', route =>
        route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } })
      );
      await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
      await page.route('**/api/channels*', route =>
        route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
      );
    };
  }

  test('sidebar shows 其他 link and not Import', async ({ page }) => {
    await (stubMiscApis(page))();
    await page.goto('/');
    const nav = page.locator('nav');
    await expect(nav.locator('[href="/misc"]')).toBeVisible({ timeout: 10000 });
    await expect(nav.locator('[href="/channels/import"]')).not.toBeVisible();
  });

  test('navigating to /misc renders all 6 sections', async ({ page }) => {
    await (stubMiscApis(page))();
    await page.goto('/misc');
    await expect(page.locator('[data-testid="section-quota-daily"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="section-channels-daily"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-videos-daily"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-crawl-errors"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-removed-videos"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-removed-channels"]')).toBeVisible();
  });

  test('clicking day toggle 7 sends days=7 query param', async ({ page }) => {
    let capturedUrl = '';
    // Set up the stub BEFORE goto so it captures from the start
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({ json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 } })
    );
    await page.route('**/api/misc/channels/daily-additions*', route =>
      route.fulfill({ json: { items: [] } })
    );
    await page.route('**/api/misc/videos/daily-new*', route =>
      route.fulfill({ json: { items: [] } })
    );
    await page.route('**/api/system/logs*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );
    // Capture the quota request URL
    await page.route('**/api/misc/quota/daily*', async route => {
      capturedUrl = route.request().url();
      await route.fulfill({ json: { items: [] } });
    });

    await page.goto('/misc');
    await expect(page.locator('[data-testid="section-quota-daily"]')).toBeVisible({ timeout: 10000 });

    // Click the "7" toggle in the first days-selector
    const firstDaysSelector = page.locator('[data-testid="days-selector"]').first();
    await firstDaysSelector.locator('button').filter({ hasText: '7' }).click();
    await page.waitForTimeout(800);
    expect(capturedUrl).toMatch(/days=7/);
  });

  test('/channels/import still accessible via direct URL', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({ json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 } })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );
    await page.goto('/channels/import');
    // Page should not show 404
    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('body')).not.toContainText('Not Found');
    // Should render within the layout (nav is present)
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
  });
});
