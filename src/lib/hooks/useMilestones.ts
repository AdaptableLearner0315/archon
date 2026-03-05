'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MilestoneType } from '@/components/ui/Celebration';

// Local storage key for tracking completed milestones
const MILESTONES_STORAGE_KEY = 'archon_milestones';

interface MilestoneRecord {
  completedAt: string;
  data?: Record<string, unknown>;
}

type MilestonesState = Partial<Record<MilestoneType | string, MilestoneRecord>>;

/**
 * Hook for tracking and triggering milestone celebrations
 *
 * Usage:
 * ```tsx
 * const { checkMilestone, markMilestone, shouldCelebrate, clearCelebration } = useMilestones();
 *
 * // Check if a milestone is already completed
 * if (!checkMilestone('first_dashboard_visit')) {
 *   markMilestone('first_dashboard_visit');
 * }
 *
 * // In render:
 * <Celebration active={shouldCelebrate} type={celebrationType} onComplete={clearCelebration} />
 * ```
 */
export function useMilestones(companyId?: string) {
  const [milestones, setMilestones] = useState<MilestonesState>({});
  const [pendingCelebration, setPendingCelebration] = useState<{
    type: MilestoneType;
    title?: string;
    subtitle?: string;
  } | null>(null);

  // Generate storage key based on company (so different companies have separate milestones)
  const storageKey = companyId
    ? `${MILESTONES_STORAGE_KEY}_${companyId}`
    : MILESTONES_STORAGE_KEY;

  // Load milestones from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setMilestones(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load milestones from localStorage:', e);
    }
  }, [storageKey]);

  // Save milestones to localStorage
  const saveMilestones = useCallback((newMilestones: MilestonesState) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(newMilestones));
    } catch (e) {
      console.warn('Failed to save milestones to localStorage:', e);
    }
  }, [storageKey]);

  // Check if a milestone has been completed
  const checkMilestone = useCallback((type: MilestoneType | string): boolean => {
    return !!milestones[type];
  }, [milestones]);

  // Mark a milestone as completed (optionally trigger celebration)
  const markMilestone = useCallback((
    type: MilestoneType,
    options?: {
      celebrate?: boolean;
      title?: string;
      subtitle?: string;
      data?: Record<string, unknown>;
    }
  ) => {
    const { celebrate = true, title, subtitle, data } = options ?? {};

    // Don't re-mark already completed milestones
    if (milestones[type]) {
      return;
    }

    const newMilestones: MilestonesState = {
      ...milestones,
      [type]: {
        completedAt: new Date().toISOString(),
        data,
      },
    };

    setMilestones(newMilestones);
    saveMilestones(newMilestones);

    if (celebrate) {
      setPendingCelebration({ type, title, subtitle });
    }
  }, [milestones, saveMilestones]);

  // Clear pending celebration (call this from onComplete)
  const clearCelebration = useCallback(() => {
    setPendingCelebration(null);
  }, []);

  // Reset a specific milestone (useful for testing)
  const resetMilestone = useCallback((type: MilestoneType | string) => {
    const newMilestones = { ...milestones };
    delete newMilestones[type];
    setMilestones(newMilestones);
    saveMilestones(newMilestones);
  }, [milestones, saveMilestones]);

  // Reset all milestones (useful for testing)
  const resetAllMilestones = useCallback(() => {
    setMilestones({});
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // Get milestone data
  const getMilestoneData = useCallback((type: MilestoneType | string): MilestoneRecord | undefined => {
    return milestones[type];
  }, [milestones]);

  return {
    // State
    milestones,
    shouldCelebrate: !!pendingCelebration,
    pendingCelebration,

    // Actions
    checkMilestone,
    markMilestone,
    clearCelebration,
    resetMilestone,
    resetAllMilestones,
    getMilestoneData,
  };
}

// Revenue milestone helpers
export const REVENUE_MILESTONES = [
  { amount: 100, type: 'revenue_100' as const, title: 'First $100!' },
  { amount: 1000, type: 'revenue_1k' as const, title: 'First $1,000!' },
  { amount: 10000, type: 'revenue_10k' as const, title: '$10,000 reached!' },
  { amount: 50000, type: 'revenue_50k' as const, title: '$50,000 milestone!' },
  { amount: 100000, type: 'revenue_100k' as const, title: 'Six figures!' },
];

export function checkRevenueMilestone(revenue: number, completedMilestones: MilestonesState): typeof REVENUE_MILESTONES[number] | null {
  for (const milestone of REVENUE_MILESTONES) {
    if (revenue >= milestone.amount && !completedMilestones[milestone.type]) {
      return milestone;
    }
  }
  return null;
}

// User growth milestone helpers
export const GROWTH_MILESTONES = [
  { count: 10, type: 'users_10' as const, title: 'First 10 users!' },
  { count: 100, type: 'users_100' as const, title: '100 users!' },
  { count: 1000, type: 'users_1k' as const, title: '1,000 users!' },
  { count: 10000, type: 'users_10k' as const, title: '10,000 users!' },
];

export function checkGrowthMilestone(userCount: number, completedMilestones: MilestonesState): typeof GROWTH_MILESTONES[number] | null {
  for (const milestone of GROWTH_MILESTONES) {
    if (userCount >= milestone.count && !completedMilestones[milestone.type]) {
      return milestone;
    }
  }
  return null;
}

export default useMilestones;
