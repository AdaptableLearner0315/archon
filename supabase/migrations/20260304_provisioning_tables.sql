-- Provisioning Infrastructure Tables
-- For OAuth-connected accounts, encrypted tokens, and provisioning jobs

-- Connected external accounts (Vercel, Twitter, YouTube, etc.)
CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL, -- 'vercel', 'twitter', 'youtube', 'linkedin', 'tiktok', 'supabase'
  provider_account_id TEXT,
  account_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  scopes TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, provider)
);

-- Encrypted OAuth tokens (separate table for security)
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connected_account_id UUID REFERENCES connected_accounts(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provisioning job tracking
CREATE TABLE IF NOT EXISTS provision_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'landing_deploy',
    'database_migrate',
    'email_setup',
    'social_post',
    'social_schedule',
    'ads_campaign'
  )),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step TEXT,
  result JSONB DEFAULT '{}',
  error TEXT,
  rollback_data JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled social media posts
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'linkedin', 'youtube', 'tiktok', 'instagram')),
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posting', 'posted', 'failed', 'cancelled')),
  external_post_id TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_connected_accounts_company ON connected_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider ON connected_accounts(company_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_account ON oauth_tokens(connected_account_id);
CREATE INDEX IF NOT EXISTS idx_provision_jobs_company ON provision_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_provision_jobs_status ON provision_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_company ON scheduled_posts(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled ON scheduled_posts(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_platform ON scheduled_posts(company_id, platform);

-- RLS Policies for connected_accounts
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connected accounts"
  ON connected_accounts
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own connected accounts"
  ON connected_accounts
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own connected accounts"
  ON connected_accounts
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own connected accounts"
  ON connected_accounts
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for oauth_tokens
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own oauth tokens"
  ON oauth_tokens
  FOR SELECT
  USING (
    connected_account_id IN (
      SELECT id FROM connected_accounts WHERE company_id IN (
        SELECT id FROM companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert own oauth tokens"
  ON oauth_tokens
  FOR INSERT
  WITH CHECK (
    connected_account_id IN (
      SELECT id FROM connected_accounts WHERE company_id IN (
        SELECT id FROM companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own oauth tokens"
  ON oauth_tokens
  FOR UPDATE
  USING (
    connected_account_id IN (
      SELECT id FROM connected_accounts WHERE company_id IN (
        SELECT id FROM companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete own oauth tokens"
  ON oauth_tokens
  FOR DELETE
  USING (
    connected_account_id IN (
      SELECT id FROM connected_accounts WHERE company_id IN (
        SELECT id FROM companies WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for provision_jobs
ALTER TABLE provision_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own provision jobs"
  ON provision_jobs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own provision jobs"
  ON provision_jobs
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own provision jobs"
  ON provision_jobs
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for scheduled_posts
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled posts"
  ON scheduled_posts
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own scheduled posts"
  ON scheduled_posts
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own scheduled posts"
  ON scheduled_posts
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own scheduled posts"
  ON scheduled_posts
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_connected_accounts_updated_at ON connected_accounts;
CREATE TRIGGER update_connected_accounts_updated_at
  BEFORE UPDATE ON connected_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_oauth_tokens_updated_at ON oauth_tokens;
CREATE TRIGGER update_oauth_tokens_updated_at
  BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduled_posts_updated_at ON scheduled_posts;
CREATE TRIGGER update_scheduled_posts_updated_at
  BEFORE UPDATE ON scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
