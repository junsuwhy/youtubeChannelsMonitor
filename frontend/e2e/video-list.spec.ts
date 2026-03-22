import { test, expect } from '@playwright/test';

const videoFixture = {
  id: 1,
  youtube_video_id: 'vid123',
  channel_id: 1,
  channel_name: '測試頻道',
  title: '測試影片標題',
  description: '影片描述',
  published_at: '2026-03-01T00:00:00',
  duration: 'PT5M30S',
  tags: [],
  topic_categories: [],
  status: 'public',
  created_at: '2026-03-01T00:00:00',
  thumbnail_url: null,
  view_count: 1000,
  like_count: 50,
  comment_count: 10,
};

test.describe('VideoListPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fake-token');
      localStorage.setItem('refresh_token', 'fake-refresh');
    });
  });

  test('page loads with video table visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [videoFixture], total: 1, page: 1, pages: 1 } })
    );

    await page.goto('/videos');
    await expect(page.locator('[data-testid="video-list-page"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="video-table"]')).toBeVisible();
  });

  test('stats row is visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );

    await page.goto('/videos');
    await expect(page.locator('[data-testid="video-stats-row"]')).toBeVisible({ timeout: 10000 });
  });

  test('shows empty state when no videos returned', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 0, total_videos: 0, active_channels: 0, new_videos_this_week: 0 },
      })
    );
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );

    await page.goto('/videos');
    await expect(page.locator('[data-testid="empty-state-videos"]')).toBeVisible({ timeout: 10000 });
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
    await page.route('**/api/channels*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [videoFixture], total: 1, page: 1, pages: 1 } })
    );

    await page.goto('/videos');
    await expect(page.locator('[data-testid="video-filter-toolbar"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="video-search-input"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="video-channel-filter"]')).toBeVisible({ timeout: 10000 });
  });
});
