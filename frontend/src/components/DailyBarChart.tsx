import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DailyStatPoint } from "@/types/index";

interface DailyBarChartProps {
  data: DailyStatPoint[];
  days: number;
  onDaysChange: (days: number) => void;
  color?: string;
  yAxisLabel?: string;
  loading?: boolean;
}

export function DailyBarChart({
  data,
  days,
  onDaysChange,
  color = "#3b82f6",
  yAxisLabel,
  loading = false
}: DailyBarChartProps) {
  return (
    <div className="w-full space-y-4" data-testid="daily-bar-chart">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground min-h-[20px]">
          {yAxisLabel}
        </div>
        <ToggleGroup
          type="single"
          value={String(days)}
          onValueChange={(val) => {
            if (val) onDaysChange(Number(val));
          }}
          data-testid="days-selector"
        >
          <ToggleGroupItem value="7" aria-label="7 days">7</ToggleGroupItem>
          <ToggleGroupItem value="14" aria-label="14 days">14</ToggleGroupItem>
          <ToggleGroupItem value="30" aria-label="30 days">30</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="h-[200px] w-full">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">載入中...</div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">尚無數據</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} />
              <YAxis allowDecimals={false} label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} />
              <Tooltip />
              <Bar dataKey="value" fill={color} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
