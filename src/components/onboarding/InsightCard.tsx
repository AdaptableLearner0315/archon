'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Users, Target, Lightbulb, ExternalLink } from 'lucide-react';

export interface MarketInsight {
  marketSize?: string;
  growthRate?: string;
  competitors?: { name: string; strength: string }[];
  gap?: string;
  acquisitionChannel?: string;
}

interface InsightCardProps {
  insight: MarketInsight;
  delay?: number;
}

export function InsightCard({ insight, delay = 0 }: InsightCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      className="mt-4 bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 border border-emerald-500/20 rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <span className="text-xs font-medium text-emerald-400 tracking-wide uppercase">
          Market Intel
        </span>
      </div>

      <div className="grid gap-3">
        {insight.marketSize && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: delay + 0.1 }}
            className="flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-white/50" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-0.5">Market Size</p>
              <p className="text-sm text-white/80 font-medium">
                {insight.marketSize}
                {insight.growthRate && (
                  <span className="ml-2 text-emerald-400 text-xs">
                    {insight.growthRate} YoY
                  </span>
                )}
              </p>
            </div>
          </motion.div>
        )}

        {insight.competitors && insight.competitors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: delay + 0.2 }}
            className="flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/40 mb-1.5">Top Competitors</p>
              <div className="flex flex-wrap gap-1.5">
                {insight.competitors.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/[0.04] rounded text-xs text-white/60"
                  >
                    {c.name}
                    <span className="text-white/30">({c.strength})</span>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {insight.gap && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: delay + 0.3 }}
            className="flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 text-white/50" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-0.5">Market Gap</p>
              <p className="text-sm text-white/80">{insight.gap}</p>
            </div>
          </motion.div>
        )}

        {insight.acquisitionChannel && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: delay + 0.4 }}
            className="flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <ExternalLink className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-0.5">Best Acquisition Channel</p>
              <p className="text-sm text-emerald-400 font-medium">{insight.acquisitionChannel}</p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
