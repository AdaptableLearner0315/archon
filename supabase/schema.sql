-- Archon Database Schema
-- Run this in your Supabase SQL Editor

-- Companies table
create table if not exists companies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  slug text unique not null,
  description text not null default '',
  goal text not null default 'revenue' check (goal in ('revenue', 'users', 'launch', 'brand')),
  ad_budget text not null default '$0',
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'scale')),
  stripe_customer_id text,
  stripe_subscription_id text,
  is_public boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agent activities
create table if not exists agent_activities (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  agent_name text not null,
  action text not null,
  detail text not null default '',
  type text not null default 'action' check (type in ('action', 'insight', 'milestone', 'alert')),
  created_at timestamptz default now()
);

-- Metrics snapshots
create table if not exists metrics (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  revenue numeric default 0,
  users_count integer default 0,
  signups_today integer default 0,
  churn_rate numeric default 0,
  conversion_rate numeric default 0,
  nps_score numeric default 0,
  created_at timestamptz default now()
);

-- Command center messages
create table if not exists command_messages (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  role text not null check (role in ('user', 'agent')),
  agent_role text,
  agent_name text,
  content text not null,
  created_at timestamptz default now()
);

-- Weekly retrospectives
create table if not exists weekly_retros (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  summary text not null,
  top_insight text not null,
  agent_performance jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Agent configurations per company
create table if not exists agent_configs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  autonomy_level text not null default 'full-auto' check (autonomy_level in ('full-auto', 'approve-big', 'manual')),
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(company_id, agent_role)
);

-- RLS Policies
alter table companies enable row level security;
alter table agent_activities enable row level security;
alter table metrics enable row level security;
alter table command_messages enable row level security;
alter table weekly_retros enable row level security;
alter table agent_configs enable row level security;

-- Companies: users can only see their own
create policy "Users can view own companies" on companies
  for select using (auth.uid() = user_id);
create policy "Users can insert own companies" on companies
  for insert with check (auth.uid() = user_id);
create policy "Users can update own companies" on companies
  for update using (auth.uid() = user_id);

-- Public companies viewable by anyone
create policy "Public companies viewable" on companies
  for select using (is_public = true);

-- Activities: viewable by company owner
create policy "View own activities" on agent_activities
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own activities" on agent_activities
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));

-- Public activities
create policy "Public activities viewable" on agent_activities
  for select using (company_id in (select id from companies where is_public = true));

-- Metrics
create policy "View own metrics" on metrics
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own metrics" on metrics
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));

-- Public metrics
create policy "Public metrics viewable" on metrics
  for select using (company_id in (select id from companies where is_public = true));

-- Messages
create policy "View own messages" on command_messages
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own messages" on command_messages
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));

-- Retros
create policy "View own retros" on weekly_retros
  for select using (company_id in (select id from companies where user_id = auth.uid()));

-- Agent configs
create policy "View own configs" on agent_configs
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own configs" on agent_configs
  for update using (company_id in (select id from companies where user_id = auth.uid()));

-- Indexes
create index idx_activities_company on agent_activities(company_id, created_at desc);
create index idx_metrics_company on metrics(company_id, created_at desc);
create index idx_messages_company on command_messages(company_id, created_at desc);
create index idx_companies_slug on companies(slug);
create index idx_companies_user on companies(user_id);

-- ============================================================
-- Intelligence Layer Schema
-- ============================================================

-- Alter companies: add cycle scheduling
alter table companies add column if not exists cycle_schedule text not null default 'daily' check (cycle_schedule in ('manual', 'daily', 'weekly'));
alter table companies add column if not exists cycle_time_utc text not null default '02:00';

-- Alter agent_configs: add prompt/thinking config
alter table agent_configs add column if not exists custom_prompt_additions text;
alter table agent_configs add column if not exists max_tokens_per_call integer default 4096;
alter table agent_configs add column if not exists use_extended_thinking boolean default false;
alter table agent_configs add column if not exists thinking_budget integer default 2048;

