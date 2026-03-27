import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { useVideos } from "@/hooks/useVideos";
import { useChannels } from "@/hooks/useChannels";
import { formatNumber, formatDuration, formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Lock, MoreHorizontal, Check, ChevronsUpDown, ArrowDown, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Video } from "@/types";

export default function VideoListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const titleParam = searchParams.get("title") || "";
  const channelIdParam = searchParams.get("channel_id") || "";
  const statusParam = searchParams.get("status") || "";
  const publishedAfterParam = searchParams.get("published_after") || "";
  const publishedBeforeParam = searchParams.get("published_before") || "";
  const sortByParam = searchParams.get("sort_by") || "";
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const limit = 20;

  const updateParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set(key, value);
    else newParams.delete(key);
    if (key !== "page") newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const [localTitle, setLocalTitle] = useState(titleParam);

  useEffect(() => {
    const t = setTimeout(() => {
      if (localTitle !== titleParam) {
        updateParam("title", localTitle);
      }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTitle, titleParam]);


  // Channels for combobox & avatars
  const { data: channelsData } = useChannels({ limit: 1000 });
  const channels = channelsData?.items || [];
  const selectedChannelId = channelIdParam ? parseInt(channelIdParam, 10) : undefined;
  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  // Stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const { data: statsPublic } = useVideos({ status: "public", limit: 1 });
  const { data: statsNew } = useVideos({ published_after: todayStr, limit: 1 });
  const { data: statsDeleted } = useVideos({ status: "deleted", limit: 1 });
  const { data: statsPrivate } = useVideos({ status: "private", limit: 1 });

  // Main table data
  const { data, isLoading, error } = useVideos({
    title: titleParam || undefined,
    channel_id: selectedChannelId,
    status: statusParam || undefined,
    include_non_public: !statusParam, // show all if no specific status selected
    published_after: publishedAfterParam || undefined,
    published_before: publishedBeforeParam || undefined,
    sort_by: sortByParam || undefined,
    page: pageParam,
    limit,
  });

  const videos: Video[] = data?.items || [];
  const totalCount = data?.total || 0;

  const handleSort = (field: string) => {
    updateParam("sort_by", field);
  };

  const renderSortableHeader = (label: string, field: string) => {
    const isActive = sortByParam === field || (!sortByParam && field === "published_at" && label === "發布時間");
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
    <div className="space-y-6 p-6" data-testid="video-list-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: "影片列表" }]} />
          <h1 className="text-3xl font-bold tracking-tight mt-2">所有影片</h1>
        </div>
        <Button variant="outline" onClick={() => window.alert("Coming soon")}>
          匯出
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="video-stats-row">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => updateParam("status", "public")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">追蹤中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsPublic?.total ?? "-"}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => updateParam("published_after", todayStr)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今日新增</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsNew?.total ?? "-"}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => updateParam("status", "deleted")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已消失</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>已刪除（{statsDeleted?.total ?? 0}）＋私人（{statsPrivate?.total ?? 0}）影片合計</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(statsDeleted?.total ?? 0) + (statsPrivate?.total ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">異常影片</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 flex-wrap items-start sm:items-center" data-testid="video-filter-toolbar">
        <Input 
          data-testid="video-search-input"
          placeholder="搜尋影片標題..." 
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          className="w-full sm:w-[250px]"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button data-testid="video-channel-filter" variant="outline" className="w-full sm:w-[200px] justify-between">
              <span className="truncate">
                {selectedChannel ? (selectedChannel.channel_name || selectedChannel.youtube_channel_id) : "所有頻道"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0">
            <Command>
              <CommandInput placeholder="搜尋頻道..." />
              <CommandList>
                <CommandEmpty>找不到頻道</CommandEmpty>
                <CommandGroup>
                  <CommandItem onSelect={() => updateParam("channel_id", "")}>
                    <Check className={cn("mr-2 h-4 w-4", !selectedChannelId ? "opacity-100" : "opacity-0")} />
                    所有頻道
                  </CommandItem>
                  {channels.map((channel) => (
                    <CommandItem
                      key={channel.id}
                      value={channel.channel_name || channel.youtube_channel_id}
                      onSelect={() => updateParam("channel_id", channel.id.toString())}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedChannelId === channel.id ? "opacity-100" : "opacity-0")} />
                      {channel.channel_name || channel.youtube_channel_id}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Select data-testid="video-status-filter" value={statusParam || "all"} onValueChange={(v) => updateParam("status", v === "all" ? "" : v)}>
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
            value={publishedAfterParam}
            onChange={(e) => updateParam("published_after", e.target.value)}
            className="w-full sm:w-[140px]"
          />
          <span className="text-muted-foreground">-</span>
          <Input 
            type="date"
            value={publishedBeforeParam}
            onChange={(e) => updateParam("published_before", e.target.value)}
            className="w-full sm:w-[140px]"
          />
        </div>

        <Select data-testid="video-sort-select" value={sortByParam || "default"} onValueChange={(v) => updateParam("sort_by", v === "default" ? "" : v)}>
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

        {(titleParam || channelIdParam || statusParam || publishedAfterParam || publishedBeforeParam || sortByParam) && (
          <Button variant="ghost" onClick={() => { setLocalTitle(""); setSearchParams(new URLSearchParams()); }} className="w-full sm:w-auto px-2">
            清除篩選
          </Button>
        )}
      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table data-testid="video-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">縮圖</TableHead>
              <TableHead>影片資訊</TableHead>
              <TableHead className="w-[180px]">頻道</TableHead>
              <TableHead className="text-right w-[120px]">{renderSortableHeader("觀看數", "view_count")}</TableHead>
              <TableHead className="text-right w-[100px]">{renderSortableHeader("按讚數", "like_count")}</TableHead>
              <TableHead className="text-right w-[100px]">{renderSortableHeader("留言數", "comment_count")}</TableHead>
              <TableHead className="text-right w-[120px]">{renderSortableHeader("發布時間", "published_at")}</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-[90px] w-[160px] rounded-md" /></TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-[250px]" />
                      <Skeleton className="h-4 w-[100px]" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <Skeleton className="h-4 w-[100px]" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : videos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <EmptyState message="找不到影片" testId="empty-state-videos" />
                </TableCell>
              </TableRow>
            ) : (
              videos.map((video: Video) => {
                const unavailable = video.status === "deleted" || video.status === "private";
                const chan = channels.find(c => c.id === video.channel_id);
                
                return (
                  <TableRow key={video.id} className={unavailable ? "opacity-60 bg-muted/30" : ""}>
                    <TableCell>
                      <div className="relative h-[90px] w-[160px] rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {unavailable || !video.thumbnail_url ? (
                          <div className="w-full h-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                            <Lock className="w-8 h-8 text-gray-400" />
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
                          {unavailable && <span className="text-xs text-muted-foreground bg-secondary px-1 rounded">最後已知數據</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link to={`/channels/${video.channel_id}`} className="flex items-center gap-2 hover:underline">
                        <img 
                          src={chan?.thumbnail_url || "https://placehold.co/24x24"} 
                          alt="Channel avatar" 
                          className="w-6 h-6 rounded-full object-cover bg-muted flex-shrink-0"
                        />
                        <span className="text-sm truncate max-w-[120px]" title={video.channel_name || ""}>
                          {video.channel_name || video.channel_id}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span>{formatNumber(video.view_count || 0)}</span>
                        <span className="text-[10px] text-muted-foreground">— (7d)</span>
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">選單</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/videos/${video.id}`}>查看詳情</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://youtube.com/watch?v=${video.youtube_video_id}`, "_blank")}>
                            YouTube 開啟
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(`https://youtube.com/watch?v=${video.youtube_video_id}`)}>
                            複製連結
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 && (
        <div data-testid="video-pagination">
          <Pagination 
            page={pageParam} 
            limit={limit} 
            total={totalCount} 
            onPageChange={(p) => updateParam("page", p.toString())} 
          />
        </div>
      )}
    </div>
  );
}
