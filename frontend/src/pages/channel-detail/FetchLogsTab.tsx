import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/Pagination";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { useFetchLogs } from "@/hooks/useAnomalies";
import { formatDate } from "@/lib/formatters";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FetchLogsTabProps {
  channelId: number;
  jobType?: string;
}

export function FetchLogsTab({ channelId, jobType }: FetchLogsTabProps) {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, error } = useFetchLogs({
    channel_id: channelId,
    job_type: jobType,
    page,
    limit
  });
  
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const logs = data?.items || [];
  const totalCount = data?.total || 0;

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDuration = (start?: string, end?: string) => {
    if (!start || !end) return "—";
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diffMs = endTime - startTime;
    
    if (diffMs < 1000) return `${diffMs}ms`;
    if (diffMs < 60000) return `${(diffMs / 1000).toFixed(1)}s`;
    
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="outline" className="border-transparent bg-green-100 text-green-800">成功</Badge>;
      case 'partial':
        return <Badge variant="outline" className="border-transparent bg-yellow-100 text-yellow-800">部分成功</Badge>;
      case 'failed':
        return <Badge variant="outline" className="border-transparent bg-red-100 text-red-800">失敗</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getJobName = (job: string) => {
    switch(job) {
      case 'channel_snapshot': return '頻道快照';
      case 'video_snapshot': return '影片快照';
      case 'discover_videos': return '探索新影片';
      default: return job;
    }
  };

  return (
    <div className="space-y-4" data-testid="channel-fetch-logs-tab">
      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">執行時間</TableHead>
              <TableHead className="w-[120px]">任務類型</TableHead>
              <TableHead className="w-[100px]">狀態</TableHead>
              <TableHead className="w-[100px] text-right">抓取筆數</TableHead>
              <TableHead className="w-[100px] text-right">配額消耗</TableHead>
              <TableHead className="w-[100px] text-right">耗時</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px] rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-6 rounded ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <EmptyState message="尚無爬取紀錄" testId="empty-state-fetch-logs" />
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <React.Fragment key={log.id}>
                  <TableRow>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(log.started_at || "")}
                    </TableCell>
                    <TableCell>
                      {getJobName(log.job_name)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(log.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      {log.videos_processed + log.channels_processed > 0 
                        ? log.videos_processed + log.channels_processed 
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {log.api_units_used > 0 ? log.api_units_used : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {getDuration(log.started_at || undefined, log.finished_at || undefined)}
                    </TableCell>
                    <TableCell>
                      {log.error_message && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6" 
                          onClick={() => toggleRow(log.id)}
                        >
                          {expandedRows[log.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedRows[log.id] && log.error_message && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={7} className="p-4">
                        <div className="text-sm font-medium text-red-600 mb-1">錯誤訊息：</div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-w-full overflow-x-auto">
                          {log.error_message}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 && (
        <Pagination 
          page={page} 
          limit={limit} 
          total={totalCount} 
          onPageChange={setPage} 
        />
      )}
    </div>
  );
}