-- Operating cycles
create table if not exists operating_cycles (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'planning', 'executing', 'completing', 'notifying', 'done', 'failed')),
  trigger text not null default 'manual' check (trigger in ('manual', 'scheduled', 'api')),
  plan jsonb,
  user_directive text,
  total_tokens_used integer default 0,
  total_cost_usd numeric default 0,
  started_at timestamptz default now(),
  completed_at timestamptz,
  error text,
  created_at timestamptz default now()
);

-- Cycle tasks
create table if not exists cycle_tasks (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  agent_name text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'needs_data', 'completed', 'failed', 'blocked')),
  result text,
  depends_on text[] default '{}',
  tokens_used integer default 0,
  cost_usd numeric default 0,
  needs_human_input boolean default false,
  human_input_question text,
  human_input_response text,
  human_input_responded_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz default now()
);

-- Agent messages (inter-agent communication)
create table if not exists agent_messages (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  from_role text not null,
  to_role text, -- null = broadcast
  type text not null default 'request' check (type in ('request', 'response', 'broadcast', 'delegation')),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  subject text not null,
  body text not null,
  payload jsonb,
  correlation_id uuid,
  created_at timestamptz default now()
);

-- Short-term memory (Tier 2)
create table if not exists agent_memory_short_term (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  topic text not null,
  content text not null,
  memory_type text not null default 'insight' check (memory_type in ('decision', 'insight', 'task_result', 'conversation_summary', 'error', 'delegation')),
  relevance_score numeric default 0.5,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz default now()
);

-- Long-term memory (Tier 3)
create table if not exists agent_memory_long_term (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  category text not null check (category in ('pattern', 'strategy', 'company_knowledge', 'agent_behavior', 'market_insight')),
  summary text not null,
  confidence numeric default 0.5,
  times_referenced integer default 0,
  last_referenced_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Agent performance tracking
create table if not exists agent_performance (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  agent_role text not null,
  tasks_completed integer default 0,
  tasks_failed integer default 0,
  avg_quality_score numeric default 0,
  total_tokens_used integer default 0,
  total_cost_usd numeric default 0,
  score numeric default 0,
  created_at timestamptz default now()
);

-- Prompt versions
create table if not exists prompt_versions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  version integer not null default 1,
  prompt_text text not null,
  is_active boolean default false,
  performance_before numeric,
  performance_after numeric,
  created_at timestamptz default now(),
  unique(company_id, agent_role, version)
);

-- Notification preferences
create table if not exists notification_preferences (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  email_enabled boolean default true,
  email_address text,
  whatsapp_enabled boolean default false,
  whatsapp_number text,
  digest_format text default 'detailed' check (digest_format in ('brief', 'detailed')),
  digest_frequency text not null default 'hourly' check (digest_frequency in ('hourly', '6h', 'daily', 'weekly')),
  slack_enabled boolean default false,
  slack_webhook_url text,
  webapp_enabled boolean default true,
  last_digest_sent_at timestamptz,
  created_at timestamptz default now(),
  unique(company_id)
);

-- RLS for new tables
alter table operating_cycles enable row level security;
alter table cycle_tasks enable row level security;
alter table agent_messages enable row level security;
alter table agent_memory_short_term enable row level security;
alter table agent_memory_long_term enable row level security;
alter table agent_performance enable row level security;
alter table prompt_versions enable row level security;
alter table notification_preferences enable row level security;

-- Operating cycles policies
create policy "View own cycles" on operating_cycles
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own cycles" on operating_cycles
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own cycles" on operating_cycles
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass cycles" on operating_cycles
  for all using (auth.role() = 'service_role');

-- Cycle tasks policies
create policy "View own cycle tasks" on cycle_tasks
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own cycle tasks" on cycle_tasks
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own cycle tasks" on cycle_tasks
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass cycle tasks" on cycle_tasks
  for all using (auth.role() = 'service_role');

-- Agent messages policies
create policy "View own agent messages" on agent_messages
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own agent messages" on agent_messages
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass agent messages" on agent_messages
  for all using (auth.role() = 'service_role');

-- Short-term memory policies
create policy "View own short term memory" on agent_memory_short_term
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own short term memory" on agent_memory_short_term
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Delete own short term memory" on agent_memory_short_term
  for delete using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass short term memory" on agent_memory_short_term
  for all using (auth.role() = 'service_role');

