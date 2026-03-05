/**
 * Type definitions for the Ad Testing & Optimization System
 */

export type AdPlatform = 'tiktok' | 'meta';
export type CampaignStatus = 'draft' | 'generating' | 'active' | 'paused' | 'completed' | 'failed';
export type CreativeType = 'video_script' | 'image_concept' | 'carousel' | 'ugc_script';
export type CreativeFormat = '9:16' | '1:1' | '16:9' | '4:5';
export type CreativeStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'archived';
export type PublicationStatus = 'pending' | 'creating' | 'active' | 'paused' | 'failed';

export interface PlatformSplit {
  tiktok: number;
  meta: number;
}

export interface WinningCriteria {
  min_ctr: number;
  max_cpa: number;
  min_roas: number;
  min_impressions: number;
  min_runtime_hours: number;
}

export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: ('male' | 'female' | 'all')[];
  locations?: string[];
  interests?: string[];
  behaviors?: string[];
  custom_audiences?: string[];
  lookalike_audiences?: string[];
  excluded_audiences?: string[];
  languages?: string[];
  placements?: string[];
}

export interface ProductInfo {
  name: string;
  description: string;
  price: string;
  benefits: string[];
  unique_selling_points: string[];
  target_audience: string;
  brand_voice: string;
}

export interface AdTestCampaign {
  id: string;
  companyId: string;
  name: string;
  status: CampaignStatus;
  totalBudgetDaily: number;
  platformSplit: PlatformSplit;
  winningCriteria: WinningCriteria;
  targeting: Targeting | null;
  productInfo: ProductInfo | null;
  startDate: string | null;
  endDate: string | null;
  autoApproveCreatives: boolean;
  autoScaleWinners: boolean;
  winnerScaleMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeContent {
  hook: string;
  script: string;
  cta: string;
  visual_direction: string;
  duration: '15' | '30' | '60';
  angle: string;
  tone?: string;
  music_suggestion?: string;
}

export interface AdCreative {
  id: string;
  companyId: string;
  campaignId: string;
  conceptId: string;
  variationNumber: number;
  creativeType: CreativeType;
  content: CreativeContent;
  format: CreativeFormat;
  status: CreativeStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdPublication {
  id: string;
  companyId: string;
  campaignId: string;
  creativeId: string;
  platform: AdPlatform;
  externalCampaignId: string | null;
  externalAdsetId: string | null;
  externalAdId: string | null;
  dailyBudgetCents: number;
  status: PublicationStatus;
  errorMessage: string | null;
  publishedAt: string | null;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceSnapshot {
  id: string;
  publicationId: string;
  snapshotAt: string;
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
  revenueCents: number;
  reach: number;
  videoViews: number;
  videoViewsP25: number;
  videoViewsP50: number;
  videoViewsP75: number;
  videoViewsP100: number;
}

export interface WinningMetrics {
  ctr: number;
  cpa: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
}

export interface AdTestWinner {
  id: string;
  campaignId: string;
  publicationId: string;
  creativeId: string;
  declaredAt: string;
  winningMetrics: WinningMetrics;
  statisticalSignificance: number;
  comparisonGroupSize: number;
  budgetBeforeScaling: number;
  budgetAfterScaling: number;
  notified: boolean;
  notifiedAt: string | null;
  notificationChannels: string[];
}

export interface AggregatedPerformance {
  publicationId: string;
  creativeId: string;
  platform: AdPlatform;
  totalImpressions: number;
  totalClicks: number;
  totalSpendCents: number;
  totalConversions: number;
  totalRevenueCents: number;
  ctr: number;
  cpa: number;
  roas: number;
  runtimeHours: number;
  snapshotCount: number;
}

export interface WinnerAnalysisResult {
  hasWinner: boolean;
  winner: AggregatedPerformance | null;
  allPerformance: AggregatedPerformance[];
  statisticalSignificance: number;
  message: string;
}

export interface BudgetAllocation {
  platform: AdPlatform;
  creativeId: string;
  budgetCents: number;
}

export interface AdConceptGenerationRequest {
  productInfo: ProductInfo;
  targeting?: Targeting;
  conceptCount: number;
  variationsPerConcept: number;
  formats: CreativeFormat[];
  durations: ('15' | '30' | '60')[];
}

export interface GeneratedAdConcept {
  conceptId: string;
  hook: string;
  script: string;
  cta: string;
  visualDirection: string;
  duration: '15' | '30' | '60';
  angle: string;
  tone: string;
  musicSuggestion?: string;
  variations: AdVariation[];
}

export interface AdVariation {
  type: 'hook' | 'cta' | 'angle';
  original: string;
  variation: string;
}

// Database row types for mapping
export interface AdTestCampaignRow {
  id: string;
  company_id: string;
  name: string;
  status: CampaignStatus;
  total_budget_daily: number;
  platform_split: PlatformSplit;
  winning_criteria: WinningCriteria;
  targeting: Targeting | null;
  product_info: ProductInfo | null;
  start_date: string | null;
  end_date: string | null;
  auto_approve_creatives: boolean;
  auto_scale_winners: boolean;
  winner_scale_multiplier: number;
  created_at: string;
  updated_at: string;
}

export interface AdCreativeRow {
  id: string;
  company_id: string;
  campaign_id: string;
  concept_id: string;
  variation_number: number;
  creative_type: CreativeType;
  content: CreativeContent;
  format: CreativeFormat;
  status: CreativeStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdPublicationRow {
  id: string;
  company_id: string;
  campaign_id: string;
  creative_id: string;
  platform: AdPlatform;
  external_campaign_id: string | null;
  external_adset_id: string | null;
  external_ad_id: string | null;
  daily_budget_cents: number;
  status: PublicationStatus;
  error_message: string | null;
  published_at: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceSnapshotRow {
  id: string;
  publication_id: string;
  snapshot_at: string;
  impressions: number;
  clicks: number;
  spend_cents: number;
  conversions: number;
  revenue_cents: number;
  reach: number;
  video_views: number;
  video_views_p25: number;
  video_views_p50: number;
  video_views_p75: number;
  video_views_p100: number;
}

export interface AdTestWinnerRow {
  id: string;
  campaign_id: string;
  publication_id: string;
  creative_id: string;
  declared_at: string;
  winning_metrics: WinningMetrics;
  statistical_significance: number;
  comparison_group_size: number;
  budget_before_scaling: number;
  budget_after_scaling: number;
  notified: boolean;
  notified_at: string | null;
  notification_channels: string[];
}

// Row to model mappers
export function mapCampaignRowToModel(row: AdTestCampaignRow): AdTestCampaign {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    status: row.status,
    totalBudgetDaily: Number(row.total_budget_daily),
    platformSplit: row.platform_split,
    winningCriteria: row.winning_criteria,
    targeting: row.targeting,
    productInfo: row.product_info,
    startDate: row.start_date,
    endDate: row.end_date,
    autoApproveCreatives: row.auto_approve_creatives,
    autoScaleWinners: row.auto_scale_winners,
    winnerScaleMultiplier: Number(row.winner_scale_multiplier),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCreativeRowToModel(row: AdCreativeRow): AdCreative {
  return {
    id: row.id,
    companyId: row.company_id,
    campaignId: row.campaign_id,
    conceptId: row.concept_id,
    variationNumber: row.variation_number,
    creativeType: row.creative_type,
    content: row.content,
    format: row.format,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPublicationRowToModel(row: AdPublicationRow): AdPublication {
  return {
    id: row.id,
    companyId: row.company_id,
    campaignId: row.campaign_id,
    creativeId: row.creative_id,
    platform: row.platform,
    externalCampaignId: row.external_campaign_id,
    externalAdsetId: row.external_adset_id,
    externalAdId: row.external_ad_id,
    dailyBudgetCents: row.daily_budget_cents,
    status: row.status,
    errorMessage: row.error_message,
    publishedAt: row.published_at,
    pausedAt: row.paused_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSnapshotRowToModel(row: PerformanceSnapshotRow): PerformanceSnapshot {
  return {
    id: row.id,
    publicationId: row.publication_id,
    snapshotAt: row.snapshot_at,
    impressions: row.impressions,
    clicks: row.clicks,
    spendCents: row.spend_cents,
    conversions: row.conversions,
    revenueCents: row.revenue_cents,
    reach: row.reach,
    videoViews: row.video_views,
    videoViewsP25: row.video_views_p25,
    videoViewsP50: row.video_views_p50,
    videoViewsP75: row.video_views_p75,
    videoViewsP100: row.video_views_p100,
  };
}

export function mapWinnerRowToModel(row: AdTestWinnerRow): AdTestWinner {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    publicationId: row.publication_id,
    creativeId: row.creative_id,
    declaredAt: row.declared_at,
    winningMetrics: row.winning_metrics,
    statisticalSignificance: Number(row.statistical_significance),
    comparisonGroupSize: row.comparison_group_size,
    budgetBeforeScaling: row.budget_before_scaling,
    budgetAfterScaling: row.budget_after_scaling,
    notified: row.notified,
    notifiedAt: row.notified_at,
    notificationChannels: row.notification_channels,
  };
}
