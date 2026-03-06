#!/usr/bin/env node
/**
 * Apply missing Supabase migrations
 *
 * Usage:
 *   node scripts/apply-migrations.mjs
 *
 * Requires DATABASE_URL in .env.local:
 *   DATABASE_URL=postgresql://postgres.yamubdjqueebbkcoxzwu:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
 *
 * Find your password in Supabase Dashboard > Project Settings > Database > Database password
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local manually (no dotenv dependency)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('\x1b[31mError: DATABASE_URL not found in .env.local\x1b[0m');
  console.log('\nAdd your Supabase connection string to .env.local:');
  console.log('\x1b[33mDATABASE_URL=postgresql://postgres.yamubdjqueebbkcoxzwu:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres\x1b[0m');
  console.log('\nFind your database password in:');
  console.log('Supabase Dashboard > Project Settings > Database > Database password');
  process.exit(1);
}

// Migration files to apply (in order)
const MIGRATIONS = [
  '20260304_infrastructure_assets.sql',
  '20260307_company_memories.sql',
  '20260308_cognitive_memory_advanced.sql',
];

async function runMigrations() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('\x1b[36mConnecting to Supabase database...\x1b[0m');
    await client.connect();
    console.log('\x1b[32m✓ Connected\x1b[0m\n');

    for (const migration of MIGRATIONS) {
      const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', migration);

      if (!fs.existsSync(migrationPath)) {
        console.log(`\x1b[33m⚠ Migration file not found: ${migration}\x1b[0m`);
        continue;
      }

      console.log(`\x1b[36mApplying: ${migration}...\x1b[0m`);

      const sql = fs.readFileSync(migrationPath, 'utf8');

      try {
        await client.query(sql);
        console.log(`\x1b[32m✓ Applied: ${migration}\x1b[0m\n`);
      } catch (err) {
        // Check if it's a "already exists" error (idempotent migrations)
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`\x1b[33m⚠ Skipped (already applied): ${migration}\x1b[0m\n`);
        } else {
          console.error(`\x1b[31m✗ Failed: ${migration}\x1b[0m`);
          console.error(`  Error: ${err.message}\n`);
          throw err;
        }
      }
    }

    console.log('\x1b[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    console.log('\x1b[32m✓ All migrations applied successfully!\x1b[0m');
    console.log('\x1b[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

    // Verify tables exist
    console.log('\x1b[36mVerifying tables...\x1b[0m');
    const verifyQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'infrastructure_assets',
          'infrastructure_jobs',
          'strategic_documents',
          'company_memories',
          'memory_associations',
          'memory_usage_logs',
          'memory_recall_configs',
          'memory_lessons'
        )
      ORDER BY table_name;
    `;

    const result = await client.query(verifyQuery);
    console.log('\x1b[32m✓ Tables verified:\x1b[0m');
    result.rows.forEach(row => {
      console.log(`  • ${row.table_name}`);
    });

  } catch (err) {
    console.error('\x1b[31mMigration failed:\x1b[0m', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
