-- Migration: Fix missing INSERT RLS policies for credits tables
-- Date: 2026-03-04
-- Issue: Onboarding fails with "Internal server error" because authenticated users
--        cannot INSERT into credit_balances and credit_transactions tables.

-- Add INSERT policy for credit_balances
-- (Allows users to insert credit balances for their own companies)
create policy if not exists "Insert own credit balance" on credit_balances
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));

-- Add INSERT policy for credit_transactions
-- (Allows users to insert credit transactions for their own companies)
create policy if not exists "Insert own credit transactions" on credit_transactions
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
