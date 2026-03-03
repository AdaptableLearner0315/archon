'use client';

import { useAppStore } from '@/lib/store';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KPICards() {
  const { metrics } = useAppStore();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition"
        >
          <p className="text-sm text-muted-foreground mb-1">{metric.label}</p>
          <p className="text-3xl font-bold tracking-tight">{metric.value}</p>
          <div className="flex items-center gap-1 mt-2">
            {metric.trend === 'up' ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : metric.trend === 'down' ? (
              <TrendingDown className="w-4 h-4 text-danger" />
            ) : (
              <Minus className="w-4 h-4 text-muted-foreground" />
            )}
            <span
              className={`text-sm font-medium ${
                metric.trend === 'up'
                  ? 'text-success'
                  : metric.trend === 'down'
                  ? 'text-danger'
                  : 'text-muted-foreground'
              }`}
            >
              {metric.change > 0 ? '+' : ''}
              {metric.change}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
