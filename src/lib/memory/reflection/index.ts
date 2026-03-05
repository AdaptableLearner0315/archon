/**
 * Memory Reflection System
 *
 * Meta-cognitive layer for the memory system:
 * - Reflection Engine: Analyzes memory performance
 * - Lesson Extractor: Extracts learnings from performance data
 * - Strategy Evolver: Automatically evolves recall strategy
 */

// Reflection Engine
export { runMemoryReflection } from './memory-reflection-engine';

// Lesson Extraction
export {
  extractMemoryLessons,
  getActiveLessons,
  getPendingLessons,
  updateLessonValidation,
  deprecateLesson,
} from './memory-lesson-extractor';

// Strategy Evolution
export {
  getRecallConfig,
  applyLesson,
  checkStrategyRollback,
  applyActiveLessons,
} from './memory-strategy-evolver';
