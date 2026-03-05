'use client';

import { useState, useEffect, useRef } from 'react';

export interface BreathState {
  /** Current breath phase from 0 to 1 (0 = fully contracted, 1 = fully expanded) */
  phase: number;
  /** Whether currently inhaling (expanding) or exhaling (contracting) */
  isInhaling: boolean;
  /** Current elapsed time in the cycle (ms) */
  elapsed: number;
  /** Total cycle count since start */
  cycleCount: number;
}

export interface UseBreathAnimationOptions {
  /** Total duration of one complete breath cycle in ms (default: 4000) */
  cycleDuration?: number;
  /** Whether animation is paused */
  paused?: boolean;
  /** Respect reduced motion preference (default: true) */
  respectReducedMotion?: boolean;
  /** Callback when a full cycle completes */
  onCycleComplete?: (cycleCount: number) => void;
}

/**
 * Easing function for smooth breathing effect
 * Creates a natural-feeling inhale/exhale curve
 */
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * Custom hook for managing breathing animation timing.
 * Returns the current breath phase (0-1) and whether inhaling or exhaling.
 */
export function useBreathAnimation(options: UseBreathAnimationOptions = {}): BreathState {
  const {
    cycleDuration = 4000,
    paused = false,
    respectReducedMotion = true,
    onCycleComplete,
  } = options;

  const [breathState, setBreathState] = useState<BreathState>({
    phase: 0,
    isInhaling: true,
    elapsed: 0,
    cycleCount: 0,
  });

  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastCycleRef = useRef<number>(0);
  const reducedMotionRef = useRef<boolean>(false);

  // Store callbacks in refs to avoid triggering re-renders
  const onCycleCompleteRef = useRef(onCycleComplete);

  // Update ref in effect to avoid accessing during render
  useEffect(() => {
    onCycleCompleteRef.current = onCycleComplete;
  }, [onCycleComplete]);

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mediaQuery.matches;

    const handleChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (paused) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    // Reset start time when resuming
    startTimeRef.current = 0;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === 0) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const halfCycle = cycleDuration / 2;

      // Calculate current cycle
      const currentCycle = Math.floor(elapsed / cycleDuration);

      // Fire callback when cycle completes
      if (currentCycle > lastCycleRef.current) {
        lastCycleRef.current = currentCycle;
        onCycleCompleteRef.current?.(currentCycle);
      }

      // Calculate position within current cycle
      const positionInCycle = elapsed % cycleDuration;
      const isInhaling = positionInCycle < halfCycle;

      // Calculate phase (0-1) using easeInOutSine for smooth breathing
      let phase: number;
      if (respectReducedMotion && reducedMotionRef.current) {
        // For reduced motion, use a static expanded state
        phase = 0.7;
      } else if (isInhaling) {
        // Inhale: 0 -> 1 over first half
        const t = positionInCycle / halfCycle;
        phase = easeInOutSine(t);
      } else {
        // Exhale: 1 -> 0 over second half
        const t = (positionInCycle - halfCycle) / halfCycle;
        phase = 1 - easeInOutSine(t);
      }

      setBreathState({
        phase,
        isInhaling,
        elapsed,
        cycleCount: currentCycle,
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [paused, cycleDuration, respectReducedMotion]);

  return breathState;
}

/**
 * Alternative easing for more dramatic breathing
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default useBreathAnimation;
