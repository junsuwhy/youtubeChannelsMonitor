import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { fetchVideos } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { NumberFormatter } from "@/components/NumberFormatter";

export default function VideoListPage() {
  const [searchParams] = useSearchParams();
  const channelIdParam = searchParams.get('channel_id');
  const channelId = channelIdParam ? parseInt(channelIdParam, 10) : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ['videos', channelId],
    queryFn: () => fetchVideos({ channel_id: channelId, page: 1, limit: 50 }),
    gcTime: 5 * 60 * 1000,
  });

  const videos = data?.items || data || [];

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "public":
        return <Badge className="bg-green-600 hover:bg-green-700">public</Badge>;
      case "private":
      case "deleted":
        return <Badge variant="secondary">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isVideoUnavailable = (status: string) => status === "private" || status === "deleted";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">影片列表 {channelId ? `(頻道 ID: ${channelId})` : ""}</h1>
      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      <div className="rounded-md border">
        <Table data-testid="video-list">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">縮圖</TableHead>
              <TableHead>標題</TableHead>
              <TableHead>頻道名稱</TableHead>
              <TableHead className="text-right">發布時間</TableHead>
              <TableHead className="text-right">觀看數</TableHead>
              <TableHead className="text-right">按讚數</TableHead>
              <TableHead className="text-right">留言數</TableHead>
              <TableHead className="w-[100px]">狀態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-[67px] w-[120px] rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[250px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[60px]" /></TableCell>
                </TableRow>
              ))
            ) : videos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <EmptyState message="找不到影片" />
                </TableCell>
              </TableRow>
            ) : (
              videos.map((video: any) => {
                const unavailable = isVideoUnavailable(video.status);
                const titleText = video.title.length > 50 ? `${video.title.substring(0, 50)}...` : video.title;
                return (
                  <TableRow key={video.id} className={unavailable ? "opacity-60 bg-muted/30" : ""}>
                    <TableCell>
                      <img 
                        src={video.thumbnail_url || 'https://placehold.co/120x67'} 
                        alt={video.title} 
                        className="h-[67px] w-[120px] rounded-md object-cover"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <a 
                        href={`https://youtube.com/watch?v=${video.youtube_video_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`hover:underline ${unavailable ? "line-through text-muted-foreground" : "text-blue-600 dark:text-blue-400"}`}
                      >
                        {titleText}
                      </a>
                    </TableCell>
                    <TableCell>
                      {video.channel_name || video.youtube_channel_id}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {video.published_at 
                        ? new Date(video.published_at).toLocaleDateString() 
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <NumberFormatter value={video.view_count || 0} />
                    </TableCell>
                    <TableCell className="text-right">
                      <NumberFormatter value={video.like_count || 0} />
                    </TableCell>
                    <TableCell className="text-right">
                      <NumberFormatter value={video.comment_count || 0} />
                    </TableCell>
                    <TableCell>
                      {renderStatusBadge(video.status)}
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
