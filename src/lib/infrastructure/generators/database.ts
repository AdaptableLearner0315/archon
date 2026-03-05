/**
 * Database Schema Generator
 *
 * Uses Forge (Engineer) + Nexus (Operations) agents to generate
 * business-specific Supabase schemas.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { InfrastructureContext, InfraResult, DatabaseSchemaContent } from '../types';
import { DATABASE_TEMPLATES } from '../templates/business-templates';

const anthropic = new Anthropic();

const SCHEMA_ENHANCEMENT_PROMPT = `You are enhancing a database schema for a {businessType} business.

Business: {productName}
Description: {businessDescription}
Key Features: {keyFeatures}

Base schema tables: {baseTables}

Generate additional customizations as JSON:

{
  "additionalTables": [
    {
      "name": "table_name",
      "columns": [
        {"name": "column", "type": "TEXT", "nullable": false, "description": "Purpose"}
      ],
      "indexes": ["idx_name ON table(column)"]
    }
  ],
  "additionalRlsPolicies": [
    {
      "table": "table_name",
      "name": "policy_name",
      "operation": "SELECT",
      "using": "auth.uid() = user_id"
    }
  ],
  "seedData": "INSERT statements for initial data",
  "backupStrategy": "Recommended backup approach",
  "auditSetup": "SQL for audit logging"
}

Focus on:
- Tables specific to this business's unique features
- Proper indexing for expected queries
- RLS policies for security
- Audit logging for important tables`;

export async function generateDatabaseSchema(
  context: InfrastructureContext,
  companyId: string,
  onProgress: (agent: string | null, progress: number) => void
): Promise<InfraResult<DatabaseSchemaContent>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    // Get base template
    const baseTemplate = DATABASE_TEMPLATES[context.businessType];

    // Step 1: Enhance schema with AI (Forge - Engineer)
    onProgress('engineer', 20);

    const prompt = SCHEMA_ENHANCEMENT_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{businessDescription}', context.businessDescription)
      .replace('{keyFeatures}', context.keyFeatures.join(', '))
      .replace('{baseTables}', baseTemplate.tables.map((t) => t.name).join(', '));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
    onProgress('engineer', 50);

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    let enhancements: {
      additionalTables?: typeof baseTemplate.tables;
      additionalRlsPolicies?: typeof baseTemplate.rlsPolicies;
      seedData?: string;
      backupStrategy?: string;
      auditSetup?: string;
    } = {};

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        enhancements = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults
    }

    // Step 2: Generate operations recommendations (Nexus - Operations)
    onProgress('operations', 70);

    // Combine base template with enhancements
    const allTables = [...baseTemplate.tables, ...(enhancements.additionalTables || [])];
    const allPolicies = [...baseTemplate.rlsPolicies, ...(enhancements.additionalRlsPolicies || [])];

    // Generate migrations
    const migrations = generateMigrations(allTables, allPolicies);

    onProgress('operations', 90);

    const finalContent: DatabaseSchemaContent = {
      schema: {
        tables: allTables.map((table) => ({
          name: table.name,
          columns: table.columns.map((col) => ({
            name: col.name,
            type: col.type.split(' ')[0], // Extract just the type
            nullable: col.nullable,
            default: extractDefault(col.type),
            references: extractReference(col.type),
          })),
          indexes: table.indexes,
        })),
        rlsPolicies: allPolicies.map((policy) => ({
          table: policy.table,
          name: policy.name,
          operation: policy.operation as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL',
          definition: policy.using,
        })),
      },
      migrations,
      seedData: enhancements.seedData || generateDefaultSeedData(context, allTables),
      backupStrategy: enhancements.backupStrategy || generateBackupStrategy(),
      auditSetup: enhancements.auditSetup || generateAuditSetup(allTables),
    };

    onProgress(null, 100);

    return {
      success: true,
      type: 'database',
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['engineer', 'operations'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'database',
      content: generateFallbackSchema(context),
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['engineer', 'operations'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateMigrations(
  tables: typeof DATABASE_TEMPLATES.saas.tables,
  policies: typeof DATABASE_TEMPLATES.saas.rlsPolicies
): string[] {
  const migrations: string[] = [];

  // Migration 1: Create tables
  let tablesSql = '-- Migration: Create core tables\n\n';

  for (const table of tables) {
    tablesSql += `-- ${table.description}\n`;
    tablesSql += `CREATE TABLE IF NOT EXISTS ${table.name} (\n`;
    tablesSql += table.columns
      .map((col) => `  ${col.name} ${col.type}`)
      .join(',\n');
    tablesSql += '\n);\n\n';
  }

  migrations.push(tablesSql);

  // Migration 2: Create indexes
  let indexesSql = '-- Migration: Create indexes\n\n';

  for (const table of tables) {
    for (const index of table.indexes) {
      indexesSql += `CREATE INDEX IF NOT EXISTS ${index};\n`;
    }
  }

  migrations.push(indexesSql);

  // Migration 3: Enable RLS and create policies
  let rlsSql = '-- Migration: Row Level Security\n\n';

  const tablesWithPolicies = new Set(policies.map((p) => p.table));

  for (const tableName of tablesWithPolicies) {
    rlsSql += `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;\n`;
  }

  rlsSql += '\n';

  for (const policy of policies) {
    rlsSql += `CREATE POLICY "${policy.name}"\n`;
    rlsSql += `  ON ${policy.table}\n`;
    rlsSql += `  FOR ${policy.operation}\n`;
    rlsSql += `  USING (${policy.using});\n\n`;
  }

  migrations.push(rlsSql);

  return migrations;
}

function extractDefault(type: string): string | undefined {
  const match = type.match(/DEFAULT\s+([^\s,]+)/i);
  return match ? match[1] : undefined;
}

function extractReference(type: string): string | undefined {
  const match = type.match(/REFERENCES\s+(\w+\(\w+\))/i);
  return match ? match[1] : undefined;
}

function generateDefaultSeedData(
  context: InfrastructureContext,
  tables: typeof DATABASE_TEMPLATES.saas.tables
): string {
  let seedData = `-- Seed Data for ${context.productName}\n\n`;

  // Generate sample data based on business type
  switch (context.businessType) {
    case 'saas':
      seedData += `-- Sample subscription tiers
INSERT INTO subscription_tiers (name, price_cents, features) VALUES
  ('Free', 0, '{"limits": {"users": 1, "projects": 3}}'),
  ('Pro', 1900, '{"limits": {"users": 5, "projects": 20}}'),
  ('Enterprise', 9900, '{"limits": {"users": -1, "projects": -1}}')
ON CONFLICT DO NOTHING;\n`;
      break;

    case 'ecommerce':
      seedData += `-- Sample product categories
INSERT INTO categories (name, slug) VALUES
  ('Featured', 'featured'),
  ('New Arrivals', 'new-arrivals'),
  ('Sale', 'sale')
ON CONFLICT DO NOTHING;\n`;
      break;

    case 'creator':
      seedData += `-- Sample membership tiers
INSERT INTO membership_tiers (name, price_cents, benefits) VALUES
  ('Supporter', 500, '{"access": ["posts"]}'),
  ('Member', 1500, '{"access": ["posts", "videos"]}'),
  ('VIP', 5000, '{"access": ["posts", "videos", "calls"]}')
ON CONFLICT DO NOTHING;\n`;
      break;

    case 'services':
      seedData += `-- Sample service packages
INSERT INTO service_packages (name, price_cents, deliverables) VALUES
  ('Consultation', 15000, '{"hours": 1, "deliverables": ["report"]}'),
  ('Project', 250000, '{"hours": 40, "deliverables": ["full-project"]}'),
  ('Retainer', 500000, '{"hours": 20, "monthly": true}')
ON CONFLICT DO NOTHING;\n`;
      break;
  }

  return seedData;
}

function generateBackupStrategy(): string {
  return `# Database Backup Strategy

## Automated Backups (Supabase)
- Point-in-time recovery (PITR) enabled
- Daily backups retained for 7 days
- Weekly backups retained for 4 weeks
- Monthly backups retained for 12 months

## Manual Backup Procedure
1. Use Supabase Dashboard > Database > Backups
2. Download latest backup before major changes
3. Store backups in secure, encrypted storage

## Restore Procedure
1. Navigate to Supabase Dashboard > Database > Backups
2. Select backup point to restore
3. Confirm restoration (creates new project or restores in-place)

## Best Practices
- Test backup restoration quarterly
- Document all schema changes
- Use migrations for schema updates
- Keep backup encryption keys secure`;
}

function generateAuditSetup(tables: typeof DATABASE_TEMPLATES.saas.tables): string {
  const auditableTables = tables.filter((t) =>
    ['users', 'orders', 'subscriptions', 'invoices', 'payments', 'clients', 'projects'].includes(t.name)
  );

  let auditSql = `-- Audit Logging Setup

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_record ON audit_log(record_id);
CREATE INDEX idx_audit_log_date ON audit_log(changed_at);

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

`;

  // Add triggers for auditable tables
  for (const table of auditableTables) {
    auditSql += `-- Audit trigger for ${table.name}
CREATE TRIGGER ${table.name}_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON ${table.name}
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

`;
  }

  return auditSql;
}

function generateFallbackSchema(context: InfrastructureContext): DatabaseSchemaContent {
  const baseTemplate = DATABASE_TEMPLATES[context.businessType];

  return {
    schema: {
      tables: baseTemplate.tables.map((table) => ({
        name: table.name,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type.split(' ')[0],
          nullable: col.nullable,
        })),
        indexes: table.indexes,
      })),
      rlsPolicies: baseTemplate.rlsPolicies.map((policy) => ({
        table: policy.table,
        name: policy.name,
        operation: policy.operation as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL',
        definition: policy.using,
      })),
    },
    migrations: generateMigrations(baseTemplate.tables, baseTemplate.rlsPolicies),
    seedData: generateDefaultSeedData(context, baseTemplate.tables),
    backupStrategy: generateBackupStrategy(),
    auditSetup: generateAuditSetup(baseTemplate.tables),
  };
}
