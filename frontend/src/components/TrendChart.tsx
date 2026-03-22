import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { parseISO, subDays, isAfter } from 'date-fns';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  valueFormatter?: (value: number) => string;
}

export interface TrendChartProps {
  data: Array<{ date: string; value: number }>;
  anomalies?: Array<{ date: string; summary: string }>;
  timeRange: '7D' | '30D' | '90D' | 'ALL';
  onTimeRangeChange: (range: string) => void;
  chartType?: 'area' | 'bar';
  color?: string;
  yAxisLabel?: string;
  valueFormatter?: (value: number) => string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  valueFormatter,
}: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const val = payload[0].value as number;
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <p className="text-sm font-medium mb-1">{label}</p>
        <p className="text-sm text-muted-foreground">
          {valueFormatter ? valueFormatter(val) : val}
        </p>
      </div>
    );
  }
  return null;
};

export function TrendChart({
  data,
  anomalies = [],
  timeRange,
  onTimeRangeChange,
  chartType = 'area',
  color = '#3b82f6',
  yAxisLabel,
  valueFormatter,
}: TrendChartProps) {
  const filteredData = useMemo(() => {
    if (!data || data.length === 0 || timeRange === 'ALL') {
      return data;
    }

    const maxDateString = data.reduce(
      (max, d) => (d.date > max ? d.date : max),
      data[0].date
    );
    const maxDate = parseISO(maxDateString);

    let daysToSubtract = 0;
    if (timeRange === '7D') daysToSubtract = 7;
    else if (timeRange === '30D') daysToSubtract = 30;
    else if (timeRange === '90D') daysToSubtract = 90;

    const thresholdDate = subDays(maxDate, daysToSubtract);

    return data.filter((d) => isAfter(parseISO(d.date), thresholdDate));
  }, [data, timeRange]);

  const activeAnomalies = useMemo(() => {
    if (!anomalies || anomalies.length === 0) return [];
    return anomalies.filter((a) =>
      filteredData.some((d) => d.date === a.date)
    );
  }, [anomalies, filteredData]);

  const renderChartBody = () => (
    <>
      <defs>
        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
      <XAxis
        dataKey="date"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={32}
        style={{ fontSize: '12px', fill: 'hsl(var(--muted-foreground))' }}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        tickFormatter={valueFormatter}
        width={60}
        style={{ fontSize: '12px', fill: 'hsl(var(--muted-foreground))' }}
      />
      <Tooltip
        content={<CustomTooltip valueFormatter={valueFormatter} />}
        cursor={{ fill: 'hsl(var(--muted)/0.5)', stroke: 'hsl(var(--muted-foreground)/0.5)', strokeWidth: 1, strokeDasharray: '3 3' }}
      />
      
      {chartType === 'bar' ? (
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      ) : (
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          fillOpacity={1}
          fill="url(#colorValue)"
          strokeWidth={2}
        />
      )}

      {activeAnomalies.map((a) => {
        const dataPoint = filteredData.find((d) => d.date === a.date);
        if (!dataPoint) return null;
        return (
          <ReferenceDot
            key={a.date}
            x={a.date}
            y={dataPoint.value}
            r={4}
            fill="red"
            stroke="white"
            strokeWidth={2}
            label={{
              position: 'top',
              value: '!',
              fill: 'red',
              fontSize: 14,
              fontWeight: 'bold',
            }}
          />
        );
      })}
    </>
  );

  return (
    <div className="w-full space-y-4" data-testid="trend-chart">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground min-h-[20px]">
          {yAxisLabel}
        </div>
        <ToggleGroup
          type="single"
          value={timeRange}
          onValueChange={(val) => {
            if (val) onTimeRangeChange(val);
          }}
          data-testid="time-range-selector"
        >
          <ToggleGroupItem value="7D" aria-label="7 days">7D</ToggleGroupItem>
          <ToggleGroupItem value="30D" aria-label="30 days">30D</ToggleGroupItem>
          <ToggleGroupItem value="90D" aria-label="90 days">90D</ToggleGroupItem>
          <ToggleGroupItem value="ALL" aria-label="All time">ALL</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="h-[200px] w-full">
        {(!filteredData || filteredData.length === 0) ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            尚無趨勢數據，等待明日第一次快照
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={filteredData}>
                {renderChartBody()}
              </BarChart>
            ) : (
              <AreaChart data={filteredData}>
                {renderChartBody()}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
