'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface TickerItem {
  agent: string;
  company: string;
  action: string;
}

export interface ActivityTickerProps {
  items: TickerItem[];
  interval?: number; // ms between items, default 2500
}

export default function ActivityTicker({ items, interval = 2500 }: ActivityTickerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Reset index when items array changes to avoid stale index
  useEffect(() => {
    setCurrentIndex(0);
  }, [items]);

  // Advance to next item
  const advanceToNext = useCallback(() => {
    if (items.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  // Set up interval for advancing items
  useEffect(() => {
    if (items.length <= 1) return;

    intervalRef.current = setInterval(advanceToNext, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [items.length, interval, advanceToNext]);

  // If no items, show nothing
  if (items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex] ?? items[0];
  if (!currentItem) return null;
  const transitionDuration = prefersReducedMotion ? 0 : 0.3;

  return (
    <div
      className="relative h-6 overflow-hidden flex justify-center items-center"
      role="marquee"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -10 }}
          transition={{
            duration: transitionDuration,
            ease: [0.4, 0, 0.2, 1]
          }}
          className="text-center text-sm text-white/40 whitespace-nowrap px-4"
        >
          <span className="text-white/60 font-medium">{currentItem.agent}</span>
          <span className="mx-1">at</span>
          <span className="text-white/60">{currentItem.company}</span>
          <span className="mx-1">completed</span>
          <span className="text-white/50">{currentItem.action}</span>
          <span className="ml-2 text-white/30">&#8594;</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Export sample ticker items for demo/testing
export const sampleTickerItems: TickerItem[] = [
  { agent: 'Atlas', company: 'BuildSignal', action: 'market analysis' },
  { agent: 'Forge', company: 'TechStart', action: 'code review' },
  { agent: 'Pulse', company: 'GrowthCo', action: 'campaign optimization' },
  { agent: 'Echo', company: 'MediaBrand', action: 'content strategy' },
  { agent: 'Prism', company: 'ProductLabs', action: 'feature prioritization' },
  { agent: 'Nexus', company: 'OpsFlow', action: 'process automation' },
  { agent: 'Arrow', company: 'SalesForce', action: 'lead qualification' },
  { agent: 'Shield', company: 'SupportHub', action: 'ticket resolution' },
  { agent: 'Lens', company: 'DataDriven', action: 'trend analysis' },
  { agent: 'Bloom', company: 'CustomerFirst', action: 'onboarding sequence' },
];