-- Long-term memory policies
create policy "View own long term memory" on agent_memory_long_term
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own long term memory" on agent_memory_long_term
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own long term memory" on agent_memory_long_term
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Delete own long term memory" on agent_memory_long_term
  for delete using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass long term memory" on agent_memory_long_term
  for all using (auth.role() = 'service_role');

-- Agent performance policies
create policy "View own performance" on agent_performance
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own performance" on agent_performance
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass performance" on agent_performance
  for all using (auth.role() = 'service_role');

-- Prompt versions policies
create policy "View own prompts" on prompt_versions
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own prompts" on prompt_versions
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own prompts" on prompt_versions
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass prompts" on prompt_versions
  for all using (auth.role() = 'service_role');

-- Notification preferences policies
create policy "View own notification prefs" on notification_preferences
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Upsert own notification prefs" on notification_preferences
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own notification prefs" on notification_preferences
  for update using (company_id in (select id from companies where user_id = auth.uid()));

-- In-app notifications
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  type text not null check (type in ('digest', 'nudge', 'artifact', 'milestone')),
  title text not null,
  body text not null,
  action_url text,
  task_id uuid references cycle_tasks(id),
  read boolean default false,
  created_at timestamptz default now()
);

-- Proof of work artifacts
create table if not exists artifacts (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id),
  task_id uuid references cycle_tasks(id),
  agent_role text not null,
  agent_name text not null,
  title text not null,
  type text not null check (type in ('report', 'code', 'strategy', 'content', 'analysis', 'email_draft', 'other')),
  content text not null,
  preview text not null default '',
  created_at timestamptz default now()
);

-- RLS for notifications + artifacts
alter table notifications enable row level security;
alter table artifacts enable row level security;

create policy "View own notifications" on notifications
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own notifications" on notifications
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass notifications" on notifications
  for all using (auth.role() = 'service_role');

create policy "View own artifacts" on artifacts
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass artifacts" on artifacts
  for all using (auth.role() = 'service_role');

-- Public artifacts viewable
create policy "Public artifacts viewable" on artifacts
  for select using (company_id in (select id from companies where is_public = true));

-- Indexes for new tables
create index idx_cycles_company on operating_cycles(company_id, created_at desc);
create index idx_cycles_status on operating_cycles(company_id, status);
create index idx_cycle_tasks_cycle on cycle_tasks(cycle_id, status);
create index idx_cycle_tasks_company on cycle_tasks(company_id, agent_role, created_at desc);
create index idx_cycle_tasks_human_input on cycle_tasks(company_id, needs_human_input) where needs_human_input = true;
create index idx_agent_messages_cycle on agent_messages(cycle_id, created_at);
create index idx_agent_messages_to on agent_messages(company_id, to_role, created_at desc);
create index idx_agent_messages_correlation on agent_messages(correlation_id);
create index idx_stm_agent on agent_memory_short_term(company_id, agent_role, created_at desc);
create index idx_stm_topic on agent_memory_short_term(company_id, topic);
create index idx_stm_expires on agent_memory_short_term(expires_at);
create index idx_ltm_agent on agent_memory_long_term(company_id, agent_role, category);
create index idx_ltm_referenced on agent_memory_long_term(company_id, last_referenced_at desc);
create index idx_performance_agent on agent_performance(company_id, agent_role, created_at desc);
create index idx_performance_cycle on agent_performance(cycle_id);
create index idx_prompt_versions_active on prompt_versions(company_id, agent_role, is_active);
create index idx_notifications_company on notifications(company_id, created_at desc);
create index idx_notifications_unread on notifications(company_id, read) where read = false;
create index idx_artifacts_company on artifacts(company_id, created_at desc);
create index idx_artifacts_cycle on artifacts(cycle_id);

-- ============================================================
-- SEO + Ads Module Schema (v2.1)
-- ============================================================

-- Add SEO/Ads columns to companies
alter table companies add column if not exists website_url text;
alter table companies add column if not exists daily_ad_budget numeric default 0;
alter table companies add column if not exists seo_enabled boolean default false;
alter table companies add column if not exists ads_enabled boolean default false;

