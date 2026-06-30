// Feature: user-management — task 5.3 unit tests for auth.signIn
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));

import { supabase } from '@/lib/supabase';
import { signIn } from './auth';

const signInWithPassword = vi.mocked(supabase.auth.signInWithPassword);

beforeEach(() => {
  signInWithPassword.mockReset();
});

describe('signIn', () => {
  it('resolves a bare username to a gmail email', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: '1' } }, error: null } as any);

    await signIn('kasir1', 'pw');

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'kasir1@gmail.com', password: 'pw' });
  });

  it('uses an identifier containing "@" verbatim, lowercased', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: '1' } }, error: null } as any);

    await signIn('Boss@Gmail.com', 'pw');

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'boss@gmail.com', password: 'pw' });
  });

  it('rejects a blank identifier and never calls signInWithPassword', async () => {
    await expect(signIn('   ', 'pw')).rejects.toThrow(/tidak valid/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects when supabase returns an auth error', async () => {
    signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    } as any);

    await expect(signIn('kasir1', 'x')).rejects.toBeTruthy();
  });
});
