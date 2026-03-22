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
  updated_at: '2026-03-01T00:00:00',
  thumbnail_url: null,
  view_count: 1000,
  like_count: 50,
  comment_count: 10,
};

test.describe('VideoDetailPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fake-token');
      localStorage.setItem('refresh_token', 'fake-refresh');
    });
  });

  test('page loads with video info card visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/videos/1/snapshots*', route =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/videos/1*', route =>
      route.fulfill({ json: videoFixture })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );

    await page.goto('/videos/1');
    await expect(page.locator('[data-testid="video-detail-page"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="video-info-card"]')).toBeVisible();
  });

  test('metrics row is visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/videos/1/snapshots*', route =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/videos/1*', route =>
      route.fulfill({ json: videoFixture })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );

    await page.goto('/videos/1');
    await expect(page.locator('[data-testid="video-metrics-row"]')).toBeVisible({ timeout: 10000 });
  });

  test('related videos card is visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/videos/1/snapshots*', route =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/videos/1*', route =>
      route.fulfill({ json: videoFixture })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );

    await page.goto('/videos/1');
    await expect(page.locator('[data-testid="video-related-list"]')).toBeVisible({ timeout: 10000 });
  });

  test('trend chart card is visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/videos/1/snapshots*', route =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/videos/1*', route =>
      route.fulfill({ json: videoFixture })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );

    await page.goto('/videos/1');
    await expect(page.locator('[data-testid="video-trend-chart"]')).toBeVisible({ timeout: 10000 });
  });

  test('video metadata card is visible', async ({ page }) => {
    await page.route('**/api/auth/refresh*', route =>
      route.fulfill({ json: { access_token: 'fake-token', token_type: 'bearer' } })
    );
    await page.route('**/api/stats/overview*', route =>
      route.fulfill({
        json: { total_channels: 10, total_videos: 50, active_channels: 8, new_videos_this_week: 5 },
      })
    );
    await page.route('**/api/videos/1/snapshots*', route =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/videos/1*', route =>
      route.fulfill({ json: videoFixture })
    );
    await page.route('**/api/videos*', route =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } })
    );

    await page.goto('/videos/1');
    await expect(page.locator('[data-testid="video-metadata"]')).toBeVisible({ timeout: 10000 });
  });
});
