'use client';

import { useRef, useEffect, useState } from 'react';
import { useBreathAnimation } from '@/hooks/useBreathAnimation';
import {
  createParticles,
  updateParticles,
  renderParticles,
  recenterParticles,
  type Particle,
} from './BreathParticles';

export interface TheBreathProps {
  centerStat: { value: number; label: string };
  orbitingStats: Array<{ value: string; label: string }>;
  breathingSpeed?: number; // ms per cycle, default 4000
  onEvolution?: () => void; // callback when "system evolved" event fires
  className?: string;
}

interface OrbitingStat {
  value: string;
  label: string;
  angle: number;
  orbitRadius: number;
  speed: number;
  phase: number;
}

// Simple 2D noise function for organic blob shape
function noise2D(x: number, y: number, time: number): number {
  const t = time * 0.0005;
  return (
    Math.sin(x * 2.5 + t) * Math.cos(y * 2.5 + t * 1.3) * 0.5 +
    Math.sin(x * 1.7 - t * 0.7) * Math.cos(y * 1.3 + t * 0.9) * 0.3 +
    Math.sin(x * 3.1 + t * 1.1) * Math.cos(y * 2.9 - t * 0.5) * 0.2
  );
}

export default function TheBreath({
  centerStat,
  orbitingStats,
  breathingSpeed = 4000,
  onEvolution,
  className = '',
}: TheBreathProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const orbitingStatsRef = useRef<OrbitingStat[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [reducedMotion, setReducedMotion] = useState(false);

  // Store current values in refs for animation loop
  const phaseRef = useRef(0);
  const isInhalingRef = useRef(true);
  const centerStatRef = useRef(centerStat);

  // Get breath animation state
  const { phase, isInhaling } = useBreathAnimation({
    cycleDuration: breathingSpeed,
    onCycleComplete: (count) => {
      // Fire evolution callback every 5 cycles
      if (count > 0 && count % 5 === 0) {
        onEvolution?.();
      }
    },
  });

  // Update refs when values change
  useEffect(() => {
    phaseRef.current = phase;
    isInhalingRef.current = isInhaling;
  }, [phase, isInhaling]);

  useEffect(() => {
    centerStatRef.current = centerStat;
  }, [centerStat]);

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Set initial value via callback to avoid direct setState in effect
    const checkReducedMotion = () => {
      setReducedMotion(mediaQuery.matches);
    };

    // Use microtask to defer initial check
    queueMicrotask(checkReducedMotion);

    const handleChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Initialize orbiting stats with orbital parameters
  useEffect(() => {
    orbitingStatsRef.current = orbitingStats.map((stat, index) => ({
      ...stat,
      angle: (index / orbitingStats.length) * Math.PI * 2,
      orbitRadius: 180 + (index % 2) * 40, // Vary orbit radii
      speed: 0.0003 + (index * 0.0001), // Different speeds
      phase: Math.random() * Math.PI * 2, // Random starting phase
    }));
  }, [orbitingStats]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = rect.width;
      const newHeight = Math.min(600, Math.max(400, window.innerHeight * 0.5));

      setDimensions({ width: newWidth, height: newHeight });

      // Recenter particles
      const centerX = newWidth / 2;
      const centerY = newHeight / 2;
      if (particlesRef.current.length > 0) {
        particlesRef.current = recenterParticles(particlesRef.current, centerX, centerY);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize particles
  useEffect(() => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    particlesRef.current = createParticles(centerX, centerY, {
      particleCount: reducedMotion ? 30 : 75,
      innerRadius: 60,
      outerRadius: 200,
    });
  }, [dimensions.width, dimensions.height, reducedMotion]);

  // Main animation loop
  useEffect(() => {
    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Calculate delta time
      const deltaTime = lastFrameTimeRef.current
        ? timestamp - lastFrameTimeRef.current
        : 16.67;
      lastFrameTimeRef.current = timestamp;

      const { width, height } = dimensions;
      const centerX = width / 2;
      const centerY = height / 2;

      // Use white/grey colors only (no purple)
      const primaryColor = '#ffffff';
      const accentColor = '#a1a1aa';

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Update and render particles
      if (!reducedMotion) {
        particlesRef.current = updateParticles(
          particlesRef.current,
          phaseRef.current,
          isInhalingRef.current,
          deltaTime
        );
      }
      renderParticles(ctx, particlesRef.current, primaryColor, accentColor);

      // Draw the breath blob
      drawBreathBlob(ctx, centerX, centerY, phaseRef.current, timestamp, primaryColor, accentColor, reducedMotion);

      // Draw center stat
      drawCenterStat(ctx, centerX, centerY, centerStatRef.current);

      // Draw orbiting stats
      drawOrbitingStats(ctx, centerX, centerY, timestamp, orbitingStatsRef.current, reducedMotion);

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dimensions, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      style={{ height: dimensions.height }}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
        aria-label={`Breathing visualization showing ${centerStat.value.toLocaleString()} ${centerStat.label}`}
        role="img"
      />
    </div>
  );
}

/**
 * Draws the organic breathing blob shape
 */
function drawBreathBlob(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  phase: number,
  time: number,
  primaryColor: string,
  accentColor: string,
  reducedMotion: boolean
): void {
  // Base radius that expands/contracts with breath
  const minRadius = 80;
  const maxRadius = 140;
  const baseRadius = minRadius + (maxRadius - minRadius) * phase;

  // Number of points around the circle
  const points = 64;
  const step = (Math.PI * 2) / points;

  ctx.beginPath();

  for (let i = 0; i <= points; i++) {
    const angle = i * step;

    // Calculate noise offset for organic shape
    let noiseOffset = 0;
    if (!reducedMotion) {
      noiseOffset = noise2D(Math.cos(angle) * 2, Math.sin(angle) * 2, time) * 20 * phase;
    }

    const radius = baseRadius + noiseOffset;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();

  // Create gradient fill
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    baseRadius * 1.5
  );

  // Gradient from white to grey with transparency
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(0.5, 'rgba(161, 161, 170, 0.3)');
  gradient.addColorStop(1, 'rgba(161, 161, 170, 0)');

  ctx.fillStyle = gradient;
  ctx.fill();

  // Add glow effect
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 40 + phase * 20;
  ctx.fill();
  ctx.shadowBlur = 0;
}

/**
 * Draws the center statistic
 */
function drawCenterStat(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  stat: { value: number; label: string }
): void {
  // Format number with commas
  const formattedValue = stat.value.toLocaleString();

  // Draw value
  ctx.save();
  ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#fafafa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Add text shadow for better contrast
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.fillText(formattedValue, centerX, centerY - 10);

  // Draw label
  ctx.font = '16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(250, 250, 250, 0.7)';
  ctx.fillText(stat.label, centerX, centerY + 30);

  ctx.restore();
}

/**
 * Draws orbiting statistics around the breath
 */
function drawOrbitingStats(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  time: number,
  stats: OrbitingStat[],
  reducedMotion: boolean
): void {
  stats.forEach((stat) => {
    // Calculate position on elliptical orbit
    let angle = stat.angle;
    if (!reducedMotion) {
      angle = stat.angle + time * stat.speed + stat.phase;
    }

    // Elliptical orbit (wider than tall)
    const orbitX = stat.orbitRadius * 1.2;
    const orbitY = stat.orbitRadius * 0.7;

    const x = centerX + Math.cos(angle) * orbitX;
    const y = centerY + Math.sin(angle) * orbitY;

    // Calculate opacity based on position (fade when behind)
    const depthFactor = (Math.sin(angle) + 1) / 2;
    const opacity = 0.4 + depthFactor * 0.4;

    // Draw stat card background
    ctx.save();

    // Semi-transparent background
    ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + depthFactor * 0.03})`;
    ctx.beginPath();
    ctx.roundRect(x - 50, y - 25, 100, 50, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + depthFactor * 0.05})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Value
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = `rgba(250, 250, 250, ${opacity})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stat.value, x, y - 8);

    // Label
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = `rgba(250, 250, 250, ${opacity * 0.7})`;
    ctx.fillText(stat.label, x, y + 10);

    ctx.restore();
  });
}
