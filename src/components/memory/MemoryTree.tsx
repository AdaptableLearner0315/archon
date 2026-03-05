'use client';

import type { CompanyMemory } from '@/lib/types';
import { ChevronRight, Circle } from 'lucide-react';

interface MemoryTreeProps {
  memories: CompanyMemory[];
  selectedId?: string;
  onSelect: (memory: CompanyMemory) => void;
}

export function MemoryTree({ memories, selectedId, onSelect }: MemoryTreeProps) {
  if (memories.length === 0) {
    return (
      <div className="text-center py-8 text-white/40 text-sm">
        No memories in this domain yet
      </div>
    );
  }

  // Group by scope prefix for hierarchical display
  const grouped = groupByScope(memories);

  return (
    <div className="space-y-1 max-h-[500px] overflow-y-auto pr-2">
      {Object.entries(grouped).map(([scopePrefix, items]) => (
        <div key={scopePrefix} className="space-y-1">
          {/* Scope header if there's a common prefix */}
          {scopePrefix !== 'root' && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-white/30 uppercase tracking-wider">
              <ChevronRight className="w-3 h-3" />
              {formatScope(scopePrefix)}
            </div>
          )}

          {/* Memory items */}
          {items.map((memory) => (
            <MemoryItem
              key={memory.id}
              memory={memory}
              isSelected={memory.id === selectedId}
              onClick={() => onSelect(memory)}
              indent={scopePrefix !== 'root'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface MemoryItemProps {
  memory: CompanyMemory;
  isSelected: boolean;
  onClick: () => void;
  indent: boolean;
}

function MemoryItem({ memory, isSelected, onClick, indent }: MemoryItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
        isSelected
          ? 'bg-white/10 border border-white/20'
          : 'hover:bg-white/5 border border-transparent'
      } ${indent ? 'ml-4' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/90 truncate">
              {memory.topic}
            </span>
            <SourceBadge source={memory.source} />
          </div>
          <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
            {memory.content}
          </p>
        </div>

        {/* Importance indicator */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <ImportanceDots importance={memory.importance} />
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
        <span>Accessed {memory.timesAccessed}x</span>
        <span>{formatRelativeTime(memory.lastAccessedAt)}</span>
      </div>
    </button>
  );
}

function ImportanceDots({ importance }: { importance: number }) {
  const filled = Math.round(importance * 5);
  return (
    <div className="flex items-center gap-0.5" title={`Importance: ${(importance * 100).toFixed(0)}%`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Circle
          key={i}
          className={`w-1.5 h-1.5 ${
            i <= filled ? 'fill-white text-white' : 'text-white/20'
          }`}
        />
      ))}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    onboarding: 'bg-blue-500/20 text-blue-400',
    agent: 'bg-purple-500/20 text-purple-400',
    user: 'bg-green-500/20 text-green-400',
    consolidation: 'bg-amber-500/20 text-amber-400',
  };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
        colors[source] || 'bg-white/10 text-white/50'
      }`}
    >
      {source}
    </span>
  );
}

function groupByScope(memories: CompanyMemory[]): Record<string, CompanyMemory[]> {
  const groups: Record<string, CompanyMemory[]> = {};

  for (const memory of memories) {
    // Extract the second-level scope (e.g., /business/features -> features)
    const parts = memory.scope.split('/').filter(Boolean);
    const prefix = parts.length > 1 ? parts[1] : 'root';

    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(memory);
  }

  return groups;
}

function formatScope(scope: string): string {
  return scope.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
