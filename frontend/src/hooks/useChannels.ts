import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchChannels, fetchChannel, fetchChannelSnapshots, updateChannel, fetchChannelTags } from '@/lib/api';

export function useChannels(params?: Parameters<typeof fetchChannels>[0]) {
  return useQuery({
    queryKey: ['channels', params],
    queryFn: () => fetchChannels(params),
  });
}

export function useChannel(id: number) {
  return useQuery({
    queryKey: ['channel', id],
    queryFn: () => fetchChannel(id),
    enabled: !!id,
  });
}

export function useChannelSnapshots(id: number) {
  return useQuery({
    queryKey: ['channel-snapshots', id],
    queryFn: () => fetchChannelSnapshots(id),
    enabled: !!id,
  });
}

export function useChannelTags() {
  return useQuery({
    queryKey: ['channel-tags'],
    queryFn: fetchChannelTags,
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateChannel>[1] }) =>
      updateChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel'] });
    },
  });
}
