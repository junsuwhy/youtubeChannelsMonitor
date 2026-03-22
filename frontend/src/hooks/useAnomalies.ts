import { useQuery } from '@tanstack/react-query';
import { fetchChannelAnomalies, fetchFetchLogs } from '@/lib/api';

export function useChannelAnomalies(channelId: number, params?: Parameters<typeof fetchChannelAnomalies>[1]) {
  return useQuery({
    queryKey: ['channel-anomalies', channelId, params],
    queryFn: () => fetchChannelAnomalies(channelId, params),
    enabled: !!channelId,
  });
}

export function useFetchLogs(params?: Parameters<typeof fetchFetchLogs>[0]) {
  return useQuery({
    queryKey: ['fetch-logs', params],
    queryFn: () => fetchFetchLogs(params),
  });
}