-- SEO Audits table
create table if not exists seo_audits (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id),
  url text not null,
  audit_type text not null check (audit_type in ('technical', 'on_page', 'keywords')),
  results jsonb not null,
  score numeric,
  created_at timestamptz default now()
);

-- Ad Platform Credentials (encrypted)
create table if not exists ad_platform_credentials (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  platform text not null check (platform in ('google', 'meta', 'tiktok', 'linkedin')),
  credentials_encrypted text not null,
  account_id text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(company_id, platform)
);

-- Budget Changes Log
create table if not exists budget_changes (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  platform text not null,
  campaign_id text not null,
  previous_budget numeric not null,
  new_budget numeric not null,
  change_percent numeric not null,
  auto_approved boolean not null,
  approved_by text,
  reason text,
  created_at timestamptz default now()
);

-- RLS for SEO + Ads tables
alter table seo_audits enable row level security;
alter table ad_platform_credentials enable row level security;
alter table budget_changes enable row level security;

create policy "View own seo audits" on seo_audits
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass seo audits" on seo_audits
  for all using (auth.role() = 'service_role');

create policy "View own ad credentials" on ad_platform_credentials
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own ad credentials" on ad_platform_credentials
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own ad credentials" on ad_platform_credentials
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Delete own ad credentials" on ad_platform_credentials
  for delete using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass ad credentials" on ad_platform_credentials
  for all using (auth.role() = 'service_role');

create policy "View own budget changes" on budget_changes
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass budget changes" on budget_changes
  for all using (auth.role() = 'service_role');

-- Indexes for SEO + Ads tables
create index idx_seo_audits_company on seo_audits(company_id, created_at desc);
create index idx_seo_audits_url on seo_audits(company_id, url);
create index idx_ad_credentials_company on ad_platform_credentials(company_id, platform);
create index idx_budget_changes_company on budget_changes(company_id, created_at desc);

-- ============================================================
-- Credits System Schema (v3.0)
-- ============================================================

-- Credit balances per company
create table if not exists credit_balances (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null unique,
  balance integer not null default 0,
  lifetime_purchased integer default 0,
  lifetime_used integer default 0,
  lifetime_bonus integer default 0,
  updated_at timestamptz default now()
);

-- Credit transaction log
create table if not exists credit_transactions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  type text not null check (type in ('purchase', 'bonus', 'task_usage', 'refund', 'trial')),
  amount integer not null,
  balance_after integer not null,
  task_id uuid references cycle_tasks(id),
  agent_role text,
  description text,
  stripe_payment_id text,
  created_at timestamptz default now()
);

-- Agent credit costs configuration
create table if not exists agent_credit_costs (
  agent_role text primary key,
  base_cost integer not null,
  knowledge_multiplier numeric default 1.5,
  execution_multiplier numeric default 2.0
);

-- Seed default agent costs
insert into agent_credit_costs (agent_role, base_cost, knowledge_multiplier, execution_multiplier) values
  ('ceo', 15, 1.5, 2.0),
  ('engineer', 12, 1.2, 2.5),
  ('data_analyst', 10, 2.0, 1.0),
  ('growth', 8, 1.5, 2.0),
  ('marketing', 6, 1.2, 1.5),
  ('sales', 6, 1.0, 2.0),
  ('product', 8, 1.5, 1.5),
  ('operations', 6, 1.2, 1.5),
  ('support', 5, 1.0, 1.5),
  ('customer_success', 6, 1.2, 1.5),
  ('seo', 12, 1.5, 1.0),
  ('ads', 15, 1.2, 3.0)
on conflict (agent_role) do nothing;

-- Credit packages (for reference / Stripe sync)
create table if not exists credit_packages (
  id text primary key,
  name text not null,
  credits integer not null,
  bonus_credits integer default 0,
  price_cents integer not null,
  stripe_price_id text,
  is_active boolean default true
);

-- Seed default packages
insert into credit_packages (id, name, credits, bonus_credits, price_cents) values
  ('starter', 'Starter', 100, 0, 900),
  ('growth', 'Growth', 500, 50, 3900),
  ('scale', 'Scale', 2000, 300, 12900),
  ('enterprise', 'Enterprise', 10000, 2000, 49900)
