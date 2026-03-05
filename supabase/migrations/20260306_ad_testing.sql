-- Ad Testing & Optimization System Migration
-- Creates tables for autonomous UGC ad testing across TikTok and Meta

-- Ad test campaigns
CREATE TABLE IF NOT EXISTS ad_test_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'active', 'paused', 'completed', 'failed')),
  total_budget_daily NUMERIC NOT NULL,
  platform_split JSONB DEFAULT '{"tiktok": 50, "meta": 50}',
  winning_criteria JSONB DEFAULT '{"min_ctr": 1.5, "max_cpa": 50, "min_roas": 2.0, "min_impressions": 1000, "min_runtime_hours": 48}',
  targeting JSONB,
  product_info JSONB, -- {name, description, price, benefits, unique_selling_points}
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  auto_approve_creatives BOOLEAN DEFAULT FALSE,
  auto_scale_winners BOOLEAN DEFAULT TRUE,
  winner_scale_multiplier NUMERIC DEFAULT 2.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated ad creatives
CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES ad_test_campaigns(id) ON DELETE CASCADE NOT NULL,
  concept_id TEXT NOT NULL, -- Groups variations of the same concept
  variation_number INTEGER DEFAULT 1,
  creative_type TEXT CHECK (creative_type IN ('video_script', 'image_concept', 'carousel', 'ugc_script')),
  content JSONB NOT NULL, -- {hook, script, cta, visual_direction, duration, angle}
  format TEXT CHECK (format IN ('9:16', '1:1', '16:9', '4:5')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published', 'archived')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Published ads with external IDs
CREATE TABLE IF NOT EXISTS ad_publications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES ad_test_campaigns(id) ON DELETE CASCADE NOT NULL,
  creative_id UUID REFERENCES ad_creatives(id) ON DELETE CASCADE NOT NULL,
  platform TEXT CHECK (platform IN ('tiktok', 'meta')),
  external_campaign_id TEXT,
  external_adset_id TEXT,
  external_ad_id TEXT,
  daily_budget_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'creating', 'active', 'paused', 'failed')),
  error_message TEXT,
  published_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance snapshots (collected every 4 hours)
CREATE TABLE IF NOT EXISTS ad_performance_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  publication_id UUID REFERENCES ad_publications(id) ON DELETE CASCADE NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend_cents INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  video_views_p25 INTEGER DEFAULT 0,
  video_views_p50 INTEGER DEFAULT 0,
  video_views_p75 INTEGER DEFAULT 0,
  video_views_p100 INTEGER DEFAULT 0
);

-- Declared winners
CREATE TABLE IF NOT EXISTS ad_test_winners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES ad_test_campaigns(id) ON DELETE CASCADE NOT NULL,
  publication_id UUID REFERENCES ad_publications(id) ON DELETE CASCADE NOT NULL,
  creative_id UUID REFERENCES ad_creatives(id) ON DELETE CASCADE NOT NULL,
  declared_at TIMESTAMPTZ DEFAULT NOW(),
  winning_metrics JSONB NOT NULL, -- {ctr, cpa, roas, impressions, clicks, conversions}
  statistical_significance NUMERIC, -- p-value
  comparison_group_size INTEGER, -- Number of other variants compared
  budget_before_scaling INTEGER,
  budget_after_scaling INTEGER,
  notified BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMPTZ,
  notification_channels JSONB DEFAULT '[]' -- ['email', 'slack', 'whatsapp']
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ad_test_campaigns_company ON ad_test_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_ad_test_campaigns_status ON ad_test_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON ad_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_status ON ad_creatives(status);
CREATE INDEX IF NOT EXISTS idx_ad_publications_campaign ON ad_publications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_publications_status ON ad_publications(status);
CREATE INDEX IF NOT EXISTS idx_ad_performance_publication ON ad_performance_snapshots(publication_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_time ON ad_performance_snapshots(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_winners_campaign ON ad_test_winners(campaign_id);

-- RLS Policies
ALTER TABLE ad_test_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_test_winners ENABLE ROW LEVEL SECURITY;

-- Companies-based access policies
CREATE POLICY "Users can manage their ad campaigns" ON ad_test_campaigns
  FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage their ad creatives" ON ad_creatives
  FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage their ad publications" ON ad_publications
  FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can view their ad performance" ON ad_performance_snapshots
  FOR ALL USING (
    publication_id IN (
      SELECT id FROM ad_publications WHERE company_id IN (
        SELECT id FROM companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can view their ad winners" ON ad_test_winners
  FOR ALL USING (
    campaign_id IN (
      SELECT id FROM ad_test_campaigns WHERE company_id IN (
        SELECT id FROM companies WHERE user_id = auth.uid()
      )
    )
  );

-- Service role bypass for cron jobs
CREATE POLICY "Service role full access to ad_test_campaigns" ON ad_test_campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to ad_creatives" ON ad_creatives
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to ad_publications" ON ad_publications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to ad_performance_snapshots" ON ad_performance_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to ad_test_winners" ON ad_test_winners
  FOR ALL TO service_role USING (true) WITH CHECK (true);
