'use client';

import { useEffect, useState, useRef } from 'react';

export interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number; // Percentage change, positive or negative
  className?: string;
}

/**
 * MetricCard - Individual metric card with value and change indicator.
 * Features purple highlight flash on value update.
 */
export default function MetricCard({
  label,
  value,
  change,
  className = '',
}: MetricCardProps) {
  const [showHighlight, setShowHighlight] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const prevValueRef = useRef<string | number>(value);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Trigger highlight on value change
  useEffect(() => {
    if (prevValueRef.current !== value && !prefersReducedMotion) {
      setShowHighlight(true);
      const timer = setTimeout(() => setShowHighlight(false), 1500);
      prevValueRef.current = value;
      return () => clearTimeout(timer);
    }
    prevValueRef.current = value;
  }, [value, prefersReducedMotion]);

  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div
      className={`
        flex flex-col items-center justify-center
        px-4 py-3
        bg-white/[0.02] border border-white/[0.06] rounded-lg
        transition-shadow duration-500
        ${showHighlight && !prefersReducedMotion ? 'metric-highlight' : ''}
        ${className}
      `}
    >
      {/* Value + Change */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl md:text-2xl font-bold text-white font-mono">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {change !== undefined && (
          <span
            className={`
              text-xs font-medium font-mono
              ${isPositive ? 'text-green-400' : ''}
              ${isNegative ? 'text-red-400' : ''}
              ${!isPositive && !isNegative ? 'text-white/40' : ''}
            `}
          >
            {isPositive ? '+' : ''}
            {change}%
            {isPositive && <span className="ml-0.5">&#9650;</span>}
            {isNegative && <span className="ml-0.5">&#9660;</span>}
          </span>
        )}
      </div>

      {/* Label */}
      <span className="text-xs text-white/40 uppercase tracking-wider mt-1">
        {label}
      </span>
    </div>
  );
}
