import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFetchLogs } from "@/hooks/useAnomalies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/Pagination";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb } from "@/components/Breadcrumb";

export default function FetchLogsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [jobType, setJobType] = useState<string>("all");
  const limit = 20;

  const { data, isLoading, error } = useFetchLogs({
    job_type: jobType === "all" ? undefined : jobType,
    page,
    limit,
  });

  const logs = data?.items || [];
  const totalCount = data?.total || 0;

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
    <div className="space-y-6 p-6" data-testid="fetch-logs-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: "爬取紀錄" }]} />
          <h1 className="text-3xl font-bold tracking-tight mt-2">爬取紀錄</h1>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Select value={jobType} onValueChange={(val) => { setJobType(val); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="全部任務類型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="channel_snapshot">頻道快照</SelectItem>
              <SelectItem value="video_snapshot">影片快照</SelectItem>
              <SelectItem value="discover_videos">探索新影片</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead className="w-[160px]">執行時間</TableHead>
              <TableHead className="w-[120px]">任務類型</TableHead>
              <TableHead className="w-[120px]">Channel ID</TableHead>
              <TableHead className="w-[100px]">狀態</TableHead>
              <TableHead className="w-[100px] text-right">處理頻道</TableHead>
              <TableHead className="w-[100px] text-right">處理影片</TableHead>
              <TableHead className="w-[100px] text-right">配額消耗</TableHead>
              <TableHead className="w-[100px] text-right">耗時</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[40px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px] rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <EmptyState message="尚無爬取紀錄" testId="empty-state-fetch-logs" />
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow 
                  key={log.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/fetch-logs/${log.id}`)}
                >
                  <TableCell className="font-medium">{log.id}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(log.started_at || "")}
                  </TableCell>
                  <TableCell>
                    {getJobName(log.job_name)}
                  </TableCell>
                  <TableCell>
                    {log.channel_id || "—"}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(log.status)}
                  </TableCell>
                  <TableCell className="text-right">
                    {log.channels_processed > 0 ? log.channels_processed : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {log.videos_processed > 0 ? log.videos_processed : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {log.api_units_used > 0 ? log.api_units_used : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {getDuration(log.started_at || undefined, log.finished_at || undefined)}
                  </TableCell>
                </TableRow>
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
