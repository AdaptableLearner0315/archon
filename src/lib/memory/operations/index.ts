/**
 * Cognitive Memory Operations
 *
 * Advanced operations for the memory system:
 * - semantic-recall: pgvector-powered similarity search
 * - decay: Automatic importance degradation
 * - associate: Memory linking and relationships
 * - contradiction: Conflict detection and resolution
 * - attention: Smart context pruning for agents
 * - inference: Cross-domain insight generation
 */

// Semantic search
export { semanticRecall } from './semantic-recall';

// Memory decay
export {
  calculateEffectiveImportance,
  applyDecay,
  getDecayedMemories,
  refreshMemory,
} from './decay';

// Memory associations
export {
  createAssociation,
  getAssociations,
  autoAssociate,
  getContradictions,
  updateAssociationStrength,
  removeAssociation,
  getAssociationGraph,
} from './associate';

// Contradiction detection
export {
  detectContradictionsForMemory,
  scanForContradictions,
  resolveContradiction,
} from './contradiction';

// Attention mechanism
export {
  attendToMemories,
  attendForTeam,
  calculateAttentionScores,
} from './attention';

// Cross-domain inference
export {
  generateCrossDomainInsights,
  generateTriggeredInsights,
} from './inference';
