/**
 * Landing Page Deployer
 * Deploys generated landing page to Vercel
 */

import { createClient } from '@/lib/supabase/server';
import { getValidTokens } from '../tokens';
import {
  createDeployment,
  getProject,
  createProject,
  waitForDeployment,
  addDomainAlias,
  type DeploymentFile,
} from '../oauth/providers/vercel';
import type { LandingPageContent } from '@/lib/infrastructure/types';

export interface DeploymentProgress {
  stage: 'preparing' | 'uploading' | 'building' | 'ready' | 'error';
  progress: number;
  message: string;
  url?: string;
  error?: string;
}

export type ProgressCallback = (progress: DeploymentProgress) => void;

export interface DeployResult {
  success: boolean;
  url?: string;
  vercelUrl?: string;
  error?: string;
  deploymentId?: string;
}

/**
 * Deploy a landing page to Vercel
 */
export async function deployLandingPage(
  companyId: string,
  landingContent: LandingPageContent,
  projectName: string,
  onProgress?: ProgressCallback,
  customDomain?: string
): Promise<DeployResult> {
  const reportProgress = (progress: DeploymentProgress) => {
    onProgress?.(progress);
  };

  try {
    // Get Vercel tokens
    reportProgress({
      stage: 'preparing',
      progress: 5,
      message: 'Connecting to Vercel...',
    });

    const tokens = await getValidTokens(companyId, 'vercel');
    if (!tokens) {
      throw new Error('Vercel not connected. Please connect your Vercel account first.');
    }

    // Check if project exists, create if not
    reportProgress({
      stage: 'preparing',
      progress: 10,
      message: 'Checking project...',
    });

    let project = await getProject(tokens.accessToken, projectName);
    if (!project) {
      reportProgress({
        stage: 'preparing',
        progress: 15,
        message: 'Creating new project...',
      });
      project = await createProject(tokens.accessToken, projectName, 'nextjs');
      if (!project) {
        throw new Error('Failed to create Vercel project');
      }
    }

    // Prepare deployment files
    reportProgress({
      stage: 'preparing',
      progress: 20,
      message: 'Packaging files...',
    });

    const files = generateDeploymentFiles(landingContent, projectName);

    // Create deployment
    reportProgress({
      stage: 'uploading',
      progress: 30,
      message: 'Uploading to Vercel...',
    });

    const deployment = await createDeployment(tokens.accessToken, {
      name: projectName,
      files,
      projectSettings: {
        framework: 'nextjs',
        buildCommand: 'next build',
        outputDirectory: '.next',
        installCommand: 'npm install',
      },
      target: 'production',
    });

    if (!deployment) {
      throw new Error('Failed to create deployment');
    }

    // Wait for deployment to be ready
    reportProgress({
      stage: 'building',
      progress: 50,
      message: 'Building...',
    });

    const readyDeployment = await waitForDeployment(
      tokens.accessToken,
      deployment.id,
      undefined,
      180000, // 3 minutes max
      3000,
      (state, elapsed) => {
        const buildProgress = Math.min(50 + (elapsed / 180000) * 40, 90);
        reportProgress({
          stage: 'building',
          progress: buildProgress,
          message: `Building... (${state})`,
        });
      }
    );

    if (!readyDeployment) {
      throw new Error('Deployment failed or timed out');
    }

    const vercelUrl = `https://${readyDeployment.url}`;
    let deployedUrl = vercelUrl;

    // Add custom subdomain alias if configured
    if (customDomain) {
      reportProgress({
        stage: 'building',
        progress: 95,
        message: 'Configuring custom domain...',
      });

      const subdomain = `${projectName}.${customDomain}`;
      const aliasAdded = await addDomainAlias(tokens.accessToken, deployment.id, subdomain);

      if (aliasAdded) {
        deployedUrl = `https://${subdomain}`;
      } else {
        console.warn(`Failed to add custom domain alias ${subdomain}, falling back to Vercel URL`);
      }
    }

    // Update asset in database with deployment info
    await updateAssetDeployment(companyId, deployedUrl, deployment.id, vercelUrl);

    reportProgress({
      stage: 'ready',
      progress: 100,
      message: 'Deployed successfully!',
      url: deployedUrl,
    });

    return {
      success: true,
      url: deployedUrl,
      vercelUrl,
      deploymentId: deployment.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Deployment failed';
    reportProgress({
      stage: 'error',
      progress: 0,
      message: errorMessage,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Generate all files needed for a Next.js deployment
 */
function generateDeploymentFiles(
  content: LandingPageContent,
  projectName: string
): DeploymentFile[] {
  const files: DeploymentFile[] = [];

  // package.json
  files.push({
    file: 'package.json',
    data: Buffer.from(
      JSON.stringify(
        {
          name: projectName,
          version: '1.0.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          dependencies: {
            next: '^14.2.0',
            react: '^18.3.0',
            'react-dom': '^18.3.0',
            'framer-motion': '^11.0.0',
            'lucide-react': '^0.400.0',
          },
          devDependencies: {
            typescript: '^5.4.0',
            '@types/node': '^20.0.0',
            '@types/react': '^18.3.0',
            '@types/react-dom': '^18.3.0',
            tailwindcss: '^3.4.0',
            postcss: '^8.4.0',
            autoprefixer: '^10.4.0',
          },
        },
        null,
        2
      )
    ).toString('base64'),
  });

  // next.config.js
  files.push({
    file: 'next.config.js',
    data: Buffer.from(
      `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
`
    ).toString('base64'),
  });

  // tsconfig.json
  files.push({
    file: 'tsconfig.json',
    data: Buffer.from(
      JSON.stringify(
        {
          compilerOptions: {
            target: 'es5',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./src/*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2
      )
    ).toString('base64'),
  });

  // tailwind.config.js
  files.push({
    file: 'tailwind.config.js',
    data: Buffer.from(
      `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#8b5cf6',
        accent: '#a78bfa',
      },
    },
  },
  plugins: [],
};
`
    ).toString('base64'),
  });

  // postcss.config.js
  files.push({
    file: 'postcss.config.js',
    data: Buffer.from(
      `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`
    ).toString('base64'),
  });

  // src/app/globals.css
  files.push({
    file: 'src/app/globals.css',
    data: Buffer.from(
      `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground: #ffffff;
  --background: #0a0a0a;
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: system-ui, -apple-system, sans-serif;
}
`
    ).toString('base64'),
  });

  // src/app/layout.tsx
  files.push({
    file: 'src/app/layout.tsx',
    data: Buffer.from(
      `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${escapeString(content.hero.headline)}',
  description: '${escapeString(content.hero.subheadline)}',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`
    ).toString('base64'),
  });

  // Generate the landing page component
  const pageComponent = generateLandingPageComponent(content);

  // src/app/page.tsx
  files.push({
    file: 'src/app/page.tsx',
    data: Buffer.from(pageComponent).toString('base64'),
  });

  return files;
}

/**
 * Generate the landing page React component
 */
function generateLandingPageComponent(content: LandingPageContent): string {
  // If we have generated component code, use it
  if (content.componentCode && content.componentCode.length > 100) {
    // Wrap the component code properly
    return `'use client';

${content.componentCode}
`;
  }

  // Otherwise generate a default component from the content
  const features = content.features || [];
  const faqs = content.faq || [];

  return `'use client';

import { motion } from 'framer-motion';
import { ${getIconImports(features)} } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black text-white">
      {/* Hero Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
          >
            ${escapeString(content.hero.headline)}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-zinc-400 mb-8 max-w-2xl mx-auto"
          >
            ${escapeString(content.hero.subheadline)}
          </motion.p>
          <motion.a
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            href="${content.hero.ctaUrl}"
            className="inline-block px-8 py-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-lg font-semibold transition-colors"
          >
            ${escapeString(content.hero.ctaText)}
          </motion.a>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-zinc-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${features
              .map(
                (f, i) => `
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: ${i * 0.1} }}
              className="p-6 bg-zinc-800/50 rounded-xl border border-zinc-700"
            >
              <${f.icon} className="w-10 h-10 text-purple-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2">${escapeString(f.title)}</h3>
              <p className="text-zinc-400">${escapeString(f.description)}</p>
            </motion.div>`
              )
              .join('')}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">FAQ</h2>
          <div className="space-y-4">
            ${faqs
              .map(
                (faq) => `
            <div className="p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
              <h3 className="font-semibold mb-2">${escapeString(faq.question)}</h3>
              <p className="text-zinc-400">${escapeString(faq.answer)}</p>
            </div>`
              )
              .join('')}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-zinc-500 mb-4">${escapeString(content.footer.tagline)}</p>
          <div className="flex justify-center gap-6">
            ${content.footer.links
              .map((link) => `<a href="${link.url}" className="text-zinc-400 hover:text-white">${escapeString(link.label)}</a>`)
              .join('\n            ')}
          </div>
        </div>
      </footer>
    </div>
  );
}
`;
}

/**
 * Get icon imports from features
 */
function getIconImports(features: Array<{ icon: string }>): string {
  const icons = new Set(features.map((f) => f.icon).filter(Boolean));
  // Add common icons that might be needed
  icons.add('Zap');
  icons.add('Shield');
  icons.add('BarChart');
  icons.add('Users');
  return Array.from(icons).join(', ');
}

/**
 * Escape string for use in JSX
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, ' ');
}

/**
 * Update asset in database with deployment info
 */
async function updateAssetDeployment(
  companyId: string,
  deployedUrl: string,
  deploymentId: string,
  vercelUrl?: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('infrastructure_assets')
    .update({
      metadata: {
        deployed: true,
        deployedUrl,
        vercelUrl: vercelUrl || deployedUrl,
        deploymentId,
        deployedAt: new Date().toISOString(),
      },
    })
    .eq('company_id', companyId)
    .eq('type', 'landing');
}

/**
 * Get the deployed URL for a company's landing page
 */
export async function getDeployedLandingUrl(companyId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('infrastructure_assets')
    .select('metadata')
    .eq('company_id', companyId)
    .eq('type', 'landing')
    .single();

  if (data?.metadata && typeof data.metadata === 'object') {
    const metadata = data.metadata as Record<string, unknown>;
    return metadata.deployedUrl as string | null;
  }

  return null;
}
