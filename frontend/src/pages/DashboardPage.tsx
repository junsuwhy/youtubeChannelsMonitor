import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchStatsOverview, fetchSystemQuota, fetchNewVideos } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NumberFormatter } from "@/components/NumberFormatter";
import { formatDate } from "@/lib/formatters";

function KPISkeleton() {
  return (
    <Card data-testid="kpi-card-skeleton">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          <Skeleton className="h-4 w-[100px]" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          <Skeleton className="h-8 w-[60px]" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['stats-overview'],
    queryFn: fetchStatsOverview,
    gcTime: 5 * 60 * 1000,
  });

  const { data: quota, isLoading: quotaLoading, error: quotaError } = useQuery({
    queryKey: ['system-quota'],
    queryFn: fetchSystemQuota,
    gcTime: 5 * 60 * 1000,
  });

  const { data: newVideosData, isLoading: videosLoading, error: videosError } = useQuery({
    queryKey: ['new-videos'],
    queryFn: () => fetchNewVideos(10),
    gcTime: 5 * 60 * 1000,
  });

  const newVideos = Array.isArray(newVideosData) ? newVideosData : newVideosData?.items || [];

  const hasError = statsError || quotaError || videosError;
  const errorObj = statsError || quotaError || videosError;
  const errorMsg = errorObj instanceof Error ? errorObj.message : "載入失敗";

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold tracking-tight">儀表板</h1>

      {hasError && <ErrorBanner message={errorMsg} />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? <KPISkeleton /> : (
          <Card data-testid="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">總頻道數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.total_channels ? <NumberFormatter value={stats.total_channels} /> : 0}
              </div>
            </CardContent>
          </Card>
        )}

        {statsLoading ? <KPISkeleton /> : (
          <Card data-testid="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">總影片數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.total_videos ? <NumberFormatter value={stats.total_videos} /> : 0}
              </div>
            </CardContent>
          </Card>
        )}

        {statsLoading ? <KPISkeleton /> : (
          <Card data-testid="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">本週新影片</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.new_videos_this_week ? <NumberFormatter value={stats.new_videos_this_week} /> : 0}
              </div>
            </CardContent>
          </Card>
        )}

        {quotaLoading ? <KPISkeleton /> : (
          <Card data-testid="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">今日 API 額度</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {quota ? `${quota.used_today} / ${quota.quota_limit}` : '0 / 0'}
              </div>
              <p className="text-xs text-muted-foreground">
                剩餘 {quota?.remaining || 0}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-4">最新影片</h2>
        <Card>
          <div className="overflow-x-auto">
            <Table data-testid="new-videos-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">縮圖</TableHead>
                  <TableHead>標題</TableHead>
                  <TableHead>頻道</TableHead>
                  <TableHead>發布時間</TableHead>
                  <TableHead className="text-right">觀看數</TableHead>
                  <TableHead className="text-right">喜歡數</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videosLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-[50px] w-[90px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[250px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : newVideos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      無最新影片
                    </TableCell>
                  </TableRow>
                ) : (
                  newVideos.map((video: any) => (
                    <TableRow key={video.id}>
                      <TableCell>
                        <img 
                          src={video.thumbnail_url || 'https://placehold.co/90x50'} 
                          alt={video.title} 
                          className="aspect-video w-[90px] object-cover rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        <Link
                          to={`/videos/${video.id}`}
                          className="hover:text-primary hover:underline transition-colors"
                        >
                          {video.title}
                        </Link>
                      </TableCell>
                      <TableCell>{video.channel_name || 'Unknown'}</TableCell>
                      <TableCell>
                        {formatDate(video.published_at || "")}
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberFormatter value={video.view_count || 0} />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberFormatter value={video.like_count || 0} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}