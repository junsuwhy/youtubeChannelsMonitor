import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { useChannelAnomalies } from "@/hooks/useAnomalies";
import { formatRelativeTime } from "@/lib/formatters";
import { Link } from "react-router-dom";

interface AnomaliesTabProps {
  channelId: number;
}

const getAnomalyTypeConfig = (type: string) => {
  switch (type) {
    case 'video_deleted':
    case 'video_unavailable':
      return { label: '影片消失', className: 'bg-red-100 text-red-800 hover:bg-red-200' };
    case 'view_count_spike':
      return { label: '觀看飆升', className: 'bg-orange-100 text-orange-800 hover:bg-orange-200' };
    case 'mass_publish':
      return { label: '大量發片', className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' };
    case 'video_title_changed':
      return { label: '標題變更', className: 'bg-blue-100 text-blue-800 hover:bg-blue-200' };
    default:
      return { label: type, className: 'bg-gray-100 text-gray-800 hover:bg-gray-200' };
  }
};

export function AnomaliesTab({ channelId }: AnomaliesTabProps) {
  const { data, isLoading, error } = useChannelAnomalies(channelId);
  
  const anomalies = Array.isArray(data) ? data : data?.items || [];

  return (
    <div className="space-y-4" data-testid="channel-anomalies-tab">
      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">時間</TableHead>
              <TableHead className="w-[120px]">類型</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-[200px]">關聯影片</TableHead>
              <TableHead className="w-[150px]">數據</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px] rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[250px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                </TableRow>
              ))
            ) : anomalies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <EmptyState message="目前沒有偵測到異常事件" testId="empty-state-anomalies" />
                </TableCell>
              </TableRow>
            ) : (
              anomalies.map((anomaly: any) => {
                const config = getAnomalyTypeConfig(anomaly.event_type || anomaly.anomaly_type);
                const date = anomaly.detected_at || anomaly.created_at || anomaly.date || anomaly.snapshot_date;
                const videoId = anomaly.video_id;
                
                return (
                  <TableRow key={anomaly.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(date || "")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-transparent ${config.className}`}>
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {anomaly.summary || anomaly.event_type || anomaly.anomaly_type}
                    </TableCell>
                    <TableCell>
                      {videoId ? (
                        <Link to={`/videos/${videoId}`} className="text-blue-600 hover:underline line-clamp-1">
                          查看影片
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {anomaly.current_value && anomaly.threshold_value ? (
                        <span className="text-muted-foreground">
                          {anomaly.current_value} / {anomaly.threshold_value}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
