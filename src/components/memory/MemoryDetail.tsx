'use client';

import type { CompanyMemory } from '@/lib/types';
import { Archive, TrendingUp, Clock, Eye, Sparkles, User, Bot, Layers, Pencil } from 'lucide-react';

interface MemoryDetailProps {
  memory: CompanyMemory;
  onArchive: () => void;
  onBoost: () => void;
  onEdit: () => void;
}

export function MemoryDetail({ memory, onArchive, onBoost, onEdit }: MemoryDetailProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <SourceIcon source={memory.source} />
          <h3 className="text-lg font-semibold text-white">{memory.topic}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="px-2 py-0.5 bg-white/5 rounded">{memory.domain.replace('_', ' ')}</span>
          <span>{memory.scope}</span>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white/3 rounded-lg p-4">
        <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
          {memory.content}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="Importance"
          value={`${(memory.importance * 100).toFixed(0)}%`}
          icon={<Sparkles className="w-4 h-4" />}
          dots={memory.importance}
        />
        <MetricCard
          label="Confidence"
          value={`${(memory.confidence * 100).toFixed(0)}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          dots={memory.confidence}
        />
        <MetricCard
          label="Times Accessed"
          value={memory.timesAccessed.toString()}
          icon={<Eye className="w-4 h-4" />}
        />
        <MetricCard
          label="Half Life"
          value={`${memory.halfLifeDays} days`}
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      {/* Metadata */}
      <div className="space-y-2 text-xs text-white/40">
        <div className="flex justify-between">
          <span>Source</span>
          <span className="text-white/60 capitalize">{memory.source}</span>
        </div>
        {memory.sourceAgent && (
          <div className="flex justify-between">
            <span>Source Agent</span>
            <span className="text-white/60 capitalize">{memory.sourceAgent}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Created</span>
          <span className="text-white/60">{formatDate(memory.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Last Updated</span>
          <span className="text-white/60">{formatDate(memory.updatedAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Last Accessed</span>
          <span className="text-white/60">{formatDate(memory.lastAccessedAt)}</span>
        </div>
        {memory.supersedes && (
          <div className="flex justify-between">
            <span>Supersedes</span>
            <span className="text-white/60 font-mono text-[10px]">{memory.supersedes.slice(0, 8)}...</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-white/6">
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/70 hover:text-white transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={onBoost}
          disabled={memory.importance >= 1}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/70 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <TrendingUp className="w-4 h-4" />
          Boost
        </button>
        <button
          onClick={onArchive}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-sm text-red-400 transition-colors"
        >
          <Archive className="w-4 h-4" />
          Archive
        </button>
      </div>
    </div>
  );
}

function SourceIcon({ source }: { source: string }) {
  const icons: Record<string, React.ReactNode> = {
    onboarding: <Layers className="w-5 h-5 text-blue-400" />,
    agent: <Bot className="w-5 h-5 text-purple-400" />,
    user: <User className="w-5 h-5 text-green-400" />,
    consolidation: <Sparkles className="w-5 h-5 text-amber-400" />,
  };

  return (
    <div className="p-1.5 bg-white/5 rounded-lg">
      {icons[source] || <Sparkles className="w-5 h-5 text-white/40" />}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  dots?: number;
}

function MetricCard({ label, value, icon, dots }: MetricCardProps) {
  return (
    <div className="bg-white/3 rounded-lg p-3">
      <div className="flex items-center gap-2 text-white/40 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold text-white">{value}</span>
        {dots !== undefined && (
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i <= Math.round(dots * 5) ? 'bg-white' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffHours < 24) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
