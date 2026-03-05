/**
 * FLIP Animation Utilities for Morph Transitions
 *
 * FLIP = First, Last, Invert, Play
 * These utilities help create smooth morphing animations between element states.
 */

export interface MorphRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Capture the current position and dimensions of an element
 */
export function captureRect(element: HTMLElement): MorphRect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Calculate the transform needed to animate from first position to last position
 */
export function getTransform(first: MorphRect, last: MorphRect): {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
} {
  return {
    translateX: first.x - last.x,
    translateY: first.y - last.y,
    scaleX: first.width / last.width,
    scaleY: first.height / last.height,
  };
}

/**
 * Check if the user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Apply FLIP animation to an element
 *
 * @param element - The element to animate
 * @param from - The starting position (captured before layout change)
 * @param duration - Animation duration in ms (default 300)
 * @returns The Animation object for chaining
 */
export function animateFLIP(
  element: HTMLElement,
  from: MorphRect,
  duration: number = 300
): Animation {
  // Check for reduced motion preference
  if (prefersReducedMotion()) {
    duration = 0;
  }

  // Capture the new (last) position
  const to = captureRect(element);

  // Calculate the transform
  const transform = getTransform(from, to);

  // Apply the FLIP animation using Web Animations API
  return element.animate(
    [
      {
        transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scaleX}, ${transform.scaleY})`,
        opacity: 0.8,
      },
      {
        transform: 'translate(0, 0) scale(1, 1)',
        opacity: 1,
      },
    ],
    {
      duration,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    }
  );
}

/**
 * Animate an element from one position to another with opacity
 */
export function animateMorph(
  element: HTMLElement,
  options: {
    from?: MorphRect;
    duration?: number;
    delay?: number;
    onComplete?: () => void;
  } = {}
): Animation | null {
  const { from, duration = 300, delay = 0, onComplete } = options;

  if (prefersReducedMotion()) {
    onComplete?.();
    return null;
  }

  const keyframes: Keyframe[] = from
    ? [
        {
          transform: `translate(${from.x - element.getBoundingClientRect().left}px, ${from.y - element.getBoundingClientRect().top}px)`,
          opacity: 0,
        },
        {
          transform: 'translate(0, 0)',
          opacity: 1,
        },
      ]
    : [
        { opacity: 0, transform: 'scale(0.95)' },
        { opacity: 1, transform: 'scale(1)' },
      ];

  const animation = element.animate(keyframes, {
    duration,
    delay,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    fill: 'forwards',
  });

  if (onComplete) {
    animation.addEventListener('finish', onComplete);
  }

  return animation;
}

/**
 * Stagger animations for a group of elements
 */
export function staggerElements(
  elements: HTMLElement[],
  options: {
    duration?: number;
    staggerDelay?: number;
    fromRect?: MorphRect;
    onAllComplete?: () => void;
  } = {}
): Animation[] {
  const { duration = 300, staggerDelay = 50, fromRect, onAllComplete } = options;

  if (prefersReducedMotion()) {
    onAllComplete?.();
    return [];
  }

  const animations: Animation[] = [];
  let completedCount = 0;

  elements.forEach((element, index) => {
    const animation = element.animate(
      [
        {
          opacity: 0,
          transform: fromRect
            ? `translate(${fromRect.x - element.getBoundingClientRect().left}px, ${fromRect.y - element.getBoundingClientRect().top}px) scale(0.8)`
            : 'translateY(20px) scale(0.95)',
        },
        {
          opacity: 1,
          transform: 'translate(0, 0) scale(1)',
        },
      ],
      {
        duration,
        delay: index * staggerDelay,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
      }
    );

    animation.addEventListener('finish', () => {
      completedCount++;
      if (completedCount === elements.length && onAllComplete) {
        onAllComplete();
      }
    });

    animations.push(animation);
  });

  return animations;
}

/**
 * Fade out an element with optional scale
 */
export function fadeOut(
  element: HTMLElement,
  options: {
    duration?: number;
    scale?: boolean;
    onComplete?: () => void;
  } = {}
): Animation | null {
  const { duration = 300, scale = true, onComplete } = options;

  if (prefersReducedMotion()) {
    element.style.opacity = '0';
    onComplete?.();
    return null;
  }

  const animation = element.animate(
    [
      {
        opacity: 1,
        transform: 'scale(1)',
      },
      {
        opacity: 0,
        transform: scale ? 'scale(0.95)' : 'scale(1)',
      },
    ],
    {
      duration,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    }
  );

  if (onComplete) {
    animation.addEventListener('finish', onComplete);
  }

  return animation;
}

/**
 * Fade in an element with optional scale
 */
export function fadeIn(
  element: HTMLElement,
  options: {
    duration?: number;
    scale?: boolean;
    delay?: number;
    onComplete?: () => void;
  } = {}
): Animation | null {
  const { duration = 300, scale = true, delay = 0, onComplete } = options;

  if (prefersReducedMotion()) {
    element.style.opacity = '1';
    onComplete?.();
    return null;
  }

  const animation = element.animate(
    [
      {
        opacity: 0,
        transform: scale ? 'scale(0.95)' : 'scale(1)',
      },
      {
        opacity: 1,
        transform: 'scale(1)',
      },
    ],
    {
      duration,
      delay,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    }
  );

  if (onComplete) {
    animation.addEventListener('finish', onComplete);
  }

  return animation;
}
