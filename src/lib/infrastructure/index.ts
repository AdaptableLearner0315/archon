/**
 * Infrastructure Generation System
 *
 * Exports for the infrastructure generation module.
 */

// Types
export * from './types';

// Main orchestrator
export {
  generateInfrastructure,
  getInfrastructureStatus,
  regenerateInfrastructureAsset,
  extractInfrastructureContext,
} from './generator';

// Individual generators (for direct use if needed)
export { generateLandingPage } from './generators/landing';
export { generateServerConfig } from './generators/server';
export { generateDatabaseSchema } from './generators/database';
export { generateEmailTemplates } from './generators/email';
export { generateSocialContent } from './generators/social';
export { generateFAQContent } from './generators/faqs';
export { generateCompetitorAnalysis, generateGrowthExperiments } from './generators/strategic';

// Templates
export * from './templates/business-templates';
