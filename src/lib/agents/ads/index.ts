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
