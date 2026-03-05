/**
 * Server Configuration Generator
 *
 * Uses Forge (Engineer) agent to generate production-ready
 * deployment configurations.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { InfrastructureContext, InfraResult, ServerConfigContent } from '../types';

const anthropic = new Anthropic();

const SERVER_CONFIG_PROMPT = `You are generating server deployment configuration for a {businessType} business called "{productName}".

Requirements:
- Production-ready deployment
- Monitoring and error tracking
- Security best practices
- Environment management

Generate deployment configuration as JSON:

{
  "deploymentPlatform": "vercel",
  "config": {
    "vercel": {
      "framework": "nextjs",
      "buildCommand": "npm run build",
      "outputDirectory": ".next",
      "installCommand": "npm install",
      "devCommand": "npm run dev",
      "regions": ["iad1"],
      "env": ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      "headers": [
        {
          "source": "/(.*)",
          "headers": [
            {"key": "X-Frame-Options", "value": "DENY"},
            {"key": "X-Content-Type-Options", "value": "nosniff"},
            {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"}
          ]
        }
      ],
      "rewrites": [],
      "redirects": []
    }
  },
  "envTemplate": "# Environment Variables Template\\n\\n# Database\\nDATABASE_URL=\\n\\n# Supabase\\nNEXT_PUBLIC_SUPABASE_URL=\\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\\nSUPABASE_SERVICE_ROLE_KEY=\\n\\n# Stripe\\nSTRIPE_SECRET_KEY=\\nSTRIPE_WEBHOOK_SECRET=\\nNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\\n\\n# App\\nNEXT_PUBLIC_APP_URL=",
  "healthCheck": {
    "endpoint": "/api/health",
    "code": "// Health check endpoint code here"
  },
  "monitoring": {
    "provider": "Sentry",
    "setupInstructions": "1. Install @sentry/nextjs\\n2. Run npx @sentry/wizard@latest -i nextjs\\n3. Configure DSN in environment"
  },
  "security": {
    "headers": {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    },
    "rateLimiting": "Use Vercel Edge Middleware or upstash/ratelimit",
    "cors": ["https://{domain}.com", "https://www.{domain}.com"]
  }
}

Include realistic, production-ready configurations.`;

const HEALTH_CHECK_CODE = `import { NextResponse } from 'next/server';

export const runtime = 'edge';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    name: string;
    status: 'pass' | 'fail';
    duration_ms?: number;
    message?: string;
  }[];
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const startTime = Date.now();
  const checks: HealthStatus['checks'] = [];

  // Check 1: Basic runtime
  checks.push({
    name: 'runtime',
    status: 'pass',
    duration_ms: Date.now() - startTime,
  });

  // Check 2: Environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];

  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
  checks.push({
    name: 'environment',
    status: missingEnvVars.length === 0 ? 'pass' : 'fail',
    message: missingEnvVars.length > 0 ? \`Missing: \${missingEnvVars.join(', ')}\` : undefined,
  });

  // Determine overall status
  const hasFailure = checks.some((c) => c.status === 'fail');
  const status: HealthStatus['status'] = hasFailure ? 'unhealthy' : 'healthy';

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    checks,
  }, {
    status: hasFailure ? 503 : 200,
  });
}`;

const DOCKERFILE_TEMPLATE = `# Multi-stage Dockerfile for Next.js

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]`;

const DOCKER_COMPOSE_TEMPLATE = `version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${DATABASE_URL}
      - NEXT_PUBLIC_SUPABASE_URL=\${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=\${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s`;

export async function generateServerConfig(
  context: InfrastructureContext,
  companyId: string,
  onProgress: (agent: string | null, progress: number) => void
): Promise<InfraResult<ServerConfigContent>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    // Generate using Forge (Engineer) agent
    onProgress('engineer', 20);

    const prompt = SERVER_CONFIG_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{domain}', context.preferredDomain || 'example');

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
    onProgress('engineer', 60);

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    let parsedConfig: Partial<ServerConfigContent>;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedConfig = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch {
      parsedConfig = {};
    }

    onProgress('engineer', 80);

    // Build final config
    const domain = context.preferredDomain || 'example.com';

    const finalConfig: ServerConfigContent = {
      deploymentPlatform: 'vercel',
      config: {
        vercel: parsedConfig.config?.vercel || {
          framework: 'nextjs',
          buildCommand: 'npm run build',
          outputDirectory: '.next',
          installCommand: 'npm install',
          devCommand: 'npm run dev',
          regions: ['iad1'],
        },
        docker: {
          dockerfile: DOCKERFILE_TEMPLATE,
          compose: DOCKER_COMPOSE_TEMPLATE,
        },
      },
      envTemplate: generateEnvTemplate(context),
      healthCheck: {
        endpoint: '/api/health',
        code: HEALTH_CHECK_CODE,
      },
      monitoring: {
        provider: 'Sentry',
        setupInstructions: `1. Install Sentry SDK:
   npm install @sentry/nextjs

2. Run the setup wizard:
   npx @sentry/wizard@latest -i nextjs

3. Configure your DSN in .env:
   SENTRY_DSN=your-dsn-here

4. The wizard will create:
   - sentry.client.config.ts
   - sentry.server.config.ts
   - sentry.edge.config.ts

5. Verify setup by throwing a test error in your app.`,
      },
      security: {
        headers: {
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
        rateLimiting: `Use @upstash/ratelimit for edge-compatible rate limiting:

npm install @upstash/ratelimit @upstash/redis

// middleware.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});`,
        cors: [
          `https://${domain}`,
          `https://www.${domain}`,
        ],
      },
    };

    onProgress(null, 100);

    return {
      success: true,
      type: 'server',
      content: finalConfig,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['engineer'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'server',
      content: generateFallbackConfig(context),
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['engineer'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateEnvTemplate(context: InfrastructureContext): string {
  return `# ${context.productName} Environment Variables
# Generated by Archon Infrastructure Generator

# ===========================================
# Database (Supabase)
# ===========================================
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ===========================================
# Authentication
# ===========================================
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# ===========================================
# Stripe (Payments)
# ===========================================
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# ===========================================
# AI Services
# ===========================================
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# ===========================================
# Email (Resend)
# ===========================================
RESEND_API_KEY=
EMAIL_FROM=noreply@${context.preferredDomain || 'example.com'}

# ===========================================
# Monitoring
# ===========================================
SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# ===========================================
# App Configuration
# ===========================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=${context.productName}
NODE_ENV=development
`;
}

function generateFallbackConfig(context: InfrastructureContext): ServerConfigContent {
  return {
    deploymentPlatform: 'vercel',
    config: {
      vercel: {
        framework: 'nextjs',
        buildCommand: 'npm run build',
        outputDirectory: '.next',
      },
      docker: {
        dockerfile: DOCKERFILE_TEMPLATE,
        compose: DOCKER_COMPOSE_TEMPLATE,
      },
    },
    envTemplate: generateEnvTemplate(context),
    healthCheck: {
      endpoint: '/api/health',
      code: HEALTH_CHECK_CODE,
    },
    monitoring: {
      provider: 'Sentry',
      setupInstructions: 'Install @sentry/nextjs and run the setup wizard.',
    },
    security: {
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
      },
      rateLimiting: 'Use @upstash/ratelimit',
      cors: ['https://example.com'],
    },
  };
}
