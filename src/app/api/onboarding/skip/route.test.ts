import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock credit manager
vi.mock('@/lib/credits/manager', () => ({
  createCreditManager: vi.fn(() => ({
    initializeBalance: vi.fn(),
  })),
}));

import { createClient } from '@/lib/supabase/server';
import { createCreditManager } from '@/lib/credits/manager';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockCreateCreditManager = createCreditManager as ReturnType<typeof vi.fn>;

describe('/api/onboarding/skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('handles missing credit_balances table gracefully', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockCompany = { id: 'company-123' };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'companies') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValueOnce({ data: null }), // First call: no existing company
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockCompany, error: null }),
              }),
            }),
          };
        }
        // Other tables return success
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    mockCreateClient.mockResolvedValue(mockSupabase);

    // Make credit initialization throw (simulating missing table)
    mockCreateCreditManager.mockReturnValue({
      initializeBalance: vi.fn().mockRejectedValue(
        new Error("Could not find the table 'public.credit_balances'")
      ),
    });

    const response = await POST();
    const data = await response.json();

    // Should still succeed despite credit initialization failure
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.redirectUrl).toBe('/dashboard');
  });
});
