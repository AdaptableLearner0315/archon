/**
 * Ads Module Exports
 */

export {
  parseBudgetChangeMarkers,
  processBudgetChange,
  handleBudgetApprovalResponse,
  getBudgetHistory,
  getTotalDailySpend,
  type BudgetChangeRequest,
  type BudgetChangeResult,
  type AdPlatform,
} from './budget-manager';

export { encryptCredentials, decryptCredentials, validateEncryption } from './credentials';

export { GoogleAdsClient, createGoogleAdsClient } from './platforms/google';
export { MetaAdsClient, createMetaAdsClient } from './platforms/meta';
export { TikTokAdsClient, createTikTokAdsClient } from './platforms/tiktok-ads';

// Ad Testing Module
export * from './testing';
