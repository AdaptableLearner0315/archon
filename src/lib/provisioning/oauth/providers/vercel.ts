/**
 * Vercel OAuth Provider
 * Handles Vercel OAuth and deployment operations
 */

import type { RefreshedTokens, ProviderAccountInfo } from '../types';

const VERCEL_API_BASE = 'https://api.vercel.com';

// ============================================================
// Types
// ============================================================

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  latestDeployments?: VercelDeployment[];
}

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  alias?: string[];
}

export interface DeploymentFile {
  file: string;
  data: string; // base64 encoded content
  encoding?: 'base64' | 'utf-8';
}

export interface CreateDeploymentOptions {
  name: string;
  files: DeploymentFile[];
  projectSettings?: {
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
    installCommand?: string;
  };
  target?: 'production' | 'preview';
  teamId?: string;
}

export interface DeploymentResult {
  id: string;
  url: string;
  readyState: string;
  alias?: string[];
}

/**
 * Get Vercel account info
 */
export async function getAccountInfo(
  accessToken: string
): Promise<ProviderAccountInfo | null> {
  try {
    const response = await fetch(`${VERCEL_API_BASE}/v2/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const user = data.user;

    return {
      id: user.id,
      name: user.name || user.username || user.email,
      email: user.email,
      avatar: user.avatar,
    };
  } catch (error) {
    console.error('Failed to get Vercel account info:', error);
    return null;
  }
}

/**
 * Refresh Vercel access token
 * Note: Vercel integration tokens don't expire by default
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshedTokens | null> {
  try {
    const response = await fetch(`${VERCEL_API_BASE}/v2/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.VERCEL_CLIENT_ID || '',
        client_secret: process.env.VERCEL_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    };
  } catch (error) {
    console.error('Failed to refresh Vercel token:', error);
    return null;
  }
}

/**
 * List Vercel projects for the connected account
 */
export async function listProjects(
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const response = await fetch(`${VERCEL_API_BASE}/v9/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.projects.map((p: { id: string; name: string }) => ({
      id: p.id,
      name: p.name,
    }));
  } catch (error) {
    console.error('Failed to list Vercel projects:', error);
    return [];
  }
}

/**
 * Get Vercel team info if applicable
 */
export async function getTeams(
  accessToken: string
): Promise<Array<{ id: string; name: string; slug: string }>> {
  try {
    const response = await fetch(`${VERCEL_API_BASE}/v2/teams`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.teams.map((t: { id: string; name: string; slug: string }) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
    }));
  } catch (error) {
    console.error('Failed to get Vercel teams:', error);
    return [];
  }
}

// ============================================================
// Deployment Functions
// ============================================================

/**
 * Create a new project in Vercel
 */
export async function createProject(
  accessToken: string,
  name: string,
  framework = 'nextjs',
  teamId?: string
): Promise<VercelProject | null> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v10/projects`);
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        framework,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to create Vercel project:', error);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Failed to create Vercel project:', error);
    return null;
  }
}

/**
 * Get a project by name
 */
export async function getProject(
  accessToken: string,
  projectName: string,
  teamId?: string
): Promise<VercelProject | null> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectName)}`);
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.json();
      console.error('Failed to get Vercel project:', error);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Failed to get Vercel project:', error);
    return null;
  }
}

/**
 * Create a deployment using file upload
 * This is the main deployment method for uploading files directly
 */
export async function createDeployment(
  accessToken: string,
  options: CreateDeploymentOptions
): Promise<DeploymentResult | null> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v13/deployments`);
    if (options.teamId) {
      url.searchParams.set('teamId', options.teamId);
    }

    // Prepare files array with proper structure
    const files = options.files.map((f) => ({
      file: f.file,
      data: f.data,
      encoding: f.encoding || 'base64',
    }));

    const body: Record<string, unknown> = {
      name: options.name,
      files,
      target: options.target || 'production',
    };

    // Add project settings if provided
    if (options.projectSettings) {
      body.projectSettings = options.projectSettings;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to create deployment:', error);
      throw new Error(error.error?.message || 'Deployment failed');
    }

    const data = await response.json();

    return {
      id: data.id,
      url: data.url,
      readyState: data.readyState,
      alias: data.alias,
    };
  } catch (error) {
    console.error('Failed to create deployment:', error);
    throw error;
  }
}

/**
 * Get deployment status
 */
export async function getDeployment(
  accessToken: string,
  deploymentId: string,
  teamId?: string
): Promise<VercelDeployment | null> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v13/deployments/${deploymentId}`);
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Failed to get deployment:', error);
    return null;
  }
}

/**
 * Wait for deployment to be ready
 */
export async function waitForDeployment(
  accessToken: string,
  deploymentId: string,
  teamId?: string,
  maxWaitMs = 120000,
  pollIntervalMs = 3000,
  onProgress?: (state: string, elapsed: number) => void
): Promise<VercelDeployment | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const deployment = await getDeployment(accessToken, deploymentId, teamId);

    if (!deployment) {
      return null;
    }

    const elapsed = Date.now() - startTime;
    onProgress?.(deployment.state, elapsed);

    if (deployment.state === 'READY') {
      return deployment;
    }

    if (deployment.state === 'ERROR' || deployment.state === 'CANCELED') {
      throw new Error(`Deployment ${deployment.state.toLowerCase()}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Deployment timed out');
}

/**
 * Delete a deployment
 */
export async function deleteDeployment(
  accessToken: string,
  deploymentId: string,
  teamId?: string
): Promise<boolean> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v13/deployments/${deploymentId}`);
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to delete deployment:', error);
    return false;
  }
}

/**
 * List deployments for a project
 */
export async function listDeployments(
  accessToken: string,
  projectName: string,
  limit = 10,
  teamId?: string
): Promise<VercelDeployment[]> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v6/deployments`);
    url.searchParams.set('projectId', projectName);
    url.searchParams.set('limit', limit.toString());
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.deployments || [];
  } catch (error) {
    console.error('Failed to list deployments:', error);
    return [];
  }
}

/**
 * Add a custom domain alias to a deployment
 */
export async function addDomainAlias(
  accessToken: string,
  deploymentId: string,
  domain: string,
  teamId?: string
): Promise<boolean> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v2/deployments/${deploymentId}/aliases`);
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alias: domain }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to add domain alias:', error);
    return false;
  }
}
