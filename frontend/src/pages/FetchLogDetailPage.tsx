import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { fetchFetchLog } from "@/lib/api";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/formatters";

function getDuration(start: string, end?: string | null) {
  if (!end) return "執行中...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return <Badge variant="outline" className="border-transparent bg-green-100 text-green-800">成功</Badge>;
    case "partial":
      return <Badge variant="outline" className="border-transparent bg-yellow-100 text-yellow-800">部分成功</Badge>;
    case "failed":
      return <Badge variant="outline" className="border-transparent bg-red-100 text-red-800">失敗</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getJobName(jobName: string) {
  switch (jobName) {
    case "channel_snapshot": return "頻道快照";
    case "discover_videos": return "探索影片";
    case "video_snapshot": return "影片快照";
    default: return jobName;
  }
}

export default function FetchLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: log, isLoading, isError, error } = useQuery({
    queryKey: ['fetchLog', id],
    queryFn: () => fetchFetchLog(Number(id)),
    enabled: !!id,
  });

  if (isError && (error as AxiosError)?.response?.status === 404) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-muted-foreground">找不到此紀錄</p>
        <Button variant="outline" onClick={() => navigate('/fetch-logs')}>← 返回列表</Button>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-red-600">載入失敗: {(error as Error).message}</p>
        <Button variant="outline" onClick={() => navigate('/fetch-logs')}>← 返回列表</Button>
      </div>
    );
  }

  if (isLoading || !log) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-[300px]" />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[150px]" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const inputPayloadStr = log.input_payload ? JSON.stringify(JSON.parse(log.input_payload), null, 2) : null;
  const outputPayloadStr = log.output_payload ? JSON.stringify(JSON.parse(log.output_payload), null, 2) : null;

  return (
    <div data-testid="fetch-log-detail-page" className="space-y-6 p-6">
      <Breadcrumb
        items={[
          { label: "首頁", href: "/" },
          { label: "爬取紀錄", href: "/fetch-logs" },
          { label: `#${id}` },
        ]}
      />

      <div>
        <Button variant="outline" onClick={() => navigate('/fetch-logs')}>
          ← 返回列表
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>摘要</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-muted-foreground">任務名稱</span>
              <span>{getJobName(log.job_name)}</span>
            </div>
            
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-muted-foreground">狀態</span>
              <div>{getStatusBadge(log.status)}</div>
            </div>

            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-muted-foreground">頻道 ID</span>
              <span>
                {log.channel_id ? (
                  <Link to={`/channels/${log.channel_id}`} className="text-primary hover:underline">
                    {log.channel_id}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </span>
            </div>

            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-muted-foreground">API 單位消耗</span>
              <span>{log.api_units_used ?? 0}</span>
            </div>

            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-muted-foreground">開始時間</span>
              <span>{formatDateTime(log.started_at || "")}</span>
            </div>

            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-muted-foreground">結束時間</span>
              <span>{log.finished_at ? formatDateTime(log.finished_at) : <span className="text-muted-foreground">-</span>}</span>
            </div>

            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-muted-foreground">執行時間</span>
              <span>{getDuration(log.started_at || "", log.finished_at)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {log.status === 'failed' && log.error_message && (
        <Card>
          <CardHeader>
            <CardTitle>錯誤訊息</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-red-600 text-sm whitespace-pre-wrap font-mono">
              {log.error_message}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Input Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto font-mono">
            {inputPayloadStr ?? "無 payload 紀錄"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Output Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto font-mono">
            {outputPayloadStr ?? "無 payload 紀錄"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
