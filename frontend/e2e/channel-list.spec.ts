import { test, expect } from '@playwright/test';

const channelFixture = {
  id: 1,
  youtube_channel_id: 'UC123abc',
  channel_name: '測試頻道',
  description: '測試描述',
  thumbnail_url: null,
  status: 'active',
  source: 'manual',
  subscriber_count: 10000,
  video_count: 50,
  total_view_count: 500000,
  tags: ['政治'],
  topic_categories: [],
  country: 'TW',
  custom_url: '@test',
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-03-01T00:00:00',
};

test.describe('ChannelListPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fake-token');
      localStorage.setItem('refresh_token', 'fake-refresh');
    });
  });

  test('loads channel table with data', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/channels/tags*', route =>
      route.fulfill({ json: ['政治', '健康謠言'] })
    );
    await page.route('**/api/channels*', route =>
      route.fulfill({
        json: { items: [channelFixture], total: 1, page: 1, pages: 1 },
      })
    );

    await page.goto('/channels');
    await expect(page.locator('[data-testid="channel-table"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="channel-row-1"]')).toBeVisible();
  });

  test('shows sparkline stat cards on the page', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', route =>
      route.fulfill({
        json: { items: [channelFixture], total: 1, page: 1, pages: 1 },
      })
    );

    await page.goto('/channels');
    await expect(page.locator('[data-testid="sparkline-card"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('shows empty state when no channels returned', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 },
      })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 0 } })
    );

    await page.goto('/channels');
    await expect(page.locator('[data-testid="empty-state-channels"]')).toBeVisible({ timeout: 10000 });
  });

  test('add channel button opens dialog', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 },
      })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: [] }));
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 0 } })
    );

    await page.goto('/channels');
    await expect(page.locator('[data-testid="add-channel-button"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="add-channel-button"]').click();
    await expect(page.locator('[data-testid="add-channel-dialog"]')).toBeVisible();
  });

  test('filter toolbar is visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/channels/tags*', route => route.fulfill({ json: ['政治'] }));
    await page.route('**/api/channels*', route =>
      route.fulfill({
        json: { items: [channelFixture], total: 1, page: 1, pages: 1 },
      })
    );

    await page.goto('/channels');
    await expect(page.locator('[data-testid="channel-search-input"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="view-toggle"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="tags-filter"]')).toBeVisible({ timeout: 10000 });
  });
});
