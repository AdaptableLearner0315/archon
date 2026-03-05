/**
 * Ad Testing Module Exports
 */

// Types
export * from './types';

// Creative Generator
export {
  generateAdConcepts,
  generateVariations,
  saveConceptsToDatabase,
  getPendingCreatives,
  approveCreatives,
  rejectCreatives,
  autoApproveAllCreatives,
  type GenerateConceptsOptions,
  type GenerationResult,
} from './creative-generator';

// Campaign Manager
export {
  createTestCampaign,
  getCampaign,
  getCampaigns,
  updateCampaignStatus,
  updateCampaign,
  deleteCampaign,
  calculateBudgetAllocation,
  getApprovedCreatives,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  completeCampaign,
  failCampaign,
  getCampaignSummary,
  type CreateCampaignConfig,
} from './campaign-manager';

// Publisher
export {
  publishCreative,
  publishAllCreatives,
  getCampaignPublications,
  updatePublicationStatus,
  pausePublication,
  activatePublication,
  scalePublicationBudget,
} from './publisher';

// Performance Collector
export {
  collectPublicationPerformance,
  collectCampaignPerformance,
  collectAllPerformance,
  getPublicationSnapshots,
  getCampaignLatestSnapshots,
  getAggregatedPerformance,
} from './performance-collector';

// Winner Detector
export {
  calculateStatisticalSignificance,
  analyzePerformance,
  declareWinner,
  scaleWinnerAndPauseLosers,
  detectAndProcessWinner,
  getCompanyWinners,
  getCampaignWinner,
} from './winner-detector';

// Notifications
export {
  notifyWinnerFound,
  getUnnotifiedWinners,
} from './notifications';
