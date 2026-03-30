import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DailyBarChart } from "@/components/DailyBarChart";
import {
  fetchQuotaDaily,
  fetchChannelsDailyAdditions,
  fetchVideosDailyNew,
  fetchFetchLogs,
  fetchVideos,
  fetchChannels,
} from "@/lib/api";

export default function MiscPage() {
  const [quotaDays, setQuotaDays] = useState(30);
  const [channelDays, setChannelDays] = useState(30);
  const [videoDays, setVideoDays] = useState(30);

  const { data: quotaData, isLoading: quotaLoading } = useQuery({
    queryKey: ['misc', 'quota-daily', quotaDays],
    queryFn: () => fetchQuotaDaily(quotaDays),
  });

  const { data: channelData, isLoading: channelLoading } = useQuery({
    queryKey: ['misc', 'channels-daily', channelDays],
    queryFn: () => fetchChannelsDailyAdditions(channelDays),
  });

  const { data: videoDailyData, isLoading: videoDailyLoading } = useQuery({
    queryKey: ['misc', 'videos-daily', videoDays],
    queryFn: () => fetchVideosDailyNew(videoDays),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['misc', 'crawl-errors'],
    queryFn: () => fetchFetchLogs({ status: 'failed', limit: 20 }),
  });

  const { data: removedVideosData, isLoading: removedVideosLoading } = useQuery({
    queryKey: ['misc', 'removed-videos'],
    queryFn: () => fetchVideos({ status: 'private', limit: 20, sort_by: 'updated_at' }),
  });

  const { data: removedChannelsData, isLoading: removedChannelsLoading } = useQuery({
    queryKey: ['misc', 'removed-channels'],
    queryFn: () => fetchChannels({ status: 'terminated', limit: 20, sort_by: 'updated_at' }),
  });

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-3xl font-bold tracking-tight">其他</h1>

      <section data-testid="section-quota-daily">
        <Card>
          <CardHeader><CardTitle>每天使用的額度數</CardTitle></CardHeader>
          <CardContent>
            <DailyBarChart
              data={quotaData?.items ?? []}
              days={quotaDays}
              onDaysChange={setQuotaDays}
              loading={quotaLoading}
              color="#f59e0b"
            />
          </CardContent>
        </Card>
      </section>

      <section data-testid="section-channels-daily">
        <Card>
          <CardHeader><CardTitle>每天手動新增的頻道數</CardTitle></CardHeader>
          <CardContent>
            <DailyBarChart
              data={channelData?.items ?? []}
              days={channelDays}
              onDaysChange={setChannelDays}
              loading={channelLoading}
              color="#10b981"
            />
          </CardContent>
        </Card>
      </section>

      <section data-testid="section-videos-daily">
        <Card>
          <CardHeader><CardTitle>每天新上傳的影片數</CardTitle></CardHeader>
          <CardContent>
            <DailyBarChart
              data={videoDailyData?.items ?? []}
              days={videoDays}
              onDaysChange={setVideoDays}
              loading={videoDailyLoading}
              color="#3b82f6"
            />
          </CardContent>
        </Card>
      </section>

      <section data-testid="section-crawl-errors">
        <Card>
          <CardHeader><CardTitle>最新的爬取錯誤</CardTitle></CardHeader>
          <CardContent>
            {logsLoading ? (
              <p className="text-muted-foreground text-sm">載入中...</p>
            ) : !logsData?.items?.length ? (
              <p className="text-muted-foreground text-sm">目前沒有爬取錯誤</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>工作名稱</TableHead>
                    <TableHead>時間</TableHead>
                    <TableHead>錯誤訊息</TableHead>
                    <TableHead>頻道 ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.items.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.job_name}</TableCell>
                      <TableCell>{log.started_at ? new Date(log.started_at).toLocaleString('zh-TW') : '—'}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{log.error_message ?? '—'}</TableCell>
                      <TableCell>{log.channel_id ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section data-testid="section-removed-videos">
        <Card>
          <CardHeader><CardTitle>最近下架的影片</CardTitle></CardHeader>
          <CardContent>
            {removedVideosLoading ? (
              <p className="text-muted-foreground text-sm">載入中...</p>
            ) : !removedVideosData?.items?.length ? (
              <p className="text-muted-foreground text-sm">目前沒有下架的影片</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>影片標題</TableHead>
                    <TableHead>YouTube ID</TableHead>
                    <TableHead>更新時間</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {removedVideosData.items.map((video) => (
                    <TableRow key={video.id}>
                      <TableCell className="max-w-[300px] truncate">{video.title ?? '—'}</TableCell>
                      <TableCell>
                        <a href={`https://www.youtube.com/watch?v=${video.youtube_video_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          {video.youtube_video_id}
                        </a>
                      </TableCell>
                      <TableCell>{video.updated_at ? new Date(video.updated_at).toLocaleString('zh-TW') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section data-testid="section-removed-channels">
        <Card>
          <CardHeader><CardTitle>最近下架的頻道</CardTitle></CardHeader>
          <CardContent>
            {removedChannelsLoading ? (
              <p className="text-muted-foreground text-sm">載入中...</p>
            ) : !removedChannelsData?.items?.length ? (
              <p className="text-muted-foreground text-sm">目前沒有下架的頻道</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>頻道名稱</TableHead>
                    <TableHead>YouTube ID</TableHead>
                    <TableHead>更新時間</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {removedChannelsData.items.map((channel) => (
                    <TableRow key={channel.id}>
                      <TableCell>{channel.channel_name ?? '—'}</TableCell>
                      <TableCell>
                        <a href={`https://www.youtube.com/channel/${channel.youtube_channel_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          {channel.youtube_channel_id}
                        </a>
                      </TableCell>
                      <TableCell>{channel.updated_at ? new Date(channel.updated_at).toLocaleString('zh-TW') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
