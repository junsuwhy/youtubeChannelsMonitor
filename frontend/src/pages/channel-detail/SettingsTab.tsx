import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChannel, useUpdateChannel } from "@/hooks/useChannels";
import { deleteChannel } from "@/lib/api";
import { X, HelpCircle } from "lucide-react";

interface SettingsTabProps {
  channelId: number;
}

export function SettingsTab({ channelId }: SettingsTabProps) {
  const navigate = useNavigate();
  const { data: channel } = useChannel(channelId);
  const updateChannelMutation = useUpdateChannel();
  
  const [newTag, setNewTag] = useState("");
  const [localNotes, setLocalNotes] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  if (!channel) return null;

  const handleToggleStatus = (checked: boolean) => {
    updateChannelMutation.mutate({
      id: channelId,
      data: { status: checked ? 'active' : 'paused' }
    });
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      const currentTags = channel.tags || [];
      if (!currentTags.includes(newTag.trim())) {
        updateChannelMutation.mutate({
          id: channelId,
          data: { tags: [...currentTags, newTag.trim()] }
        });
      }
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = channel.tags || [];
    updateChannelMutation.mutate({
      id: channelId,
      data: { tags: currentTags.filter(t => t !== tagToRemove) }
    });
  };

  const handleSaveNotes = () => {
    // Notes field is not yet supported by the backend
    alert("功能即將推出");
  };

  const handleDeleteChannel = async () => {
    try {
      setIsDeleting(true);
      await deleteChannel(channelId);
      navigate("/channels");
    } catch (error) {
      console.error("Failed to delete channel", error);
      setIsDeleting(false);
      alert("移除頻道失敗");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="channel-settings-tab">
      <Card>
        <CardHeader>
          <CardTitle>監控設定</CardTitle>
          <CardDescription>設定此頻道的資料更新頻率與監控狀態。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="monitoring-status">監控狀態</Label>
              <div className="text-sm text-muted-foreground">
                暫停後，系統將不再排程更新此頻道的資料，但歷史資料會保留。
              </div>
            </div>
            <Switch 
              id="monitoring-status" 
              checked={channel.status === 'active'}
              onCheckedChange={handleToggleStatus}
              data-testid="settings-status-switch"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="crawl-frequency">爬取頻率</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>即將推出</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select disabled defaultValue="daily">
              <SelectTrigger id="crawl-frequency" className="w-[200px]">
                <SelectValue placeholder="選擇頻率" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6h">每 6 小時</SelectItem>
                <SelectItem value="daily">每日</SelectItem>
                <SelectItem value="weekly">每週</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">目前所有頻道預設為每日爬取。</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>元資料管理</CardTitle>
          <CardDescription>管理頻道標籤與內部備註。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>標籤</Label>
            <div className="flex flex-wrap gap-2 mb-2 p-3 min-h-[50px] border rounded-md bg-muted/30">
              {channel.tags && channel.tags.length > 0 ? (
                channel.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="pr-1 gap-1">
                    {tag}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 rounded-full hover:bg-muted"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">移除 {tag}</span>
                    </Button>
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">尚未新增標籤</span>
              )}
            </div>
            <Input 
              placeholder="輸入標籤名稱後按 Enter 新增..." 
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={handleAddTag}
              className="max-w-[300px]"
              data-testid="settings-tags-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-notes">備註</Label>
            <Textarea 
              id="channel-notes"
              placeholder="輸入頻道相關備註、調查紀錄或值得注意的事項..." 
              className="min-h-[100px]"
              value={localNotes}
              onChange={e => setLocalNotes(e.target.value)}
              data-testid="settings-notes-textarea"
            />
            <div className="flex justify-end pt-2">
              <Button 
                onClick={handleSaveNotes} 
                data-testid="settings-save-notes"
              >
                儲存備註
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">危險區域</CardTitle>
          <CardDescription>這些操作具有破壞性且無法復原。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-medium text-sm">移除此頻道</p>
              <p className="text-sm text-muted-foreground">
                這將會永久刪除此頻道的所有資料，包括影片、快照、與異常紀錄。
              </p>
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="settings-delete-channel">
                  移除此頻道
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確定要移除此頻道嗎？</AlertDialogTitle>
                  <AlertDialogDescription>
                    這項操作無法復原。這將會永久刪除「{channel.channel_name || channel.youtube_channel_id}」
                    的所有資料，包括其下的所有影片記錄、快照歷史與相關活動紀錄。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteChannel}
                    disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  >
                    {isDeleting ? "移除中..." : "確定移除"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
