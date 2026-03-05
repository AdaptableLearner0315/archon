-- Infrastructure Assets Tables
-- Generated infrastructure components for each company

-- Infrastructure assets table
CREATE TABLE IF NOT EXISTS infrastructure_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('landing', 'server', 'database', 'email', 'social', 'faqs')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  content JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strategic documents table (competitor analysis, growth experiments)
CREATE TABLE IF NOT EXISTS strategic_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('competitor_analysis', 'growth_experiments', 'positioning', 'roadmap')),
  content JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Infrastructure generation job tracking
CREATE TABLE IF NOT EXISTS infrastructure_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_infrastructure_assets_company ON infrastructure_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_infrastructure_assets_type ON infrastructure_assets(company_id, type);
CREATE INDEX IF NOT EXISTS idx_strategic_documents_company ON strategic_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_infrastructure_jobs_company ON infrastructure_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_infrastructure_jobs_status ON infrastructure_jobs(status);

-- RLS Policies for infrastructure_assets
ALTER TABLE infrastructure_assets ENABLE ROW LEVEL SECURITY;

-- Users can view their own company's assets
CREATE POLICY "Users can view own infrastructure assets"
  ON infrastructure_assets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Users can insert their own company's assets
CREATE POLICY "Users can insert own infrastructure assets"
  ON infrastructure_assets
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Users can update their own company's assets
CREATE POLICY "Users can update own infrastructure assets"
  ON infrastructure_assets
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for strategic_documents
ALTER TABLE strategic_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own strategic documents"
  ON strategic_documents
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own strategic documents"
  ON strategic_documents
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own strategic documents"
  ON strategic_documents
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for infrastructure_jobs
ALTER TABLE infrastructure_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own infrastructure jobs"
  ON infrastructure_jobs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own infrastructure jobs"
  ON infrastructure_jobs
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own infrastructure jobs"
  ON infrastructure_jobs
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_infrastructure_assets_updated_at ON infrastructure_assets;
CREATE TRIGGER update_infrastructure_assets_updated_at
  BEFORE UPDATE ON infrastructure_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_strategic_documents_updated_at ON strategic_documents;
CREATE TRIGGER update_strategic_documents_updated_at
  BEFORE UPDATE ON strategic_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
