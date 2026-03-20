import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchChannel, fetchChannelTrend, fetchVideos } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NumberFormatter, formatNumber } from "@/components/NumberFormatter";

export default function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const channelId = parseInt(id || "0", 10);

  const { data: channel, isLoading: channelLoading, error: channelError } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => fetchChannel(channelId),
    enabled: !!channelId,
    gcTime: 5 * 60 * 1000,
  });

  const { data: trendData, isLoading: trendLoading, error: trendError } = useQuery({
    queryKey: ['channel-trend', channelId],
    queryFn: () => fetchChannelTrend(channelId),
    enabled: !!channelId,
    gcTime: 5 * 60 * 1000,
  });

  const { data: videosData, isLoading: videosLoading, error: videosError } = useQuery({
    queryKey: ['channel-videos', channelId],
    queryFn: () => fetchVideos({ channel_id: channelId, page: 1, limit: 20 }),
    enabled: !!channelId,
    gcTime: 5 * 60 * 1000,
  });

  const videos = Array.isArray(videosData) ? videosData : videosData?.items || [];
  const trend = trendData || [];

  const error = channelError || trendError || videosError;
  
  if (!channelId) {
    return <div className="p-6">無效的頻道 ID</div>;
  }

  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case "active": return <Badge className="bg-green-600 hover:bg-green-700">active</Badge>;
      case "terminated": return <Badge variant="destructive">terminated</Badge>;
      case "inactive":
      case "paused": return <Badge variant="secondary">{status}</Badge>;
      default: return <Badge variant="outline">{status || 'unknown'}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      {channelLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-8 w-[200px]" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[300px]" />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : channel ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="shrink-0">
                <img 
                  src={channel.thumbnail_url || 'https://placehold.co/96x96'} 
                  alt={channel.channel_name} 
                  className="h-24 w-24 rounded-full object-cover"
                />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold">{channel.channel_name}</h1>
                    <div className="flex items-center gap-2 mt-1">
                      {renderStatusBadge(channel.status)}
                      <a 
                        href={`https://youtube.com/channel/${channel.youtube_channel_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        前往 YouTube
                      </a>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>國家: {channel.country || '未提供'}</p>
                    {channel.created_at && (
                      <p>建立時間: {new Date(channel.created_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {channel.description || '無頻道描述'}
                </p>

                <div className="flex flex-wrap gap-6 pt-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">訂閱數</p>
                    <p className="text-xl font-bold"><NumberFormatter value={channel.subscriber_count || 0} /></p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">影片數</p>
                    <p className="text-xl font-bold"><NumberFormatter value={channel.video_count || 0} /></p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">總觀看數</p>
                    <p className="text-xl font-bold"><NumberFormatter value={channel.total_view_count || 0} /></p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>訂閱趨勢</CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : trend.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground border rounded-md">
              尚無趨勢數據，等待明日第一次快照
            </div>
          ) : (
            <div data-testid="subscriber-trend-chart" className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(v) => new Date(v).toLocaleDateString()} 
                  />
                  <YAxis 
                    tickFormatter={(v) => formatNumber(v)} 
                    width={80}
                  />
                  <Tooltip 
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    formatter={(v: any) => [formatNumber(Number(v) || 0), "訂閱數"]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="subscriber_count" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    isAnimationActive={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最新影片</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">縮圖</TableHead>
                <TableHead>標題</TableHead>
                <TableHead>發布時間</TableHead>
                <TableHead className="text-right">觀看數</TableHead>
                <TableHead className="text-right">喜歡數</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videosLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-[60px] w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[300px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : videos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    暫無影片
                  </TableCell>
                </TableRow>
              ) : (
                videos.map((video: any) => (
                  <TableRow key={video.id}>
                    <TableCell>
                      <a href={`https://youtube.com/watch?v=${video.youtube_video_id}`} target="_blank" rel="noopener noreferrer">
                        <img 
                          src={video.thumbnail_url || 'https://placehold.co/120x68'} 
                          alt={video.title} 
                          className="aspect-video w-[100px] object-cover rounded hover:opacity-80 transition-opacity"
                        />
                      </a>
                    </TableCell>
                    <TableCell className="font-medium max-w-[400px]">
                      <a 
                        href={`https://youtube.com/watch?v=${video.youtube_video_id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline line-clamp-2"
                      >
                        {video.title}
                      </a>
                    </TableCell>
                    <TableCell>
                      {new Date(video.published_at).toLocaleDateString()}
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
  );
}