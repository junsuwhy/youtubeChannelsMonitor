import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../providers/AuthProvider';
import ChannelListPage from './ChannelListPage';

vi.mock('../lib/api', () => ({
  fetchChannels: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 }),
  fetchStatsOverview: vi.fn().mockResolvedValue({ active_channels: 0, new_videos_this_week: 0 }),
  fetchChannelTags: vi.fn().mockResolvedValue([]),
  createChannel: vi.fn().mockResolvedValue({}),
  deleteChannel: vi.fn().mockResolvedValue({}),
  updateChannel: vi.fn().mockResolvedValue({}),
  resolveChannelUrl: vi.fn().mockResolvedValue({ youtube_channel_id: '', channel_name: null, thumbnail_url: null }),
  fetchChannelNow: vi.fn().mockResolvedValue({}),
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../hooks/useChannels', () => ({
  useChannels: vi.fn().mockReturnValue({ data: { items: [], total: 0 }, isLoading: false, error: null }),
  useChannelTags: vi.fn().mockReturnValue({ data: [] }),
}));

const makeAuthContext = (role: string | null) => ({
  isAuthenticated: true,
  role: role as any,
  canManageContent: role === 'content_admin' || role === 'user_admin',
  canManageUsers: role === 'user_admin',
  login: async () => {},
  logout: () => {},
});

const renderChannelList = (role: string | null) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={makeAuthContext(role)}>
        <MemoryRouter>
          <ChannelListPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('ChannelListPage 權限', () => {
  it('viewer 看不到新增頻道按鈕', () => {
    renderChannelList('viewer');
    expect(screen.queryByTestId('add-channel-button')).not.toBeInTheDocument();
  });

  it('viewer 看不到批次匯入連結', () => {
    renderChannelList('viewer');
    expect(screen.queryByText(/批次匯入/i)).not.toBeInTheDocument();
  });

  it('content_admin 看得到新增頻道按鈕', () => {
    renderChannelList('content_admin');
    expect(screen.getByTestId('add-channel-button')).toBeInTheDocument();
  });

  it('content_admin 看得到批次匯入連結', () => {
    renderChannelList('content_admin');
    expect(screen.getByText(/批次匯入/i)).toBeInTheDocument();
  });
});
