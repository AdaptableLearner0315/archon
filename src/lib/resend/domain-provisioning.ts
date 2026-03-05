/**
 * Resend Domain Provisioning
 *
 * Provisions email domains and addresses via the Resend Domains API.
 * Uses the same raw fetch() pattern as the rest of the codebase.
 */

const RESEND_API_BASE = 'https://api.resend.com';

interface ResendDomain {
  id: string;
  name: string;
  status: 'pending' | 'verified' | 'failed';
  records: {
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
    priority?: number;
  }[];
}

interface ProvisionResult {
  success: boolean;
  domainId?: string;
  domain?: string;
  email?: string;
  dnsRecords?: ResendDomain['records'];
  error?: string;
}

function getApiKey(): string | null {
  return process.env.RESEND_API_KEY || null;
}

/**
 * Provision a subdomain under archon.app via Resend Domains API
 */
export async function provisionEmailDomain(companySlug: string): Promise<ProvisionResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const domain = `${companySlug}.archon.app`;

  try {
    const response = await fetch(`${RESEND_API_BASE}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Domain provisioning failed: ${response.status} ${(errorData as Record<string, string>).message || response.statusText}`,
      };
    }

    const data: ResendDomain = await response.json();

    return {
      success: true,
      domainId: data.id,
      domain: data.name,
      email: `hello@${data.name}`,
      dnsRecords: data.records,
    };
  } catch (error) {
    return {
      success: false,
      error: `Domain provisioning error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check domain verification status
 */
export async function checkDomainVerification(domainId: string): Promise<{
  verified: boolean;
  status: string;
  error?: string;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { verified: false, status: 'error', error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch(`${RESEND_API_BASE}/domains/${domainId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return { verified: false, status: 'error', error: `API error: ${response.status}` };
    }

    const data: ResendDomain = await response.json();

    return {
      verified: data.status === 'verified',
      status: data.status,
    };
  } catch (error) {
    return {
      verified: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Trigger domain verification via Resend API
 */
export async function verifyDomain(domainId: string): Promise<boolean> {
  const apiKey = getApiKey();
  if (!apiKey) return false;

  try {
    const response = await fetch(`${RESEND_API_BASE}/domains/${domainId}/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
