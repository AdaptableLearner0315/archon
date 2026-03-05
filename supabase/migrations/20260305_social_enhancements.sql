-- Social Media Posting Infrastructure Enhancements
-- Adds retry tracking and profile setup capabilities

-- Add retry tracking columns to scheduled_posts
ALTER TABLE scheduled_posts
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'single',
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'calendar';

-- Profile setup tracking for autonomous profile management
CREATE TABLE IF NOT EXISTS social_profile_setups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'linkedin')),
  setup_type TEXT NOT NULL CHECK (setup_type IN ('bio', 'pinned', 'header')),
  content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  external_id TEXT,
  error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, platform, setup_type)
);

-- Index for cron job efficiency - find due posts quickly
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
ON scheduled_posts(scheduled_for, status)
WHERE status = 'scheduled';

-- Index for retry processing
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_failed_retry
ON scheduled_posts(status, retry_count, max_retries)
WHERE status = 'failed';

-- Index for profile setups by company
CREATE INDEX IF NOT EXISTS idx_social_profile_setups_company
ON social_profile_setups(company_id);

-- RLS Policies for social_profile_setups
ALTER TABLE social_profile_setups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile setups"
  ON social_profile_setups
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own profile setups"
  ON social_profile_setups
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own profile setups"
  ON social_profile_setups
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own profile setups"
  ON social_profile_setups
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Updated_at trigger for social_profile_setups
DROP TRIGGER IF EXISTS update_social_profile_setups_updated_at ON social_profile_setups;
CREATE TRIGGER update_social_profile_setups_updated_at
  BEFORE UPDATE ON social_profile_setups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
