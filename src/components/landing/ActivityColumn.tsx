'use client';

import { useEffect, useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import ActivityItem, { type ActivityItemData } from './ActivityItem';

export type CategoryType = 'engineering' | 'marketing' | 'sales' | 'operations';

export interface ActivityColumnProps {
  category: CategoryType;
  title: string;
  subtitle?: string;
  items: ActivityItemData[];
  maxVisible?: number;
  className?: string;
}

const categoryColors: Record<CategoryType, string> = {
  engineering: 'text-blue-400',
  marketing: 'text-pink-400',
  sales: 'text-green-400',
  operations: 'text-amber-400',
};

/**
 * ActivityColumn - Single category column with header and scrollable item list.
 * Terminal-like aesthetic with category-specific header colors.
 */
export default function ActivityColumn({
  category,
  title,
  subtitle,
  items,
  maxVisible = 4,
  className = '',
}: ActivityColumnProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const prevItemsRef = useRef<string[]>([]);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Track new items for highlight animation
  useEffect(() => {
    const currentIds = items.map((item) => item.id);
    const prevIds = new Set(prevItemsRef.current);
    const newIds = currentIds.filter((id) => !prevIds.has(id));

    if (newIds.length > 0) {
      setNewItemIds(new Set(newIds));
      // Clear new item markers after animation
      const timer = setTimeout(() => setNewItemIds(new Set()), 2500);
      return () => clearTimeout(timer);
    }

    prevItemsRef.current = currentIds;
  }, [items]);

  const visibleItems = items.slice(0, maxVisible);

  return (
    <div
      className={`
        flex flex-col min-w-[200px] max-w-[280px] w-full
        bg-white/[0.02] border border-white/[0.06] rounded-lg
        overflow-hidden
        ${className}
      `}
    >
      {/* Column Header */}
      <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider ${categoryColors[category]}`}>
            {title}
          </span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
        </div>
        {subtitle && (
          <span className="text-[10px] text-white/30 font-mono">{subtitle}</span>
        )}
      </div>

      {/* Items List */}
      <div
        className="flex flex-col gap-0.5 p-1 overflow-y-auto scrollbar-thin"
        style={{ maxHeight: '200px' }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleItems.map((item) => (
            <ActivityItem
              key={item.id}
              item={item}
              isNew={newItemIds.has(item.id)}
              prefersReducedMotion={prefersReducedMotion}
            />
          ))}
        </AnimatePresence>

        {visibleItems.length === 0 && (
          <div className="text-xs text-white/20 font-mono px-2 py-4 text-center">
            No activity yet
          </div>
        )}
      </div>
    </div>
  );
}
