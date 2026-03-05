'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ActivityStack from './ActivityStack';
import MetricsBar, { type MetricData } from './MetricsBar';
import ActivityDashboard, { type CategorizedActivities } from './ActivityDashboard';
import { type TickerItem } from './ActivityTicker';
import { captureRect, MorphRect, staggerElements } from '@/lib/animations/morphTransition';

export interface ActivitySectionProps {
  mode: 'activity' | 'functionality';
  children: React.ReactNode; // TheBreath component
  tickerItems: TickerItem[];
  metricsBarData?: MetricData[];
  categorizedActivities?: CategorizedActivities;
  onMorphComplete?: () => void;
}

// Placeholder feature cards for functionality mode
const featureCards = [
  { id: 'strategy', title: 'Strategy', description: 'AI-powered business planning' },
  { id: 'engineering', title: 'Engineering', description: 'Automated code development' },
  { id: 'marketing', title: 'Marketing', description: 'Multi-channel campaigns' },
  { id: 'analytics', title: 'Analytics', description: 'Real-time insights' },
];

export default function ActivitySection({
  mode,
  children,
  tickerItems,
  metricsBarData,
  categorizedActivities,
  onMorphComplete,
}: ActivitySectionProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [breathRect, setBreathRect] = useState<MorphRect | null>(null);
  const breathRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Capture The Breath position before transitioning to functionality mode
  useEffect(() => {
    if (mode === 'functionality' && breathRef.current) {
      setBreathRect(captureRect(breathRef.current));
    }
  }, [mode]);

  // Animate feature cards when transitioning to functionality mode
  const animateFeatureCards = useCallback(() => {
    if (!gridRef.current || prefersReducedMotion) {
      onMorphComplete?.();
      return;
    }

    const cards = gridRef.current.querySelectorAll<HTMLElement>('[data-feature-card]');
    if (cards.length === 0) {
      onMorphComplete?.();
      return;
    }

    staggerElements(Array.from(cards), {
      duration: 400,
      staggerDelay: 75,
      fromRect: breathRect || undefined,
      onAllComplete: () => {
        setIsTransitioning(false);
        onMorphComplete?.();
      },
    });
  }, [breathRect, onMorphComplete, prefersReducedMotion]);

  // Trigger animation when entering functionality mode
  useEffect(() => {
    if (mode === 'functionality') {
      setIsTransitioning(true);
      // Small delay to ensure DOM is updated
      const timer = setTimeout(animateFeatureCards, 50);
      return () => clearTimeout(timer);
    }
  }, [mode, animateFeatureCards]);

  const transitionDuration = prefersReducedMotion ? 0 : 0.4;

  return (
    <div className="relative min-h-[400px] flex flex-col items-center justify-center">
      <AnimatePresence mode="wait">
        {mode === 'activity' ? (
          <motion.div
            key="activity"
            id="activity-panel"
            role="tabpanel"
            aria-labelledby="activity-tab"
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            transition={{
              duration: transitionDuration,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="w-full"
          >
            {/* Vertical layout: Breath at top, Metrics, then Activity Dashboard */}
            <div className="flex flex-col items-center gap-8">
              {/* The Breath container - Hero position */}
              <div
                ref={breathRef}
                className="relative flex-shrink-0 flex justify-center w-full"
              >
                {children}
              </div>

              {/* Metrics Bar */}
              {metricsBarData && metricsBarData.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: prefersReducedMotion ? 0 : 0.2,
                    duration: transitionDuration
                  }}
                  className="w-full"
                >
                  <MetricsBar metrics={metricsBarData} />
                </motion.div>
              )}

              {/* Activity Dashboard - 4 columns */}
              {categorizedActivities && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: prefersReducedMotion ? 0 : 0.4,
                    duration: transitionDuration
                  }}
                  className="w-full"
                >
                  <ActivityDashboard activities={categorizedActivities} />
                </motion.div>
              )}

              {/* Fallback: Original Activity Stack if no categorized data */}
              {!categorizedActivities && (
                <motion.div
                  initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: prefersReducedMotion ? 0 : 0.3,
                    duration: transitionDuration
                  }}
                  className="w-full max-w-xs"
                >
                  <ActivityStack items={tickerItems} maxVisible={5} interval={2500} />
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="functionality"
            id="functionality-panel"
            role="tabpanel"
            aria-labelledby="functionality-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: transitionDuration,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="w-full max-w-4xl mx-auto px-4"
          >
            {/* Feature cards grid - placeholder for morph target */}
            <div
              ref={gridRef}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {featureCards.map((card, index) => (
                <div
                  key={card.id}
                  data-feature-card
                  className="glass rounded-xl p-6 opacity-0"
                  style={{
                    // Initial opacity is 0, will be animated by staggerElements
                    opacity: isTransitioning ? 0 : 1,
                  }}
                >
                  <motion.div
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{
                      delay: prefersReducedMotion ? 0 : index * 0.075,
                      duration: transitionDuration
                    }}
                  >
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {card.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {card.description}
                    </p>
                  </motion.div>
                </div>
              ))}
            </div>

            {/* Placeholder text for feature section */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: prefersReducedMotion ? 0 : 0.4,
                duration: transitionDuration
              }}
              className="text-center text-muted-foreground text-sm mt-8"
            >
              Explore what each agent can do for your business
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
