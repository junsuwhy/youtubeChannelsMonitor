import { useQuery } from '@tanstack/react-query';
import { fetchVideos, fetchVideo, fetchVideoSnapshots } from '@/lib/api';

export function useVideos(params?: Parameters<typeof fetchVideos>[0]) {
  return useQuery({
    queryKey: ['videos', params],
    queryFn: () => fetchVideos(params),
  });
}

export function useVideo(id: number) {
  return useQuery({
    queryKey: ['video', id],
    queryFn: () => fetchVideo(id),
    enabled: !!id,
  });
}

export function useVideoSnapshots(id: number) {
  return useQuery({
    queryKey: ['video-snapshots', id],
    queryFn: () => fetchVideoSnapshots(id),
    enabled: !!id,
  });
}
