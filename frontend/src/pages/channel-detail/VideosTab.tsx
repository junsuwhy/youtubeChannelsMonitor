import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { useVideos } from "@/hooks/useVideos";
import { formatNumber, formatDuration, formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Lock, ArrowDown } from "lucide-react";
import type { Video } from "@/types";

interface VideosTabProps {
  channelId: number;
}

export function VideosTab({ channelId }: VideosTabProps) {
  const [title, setTitle] = useState("");
  const [localTitle, setLocalTitle] = useState("");
  const [status, setStatus] = useState("");
  const [publishedAfter, setPublishedAfter] = useState("");
  const [publishedBefore, setPublishedBefore] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    const t = setTimeout(() => setTitle(localTitle), 300);
    return () => clearTimeout(t);
  }, [localTitle]);

  const { data, isLoading, error } = useVideos({
    channel_id: channelId,
    title: title || undefined,
    status: status || undefined,
    include_non_public: !status,
    published_after: publishedAfter || undefined,
    published_before: publishedBefore || undefined,
    sort_by: sortBy || undefined,
    page,
    limit,
  });

  const videos: Video[] = data?.items || [];
  const totalCount = data?.total || 0;

  const handleSort = (field: string) => {
    setSortBy(field);
    setPage(1);
  };

  const renderSortableHeader = (label: string, field: string) => {
    const isActive = sortBy === field || (!sortBy && field === "published_at" && label === "發布時間");
    return (
      <div 
        className="flex items-center gap-1 cursor-pointer select-none hover:text-primary justify-end"
        onClick={() => handleSort(field)}
      >
        {label}
        {isActive && <ArrowDown className="h-4 w-4" />}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="channel-videos-tab">
      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        <Input 
          placeholder="搜尋影片標題..." 
          value={localTitle}
          onChange={(e) => {
            setLocalTitle(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-[250px]"
        />

        <Select 
          value={status || "all"} 
          onValueChange={(v) => {
            setStatus(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="所有狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有狀態</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="unlisted">Unlisted</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input 
            type="date"
            value={publishedAfter}
            onChange={(e) => {
              setPublishedAfter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-[140px]"
          />
          <span className="text-muted-foreground">-</span>
          <Input 
            type="date"
            value={publishedBefore}
            onChange={(e) => {
              setPublishedBefore(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-[140px]"
          />
        </div>

        <Select 
          value={sortBy || "default"} 
          onValueChange={(v) => {
            setSortBy(v === "default" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="排序方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">預設排序 (發布時間)</SelectItem>
            <SelectItem value="view_count">觀看數</SelectItem>
            <SelectItem value="like_count">按讚數</SelectItem>
            <SelectItem value="comment_count">留言數</SelectItem>
            <SelectItem value="created_at">系統發現時間</SelectItem>
          </SelectContent>
        </Select>

        {(title || status || publishedAfter || publishedBefore || sortBy) && (
          <Button 
            variant="ghost" 
            onClick={() => { 
              setLocalTitle(""); 
              setTitle("");
              setStatus("");
              setPublishedAfter("");
              setPublishedBefore("");
              setSortBy("");
              setPage(1);
            }} 
            className="w-full sm:w-auto px-2"
          >
            清除篩選
          </Button>
        )}
      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">縮圖</TableHead>
              <TableHead>影片資訊</TableHead>
              <TableHead className="text-right w-[100px]">{renderSortableHeader("觀看數", "view_count")}</TableHead>
              <TableHead className="text-right w-[80px]">{renderSortableHeader("按讚數", "like_count")}</TableHead>
              <TableHead className="text-right w-[80px]">{renderSortableHeader("留言數", "comment_count")}</TableHead>
              <TableHead className="text-right w-[120px]">{renderSortableHeader("發布時間", "published_at")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-[68px] w-[120px] rounded-md" /></TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-[200px]" />
                      <Skeleton className="h-4 w-[80px]" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[50px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[50px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : videos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <EmptyState message="此頻道目前沒有影片" testId="empty-state-videos" />
                </TableCell>
              </TableRow>
            ) : (
              videos.map((video: Video) => {
                const unavailable = video.status === "deleted" || video.status === "private";
                
                return (
                  <TableRow key={video.id} className={unavailable ? "opacity-60 bg-muted/30" : ""}>
                    <TableCell>
                      <div className="relative h-[68px] w-[120px] rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {unavailable || !video.thumbnail_url ? (
                          <div className="w-full h-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-gray-400" />
                          </div>
                        ) : (
                          <img
                            src={video.thumbnail_url}
                            alt={video.title || "Thumbnail"}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                        {video.duration && (
                          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                            {formatDuration(video.duration)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Link 
                          to={`/videos/${video.id}`}
                          className={cn("font-medium hover:underline line-clamp-2", unavailable ? "line-through text-muted-foreground" : "text-blue-600 dark:text-blue-400")}
                          title={video.title || ""}
                        >
                          {video.title || video.youtube_video_id}
                        </Link>
                        <div className="flex flex-wrap gap-2 items-center">
                          <StatusBadge status={video.status} className="h-5 text-[10px] px-1" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span>{formatNumber(video.view_count || 0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(video.like_count || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(video.comment_count || 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatRelativeTime(video.published_at || "")}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 && (
        <div>
          <Pagination 
            page={page} 
            limit={limit} 
            total={totalCount} 
            onPageChange={setPage} 
          />
        </div>
      )}
    </div>
  );
}
