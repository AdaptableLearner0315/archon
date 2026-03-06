'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Building2, Users, Target, AlertCircle } from 'lucide-react';

export interface MemoryInsight {
  id: string;
  category: 'business' | 'market' | 'stage' | 'audience' | 'pain';
  label: string;
  value: string;
}

interface MemoryBubblesProps {
  insights: MemoryInsight[];
  className?: string;
}

const CATEGORY_CONFIG: Record<
  MemoryInsight['category'],
  { icon: typeof Brain; color: string; bg: string }
> = {
  business: {
    icon: Building2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  market: {
    icon: Target,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  stage: {
    icon: Target,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
  },
  audience: {
    icon: Users,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  pain: {
    icon: AlertCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
};

export function MemoryBubbles({ insights, className = '' }: MemoryBubblesProps) {
  if (insights.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Brain className="w-3.5 h-3.5" />
        <span>Atlas is learning...</span>
      </div>
      <AnimatePresence mode="popLayout">
        {insights.map((insight, index) => (
          <MemoryBubble key={insight.id} insight={insight} delay={index * 0.1} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function MemoryBubble({ insight, delay }: { insight: MemoryInsight; delay: number }) {
  const config = CATEGORY_CONFIG[insight.category];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 10, scale: 0.95 }}
      transition={{ delay, duration: 0.3, ease: 'easeOut' }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.bg}`}
    >
      <Icon className={`w-3.5 h-3.5 ${config.color} flex-shrink-0`} />
      <div className="min-w-0 flex-1">
        <span className="text-xs text-white/50">{insight.label}:</span>
        <span className="text-xs text-white ml-1 truncate">{insight.value}</span>
      </div>
    </motion.div>
  );
}

// Compact version for inline display
export function MemoryChips({ insights }: { insights: MemoryInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      <AnimatePresence>
        {insights.map((insight, index) => {
          const config = CATEGORY_CONFIG[insight.category];
          const Icon = config.icon;

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: index * 0.05, duration: 0.2 }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs ${config.bg}`}
            >
              <Icon className={`w-3 h-3 ${config.color}`} />
              <span className="text-white/70">{insight.value}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
