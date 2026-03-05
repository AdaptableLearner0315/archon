'use client';

/**
 * Particle system for The Breath visualization.
 * Manages particles that flow inward on inhale and outward on exhale.
 */

export interface Particle {
  id: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  angle: number;
  distance: number;
  speed: number;
  size: number;
  opacity: number;
  hue: number; // For color variation within purple range
}

export interface ParticleSystemConfig {
  particleCount: number;
  minSize: number;
  maxSize: number;
  minSpeed: number;
  maxSpeed: number;
  innerRadius: number;
  outerRadius: number;
}

const DEFAULT_CONFIG: ParticleSystemConfig = {
  particleCount: 75,
  minSize: 1,
  maxSize: 4,
  minSpeed: 0.3,
  maxSpeed: 1.2,
  innerRadius: 80,
  outerRadius: 250,
};

/**
 * Creates initial particles distributed around the center
 */
export function createParticles(
  centerX: number,
  centerY: number,
  config: Partial<ParticleSystemConfig> = {}
): Particle[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const particles: Particle[] = [];

  for (let i = 0; i < cfg.particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = cfg.innerRadius + Math.random() * (cfg.outerRadius - cfg.innerRadius);

    particles.push({
      id: i,
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      baseX: centerX,
      baseY: centerY,
      angle,
      distance,
      speed: cfg.minSpeed + Math.random() * (cfg.maxSpeed - cfg.minSpeed),
      size: cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize),
      opacity: 0.3 + Math.random() * 0.5,
      hue: 0, // No longer used, kept for interface compatibility
    });
  }

  return particles;
}

/**
 * Updates particle positions based on breath phase
 * @param particles - Array of particles to update
 * @param phase - Current breath phase (0-1, where 1 is fully expanded)
 * @param isInhaling - Whether currently inhaling
 * @param deltaTime - Time since last frame in ms
 * @param config - Particle system configuration
 */
export function updateParticles(
  particles: Particle[],
  phase: number,
  isInhaling: boolean,
  deltaTime: number,
  config: Partial<ParticleSystemConfig> = {}
): Particle[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const timeScale = deltaTime / 16.67; // Normalize to 60fps

  return particles.map((particle) => {
    // Calculate target distance based on breath phase
    // Inhale: particles move inward (smaller distance)
    // Exhale: particles move outward (larger distance)
    const breathInfluence = isInhaling ? -1 : 1;
    const targetOffset = breathInfluence * particle.speed * 30 * phase;

    // Apply movement with some noise for organic feel
    const noiseAngle = Math.sin(Date.now() * 0.001 + particle.id * 0.5) * 0.1;
    const currentAngle = particle.angle + noiseAngle;

    // Smoothly interpolate distance
    const baseDistance = cfg.innerRadius + (cfg.outerRadius - cfg.innerRadius) * 0.5;
    const targetDistance = baseDistance + targetOffset;
    const newDistance = particle.distance + (targetDistance - particle.distance) * 0.02 * timeScale;

    // Calculate new position
    const newX = particle.baseX + Math.cos(currentAngle) * newDistance;
    const newY = particle.baseY + Math.sin(currentAngle) * newDistance;

    // Update opacity based on phase for pulsing effect
    const pulseOpacity = 0.3 + phase * 0.4;

    return {
      ...particle,
      x: newX,
      y: newY,
      distance: newDistance,
      angle: currentAngle,
      opacity: particle.opacity * 0.8 + pulseOpacity * 0.2,
    };
  });
}

/**
 * Renders particles to a canvas context
 * @param ctx - Canvas 2D rendering context
 * @param particles - Array of particles to render
 * @param _primaryColor - Primary color (reserved for future gradient effects)
 * @param _accentColor - Accent color (reserved for future gradient effects)
 */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  _primaryColor: string,
  _accentColor: string
): void {
  particles.forEach((particle) => {
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);

    // Create gradient for each particle
    const gradient = ctx.createRadialGradient(
      particle.x,
      particle.y,
      0,
      particle.x,
      particle.y,
      particle.size * 2
    );

    // Use white/grey for particles (no purple)
    const color = `rgba(255, 255, 255, ${particle.opacity})`;
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fill();
  });
}

/**
 * Recenter particles when canvas resizes
 */
export function recenterParticles(
  particles: Particle[],
  newCenterX: number,
  newCenterY: number
): Particle[] {
  return particles.map((particle) => ({
    ...particle,
    baseX: newCenterX,
    baseY: newCenterY,
    x: newCenterX + Math.cos(particle.angle) * particle.distance,
    y: newCenterY + Math.sin(particle.angle) * particle.distance,
  }));
}

const BreathParticlesUtils = {
  createParticles,
  updateParticles,
  renderParticles,
  recenterParticles,
};

export default BreathParticlesUtils;
