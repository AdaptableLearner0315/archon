'use client';

import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Confetti particle configuration
interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  shape: 'circle' | 'square' | 'triangle';
  velocity: { x: number; y: number };
  rotationVelocity: number;
}

// Theme colors for confetti
const CONFETTI_COLORS = [
  '#a78bfa', // purple-400
  '#c4b5fd', // purple-300
  '#8b5cf6', // purple-500
  '#f472b6', // pink-400
  '#fbbf24', // amber-400
  '#34d399', // emerald-400
  '#60a5fa', // blue-400
  '#fb7185', // rose-400
];

// Milestone types
export type MilestoneType =
  | 'onboarding_complete'
  | 'first_dashboard_visit'
  | 'first_cycle_complete'
  | 'revenue_milestone'
  | 'growth_milestone'
  | 'first_customer'
  | 'custom';

interface CelebrationConfig {
  particleCount?: number;
  duration?: number;
  spread?: number;
  title?: string;
  subtitle?: string;
}

const MILESTONE_CONFIGS: Record<MilestoneType, CelebrationConfig> = {
  onboarding_complete: {
    particleCount: 100,
    duration: 4000,
    title: 'Welcome aboard!',
    subtitle: 'Your AI organization is ready',
  },
  first_dashboard_visit: {
    particleCount: 80,
    duration: 3000,
    title: 'Let\'s build something great!',
    subtitle: 'Your dashboard is ready',
  },
  first_cycle_complete: {
    particleCount: 120,
    duration: 5000,
    title: 'First cycle complete!',
    subtitle: 'Your AI team delivered results',
  },
  revenue_milestone: {
    particleCount: 150,
    duration: 6000,
    title: 'Revenue milestone!',
    subtitle: 'Your hard work is paying off',
  },
  growth_milestone: {
    particleCount: 100,
    duration: 4000,
    title: 'You\'re growing!',
    subtitle: 'Keep up the momentum',
  },
  first_customer: {
    particleCount: 130,
    duration: 5000,
    title: 'First customer!',
    subtitle: 'This is just the beginning',
  },
  custom: {
    particleCount: 80,
    duration: 3000,
  },
};

// Context for global celebration control
interface CelebrationContextType {
  celebrate: (type: MilestoneType, config?: CelebrationConfig) => void;
  isActive: boolean;
}

const CelebrationContext = createContext<CelebrationContextType | null>(null);

export function useCelebration() {
  const context = useContext(CelebrationContext);
  if (!context) {
    throw new Error('useCelebration must be used within CelebrationProvider');
  }
  return context;
}

// Provider component
export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const [message, setMessage] = useState<{ title?: string; subtitle?: string } | null>(null);

  const celebrate = useCallback((type: MilestoneType, customConfig?: CelebrationConfig) => {
    const config = { ...MILESTONE_CONFIGS[type], ...customConfig };
    const { particleCount = 80, duration = 3000, title, subtitle } = config;

    // Generate particles
    const newParticles: ConfettiParticle[] = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 20, // Start near center
      y: 40,
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 0.5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      shape: (['circle', 'square', 'triangle'] as const)[Math.floor(Math.random() * 3)],
      velocity: {
        x: (Math.random() - 0.5) * 15,
        y: -10 - Math.random() * 10,
      },
      rotationVelocity: (Math.random() - 0.5) * 20,
    }));

    setParticles(newParticles);
    setMessage(title ? { title, subtitle } : null);
    setIsActive(true);

    setTimeout(() => {
      setIsActive(false);
      setParticles([]);
      setMessage(null);
    }, duration);
  }, []);

  return (
    <CelebrationContext.Provider value={{ celebrate, isActive }}>
      {children}
      <CelebrationOverlay particles={particles} message={message} isActive={isActive} />
    </CelebrationContext.Provider>
  );
}

// Confetti particle component
function ConfettiPiece({ particle }: { particle: ConfettiParticle }) {
  const shapeStyles = {
    circle: 'rounded-full',
    square: 'rounded-sm',
    triangle: 'clip-path-triangle',
  };

  return (
    <motion.div
      initial={{
        x: `${particle.x}vw`,
        y: `${particle.y}vh`,
        rotate: particle.rotation,
        scale: 0,
        opacity: 1,
      }}
      animate={{
        x: `${particle.x + particle.velocity.x * 8}vw`,
        y: '110vh',
        rotate: particle.rotation + particle.rotationVelocity * 20,
        scale: particle.scale,
        opacity: [1, 1, 0.8, 0],
      }}
      transition={{
        duration: 3 + Math.random() * 2,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={`absolute w-3 h-3 ${shapeStyles[particle.shape]}`}
      style={{
        backgroundColor: particle.color,
        clipPath: particle.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
      }}
    />
  );
}

// Celebration overlay component
function CelebrationOverlay({
  particles,
  message,
  isActive,
}: {
  particles: ConfettiParticle[];
  message: { title?: string; subtitle?: string } | null;
  isActive: boolean;
}) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden"
        >
          {/* Confetti particles */}
          {particles.map((particle) => (
            <ConfettiPiece key={particle.id} particle={particle} />
          ))}

          {/* Message overlay */}
          {message && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.5, repeat: 2 }}
                className="text-5xl mb-4"
              >
                🎉
              </motion.div>
              {message.title && (
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 drop-shadow-lg">
                  {message.title}
                </h2>
              )}
              {message.subtitle && (
                <p className="text-lg text-white/80 drop-shadow-md">
                  {message.subtitle}
                </p>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Standalone celebration component (for cases where you don't need the provider)
export function Celebration({
  active,
  type = 'custom',
  particleCount,
  duration,
  title,
  subtitle,
  onComplete,
}: {
  active: boolean;
  type?: MilestoneType;
  particleCount?: number;
  duration?: number;
  title?: string;
  subtitle?: string;
  onComplete?: () => void;
}) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (active) {
      const config = MILESTONE_CONFIGS[type];
      const count = particleCount ?? config.particleCount ?? 80;
      const dur = duration ?? config.duration ?? 3000;

      const newParticles: ConfettiParticle[] = Array.from({ length: count }, (_, i) => ({
        id: i,
        x: 50 + (Math.random() - 0.5) * 20,
        y: 40,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        shape: (['circle', 'square', 'triangle'] as const)[Math.floor(Math.random() * 3)],
        velocity: {
          x: (Math.random() - 0.5) * 15,
          y: -10 - Math.random() * 10,
        },
        rotationVelocity: (Math.random() - 0.5) * 20,
      }));

      setParticles(newParticles);
      setShowMessage(true);

      const timer = setTimeout(() => {
        setParticles([]);
        setShowMessage(false);
        onComplete?.();
      }, dur);

      return () => clearTimeout(timer);
    }
  }, [active, type, particleCount, duration, onComplete]);

  const displayTitle = title ?? MILESTONE_CONFIGS[type].title;
  const displaySubtitle = subtitle ?? MILESTONE_CONFIGS[type].subtitle;

  return (
    <CelebrationOverlay
      particles={particles}
      message={showMessage && displayTitle ? { title: displayTitle, subtitle: displaySubtitle } : null}
      isActive={active && particles.length > 0}
    />
  );
}

export default Celebration;
