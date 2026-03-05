'use client';

import { useState } from 'react';
import { AlertTriangle, Bell, CheckCircle, X, ArrowRight, Clock } from 'lucide-react';
import { AGENTS } from '@/lib/types';
import type { AgentRole } from '@/lib/types';

export type PriorityLevel = 'critical' | 'high' | 'medium';

export interface PriorityItem {
  id: string;
  title: string;
  description: string;
  agentRole: AgentRole;
  priority: PriorityLevel;
  actionLabel?: string;
  actionUrl?: string;
  createdAt: string;
}

interface PriorityCardProps {
  item: PriorityItem;
  onDismiss: (id: string) => void;
  onAction?: (item: PriorityItem) => void;
}

function PriorityCard({ item, onDismiss, onAction }: PriorityCardProps) {
  const agentInfo = AGENTS.find(a => a.role === item.agentRole);

  const priorityConfig = {
    critical: {
      bg: 'bg-danger/10',
      border: 'border-danger/30',
      icon: AlertTriangle,
      iconColor: 'text-danger',
      badge: 'bg-danger text-white',
      badgeText: 'Urgent',
    },
    high: {
      bg: 'bg-warning/10',
      border: 'border-warning/30',
      icon: Bell,
      iconColor: 'text-warning',
      badge: 'bg-warning text-black',
      badgeText: 'Needs Attention',
    },
    medium: {
      bg: 'bg-white/[0.03]',
      border: 'border-white/10',
      icon: Clock,
      iconColor: 'text-white/60',
      badge: 'bg-white/10 text-white/70',
      badgeText: 'Review Soon',
    },
  };

  const config = priorityConfig[item.priority];
  const Icon = config.icon;

  return (
    <div
      className={`relative ${config.bg} border ${config.border} rounded-xl p-4 transition-all hover:shadow-lg`}
    >
      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(item.id)}
        className="absolute top-3 right-3 p-1 rounded-full hover:bg-secondary/50 transition text-muted-foreground hover:text-foreground"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${config.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${config.badge}`}>
              {config.badgeText}
            </span>
          </div>
          <h3 className="text-sm font-semibold">{item.title}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-3">{item.description}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{agentInfo?.icon}</span>
          <span className="text-xs text-muted-foreground">{agentInfo?.name}</span>
        </div>
        {item.actionLabel && (
          <button
            onClick={() => onAction?.(item)}
            className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white transition"
          >
            {item.actionLabel}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

interface PriorityCardsProps {
  items?: PriorityItem[];
  onAction?: (item: PriorityItem) => void;
}

export default function PriorityCards({ items, onAction }: PriorityCardsProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Default mock items if none provided
  const defaultItems: PriorityItem[] = [
    {
      id: '1',
      title: 'Review pricing strategy',
      description: 'Lens identified a competitor lowered prices by 20%. Consider adjusting our pricing model.',
      agentRole: 'data-analyst',
      priority: 'high',
      actionLabel: 'Review Analysis',
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      title: 'Approve content calendar',
      description: 'Echo has drafted the Q1 content calendar. Your approval is needed to start scheduling.',
      agentRole: 'marketing',
      priority: 'medium',
      actionLabel: 'Review Calendar',
      createdAt: new Date().toISOString(),
    },
  ];

  const displayItems = (items || defaultItems).filter(
    item => !dismissedIds.has(item.id)
  );

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  if (displayItems.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-4 h-4 text-success" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Needs Your Attention
          </h2>
        </div>
        <div className="text-center py-6 text-muted-foreground">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success/50" />
          <p className="text-sm">All clear! No items need your attention.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-warning" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Needs Your Attention
          </h2>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
          {displayItems.length} item{displayItems.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {displayItems.map(item => (
          <PriorityCard
            key={item.id}
            item={item}
            onDismiss={handleDismiss}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}
