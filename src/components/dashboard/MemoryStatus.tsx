'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, ChevronRight, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface MemoryStatusProps {
  companyId: string;
}

interface MemoryStats {
  total: number;
  lastUpdated: string | null;
}

export function MemoryStatus({ companyId }: MemoryStatusProps) {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();

        const [countResult, lastResult] = await Promise.all([
          supabase
            .from('company_memories')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('is_archived', false),
          supabase
            .from('company_memories')
            .select('updated_at')
            .eq('company_id', companyId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single(),
        ]);

        setStats({
          total: countResult.count ?? 0,
          lastUpdated: lastResult.data?.updated_at ?? null,
        });
      } catch (error) {
        console.error('Failed to load memory stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [companyId]);

  if (isLoading) {
    return (
      <div className="bg-black border border-white/6 rounded-xl p-4 animate-pulse">
        <div className="h-5 bg-white/5 rounded w-48" />
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return null; // Don't show if no memories yet
  }

  return (
    <Link
      href="/dashboard/memory"
      className="block bg-black border border-white/6 rounded-xl p-4 hover:border-white/10 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
            <Brain className="w-5 h-5 text-white/70" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white/90">Memory</span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 rounded text-xs text-white/50">
                <Sparkles className="w-3 h-3" />
                {stats.total} facts
              </span>
            </div>
            {stats.lastUpdated && (
              <p className="text-xs text-white/40 mt-0.5">
                Last learned: {formatRelativeTime(stats.lastUpdated)}
              </p>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/50 transition-colors" />
      </div>
    </Link>
  );
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
