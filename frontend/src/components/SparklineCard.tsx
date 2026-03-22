import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SparklineCardProps {
  title: string;
  value: string | number;
  change: { text: string; color: 'green' | 'red' | 'gray'; arrow: string };
  subtitle?: string;
  sparklineData?: number[];
  icon?: React.ReactNode;
  onClick?: () => void;
}

export function SparklineCard({
  title,
  value,
  change,
  subtitle,
  sparklineData,
  icon,
  onClick,
}: SparklineCardProps) {
  const colorMap = {
    green: 'text-green-600',
    red: 'text-red-600',
    gray: 'text-gray-400',
  };

  const changeColor = colorMap[change.color];

  return (
    <Card 
      data-testid="sparkline-card" 
      onClick={onClick}
      className={onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-sm ${changeColor} mt-1 flex items-center gap-1`}>
          <span>{change.arrow}</span>
          <span>{change.text}</span>
          {subtitle && <span className="text-muted-foreground ml-1">{subtitle}</span>}
        </p>

        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-4 h-6 w-full">
            <ResponsiveContainer width="100%" height={24}>
              <AreaChart 
                data={sparklineData.map((v, i) => ({ i, v }))} 
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id={`grad-${title.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="v" 
                  stroke="#3b82f6" 
                  fill={`url(#grad-${title.replace(/\s+/g, '-')})`} 
                  dot={false} 
                  strokeWidth={1} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
