'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export interface ActivityToggleProps {
  mode: 'activity' | 'functionality';
  onModeChange: (mode: 'activity' | 'functionality') => void;
}

export default function ActivityToggle({ mode, onModeChange }: ActivityToggleProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, targetMode: 'activity' | 'functionality') => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onModeChange(targetMode);
      }
    },
    [onModeChange]
  );

  const transitionDuration = prefersReducedMotion ? 0 : 0.3;

  return (
    <div className="relative z-10 flex justify-center">
      <div
        className="glass rounded-full px-2 py-1.5 flex items-center gap-1"
        role="tablist"
        aria-label="View mode"
      >
        {/* Background slider */}
        <motion.div
          className="absolute h-[calc(100%-12px)] rounded-full bg-white/[0.08]"
          initial={false}
          animate={{
            x: mode === 'activity' ? 0 : '100%',
            width: mode === 'activity' ? '50%' : '50%',
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
            duration: transitionDuration,
          }}
          style={{
            left: 8,
          }}
        />

        {/* Activity option */}
        <button
          role="tab"
          aria-selected={mode === 'activity'}
          aria-controls="activity-panel"
          tabIndex={mode === 'activity' ? 0 : -1}
          onClick={() => onModeChange('activity')}
          onKeyDown={(e) => handleKeyDown(e, 'activity')}
          className={`
            relative z-10 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
            transition-colors duration-300 select-none cursor-pointer
            focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background
            ${mode === 'activity' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'}
          `}
        >
          <motion.span
            className="relative flex items-center justify-center w-2 h-2"
            initial={false}
            animate={{
              scale: mode === 'activity' ? 1 : 0.8,
            }}
            transition={{ duration: transitionDuration }}
          >
            {/* Outer ring for inactive state */}
            <motion.span
              className="absolute inset-0 rounded-full border border-current"
              initial={false}
              animate={{
                opacity: mode === 'activity' ? 0 : 1,
              }}
              transition={{ duration: transitionDuration }}
            />
            {/* Filled dot for active state */}
            <motion.span
              className="absolute inset-0 rounded-full bg-white"
              initial={false}
              animate={{
                scale: mode === 'activity' ? 1 : 0,
                opacity: mode === 'activity' ? 1 : 0,
              }}
              transition={{ duration: transitionDuration }}
            />
          </motion.span>
          <span>Activity</span>
        </button>

        {/* Functionality option */}
        <button
          role="tab"
          aria-selected={mode === 'functionality'}
          aria-controls="functionality-panel"
          tabIndex={mode === 'functionality' ? 0 : -1}
          onClick={() => onModeChange('functionality')}
          onKeyDown={(e) => handleKeyDown(e, 'functionality')}
          className={`
            relative z-10 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
            transition-colors duration-300 select-none cursor-pointer
            focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background
            ${mode === 'functionality' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'}
          `}
        >
          <motion.span
            className="relative flex items-center justify-center w-2 h-2"
            initial={false}
            animate={{
              scale: mode === 'functionality' ? 1 : 0.8,
            }}
            transition={{ duration: transitionDuration }}
          >
            {/* Outer ring for inactive state */}
            <motion.span
              className="absolute inset-0 rounded-full border border-current"
              initial={false}
              animate={{
                opacity: mode === 'functionality' ? 0 : 1,
              }}
              transition={{ duration: transitionDuration }}
            />
            {/* Filled dot for active state */}
            <motion.span
              className="absolute inset-0 rounded-full bg-white"
              initial={false}
              animate={{
                scale: mode === 'functionality' ? 1 : 0,
                opacity: mode === 'functionality' ? 1 : 0,
              }}
              transition={{ duration: transitionDuration }}
            />
          </motion.span>
          <span>Functionality</span>
        </button>
      </div>
    </div>
  );
}
