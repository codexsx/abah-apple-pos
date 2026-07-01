// Feature: user-management — task 5.3 unit tests for users service
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '@/lib/supabase';
import { listUsers, createUser, updateUser, deleteUser } from './users';

const invoke = vi.mocked(supabase.functions.invoke);
type InvokeResponse = Awaited<ReturnType<typeof invoke>>;

beforeEach(() => {
  invoke.mockReset();
});

describe('users service', () => {
  it('listUsers calls admin-users list and maps users with permissions defaulted to {}', async () => {
    invoke.mockResolvedValue({
      data: {
        users: [
          { id: '1', username: 'kasir1', name: 'Kasir', role: 'KASIR', permissions: null, avatar_url: null },
        ],
      },
      error: null,
    } as InvokeResponse);

    const result = await listUsers();

    expect(invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'list', payload: undefined },
    });
    expect(result).toEqual([
      { id: '1', username: 'kasir1', name: 'Kasir', role: 'KASIR', permissions: {}, avatar_url: null },
    ]);
  });

  it('createUser calls admin-users create with payload spread from input', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null } as InvokeResponse);

    const input = {
      username: 'kasir2',
      password: 'pw',
      name: 'Kasir Dua',
      role: 'KASIR' as const,
      permissions: {},
    };
    await createUser(input);

    expect(invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'create', payload: { ...input } },
    });
  });

  it('createUser accepts the Admin/Keuangan role payload', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null } as InvokeResponse);

    const input = {
      username: 'finance1',
      password: 'password',
      name: 'Finance Satu',
      role: 'KEUANGAN' as const,
      permissions: {},
    };
    await createUser(input);

    expect(invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'create', payload: { ...input } },
    });
  });

  it('updateUser calls admin-users update with id and patch', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null } as InvokeResponse);

    await updateUser('id', { role: 'TEKNISI' });

    expect(invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'update', payload: { id: 'id', role: 'TEKNISI' } },
    });
  });

  it('deleteUser calls admin-users delete with id', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null } as InvokeResponse);

    await deleteUser('id');

    expect(invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'delete', payload: { id: 'id' } },
    });
  });

  it('throws using error.message when invoke returns an error without context', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } } as InvokeResponse);

    await expect(listUsers()).rejects.toThrow(/boom/);
  });

  it('maps function fetch failures to an actionable admin function message', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to send a request to the Edge Function' },
    } as InvokeResponse);

    await expect(listUsers()).rejects.toThrow(/fungsi admin/i);
  });

  it('throws using data.error when the response payload carries an error', async () => {
    invoke.mockResolvedValue({ data: { error: 'denied' }, error: null } as InvokeResponse);

    await expect(
      createUser({
        username: 'x',
        password: 'pw',
        name: 'X',
        role: 'KASIR',
        permissions: {},
      }),
    ).rejects.toThrow(/denied/);
  });
});
