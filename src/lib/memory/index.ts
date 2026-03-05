/**
 * Cognitive Memory System
 *
 * Exports the main memory store and utility functions for
 * seeding memories from onboarding data.
 */

export { CognitiveMemoryStore, getCognitiveMemoryStore } from './store';
export { seedMemoriesFromOnboarding, seedMemoriesFromSurprise } from './seed';

// Embeddings and semantic search
export {
  generateEmbedding,
  generateEmbeddingsBatch,
  generateCombinedEmbedding,
  isEmbeddingsAvailable,
  EMBEDDING_DIMENSIONS,
} from './embeddings';

// All cognitive operations
export * from './operations';

// Memory reflection (meta-cognitive layer)
export * from './reflection';
