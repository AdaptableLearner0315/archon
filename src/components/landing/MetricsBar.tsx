'use client';

import MetricCard from './MetricCard';

export interface MetricData {
  label: string;
  value: string | number;
  change?: number;
}

export interface MetricsBarProps {
  metrics: MetricData[];
  className?: string;
}

/**
 * MetricsBar - Horizontal metrics strip with 4 cards showing value + change indicator.
 * Responsive: 4-column on desktop, 2x2 grid on mobile.
 */
export default function MetricsBar({ metrics, className = '' }: MetricsBarProps) {
  return (
    <div
      className={`
        grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3
        w-full max-w-4xl mx-auto
        ${className}
      `}
    >
      {metrics.map((metric, index) => (
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          change={metric.change}
        />
      ))}
    </div>
  );
}
