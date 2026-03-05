'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type TickerItem } from './ActivityTicker';

export interface ActivityStackProps {
  items: TickerItem[];
  maxVisible?: number; // Number of items to show, default 5
  interval?: number; // ms between new items, default 2500
  className?: string;
}

interface StackItem extends TickerItem {
  id: number;
}

export default function ActivityStack({
  items,
  maxVisible = 5,
  interval = 2500,
  className = '',
}: ActivityStackProps) {
  const [visibleItems, setVisibleItems] = useState<StackItem[]>([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const currentIndexRef = useRef(0);
  const idCounterRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Initialize with first set of items
  useEffect(() => {
    if (items.length === 0) return;

    const initialItems: StackItem[] = [];
    const count = Math.min(maxVisible, items.length);

    for (let i = 0; i < count; i++) {
      initialItems.push({
        ...items[i],
        id: idCounterRef.current++,
      });
    }

    setVisibleItems(initialItems);
    currentIndexRef.current = count % items.length;
  }, [items, maxVisible]);

  // Add a new item to the stack
  const addNewItem = useCallback(() => {
    if (items.length === 0) return;

    const newItem: StackItem = {
      ...items[currentIndexRef.current],
      id: idCounterRef.current++,
    };

    currentIndexRef.current = (currentIndexRef.current + 1) % items.length;

    setVisibleItems((prev) => {
      const updated = [newItem, ...prev];
      // Keep only maxVisible items
      return updated.slice(0, maxVisible);
    });
  }, [items, maxVisible]);

  // Set up interval for adding new items
  useEffect(() => {
    if (items.length <= maxVisible) return;

    intervalRef.current = setInterval(addNewItem, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [items.length, maxVisible, interval, addNewItem]);

  if (items.length === 0) {
    return null;
  }

  const transitionDuration = prefersReducedMotion ? 0 : 0.4;

  return (
    <div
      className={`flex flex-col gap-2 ${className}`}
      role="log"
      aria-live="polite"
      aria-label="Live activity feed"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
          Live Activity
        </span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      </div>

      {/* Activity stack */}
      <div className="flex flex-col gap-1.5 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleItems.map((item, index) => (
            <motion.div
              key={item.id}
              layout
              initial={{
                opacity: 0,
                y: prefersReducedMotion ? 0 : -20,
                scale: prefersReducedMotion ? 1 : 0.95,
              }}
              animate={{
                opacity: 1 - index * 0.15, // Fade older items
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: prefersReducedMotion ? 0 : 20,
                scale: prefersReducedMotion ? 1 : 0.95,
              }}
              transition={{
                duration: transitionDuration,
                ease: [0.4, 0, 0.2, 1],
                layout: { duration: transitionDuration * 0.75 },
              }}
              className="flex items-start gap-2 text-sm font-mono"
            >
              {/* Pulse indicator */}
              <span className="relative flex h-2 w-2 mt-1.5 flex-shrink-0">
                {index === 0 ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </>
                ) : (
                  <span
                    className="relative inline-flex rounded-full h-2 w-2 bg-green-500/50"
                    style={{ opacity: 1 - index * 0.2 }}
                  />
                )}
              </span>

              {/* Activity text */}
              <div className="flex flex-col min-w-0">
                <span className="text-white/70 truncate">
                  <span className="text-white/90 font-medium">{item.agent}</span>
                  <span className="text-white/40"> at </span>
                  <span className="text-white/60">{item.company}</span>
                </span>
                <span className="text-white/40 text-xs truncate">
                  {item.action}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
