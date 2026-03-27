import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { subDays } from "date-fns";
import type { AxiosError } from "axios";
import {
  AlertTriangle,
  Play,
  Lock,
  Eye,
  ThumbsUp,
  MessageSquare,
  TrendingUp,
  Copy,
  ExternalLink,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { useVideo, useVideoSnapshots, useVideos } from "@/hooks/useVideos";
import { Breadcrumb } from "@/components/Breadcrumb";
import { StatusBadge } from "@/components/StatusBadge";
import { SparklineCard } from "@/components/SparklineCard";
import { TrendChart } from "@/components/TrendChart";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatChange,
} from "@/lib/formatters";

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const videoId = parseInt(id || "0", 10);

  const { data: video, isLoading: videoLoading, error: videoError } = useVideo(videoId);
  const { data: snapshotsData, isLoading: snapshotsLoading } = useVideoSnapshots(videoId);

  const { data: relatedData, isLoading: relatedLoading } = useVideos({
    channel_id: video?.channel_id,
    limit: 6,
    sort_by: "published_at",
  });

  const [metric, setMetric] = useState<"view_count" | "like_count" | "comment_count">("view_count");
  const [timeRange, setTimeRange] = useState<"7D" | "30D" | "90D" | "ALL">("30D");
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const snapshots = Array.isArray(snapshotsData) ? snapshotsData : [];
  const relatedVideos = relatedData?.items || [];

  const metrics = useMemo(() => {
    if (!snapshots || snapshots.length === 0) {
      return {
        view: { value: 0, change: { text: "0", color: "gray", arrow: "" }, sparkline: [] },
        like: { value: 0, change: { text: "0", color: "gray", arrow: "" }, sparkline: [] },
        comment: { value: 0, change: { text: "0", color: "gray", arrow: "" }, sparkline: [] },
        interactionRate: "0.0%",
      };
    }

    const latest = snapshots[snapshots.length - 1];
    const sevenDaysAgoStr = subDays(new Date(latest.snapshot_date), 7).toISOString();
    
    let previous = snapshots[0];
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (new Date(snapshots[i].snapshot_date) <= new Date(sevenDaysAgoStr)) {
        previous = snapshots[i];
        break;
      }
    }

    const viewSparkline = snapshots.map((s) => s.view_count || 0);
    const likeSparkline = snapshots.map((s) => s.like_count || 0);
    const commentSparkline = snapshots.map((s) => s.comment_count || 0);

    const views = latest.view_count || 0;
    const likes = latest.like_count || 0;
    const comments = latest.comment_count || 0;

    const interactionRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

    return {
      view: {
        value: views,
        change: formatChange(views, previous.view_count || 0),
        sparkline: viewSparkline,
      },
      like: {
        value: likes,
        change: formatChange(likes, previous.like_count || 0),
        sparkline: likeSparkline,
      },
      comment: {
        value: comments,
        change: formatChange(comments, previous.comment_count || 0),
        sparkline: commentSparkline,
      },
      interactionRate: interactionRate.toFixed(1) + "%",
    };
  }, [snapshots]);

  const handleCopyLink = () => {
    if (video?.youtube_video_id) {
      navigator.clipboard.writeText(`https://youtube.com/watch?v=${video.youtube_video_id}`);
    }
  };

  const handleCopyId = () => {
    if (video?.youtube_video_id) {
      navigator.clipboard.writeText(video.youtube_video_id);
    }
  };

  if (videoError && (videoError as AxiosError)?.response?.status === 404) {
    return (
      <div className="p-6 space-y-4">
        <ErrorBanner message="影片不存在或已被刪除" />
        <Button variant="outline" asChild>
          <Link to="/">返回首頁</Link>
        </Button>
      </div>
    );
  }

  if (videoLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-[300px]" />
        <Card>
          <CardContent className="p-6 flex gap-6">
            <Skeleton className="w-[320px] h-[180px] rounded-md" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!video) return null;

  const isDeletedOrPrivate = video.status === "deleted" || video.status === "private";
  const youtubeUrl = `https://youtube.com/watch?v=${video.youtube_video_id}`;
  const maxResThumbnail = `https://img.youtube.com/vi/${video.youtube_video_id}/maxresdefault.jpg`;
  const standardThumbnail = `https://img.youtube.com/vi/${video.youtube_video_id}/hqdefault.jpg`;
  const thumbnailUrl = imgError ? standardThumbnail : (video.thumbnail_url || maxResThumbnail);

  const chartData = snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s[metric] || 0,
  }));

  const metricLabels = {
    view_count: "觀看數",
    like_count: "按讚數",
    comment_count: "留言數",
  };

  return (
    <div className="space-y-6 p-6" data-testid="video-detail-page">
      <Breadcrumb
        items={[
          { label: "首頁", href: "/" },
          { label: "頻道列表", href: "/channels" },
          { label: video.channel_name || "未知頻道", href: `/channels/${video.channel_id}` },
          { label: video.title || "影片詳情" },
        ]}
      />

      {isDeletedOrPrivate && (
        <div data-testid="video-warning-banner" className="bg-amber-50 border border-amber-200 rounded-md p-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-amber-800 text-sm">
            ⚠️ 此影片已於 {formatDateTime(video.updated_at || video.created_at || "")} 變為{video.status === "deleted" ? "刪除" : "私人"}，以下數據為最後一次成功爬取的記錄
          </span>
        </div>
      )}

      <Card data-testid="video-info-card">
        <CardContent className="p-6 flex flex-col md:flex-row gap-6">
          <div className="shrink-0 relative group">
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="block relative rounded-md overflow-hidden bg-muted">
              <img
                src={thumbnailUrl}
                alt={video.title || "Video thumbnail"}
                className="w-[320px] aspect-video object-cover"
                onError={(e) => {
                  if (!imgError) {
                    setImgError(true);
                  } else {
                    e.currentTarget.src = "https://placehold.co/320x180?text=No+Image";
                  }
                }}
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {isDeletedOrPrivate ? (
                  <div className="bg-black/60 p-4 rounded-full flex items-center justify-center">
                    <Lock className="h-8 w-8 text-white" />
                  </div>
                ) : (
                  <Play className="h-12 w-12 text-white drop-shadow-md" />
                )}
              </div>
            </a>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-xl font-bold line-clamp-2 leading-tight mb-2" title={video.title || ""}>
                {video.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={video.status} />
                <Link
                  to={`/channels/${video.channel_id}`}
                  className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
                >
                  <img
                    src={`https://placehold.co/32x32?text=${video.channel_name?.charAt(0) || "C"}`}
                    alt={video.channel_name || ""}
                    className="h-6 w-6 rounded-full object-cover bg-muted"
                  />
                  {video.channel_name}
                </Link>
              </div>
            </div>

            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">發布時間:</span>
                <span>{formatDateTime(video.published_at || "")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">時長:</span>
                <span>{formatDuration(video.duration || "")}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="default" size="sm" className="gap-2">
                <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  在 YouTube 觀看
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                <Copy className="h-4 w-4" />
                複製連結
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCopyId}>
                    複製 Video ID
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="video-metrics-row">
        {snapshotsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] w-full rounded-xl" />)
        ) : (
          <>
            <SparklineCard
              title="觀看數"
              value={formatNumber(metrics.view.value)}
              change={{ ...metrics.view.change, color: metrics.view.change.color as "green" | "red" | "gray" }}
              subtitle="過去 7 天"
              sparklineData={metrics.view.sparkline}
              icon={<Eye className="h-4 w-4" />}
            />
            <SparklineCard
              title="按讚數"
              value={formatNumber(metrics.like.value)}
              change={{ ...metrics.like.change, color: metrics.like.change.color as "green" | "red" | "gray" }}
              subtitle="過去 7 天"
              sparklineData={metrics.like.sparkline}
              icon={<ThumbsUp className="h-4 w-4" />}
            />
            <SparklineCard
              title="留言數"
              value={formatNumber(metrics.comment.value)}
              change={{ ...metrics.comment.change, color: metrics.comment.change.color as "green" | "red" | "gray" }}
              subtitle="過去 7 天"
              sparklineData={metrics.comment.sparkline}
              icon={<MessageSquare className="h-4 w-4" />}
            />
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  互動率
                </CardTitle>
                <div className="text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.interactionRate}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  (按讚 + 留言) / 觀看數
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card data-testid="video-trend-chart">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <CardTitle>數據趨勢</CardTitle>
           <ToggleGroup
             type="single"
             value={metric}
             onValueChange={(val) => {
               if (val) setMetric(val as "view_count" | "like_count" | "comment_count");
             }}
             size="sm"
           >
            <ToggleGroupItem value="view_count">觀看數</ToggleGroupItem>
            <ToggleGroupItem value="like_count">按讚數</ToggleGroupItem>
            <ToggleGroupItem value="comment_count">留言數</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {snapshotsLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : snapshots.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground border rounded-md">
              尚無趨勢數據
            </div>
          ) : (
            <div className="pt-4">
              <TrendChart
                data={chartData}
                timeRange={timeRange}
                onTimeRangeChange={(val) => setTimeRange(val as "7D" | "30D" | "90D" | "ALL")}
                yAxisLabel={metricLabels[metric]}
                valueFormatter={(val) => formatNumber(val)}
                color={metric === "view_count" ? "#3b82f6" : metric === "like_count" ? "#ec4899" : "#8b5cf6"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card data-testid="video-metadata">
            <CardHeader>
              <CardTitle>影片資訊</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {video.description && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">描述</h3>
                  <div
                    className={`text-sm text-muted-foreground whitespace-pre-wrap ${
                      isDescExpanded ? "" : "line-clamp-4"
                    }`}
                  >
                    {video.description}
                  </div>
                  {(video.description.match(/\n/g)?.length || 0) > 3 || video.description.length > 200 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs h-8"
                      onClick={() => setIsDescExpanded(!isDescExpanded)}
                    >
                      {isDescExpanded ? (
                        <>
                          <ChevronUp className="mr-1 h-3 w-3" /> 顯示較少
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1 h-3 w-3" /> 顯示完整資訊
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
              )}

              {video.tags && video.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">標籤</h3>
                  <div className="flex flex-wrap gap-2">
                    {video.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {video.topic_categories && video.topic_categories.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">主題分類</h3>
                  <div className="flex flex-wrap gap-2">
                    {video.topic_categories.map((topic) => {
                      const topicName = topic.split("/").pop() || topic;
                      return (
                        <Badge key={topic} variant="outline" className="font-normal text-muted-foreground">
                          {topicName}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {!video.description && (!video.tags || video.tags.length === 0) && (!video.topic_categories || video.topic_categories.length === 0) && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  無詳細資訊
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card data-testid="video-related-list">
            <CardHeader>
              <CardTitle className="text-lg">頻道最新影片</CardTitle>
            </CardHeader>
            <CardContent>
              {relatedLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="w-[120px] h-[68px] rounded" />
                      <div className="flex-1 space-y-2 py-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : relatedVideos.length === 0 ? (
                <div className="py-8 text-center">
                  <EmptyState message="同頻道無其他影片" />
                </div>
              ) : (
                <div className="space-y-4">
                  {relatedVideos
                    .filter((v) => v.id !== videoId)
                    .slice(0, 5)
                    .map((v) => {
                      const vImgUrl = v.thumbnail_url || `https://img.youtube.com/vi/${v.youtube_video_id}/hqdefault.jpg`;
                      return (
                        <Link
                          key={v.id}
                          to={`/videos/${v.id}`}
                          className="flex gap-3 group hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors"
                        >
                          <div className="relative shrink-0 w-[120px] h-[68px] rounded overflow-hidden bg-muted">
                            <img
                              src={vImgUrl}
                              alt={v.title || ""}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              onError={(e) => { e.currentTarget.src = "https://placehold.co/120x68?text=No+Image"; }}
                            />
                            {v.duration && (
                              <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                                {formatDuration(v.duration)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                            <h4 className="text-sm font-medium line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                              {v.title}
                            </h4>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                              <span>{formatNumber(v.view_count || 0)} 觀看</span>
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/50"></span>
                              <span>{formatDate(v.published_at || "")}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
