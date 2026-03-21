import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, Eye, Video, TrendingUp, MoreHorizontal, Slash, Lock, ChevronDown, ChevronUp, EyeOff, AlertTriangle, Edit } from "lucide-react";

import { fetchChannelTrend, fetchVideos, fetchChannelNow, deleteChannel } from "@/lib/api";
import { useChannel, useChannelSnapshots, useUpdateChannel } from "@/hooks/useChannels";
import { useChannelAnomalies } from "@/hooks/useAnomalies";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { BarChart, Bar, XAxis as BXAxis, YAxis as BYAxis, Tooltip as BTooltip, ResponsiveContainer as BResponsiveContainer, CartesianGrid } from "recharts";

import { ErrorBanner } from "@/components/ErrorBanner";
import { VideosTab } from "./channel-detail/VideosTab";
import { AnomaliesTab } from "./channel-detail/AnomaliesTab";
import { FetchLogsTab } from "./channel-detail/FetchLogsTab";
import { SettingsTab } from "./channel-detail/SettingsTab";
import { formatNumber } from "@/components/NumberFormatter";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { SparklineCard } from "@/components/SparklineCard";
import { TrendChart } from "@/components/TrendChart";
import { formatDate, formatRelativeTime, formatChange } from "@/lib/formatters";

type MetricType = "subscriber" | "view" | "video";
type TimeRangeType = "7D" | "30D" | "90D" | "1Y" | "ALL";

