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

const setupCommonStubs = async (page: any) => {
  await page.route('**/api/auth/refresh*', (route: any) =>
    route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
  );
  await page.route('**/api/stats/overview*', (route: any) =>
    route.fulfill({
      json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
    })
  );
  await page.route('**/api/stats/channels/1/snapshots*', (route: any) =>
    route.fulfill({ json: [] })
  );
  await page.route('**/api/stats/channels/1/trend*', (route: any) =>
    route.fulfill({ json: [] })
  );
  await page.route('**/api/channels/1/anomalies*', (route: any) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pages: 0 } })
  );
  await page.route('**/api/system/logs*', (route: any) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
  );
  await page.route('**/api/videos*', (route: any) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
  );
  await page.route('**/api/channels/1*', (route: any) =>
    route.fulfill({ json: channelFixture })
  );
};

test.describe('ChannelDetailPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fake-token');
      localStorage.setItem('refresh_token', 'fake-refresh');
    });
  });

  test('page loads with channel info card visible', async ({ page }) => {
    await setupCommonStubs(page);
    await page.goto('/channels/1');
    await expect(page.locator('[data-testid="channel-info-card"]')).toBeVisible({ timeout: 10000 });
  });

  test('metrics row is visible after channel loads', async ({ page }) => {
    await setupCommonStubs(page);
    await page.goto('/channels/1');
    await expect(page.locator('[data-testid="channel-metrics-row"]')).toBeVisible({ timeout: 10000 });
  });

  test('overview tab is the default active tab', async ({ page }) => {
    await setupCommonStubs(page);
    await page.goto('/channels/1');
    await expect(page.locator('[data-testid="channel-tabs"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="tab-overview"]')).toBeVisible();
  });

  test('clicking videos tab shows videos content area', async ({ page }) => {
    await setupCommonStubs(page);
    await page.goto('/channels/1');
    await expect(page.locator('[data-testid="tab-videos-trigger"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-videos-trigger"]').click();
    await expect(page.locator('[data-testid="tab-videos"]')).toBeVisible();
  });

  test('trend chart metric toggle is visible on overview tab', async ({ page }) => {
    await setupCommonStubs(page);
    await page.goto('/channels/1');
    await expect(page.locator('[data-testid="trend-chart-metric-toggle"]')).toBeVisible({ timeout: 10000 });
  });
});
