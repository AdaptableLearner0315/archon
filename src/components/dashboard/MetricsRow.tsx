'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
}

function Sparkline({ data, color, height = 24 }: SparklineProps) {
  const points = useMemo(() => {
    if (data.length === 0) return '';
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const width = 60;
    const stepX = width / (data.length - 1 || 1);

    return data
      .map((value, i) => {
        const x = i * stepX;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, height]);

  return (
    <svg width="60" height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  target?: string;
  sparklineData?: number[];
}

function MetricCard({ label, value, change, trend, target, sparklineData }: MetricCardProps) {
  const trendColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--muted-foreground)';

  // Generate mock sparkline data if not provided
  const data = useMemo(() => {
    if (sparklineData) return sparklineData;
    return Array.from({ length: 7 }, () => Math.random() * 100);
  }, [sparklineData]);

  return (
    <div className="flex-1 min-w-[140px] bg-card border border-border rounded-xl p-4 hover:border-white/10 transition group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-1 truncate">{label}</p>
          <p className="text-xl font-bold tracking-tight truncate">{value}</p>
          {target && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">Goal: {target}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Sparkline data={data} color={trendColor} />
          <div className="flex items-center gap-1">
            {trend === 'up' ? (
              <TrendingUp className="w-3 h-3 text-success" />
            ) : trend === 'down' ? (
              <TrendingDown className="w-3 h-3 text-danger" />
            ) : (
              <Minus className="w-3 h-3 text-muted-foreground" />
            )}
            <span
              className={`text-xs font-medium ${
                trend === 'up'
                  ? 'text-success'
                  : trend === 'down'
                  ? 'text-danger'
                  : 'text-muted-foreground'
              }`}
            >
              {change > 0 ? '+' : ''}{change}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricsRowProps {
  additionalMetrics?: {
    label: string;
    value: string;
    change: number;
    trend: 'up' | 'down' | 'neutral';
    target?: string;
  }[];
}

export default function MetricsRow({ additionalMetrics }: MetricsRowProps) {
  const { metrics } = useAppStore();

  const displayMetrics = additionalMetrics || metrics.map(m => ({
    ...m,
    target: undefined,
  }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
      {displayMetrics.map((metric) => (
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          change={metric.change}
          trend={metric.trend}
          target={metric.target}
        />
      ))}
    </div>
  );
}
