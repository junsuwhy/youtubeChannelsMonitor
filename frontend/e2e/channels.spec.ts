import { test, expect } from '@playwright/test';

test.describe('Channel List Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set fake token to bypass login redirect
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fake-token');
    });
  });

  test('channel list renders', async ({ page }) => {
    await page.route('**/api/channels*', async route => {
      const json = {
        items: [
          { id: 1, youtube_channel_id: 'UC123', channel_name: 'Channel 1', subscriber_count: 100, video_count: 10, status: 'active' },
          { id: 2, youtube_channel_id: 'UC456', channel_name: 'Channel 2', subscriber_count: 200, video_count: 20, status: 'active' }
        ],
        total: 2,
        page: 1,
        pages: 1
      };
      await route.fulfill({ json });
    });

    await page.goto('/channels');
    
    const table = page.locator('[data-testid="channel-list"]');
    await expect(table).toBeVisible({ timeout: 10000 });
    
    await expect(page.locator('text=Channel 1')).toBeVisible();
    await expect(page.locator('text=Channel 2')).toBeVisible();
  });

  test('empty state shown', async ({ page }) => {
    await page.route('**/api/channels*', async route => {
      await route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } });
    });

    await page.goto('/channels');
    
    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });

  test('add channel form', async ({ page }) => {
    await page.route('**/api/channels*', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({ json: { id: 3, youtube_channel_id: 'UC789', channel_name: 'New Channel' } });
      }
    });

    await page.goto('/channels');

    await page.click('[data-testid="add-channel-button"]');
    
    const dialog = page.locator('[data-testid="add-channel-dialog"]');
    await expect(dialog).toBeVisible();

    await page.fill('input#youtube_channel_id', 'UC789');
    await page.fill('input#channel_title', 'New Channel');
    
    await page.click('button[type="submit"]');

    await expect(dialog).not.toBeVisible();
  });

  test('duplicate channel shows error', async ({ page }) => {
    await page.route('**/api/channels*', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          json: { detail: "Channel already exists" }
        });
      }
    });

    await page.goto('/channels');

    await page.click('[data-testid="add-channel-button"]');
    await page.fill('input#youtube_channel_id', 'UC123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=此頻道已在監控清單中')).toBeVisible();
  });
});