export default function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const channelId = parseInt(id || "0", 10);
  const navigate = useNavigate();

  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [isFetchingNow, setIsFetchingNow] = useState(false);

  // Overview tab state
  const [activeTab, setActiveTab] = useState("overview");
  const [metric, setMetric] = useState<MetricType>("subscriber");
  const [timeRange, setTimeRange] = useState<TimeRangeType>("30D");
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  const { data: channel, isLoading: channelLoading, error: channelError } = useChannel(channelId);
  const { data: snapshots } = useChannelSnapshots(channelId);

  const { data: trendData, isLoading: trendLoading, error: trendError } = useQuery({
    queryKey: ['channel-trend', channelId],
    queryFn: () => fetchChannelTrend(channelId),
    enabled: !!channelId,
    gcTime: 5 * 60 * 1000,
  });

  const { data: videosData, error: videosError } = useQuery({
    queryKey: ['channel-videos', channelId],
    queryFn: () => fetchVideos({ channel_id: channelId, limit: 200 }),
    enabled: !!channelId,
    gcTime: 5 * 60 * 1000,
  });

  const { data: anomaliesData } = useChannelAnomalies(channelId);

  const updateChannelMutation = useUpdateChannel();

  const videos = Array.isArray(videosData) ? videosData : videosData?.items || [];
  const trend = trendData || [];
  const anomalies = Array.isArray(anomaliesData) ? anomaliesData : anomaliesData?.items || [];

  const error = channelError || trendError || videosError;

  if (!channelId) {
    return <div className="p-6">無效的頻道 ID</div>;
  }

  const handleAddTag = () => {
    if (!newTag.trim() || !channel) return;
    const currentTags = channel.tags || [];
    if (currentTags.includes(newTag.trim())) {
      setNewTag("");
      setTagPopoverOpen(false);
      return;
    }
    updateChannelMutation.mutate({
      id: channelId,
      data: { tags: [...currentTags, newTag.trim()] }
    });
    setNewTag("");
    setTagPopoverOpen(false);
  };

  const handleSaveNotes = () => {
    updateChannelMutation.mutate({
      id: channelId,
      data: { notes: notesText } as any
    });
    setNotesDialogOpen(false);
  };

  const handleToggleStatus = () => {
    if (!channel) return;
    updateChannelMutation.mutate({
      id: channelId,
      data: { status: channel.status === 'active' ? 'paused' : 'active' }
    });
  };

  const handleFetchNow = async () => {
    setIsFetchingNow(true);
    try {
      await fetchChannelNow(channelId);
    } catch (e) {
    } finally {
      setIsFetchingNow(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("確定要移除此頻道嗎？這項操作無法復原。")) {
      await deleteChannel(channelId);
      navigate("/channels");
    }
  };

  const sortedSnapshots = [...(snapshots || [])].sort(
    (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
  );

  const latestSub = channel?.subscriber_count || 0;
  const latestView = channel?.total_view_count || 0;
  const latestVideo = channel?.video_count || 0;

  const past30Index = Math.max(0, sortedSnapshots.length - 30);
  const past30Snapshot = sortedSnapshots.length > 0 ? sortedSnapshots[past30Index] : null;

  const past30Sub = past30Snapshot?.subscriber_count || 0;
  const past30View = past30Snapshot?.view_count || 0;
  const past30Video = past30Snapshot?.video_count || 0;

  const avgView = latestVideo > 0 ? latestView / latestVideo : 0;
  const past30AvgView = past30Video > 0 ? past30View / past30Video : 0;

  const subChange = formatChange(latestSub, past30Sub);
  const viewChange = formatChange(latestView, past30View);
  const videoChange = formatChange(latestVideo, past30Video);
  const avgViewChange = formatChange(avgView, past30AvgView);

  const sparklineSub = sortedSnapshots.map(s => s.subscriber_count || 0);
  const sparklineView = sortedSnapshots.map(s => s.view_count || 0);
  const sparklineVideo = sortedSnapshots.map(s => s.video_count || 0);

  // Overview Tab Data Processing
  const filteredTrendData = useMemo(() => {
    if (!trend || trend.length === 0) return [];
    if (timeRange === "ALL") return trend;
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : timeRange === "90D" ? 90 : 365;
    const now = new Date();
    const cutoffDate = new Date(now.setDate(now.getDate() - days));
    return trend.filter((d: any) => new Date(d.date) >= cutoffDate);
  }, [trend, timeRange]);

  const trendChartData = useMemo(() => {
    const dataKey = metric === 'subscriber' ? 'subscriber_count' : 'view_count';
    return filteredTrendData.map((d: any) => ({
      date: d.date,
      value: (d[dataKey] as number) || 0
    }));
  }, [filteredTrendData, metric]);

  const weeklyVideoData = useMemo(() => {
    if (metric !== 'video') return [];
    
    const weeks: Record<string, number> = {};
    videos.forEach((v: any) => {
      if (!v.published_at) return;
      const d = new Date(v.published_at);
      const day = d.getDay() || 7; 
      d.setHours(-24 * (day - 1));
      const weekStart = d.toISOString().split('T')[0];
      weeks[weekStart] = (weeks[weekStart] || 0) + 1;
    });

    const result = Object.entries(weeks)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
      
    if (timeRange === 'ALL') return result;
    
    let daysToSubtract = 30;
    if (timeRange === '7D') daysToSubtract = 7;
    else if (timeRange === '90D') daysToSubtract = 90;
    else if (timeRange === '1Y') daysToSubtract = 365;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToSubtract);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    return result.filter(d => d.date >= cutoffStr);
  }, [videos, metric, timeRange]);

  const timelineEvents = useMemo(() => {
    type EventItem = { type: string; date: string; title: string; desc?: string; id: string; Icon: any; iconColor: string; bgColor: string };
    const events: EventItem[] = [];
    
    videos.forEach((v: any) => {
      if (v.published_at) {
        events.push({
          type: 'video',
          date: v.published_at,
          title: '發布新影片',
          desc: v.title || undefined,
          id: `vid-${v.id}`,
          Icon: Video,
          iconColor: "text-blue-600",
          bgColor: "bg-blue-100"
        });
      }
    });

    anomalies.forEach((a: any) => {
      if (a.detected_at || a.created_at || a.date || a.snapshot_date) {
        const type = a.event_type || a.anomaly_type || '';
        let Icon = AlertTriangle;
        let iconColor = "text-red-600";
        let bgColor = "bg-red-100";
        let title = "頻道狀態變更";

        if (type === 'video_deleted' || type === 'video_status_changed' || type === 'video_unavailable') {
          Icon = EyeOff;
          title = "影片狀態變更";
        } else if (type === 'view_count_spike') {
          Icon = TrendingUp;
          iconColor = "text-orange-600";
          bgColor = "bg-orange-100";
          title = "觀看數異常飆升";
        } else if (type === 'video_title_changed') {
          Icon = Edit;
          iconColor = "text-yellow-600";
          bgColor = "bg-yellow-100";
          title = "影片標題變更";
        }

        events.push({
          type: 'anomaly',
          date: a.detected_at || a.created_at || a.date || a.snapshot_date,
          title: title,
          desc: a.summary || a.event_type || a.anomaly_type,
          id: `ano-${a.id}`,
          Icon,
          iconColor,
          bgColor
        });
      }
    });

    return events
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [videos, anomalies]);

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
        <>
          <Card data-testid="channel-info-card">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="shrink-0 relative h-24 w-24">
                  <img 
                    src={channel.thumbnail_url || 'https://placehold.co/96x96'} 
                    alt={channel.channel_name ?? undefined} 
                    className="h-24 w-24 rounded-full object-cover"
                  />
                  {channel.status === 'terminated' && (
                    <div className="absolute inset-0 bg-gray-500/50 rounded-full flex items-center justify-center">
                      <Lock className="h-8 w-8 text-white opacity-80" />
                      <Slash className="h-8 w-8 text-white absolute opacity-80" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-bold">{channel.channel_name}</h1>
                        <StatusBadge status={channel.status} />
                        <SourceBadge source={channel.source} />
                      </div>
                      {channel.custom_url && (
                        <p className="text-sm text-muted-foreground">@{channel.custom_url}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        頻道建立於 {formatDate(channel.created_at || "")} ・ 國家: {channel.country || '未提供'}
                      </p>
                      <div>
                        <a 
                          href={`https://youtube.com/channel/${channel.youtube_channel_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          在 YouTube 查看 ↗
                        </a>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        data-testid="channel-action-pause"
                        onClick={handleToggleStatus}
                      >
                        {channel.status === 'active' ? '暫停監控' : '恢復監控'}
                      </Button>
                      <Button 
                        data-testid="channel-action-fetch"
                        onClick={handleFetchNow}
                        disabled={isFetchingNow}
                      >
                        {isFetchingNow ? '爬取中...' : '立即爬取'}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid="channel-action-more">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => window.alert("Coming soon")}>
                            匯出此頻道資料
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(channel.youtube_channel_id)}>
                            複製 Channel ID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onClick={handleDelete}>
                            移除頻道
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {channel.tags?.map(tag => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                    <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2">+ 新增標籤</Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3">
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">新增標籤</h4>
                          <div className="flex gap-2">
                            <Input 
                              value={newTag} 
                              onChange={e => setNewTag(e.target.value)} 
                              placeholder="輸入標籤名稱..." 
                              className="h-8 text-sm"
                              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                            />
                            <Button size="sm" className="h-8" onClick={handleAddTag}>新增</Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md flex justify-between items-start group">
                    <div className="whitespace-pre-wrap flex-1">
                      {(channel as any).notes || "（無備註）"}
                    </div>
                    <Dialog open={notesDialogOpen} onOpenChange={(open) => {
                      setNotesDialogOpen(open);
                      if (open) setNotesText((channel as any).notes || "");
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-xs">
                          [編輯]
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>編輯頻道備註</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                          <Textarea 
                            value={notesText} 
                            onChange={e => setNotesText(e.target.value)} 
                            placeholder="輸入備註內容..." 
                            className="min-h-[100px]"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>取消</Button>
                          <Button onClick={handleSaveNotes}>儲存</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                    <div>首次收錄: {formatDate(channel.created_at || "")}</div>
                    <div>最後爬取: {formatRelativeTime(channel.updated_at || "")}</div>
                    <div>爬取頻率: 每日</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div data-testid="channel-metrics-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SparklineCard
              title="訂閱數"
              value={formatNumber(latestSub)}
              change={subChange}
              sparklineData={sparklineSub}
              icon={<Users className="h-4 w-4" />}
              onClick={() => {}}
            />
            <SparklineCard
              title="總觀看"
              value={formatNumber(latestView)}
              change={viewChange}
              sparklineData={sparklineView}
              icon={<Eye className="h-4 w-4" />}
              onClick={() => {}}
            />
            <SparklineCard
              title="影片數"
              value={formatNumber(latestVideo)}
              change={videoChange}
              sparklineData={sparklineVideo}
              icon={<Video className="h-4 w-4" />}
              onClick={() => {}}
            />
            <SparklineCard
              title="平均觀看"
              value={formatNumber(avgView)}
              change={avgViewChange}
              icon={<TrendingUp className="h-4 w-4" />}
              onClick={() => {}}
            />
          </div>
        </>
      ) : null}

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="mt-6 space-y-4" data-testid="channel-tabs">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">總覽</TabsTrigger>
          <TabsTrigger value="videos" data-testid="tab-videos-trigger">影片</TabsTrigger>
          <TabsTrigger value="anomalies" data-testid="tab-anomalies-trigger">異常記錄</TabsTrigger>
          <TabsTrigger value="fetch-logs" data-testid="tab-fetch-logs-trigger">爬取紀錄</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings-trigger">設定</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <ToggleGroup 
                type="single" 
                value={metric} 
                onValueChange={(val) => val && setMetric(val as MetricType)}
                data-testid="trend-chart-metric-toggle"
              >
                <ToggleGroupItem value="subscriber">訂閱數</ToggleGroupItem>
                <ToggleGroupItem value="view">觀看數</ToggleGroupItem>
                <ToggleGroupItem value="video">影片發布</ToggleGroupItem>
              </ToggleGroup>
              
              <div data-testid="trend-chart-time-range" className="flex gap-2">
                {(['7D', '30D', '90D', '1Y', 'ALL'] as const).map(range => (
                  <Button
                    key={range}
                    variant={timeRange === range ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimeRange(range)}
                  >
                    {range}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {trendLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : metric !== 'video' ? (
                <div className="[&_[data-testid=time-range-selector]]:hidden">
                  <TrendChart 
                    data={trendChartData}
                    timeRange="ALL"
                    onTimeRangeChange={() => {}}
                    chartType="area"
                    color={metric === 'subscriber' ? '#2563eb' : '#16a34a'}
                    valueFormatter={(v) => formatNumber(v)}
                  />
                </div>
              ) : (
                <div className="h-[200px] w-full mt-4">
                  <BResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyVideoData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
                      <BXAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} style={{ fontSize: '12px', fill: 'hsl(var(--muted-foreground))' }} />
                      <BYAxis tickLine={false} axisLine={false} width={40} style={{ fontSize: '12px', fill: 'hsl(var(--muted-foreground))' }} />
                      <BTooltip 
                        formatter={(val: any) => [val, "發布數"]}
                        labelFormatter={(label) => `當週: ${label}`}
                        cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                      />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </BResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">頻道介紹</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4" data-testid="channel-description">
                <div className="relative">
                  <p className={`text-sm text-muted-foreground whitespace-pre-wrap break-words ${!isDescExpanded ? 'line-clamp-3' : ''}`}>
                    {channel?.description || '尚無描述'}
                  </p>
                  {(channel?.description && channel.description.split('\n').length > 3) && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 text-xs h-6 px-2"
                      onClick={() => setIsDescExpanded(!isDescExpanded)}
                    >
                      {isDescExpanded ? <><ChevronUp className="h-3 w-3 mr-1" /> 收起</> : <><ChevronDown className="h-3 w-3 mr-1" /> 展開</>}
                    </Button>
                  )}
                </div>
                {channel?.topic_categories && channel.topic_categories.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Topic 分類</h4>
                    <div className="flex flex-wrap gap-2">
                      {channel.topic_categories.map((topic, i) => {
                        const label = topic.split('/').pop()?.replace(/_/g, ' ');
                        return <Badge key={i} variant="secondary">{label || topic}</Badge>;
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">近期活動</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6" data-testid="activity-timeline">
                {timelineEvents.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">暫無活動</div>
                ) : (
                  <div className="relative pl-6 border-l space-y-6">
                    {timelineEvents.map((evt) => (
                      <div key={evt.id} className="relative">
                        <span className={`absolute -left-[35px] top-0.5 ${evt.bgColor} h-6 w-6 rounded-full border border-background flex items-center justify-center`}>
                          <evt.Icon className={`h-3 w-3 ${evt.iconColor}`} />
                        </span>
                        <div className="text-xs text-muted-foreground mb-1">
                          {formatRelativeTime(evt.date)} ({formatDate(evt.date)})
                        </div>
                        <div className="text-sm font-medium">
                          {evt.title}
                        </div>
                        {evt.desc && (
                          <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {evt.desc}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {timelineEvents.length > 0 && (
                  <div className="pt-4 border-t text-center">
                    <Button variant="link" size="sm" onClick={() => setActiveTab("anomalies")}>
                      查看全部活動紀錄 →
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="videos" data-testid="tab-videos">
          <VideosTab channelId={channelId} />
        </TabsContent>
        <TabsContent value="anomalies" data-testid="tab-anomalies">
          <AnomaliesTab channelId={channelId} />
        </TabsContent>
        <TabsContent value="fetch-logs" data-testid="tab-fetch-logs">
          <FetchLogsTab channelId={channelId} />
        </TabsContent>
        <TabsContent value="settings" data-testid="tab-settings">
          <SettingsTab channelId={channelId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