on conflict (id) do nothing;

-- Onboarding profiles (extracted from conversation)
create table if not exists onboarding_profiles (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null unique,
  business_idea text,
  business_idea_summary text,
  target_audience jsonb,
  competitors jsonb,
  unique_value_prop text,
  stage text check (stage in ('idea', 'mvp', 'launched', 'revenue')),
  team_size integer default 1,
  founder_skills text[],
  hours_per_week integer,
  risk_tolerance text check (risk_tolerance in ('low', 'medium', 'high')),
  working_style text check (working_style in ('move-fast', 'balanced', 'methodical')),
  recommended_credits integer,
  conversation_log jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for credits tables
alter table credit_balances enable row level security;
alter table credit_transactions enable row level security;
alter table agent_credit_costs enable row level security;
alter table credit_packages enable row level security;
alter table onboarding_profiles enable row level security;

-- Credit balances policies
create policy "View own credit balance" on credit_balances
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own credit balance" on credit_balances
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass credit balances" on credit_balances
  for all using (auth.role() = 'service_role');

-- Credit transactions policies
create policy "View own credit transactions" on credit_transactions
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own credit transactions" on credit_transactions
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass credit transactions" on credit_transactions
  for all using (auth.role() = 'service_role');

-- Agent credit costs - readable by all authenticated
create policy "View agent costs" on agent_credit_costs
  for select using (true);

-- Credit packages - readable by all
create policy "View credit packages" on credit_packages
  for select using (true);

-- Onboarding profiles policies
create policy "View own onboarding profile" on onboarding_profiles
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own onboarding profile" on onboarding_profiles
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own onboarding profile" on onboarding_profiles
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass onboarding profiles" on onboarding_profiles
  for all using (auth.role() = 'service_role');

-- Indexes for credits tables
create index idx_credit_balances_company on credit_balances(company_id);
create index idx_credit_transactions_company on credit_transactions(company_id, created_at desc);
create index idx_credit_transactions_type on credit_transactions(company_id, type);
create index idx_onboarding_profiles_company on onboarding_profiles(company_id);

-- ============================================================
-- Reflection Agent Schema (v4.0)
-- ============================================================

-- Agent reflections - stores weekly/daily reflection outputs
create table if not exists agent_reflections (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  period text not null check (period in ('daily', 'weekly')),
  summary jsonb not null,
  recommendations jsonb not null,
  health_score integer check (health_score >= 0 and health_score <= 100),
  created_at timestamptz default now()
);

-- Reflection triggers - tracks when users execute recommendations
create table if not exists reflection_triggers (
  id uuid default gen_random_uuid() primary key,
  reflection_id uuid references agent_reflections(id) on delete cascade not null,
  recommendation_id text not null,
  triggered_at timestamptz default now(),
  triggered_via text not null check (triggered_via in ('slack', 'email', 'voice', 'webapp', 'sms')),
  cycle_id uuid references operating_cycles(id),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed'))
);

-- RLS for reflection tables
alter table agent_reflections enable row level security;
alter table reflection_triggers enable row level security;

-- Reflections policies
create policy "View own reflections" on agent_reflections
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own reflections" on agent_reflections
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass reflections" on agent_reflections
  for all using (auth.role() = 'service_role');

-- Reflection triggers policies
create policy "View own reflection triggers" on reflection_triggers
  for select using (reflection_id in (
    select id from agent_reflections where company_id in (
      select id from companies where user_id = auth.uid()
    )
  ));
create policy "Insert own reflection triggers" on reflection_triggers
  for insert with check (reflection_id in (
    select id from agent_reflections where company_id in (
      select id from companies where user_id = auth.uid()
    )
  ));
create policy "Update own reflection triggers" on reflection_triggers
  for update using (reflection_id in (
    select id from agent_reflections where company_id in (
      select id from companies where user_id = auth.uid()
    )
  ));
create policy "Service role bypass reflection triggers" on reflection_triggers
  for all using (auth.role() = 'service_role');

-- Indexes for reflection tables
create index idx_reflections_company on agent_reflections(company_id, created_at desc);
create index idx_reflections_period on agent_reflections(company_id, period);
create index idx_reflection_triggers_reflection on reflection_triggers(reflection_id);
create index idx_reflection_triggers_status on reflection_triggers(status) where status in ('pending', 'running');

-- ============================================================
-- Agent Reflection & Alignment System Schema (v5.0)
-- ============================================================

-- Reasoning Audits - stores task-level reasoning evaluations
create table if not exists reasoning_audits (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references cycle_tasks(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  decision_summary text not null,
  rationale jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  alternatives_considered jsonb not null default '[]'::jsonb,
  risks_identified jsonb not null default '[]'::jsonb,
  confidence_score integer check (confidence_score >= 0 and confidence_score <= 100),
  invalidation_triggers jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Agent Goals - registered at cycle start
create table if not exists agent_goals (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  goal text not null,
  metrics jsonb not null default '[]'::jsonb,
  planned_actions jsonb not null default '[]'::jsonb,
  resources_needed jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  unique(cycle_id, agent_role)
);

-- Alignment Conflicts - detected before cycle execution
create table if not exists alignment_conflicts (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  agent_a text not null,
  agent_b text not null,
  conflict_type text not null check (conflict_type in ('resource', 'goal', 'priority', 'timing')),
  description text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  resolution text,
  resolved_by text check (resolved_by in ('atlas', 'human')),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- Alignment Reports - per-cycle alignment assessment
create table if not exists alignment_reports (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null unique,
  company_id uuid references companies(id) on delete cascade not null,
  overall_score integer check (overall_score >= 0 and overall_score <= 100),
  agent_alignment jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Cycle Summaries - structured summary after each cycle
create table if not exists cycle_summaries (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null unique,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_number integer not null,
  duration_planned integer, -- minutes
  duration_actual integer, -- minutes
  headline text not null,
  completed jsonb not null default '[]'::jsonb,
  in_progress jsonb not null default '[]'::jsonb,
  metrics_impact jsonb not null default '[]'::jsonb,
  alignment_score integer,
  ceo_comment text,
  next_priority text,
  created_at timestamptz default now()
);

-- Weekly Reflection Summaries - comprehensive weekly analysis
create table if not exists weekly_reflection_summaries (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  week_of date not null,
  cycles_completed integer not null default 0,
  wins jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  agent_rankings jsonb not null default '[]'::jsonb,
  lessons_learned jsonb not null default '[]'::jsonb,
  alignment_trend jsonb,
  ceo_assessment jsonb,
  human_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  unique(company_id, week_of)
);

-- Agent Lessons - validated learnings that evolve prompts
create table if not exists agent_lessons (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  lesson text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'validating', 'active', 'deprecated')),
  prompt_addition text not null,
  impact_before numeric,
  impact_after numeric,
  required_cycles integer not null default 5,
  validation_cycles integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User Journey Reviews - bi-weekly user experience analysis
create table if not exists user_journey_reviews (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  review_date date not null,
  agent_reflections jsonb not null default '[]'::jsonb,
  journey_stages jsonb not null default '[]'::jsonb,
  experience_score integer check (experience_score >= 0 and experience_score <= 100),
  created_at timestamptz default now()
);

-- Company maturity tracker (for adaptive validation thresholds)
alter table companies add column if not exists total_cycles_completed integer default 0;
alter table companies add column if not exists lesson_validation_threshold integer default 5;

-- RLS for new tables
alter table reasoning_audits enable row level security;
alter table agent_goals enable row level security;
alter table alignment_conflicts enable row level security;
alter table alignment_reports enable row level security;
alter table cycle_summaries enable row level security;
alter table weekly_reflection_summaries enable row level security;
alter table agent_lessons enable row level security;
alter table user_journey_reviews enable row level security;

-- Reasoning audits policies
create policy "View own reasoning audits" on reasoning_audits
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass reasoning audits" on reasoning_audits
  for all using (auth.role() = 'service_role');

-- Agent goals policies
create policy "View own agent goals" on agent_goals
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass agent goals" on agent_goals
  for all using (auth.role() = 'service_role');

-- Alignment conflicts policies
create policy "View own alignment conflicts" on alignment_conflicts
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass alignment conflicts" on alignment_conflicts
  for all using (auth.role() = 'service_role');

-- Alignment reports policies
create policy "View own alignment reports" on alignment_reports
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass alignment reports" on alignment_reports
  for all using (auth.role() = 'service_role');

-- Cycle summaries policies
create policy "View own cycle summaries" on cycle_summaries
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass cycle summaries" on cycle_summaries
  for all using (auth.role() = 'service_role');

-- Weekly reflection summaries policies
create policy "View own weekly reflection summaries" on weekly_reflection_summaries
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass weekly reflection summaries" on weekly_reflection_summaries
  for all using (auth.role() = 'service_role');

-- Agent lessons policies
create policy "View own agent lessons" on agent_lessons
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass agent lessons" on agent_lessons
  for all using (auth.role() = 'service_role');

-- User journey reviews policies
create policy "View own user journey reviews" on user_journey_reviews
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass user journey reviews" on user_journey_reviews
  for all using (auth.role() = 'service_role');

-- Indexes for new tables
create index idx_reasoning_audits_task on reasoning_audits(task_id);
create index idx_reasoning_audits_cycle on reasoning_audits(cycle_id);
create index idx_reasoning_audits_company on reasoning_audits(company_id, created_at desc);
create index idx_reasoning_audits_confidence on reasoning_audits(company_id, confidence_score);
create index idx_agent_goals_cycle on agent_goals(cycle_id);
create index idx_agent_goals_company on agent_goals(company_id, agent_role);
create index idx_alignment_conflicts_cycle on alignment_conflicts(cycle_id);
create index idx_alignment_conflicts_company on alignment_conflicts(company_id, created_at desc);
create index idx_alignment_conflicts_severity on alignment_conflicts(company_id, severity) where resolved_at is null;
create index idx_alignment_reports_cycle on alignment_reports(cycle_id);
create index idx_cycle_summaries_company on cycle_summaries(company_id, created_at desc);
create index idx_weekly_reflections_company on weekly_reflection_summaries(company_id, week_of desc);
create index idx_agent_lessons_company on agent_lessons(company_id, agent_role);
create index idx_agent_lessons_status on agent_lessons(company_id, status);
create index idx_user_journey_reviews_company on user_journey_reviews(company_id, review_date desc);

-- ============================================================
-- Team Tasks (4-Agent Parallel Execution)
-- ============================================================

CREATE TABLE IF NOT EXISTS team_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id UUID REFERENCES operating_cycles(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  agent_roles TEXT[] NOT NULL CHECK (array_length(agent_roles, 1) BETWEEN 2 AND 4),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'merging', 'completed', 'failed')),
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  merged_result TEXT,
  merge_strategy TEXT NOT NULL DEFAULT 'synthesize' CHECK (merge_strategy IN ('concatenate', 'synthesize', 'vote')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link individual tasks to their parent team task
ALTER TABLE cycle_tasks ADD COLUMN IF NOT EXISTS team_task_id UUID REFERENCES team_tasks(id);

-- Index for efficient team task lookups
CREATE INDEX IF NOT EXISTS idx_team_tasks_cycle ON team_tasks(cycle_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_company ON team_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_cycle_tasks_team ON cycle_tasks(team_task_id) WHERE team_task_id IS NOT NULL;

-- Team credit transactions tracking
CREATE TABLE IF NOT EXISTS team_credit_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_task_id UUID REFERENCES team_tasks(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  total_reserved INTEGER NOT NULL,
  agents_charged TEXT[] NOT NULL,
  refunded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for team tables
ALTER TABLE team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_credit_reservations ENABLE ROW LEVEL SECURITY;

-- Team tasks policies
CREATE POLICY "View own team tasks" ON team_tasks
  FOR SELECT USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Insert own team tasks" ON team_tasks
  FOR INSERT WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Update own team tasks" ON team_tasks
  FOR UPDATE USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Service role bypass team tasks" ON team_tasks
  FOR ALL USING (auth.role() = 'service_role');

-- Team credit reservations policies
CREATE POLICY "View own team credit reservations" ON team_credit_reservations
  FOR SELECT USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Service role bypass team credit reservations" ON team_credit_reservations
  FOR ALL USING (auth.role() = 'service_role');
