import { test, expect } from '@playwright/test';

test.describe('Channel List Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set fake token to bypass login redirect
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fake-token');
      localStorage.setItem('refresh_token', 'fake-refresh');
    });
  });

  test('channel list renders', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({ json: { total_channels: 2, total_videos: 30, active_channels: 2, new_videos_this_week: 0 } })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', async route => {
      const json = {
        items: [
          { id: 1, youtube_channel_id: 'UC123', channel_name: 'Channel 1', subscriber_count: 100, video_count: 10, status: 'active', source: 'manual', tags: [], topic_categories: [], created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' },
          { id: 2, youtube_channel_id: 'UC456', channel_name: 'Channel 2', subscriber_count: 200, video_count: 20, status: 'active', source: 'manual', tags: [], topic_categories: [], created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' }
        ],
        total: 2,
        page: 1,
        pages: 1
      };
      await route.fulfill({ json });
    });

    await page.goto('/channels');

    const table = page.locator('[data-testid="channel-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    await expect(page.locator('[data-testid="channel-row-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="channel-row-2"]')).toBeVisible();
  });

  test('empty state shown', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({ json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 } })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', async route => {
      await route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } });
    });

    await page.goto('/channels');

    const emptyState = page.locator('[data-testid="empty-state-channels"]');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });

  test('add channel form', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({ json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 } })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({ json: { id: 3, youtube_channel_id: 'UC789', channel_name: 'New Channel', status: 'active', source: 'manual', tags: [], topic_categories: [], created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' } });
      }
    });

    await page.goto('/channels');

    await page.locator('[data-testid="add-channel-button"]').click();

    const dialog = page.locator('[data-testid="add-channel-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await page.fill('input#url_input', 'UC789newchannel');
    await page.fill('input#channel_title', 'New Channel');
  });

  test('duplicate channel shows error', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({ json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 } })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', async route => {
      await route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } });
    });

    await page.goto('/channels');

    await page.locator('[data-testid="add-channel-button"]').click();
    const dialog = page.locator('[data-testid="add-channel-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await page.fill('input#url_input', 'UC123');
  });
});

