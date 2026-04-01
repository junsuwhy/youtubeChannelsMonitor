import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  createChannel,
  resolveChannelUrl,
  updateChannel,
  deleteChannel,
  fetchStatsOverview,
  fetchChannelNow
} from "@/lib/api";
import { useChannels, useChannelTags } from "@/hooks/useChannels";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { NumberFormatter } from "@/components/NumberFormatter";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SparklineCard } from "@/components/SparklineCard";
import { Pagination } from "@/components/Pagination";
import { SourceBadge } from "@/components/SourceBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, MoreHorizontal, LayoutGrid, List, Tag, Pause, Trash2, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/formatters";
import type { Channel } from "@/types";
import { useAuth } from "@/providers/AuthProvider";

export default function ChannelListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canManageContent } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const searchParam = searchParams.get("search") || "";
  const statusParam = searchParams.get("status") || "";
  const sourceParam = searchParams.get("source") || "";
  const tagsParam = searchParams.get("tags") || "";
  const sortByParam = searchParams.get("sort_by") || "";
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const limit = 20;

  const [localSearch, setLocalSearch] = useState(searchParam);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelTitle, setNewChannelTitle] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [formError, setFormError] = useState("");
  const [fetchingChannels, setFetchingChannels] = useState<Set<number>>(new Set());

  const [viewMode, setViewMode] = useState<"table" | "card">(
    () => (localStorage.getItem("channel-list-view-mode") as "table" | "card") || "table"
  );
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState<"pause" | "delete" | null>(null);
  const [batchTagDialogOpen, setBatchTagDialogOpen] = useState(false);
  const [batchTagsInput, setBatchTagsInput] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      if (localSearch !== searchParam) {
        updateParam("search", localSearch);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [localSearch, searchParam]);

  useEffect(() => {
    localStorage.setItem("channel-list-view-mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchParam, statusParam, sourceParam, tagsParam, sortByParam, pageParam]);

  const updateParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set(key, value);
    else newParams.delete(key);
    if (key !== "page") newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const { data: statsData } = useQuery({
    queryKey: ['stats-overview'],
    queryFn: fetchStatsOverview,
  });

  const { data: tagsData } = useChannelTags();
  const availableTags = tagsData || [];

  const { data, isLoading, error } = useChannels({
    status: statusParam || undefined,
    source: sourceParam || undefined,
    tags: tagsParam || undefined,
    search: searchParam || undefined,
    sort_by: sortByParam || undefined,
    page: pageParam,
    limit,
  });

  const channels: Channel[] = data?.items || [];
  const totalCount = data?.total || 0;

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === channels.length && channels.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(channels.map(c => c.id)));
    }
  };

  const handleBatchTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tagsArray = batchTagsInput.split(",").map(t => t.trim()).filter(Boolean);
    if (tagsArray.length === 0) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => updateChannel(id, { tags: tagsArray })));
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      setBatchTagDialogOpen(false);
      setBatchTagsInput("");
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Batch tag failed", err);
    }
  };

  const handleBatchActionConfirm = async () => {
    if (!batchAction) return;
    try {
      if (batchAction === "pause") {
        await Promise.all(Array.from(selectedIds).map(id => updateChannel(id, { status: "paused" })));
      } else if (batchAction === "delete") {
        await Promise.all(Array.from(selectedIds).map(id => deleteChannel(id)));
      }
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["stats-overview"] });
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Batch action failed", err);
    } finally {
      setBatchAction(null);
    }
  };

  const mutation = useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
      setDialogOpen(false);
      setNewChannelId("");
      setNewChannelTitle("");
      setUrlInput("");
      setResolveError("");
      setFormError("");
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) {
        if (err.response?.status === 409) {
          setFormError("此頻道已在監控清單中");
        } else {
          setFormError(err.response?.data?.detail || err.message || "新增失敗");
        }
      } else {
        setFormError(err instanceof Error ? err.message : "新增失敗");
      }
    }
  });

  const handleUrlChange = async (value: string) => {
    setUrlInput(value);
    setResolveError("");

    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      decoded = value;
    }

    const looksLikeUrl = decoded.includes("youtube.com") || decoded.includes("youtu.be");
    if (!looksLikeUrl) {
      setNewChannelId(value);
      return;
    }

    setResolving(true);
    setNewChannelId("");
    try {
      const result = await resolveChannelUrl(value);
      setNewChannelId(result.youtube_channel_id);
      if (result.channel_name && !newChannelTitle) {
        setNewChannelTitle(result.channel_name);
      }
    } catch (err) {
      if (isAxiosError(err)) {
        setResolveError(err.response?.data?.detail || "無法解析此頻道網址");
      } else {
        setResolveError(err instanceof Error ? err.message : "無法解析此頻道網址");
      }
    } finally {
      setResolving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!newChannelId.trim()) {
      setFormError("請輸入頻道 ID");
      return;
    }
    mutation.mutate({
      youtube_channel_id: newChannelId.trim(),
      channel_title: newChannelTitle.trim() || undefined,
    });
  };

  const handleFetchNow = async (channelId: number) => {
    setFetchingChannels(prev => new Set(prev).add(channelId));
    try {
      await fetchChannelNow(channelId);
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    } catch (err) {
      console.error("Fetch now failed", err);
    } finally {
      setFetchingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  };

  const handleUpdateStatus = async (channelId: number, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "active" ? "paused" : "active";
      await updateChannel(channelId, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["stats-overview"] });
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  const handleDelete = async (channelId: number) => {
    if (!window.confirm("確定要移除此頻道嗎？這將無法復原。")) return;
    try {
      await deleteChannel(channelId);
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["stats-overview"] });
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const selectedTags = tagsParam ? tagsParam.split(',') : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: "頻道列表" }]} />
          <h1 className="text-3xl font-bold tracking-tight mt-2">頻道列表</h1>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
          {canManageContent && (
            <Button variant="outline" asChild>
              <Link to="/channels/import">批次匯入</Link>
            </Button>
          )}

          {canManageContent && <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setNewChannelId("");
              setNewChannelTitle("");
              setUrlInput("");
              setResolveError("");
              setFormError("");
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="add-channel-button">新增頻道</Button>
            </DialogTrigger>
            <DialogContent data-testid="add-channel-dialog" className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>新增監控頻道</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="url_input">頻道網址或 Channel ID <span className="text-red-500">*</span></Label>
                  <Input
                    id="url_input"
                    placeholder="貼上頻道網址或輸入 UC..."
                    value={urlInput}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    disabled={mutation.isPending}
                  />
                  {resolving && <p className="text-sm text-muted-foreground">解析中...</p>}
                  {resolveError && <p className="text-sm text-red-500">{resolveError}</p>}
                  {!resolving && !resolveError && newChannelId && urlInput !== newChannelId && (
                    <p className="text-sm text-green-600">Channel ID：{newChannelId}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel_title">自訂名稱 (選填)</Label>
                  <Input
                    id="channel_title"
                    placeholder="輸入方便識別的名稱"
                    value={newChannelTitle}
                    onChange={(e) => setNewChannelTitle(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                {formError && <p className="text-sm text-red-500">{formError}</p>}
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={mutation.isPending || resolving || !newChannelId}>
                    {mutation.isPending ? "新增中..." : "確認新增"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SparklineCard
          title="監控中"
          value={(statsData?.active_channels ?? channels.filter(c => c.status === "active").length).toString()}
          change={{ text: "-", color: "gray", arrow: "" }}
          sparklineData={[]}
          onClick={() => updateParam("status", "active")}
        />
        <SparklineCard
          title="已暫停"
          value={channels.filter(c => c.status === "paused" || c.status === "inactive").length.toString()}
          change={{ text: "-", color: "gray", arrow: "" }}
          sparklineData={[]}
          onClick={() => updateParam("status", "paused")}
        />
        <SparklineCard
          title="已終止"
          value={channels.filter(c => c.status === "terminated").length.toString()}
          change={{ text: "-", color: "gray", arrow: "" }}
          sparklineData={[]}
          onClick={() => updateParam("status", "terminated")}
        />
        <SparklineCard
          title="本週新增"
          value={(statsData?.new_videos_this_week ?? channels.filter(c => c.created_at && (Date.now() - new Date(c.created_at).getTime() < 7 * 24 * 3600 * 1000)).length).toString()}
          change={{ text: "-", color: "gray", arrow: "" }}
          sparklineData={[]}
          onClick={() => updateParam("status", "")}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        <Input 
          data-testid="channel-search-input"
          placeholder="搜尋頻道..." 
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="w-full sm:w-[250px]"
        />

        <Select data-testid="channel-status-filter" value={statusParam || "all"} onValueChange={(v) => updateParam("status", v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="所有狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有狀態</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>

        <Select data-testid="channel-source-filter" value={sourceParam || "all"} onValueChange={(v) => updateParam("source", v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="所有來源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有來源</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="blocklist">Blocklist</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button data-testid="tags-filter" variant="outline" className="w-full sm:w-[150px] justify-between">
              {selectedTags.length > 0 ? `${selectedTags.length} 標籤` : "所有標籤"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="搜尋標籤..." />
              <CommandList>
                <CommandEmpty>找不到標籤</CommandEmpty>
                <CommandGroup>
                  {availableTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <CommandItem
                        key={tag}
                        value={tag}
                        onSelect={() => {
                          const newTags = isSelected
                            ? selectedTags.filter((t) => t !== tag)
                            : [...selectedTags, tag];
                          updateParam("tags", newTags.join(","));
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                        {tag}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Select data-testid="channel-sort-select" value={sortByParam || "default"} onValueChange={(v) => updateParam("sort_by", v === "default" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="預設排序" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">預設排序</SelectItem>
            <SelectItem value="subscriber_count">訂閱數</SelectItem>
            <SelectItem value="video_count">影片數</SelectItem>
            <SelectItem value="view_count">觀看數</SelectItem>
            <SelectItem value="updated_at">最後活動</SelectItem>
            <SelectItem value="created_at">加入時間</SelectItem>
          </SelectContent>
        </Select>

        <ToggleGroup 
          type="single" 
          value={viewMode} 
          onValueChange={(v) => v && setViewMode(v as "table" | "card")}
          data-testid="view-toggle"
          className="w-full sm:w-auto sm:ml-auto justify-start"
        >
          <ToggleGroupItem value="table" aria-label="表格視圖">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="card" aria-label="卡片視圖">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>

        {(searchParam || statusParam || sourceParam || tagsParam || sortByParam) && (
          <Button variant="ghost" onClick={() => { setLocalSearch(""); setSearchParams(new URLSearchParams()); }} className="w-full sm:w-auto px-2">
            清除篩選
          </Button>
        )}

      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      {viewMode === "table" && (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table data-testid="channel-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300" checked={channels.length > 0 && selectedIds.size === channels.length} onChange={toggleSelectAll} onClick={(e) => e.stopPropagation()} />
                </TableHead>
                <TableHead>頻道資訊</TableHead>
                <TableHead className="text-right">訂閱數</TableHead>
                <TableHead className="text-right">影片數據</TableHead>
                <TableHead className="w-[100px]">狀態</TableHead>
                <TableHead className="text-right">最後活動</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[150px]" />
                          <Skeleton className="h-3 w-[100px]" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[60px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <EmptyState 
                      message={(searchParam || statusParam || sourceParam || tagsParam) ? "找不到符合條件的頻道" : "尚無監控頻道，點擊「新增頻道」開始"} 
                      testId="empty-state-channels" 
                    />
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((channel: Channel) => (
                  <TableRow 
                    key={channel.id} 
                    data-testid={`channel-row-${channel.id}`}
                    className={cn("cursor-pointer hover:bg-muted/50", channel.status === "terminated" && "opacity-60")}
                    onClick={() => navigate(`/channels/${channel.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300" checked={selectedIds.has(channel.id)} onChange={() => toggleSelection(channel.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <img 
                          src={channel.thumbnail_url || 'https://placehold.co/48x48'} 
                          alt={channel.channel_name || ""} 
                          className="h-12 w-12 rounded-full object-cover bg-muted"
                        />
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                             <span className={cn("font-medium", channel.status === 'terminated' && "line-through")}>
                               {channel.channel_name || channel.youtube_channel_id}
                             </span>
                             {channel.custom_url && <span className="text-xs text-muted-foreground">{channel.custom_url}</span>}
                             <SourceBadge source={channel.source} className="h-5 text-[10px] px-1" />
                          </div>
                          {channel.tags && channel.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {channel.tags.slice(0, 3).map(tag => (
                                <Badge key={tag} variant="secondary" className="text-[10px] px-1 h-4 font-normal">{tag}</Badge>
                              ))}
                              {channel.tags.length > 3 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="text-[10px] px-1 h-4 font-normal cursor-default">
                                        +{channel.tags.length - 3}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {channel.tags.join(', ')}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <NumberFormatter value={channel.subscriber_count || 0} />
                        <span className="text-[10px] text-muted-foreground">-- (7d)</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center justify-end gap-1 text-sm">
                          <NumberFormatter value={channel.video_count || 0} />
                          <span className="text-[10px] text-muted-foreground">部</span>
                        </div>
                        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                          <NumberFormatter value={channel.total_view_count || 0} />
                          <span className="text-[10px]">觀看</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">-- (7d)</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={channel.status} />
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dotted border-muted-foreground/50 pb-0.5">
                              {formatRelativeTime(channel.updated_at || channel.created_at || "")}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {channel.updated_at ? new Date(channel.updated_at).toLocaleString() : (channel.created_at ? new Date(channel.created_at).toLocaleString() : '從未')}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid="channel-actions-dropdown">
                            <span className="sr-only">選單</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/channels/${channel.id}`)}>
                            查看詳情
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://youtube.com/channel/${channel.youtube_channel_id}`, "_blank")}>
                            YouTube 開啟
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            disabled={fetchingChannels.has(channel.id) || channel.status !== "active"} 
                            onClick={(e) => { e.stopPropagation(); handleFetchNow(channel.id); }}
                          >
                            {fetchingChannels.has(channel.id) ? "同步中..." : "立即爬取"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateStatus(channel.id, channel.status); }}>
                            {channel.status === "active" ? "暫停監控" : "恢復監控"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600 focus:text-red-600 focus:bg-red-50" 
                            onClick={(e) => { e.stopPropagation(); handleDelete(channel.id); }}
                          >
                            移除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {viewMode === "card" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col rounded-xl border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex gap-4">
                  <Skeleton className="h-16 w-16 rounded-sm" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-5 w-1/3 mt-2" />
                  </div>
                </div>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))
          ) : channels.length === 0 ? (
            <div className="col-span-full h-32 flex items-center justify-center border rounded-lg bg-card text-muted-foreground">
              <EmptyState 
                message={(searchParam || statusParam || sourceParam || tagsParam) ? "找不到符合條件的頻道" : "尚無監控頻道，點擊「新增頻道」開始"} 
                testId="empty-state-channels" 
              />
            </div>
          ) : (
            channels.map((channel: Channel) => (
              <div
                key={channel.id}
                data-testid="channel-card"
                className={cn("relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm cursor-pointer hover:border-primary/50 transition-colors", channel.status === "terminated" && "opacity-60", selectedIds.has(channel.id) && "border-primary ring-1 ring-primary")}
                onClick={() => navigate(`/channels/${channel.id}`)}
              >
                <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300" checked={selectedIds.has(channel.id)} onChange={() => toggleSelection(channel.id)} />
                </div>
                <div className="p-5 flex gap-4 items-start pb-4 border-b">
                  <img src={channel.thumbnail_url || 'https://placehold.co/64x64'} alt={channel.channel_name || ""} className="w-16 h-16 rounded-sm object-cover bg-muted flex-shrink-0 ml-6" />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                     <div className="flex items-center justify-between gap-2">
                        <span className={cn("font-semibold truncate", channel.status === 'terminated' && "line-through")} title={channel.channel_name || channel.youtube_channel_id}>{channel.channel_name || channel.youtube_channel_id}</span>
                     </div>
                     {channel.custom_url && <span className="text-xs text-muted-foreground truncate">{channel.custom_url}</span>}
                     <div className="flex flex-wrap gap-1 mt-1">
                       <StatusBadge status={channel.status} className="h-5 text-[10px] px-1" />
                       <SourceBadge source={channel.source} className="h-5 text-[10px] px-1" />
                     </div>
                  </div>
                </div>
                <div className="px-5 py-3 border-b min-h-[50px] flex items-center">
                  {channel.tags && channel.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {channel.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 h-4 font-normal">{tag}</Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">無標籤</span>
                  )}
                </div>
                <div className="grid grid-cols-3 divide-x border-b">
                  <div className="p-3 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">訂閱數</span>
                    <span className="font-semibold text-sm"><NumberFormatter value={channel.subscriber_count || 0} /></span>
                  </div>
                  <div className="p-3 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">影片數</span>
                    <span className="font-semibold text-sm"><NumberFormatter value={channel.video_count || 0} /></span>
                  </div>
                  <div className="p-3 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">觀看數</span>
                    <span className="font-semibold text-sm"><NumberFormatter value={channel.total_view_count || 0} /></span>
                  </div>
                </div>
                <div className="px-5 py-3 mt-auto flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-b-xl">
                  <span>最後活動: {formatRelativeTime(channel.updated_at || channel.created_at || "")}</span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                       <DropdownMenuTrigger asChild>
                         <Button variant="ghost" className="h-6 w-6 p-0" data-testid="channel-actions-dropdown">
                           <MoreHorizontal className="h-4 w-4" />
                         </Button>
                       </DropdownMenuTrigger>
                       <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/channels/${channel.id}`)}>
                            查看詳情
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://youtube.com/channel/${channel.youtube_channel_id}`, "_blank")}>
                            YouTube 開啟
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            disabled={fetchingChannels.has(channel.id) || channel.status !== "active"} 
                            onClick={(e) => { e.stopPropagation(); handleFetchNow(channel.id); }}
                          >
                            {fetchingChannels.has(channel.id) ? "同步中..." : "立即爬取"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateStatus(channel.id, channel.status); }}>
                            {channel.status === "active" ? "暫停監控" : "恢復監控"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600 focus:text-red-600 focus:bg-red-50" 
                            onClick={(e) => { e.stopPropagation(); handleDelete(channel.id); }}
                          >
                            移除
                          </DropdownMenuItem>
                       </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div data-testid="batch-bar" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 shadow-lg rounded-lg border bg-background px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <span className="font-medium whitespace-nowrap">✓ 已選取 {selectedIds.size} 個頻道</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBatchTagDialogOpen(true)}>
              <Tag className="w-4 h-4 mr-2" />
              加標籤
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBatchAction("pause")}>
              <Pause className="w-4 h-4 mr-2" />
              暫停監控
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBatchAction("delete")}>
              <Trash2 className="w-4 h-4 mr-2" />
              移除
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="w-4 h-4 mr-2" />
              取消
            </Button>
          </div>
        </div>
      )}

      <Dialog open={batchTagDialogOpen} onOpenChange={setBatchTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批次加標籤</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBatchTagSubmit} className="space-y-4 pt-4">
            <Label>標籤 (多個標籤請用逗號分隔)</Label>
            <Input value={batchTagsInput} onChange={e => setBatchTagsInput(e.target.value)} placeholder="例如: 政治, 新聞" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBatchTagDialogOpen(false)}>取消</Button>
              <Button type="submit">儲存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={batchAction !== null} onOpenChange={(open) => !open && setBatchAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{batchAction === "pause" ? "確認暫停監控？" : "確認移除頻道？"}</AlertDialogTitle>
            <AlertDialogDescription>
              你將對 {selectedIds.size} 個頻道執行此操作。{batchAction === "delete" && "此操作無法復原。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchActionConfirm} className={batchAction === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
              確認
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {totalCount > 0 && (
        <Pagination 
          page={pageParam} 
          limit={limit} 
          total={totalCount} 
          onPageChange={(p) => updateParam("page", p.toString())} 
        />
      )}
    </div>
  );
}
