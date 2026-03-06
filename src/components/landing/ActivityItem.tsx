'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export interface ActivityItemData {
  id: string;
  agent: string;
  company: string;
  action: string;
  timestamp: Date;
  isNew?: boolean;
}

export interface ActivityItemProps {
  item: ActivityItemData;
  isNew?: boolean;
  prefersReducedMotion?: boolean;
}

/**
 * Format timestamp as relative time (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * ActivityItem - Individual activity entry in terminal-like monospace style.
 * Format: ▸ Agent → Company | Action | Xm ago
 * Features purple highlight animation for new items.
 */
export default function ActivityItem({
  item,
  isNew = false,
  prefersReducedMotion = false,
}: ActivityItemProps) {
  const [showHighlight, setShowHighlight] = useState(isNew);
  const [relativeTime, setRelativeTime] = useState('--');

  // Remove highlight after animation completes
  useEffect(() => {
    if (isNew && !prefersReducedMotion) {
      const timer = setTimeout(() => setShowHighlight(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isNew, prefersReducedMotion]);

  // Calculate relative time on client only to avoid hydration mismatch
  useEffect(() => {
    setRelativeTime(formatRelativeTime(item.timestamp));
    // Update every minute to keep time fresh
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(item.timestamp));
    }, 60000);
    return () => clearInterval(interval);
  }, [item.timestamp]);

  const transitionDuration = prefersReducedMotion ? 0 : 0.4;

  return (
    <motion.div
      initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: prefersReducedMotion ? 0 : 10 }}
      transition={{
        duration: transitionDuration,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={`
        flex flex-col gap-0.5 px-2 py-1.5 rounded-md
        font-mono text-xs
        transition-shadow duration-500
        ${showHighlight && !prefersReducedMotion ? 'activity-highlight' : ''}
      `}
    >
      {/* Top line: Agent → Company */}
      <div className="flex items-center gap-1 truncate">
        <span className="text-primary">▸</span>
        <span className="text-white/90 font-medium">{item.agent}</span>
        <span className="text-white/30">→</span>
        <span className="text-white/60 truncate">{item.company}</span>
      </div>

      {/* Bottom line: Action | Time */}
      <div className="flex items-center justify-between gap-2 pl-3">
        <span className="text-white/40 truncate">{item.action}</span>
        <span className="text-white/25 flex-shrink-0" suppressHydrationWarning>
          {relativeTime}
        </span>
      </div>
    </motion.div>
  );
}
