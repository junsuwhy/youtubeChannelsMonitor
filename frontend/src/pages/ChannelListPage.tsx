import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { fetchChannels, createChannel, fetchChannelNow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { NumberFormatter } from "@/components/NumberFormatter";

export default function ChannelListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelTitle, setNewChannelTitle] = useState("");
  const [formError, setFormError] = useState("");
  const [fetchingChannels, setFetchingChannels] = useState<Set<number>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['channels', statusFilter],
    queryFn: () => fetchChannels({ status: statusFilter || undefined, page: 1, limit: 50 }),
    gcTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setDialogOpen(false);
      setNewChannelId("");
      setNewChannelTitle("");
      setFormError("");
    },
    onError: (err: any) => {
      if (err.response?.status === 409) {
        setFormError("此頻道已在監控清單中");
      } else {
        setFormError(err.response?.data?.detail || err.message || "新增失敗");
      }
    }
  });

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

  const channels = data?.items || data || [];

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-600 hover:bg-green-700">active</Badge>;
      case "terminated":
        return <Badge variant="destructive">terminated</Badge>;
      case "inactive":
      case "paused":
        return <Badge variant="secondary">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleFetchNow = async (e: React.MouseEvent, channelId: number) => {
    e.stopPropagation(); // prevent row navigation
    setFetchingChannels(prev => new Set(prev).add(channelId));
    try {
      await fetchChannelNow(channelId);
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: string } }; message?: string };
      console.error("Fetch now failed for channel", channelId, anyErr?.response?.data?.detail || anyErr.message);
    } finally {
      setFetchingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">頻道列表</h1>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <select
            className="flex h-9 w-full sm:w-[150px] items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">所有狀態</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="paused">Paused</option>
            <option value="terminated">Terminated</option>
          </select>

          <Button variant="outline" asChild>
            <Link to="/channels/import">批次匯入</Link>
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setNewChannelId("");
              setNewChannelTitle("");
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
                  <Label htmlFor="youtube_channel_id">YouTube Channel ID <span className="text-red-500">*</span></Label>
                  <Input
                    id="youtube_channel_id"
                    placeholder="UC..."
                    value={newChannelId}
                    onChange={(e) => setNewChannelId(e.target.value)}
                    disabled={mutation.isPending}
                  />
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
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "新增中..." : "確認新增"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && <ErrorBanner message={error instanceof Error ? error.message : "載入失敗"} />}

      <div className="rounded-md border">
        <Table data-testid="channel-list">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">縮圖</TableHead>
              <TableHead>頻道名稱</TableHead>
              <TableHead className="text-right">訂閱數</TableHead>
              <TableHead className="text-right">影片數</TableHead>
              <TableHead className="w-[100px]">狀態</TableHead>
              <TableHead className="text-right">最後更新</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-10 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px] ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-[80px]" /></TableCell>
                </TableRow>
              ))
            ) : channels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <EmptyState message="找不到頻道" />
                </TableCell>
              </TableRow>
            ) : (
              channels.map((channel: any) => (
                <TableRow 
                  key={channel.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/channels/${channel.id}`)}
                >
                  <TableCell>
                    <img 
                      src={channel.thumbnail_url || 'https://placehold.co/40x40'} 
                      alt={channel.channel_name} 
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {channel.channel_name || channel.youtube_channel_id}
                  </TableCell>
                  <TableCell className="text-right">
                    <NumberFormatter value={channel.subscriber_count || 0} />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumberFormatter value={channel.video_count || 0} />
                  </TableCell>
                  <TableCell>
                    {renderStatusBadge(channel.status)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {channel.last_fetched_at 
                      ? new Date(channel.last_fetched_at).toLocaleDateString() 
                      : '從未'}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {channel.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="fetch-now-btn"
                        disabled={fetchingChannels.has(channel.id)}
                        onClick={(e) => handleFetchNow(e, channel.id)}
                      >
                        {fetchingChannels.has(channel.id) ? "同步中..." : "立即同步"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}