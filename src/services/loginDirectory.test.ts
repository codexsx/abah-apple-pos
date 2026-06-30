import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    select: vi.fn(),
    not: vi.fn(),
  };
  return { chain };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.chain.from,
  },
}));

import { getLoginAccounts } from './loginDirectory';

beforeEach(() => {
  const { chain } = mocks;
  chain.from.mockClear().mockReturnValue(chain);
  chain.select.mockClear().mockReturnValue(chain);
  chain.not.mockReset();
});

describe('loginDirectory service', () => {
  it('loads only public login directory fields and sorts by role priority', async () => {
    const { chain } = mocks;
    chain.not.mockResolvedValue({
      data: [
        {
          id: 'tech-id',
          name: 'Teknisi',
          role: 'TEKNISI',
          initials: 'TE',
          username: 'teknisi',
          avatar_url: null,
          avatar_crop_x: null,
          avatar_crop_y: null,
          avatar_zoom: null,
        },
        {
          id: 'manager-id',
          name: 'Manager',
          role: 'MANAJER',
          initials: 'MA',
          username: 'manager',
          avatar_url: 'https://cdn.test/m.png',
          avatar_crop_x: 44,
          avatar_crop_y: 31,
          avatar_zoom: 1.4,
        },
        {
          id: 'missing-username',
          name: 'Hidden',
          role: 'KASIR',
          initials: 'HI',
          username: null,
          avatar_url: null,
          avatar_crop_x: 50,
          avatar_crop_y: 50,
          avatar_zoom: 1,
        },
      ],
      error: null,
    });

    const accounts = await getLoginAccounts();

    expect(chain.from).toHaveBeenCalledWith('profiles');
    expect(chain.select).toHaveBeenCalledWith(
      'id, name, role, initials, username, avatar_url, avatar_crop_x, avatar_crop_y, avatar_zoom',
    );
    expect(chain.not).toHaveBeenCalledWith('username', 'is', null);
    expect(accounts).toEqual([
      {
        id: 'manager-id',
        name: 'Manager',
        role: 'MANAJER',
        initials: 'MA',
        username: 'manager',
        avatar_url: 'https://cdn.test/m.png',
        avatar_crop_x: 44,
        avatar_crop_y: 31,
        avatar_zoom: 1.4,
      },
      {
        id: 'tech-id',
        name: 'Teknisi',
        role: 'TEKNISI',
        initials: 'TE',
        username: 'teknisi',
        avatar_url: null,
        avatar_crop_x: 50,
        avatar_crop_y: 50,
        avatar_zoom: 1,
      },
    ]);
  });

  it('throws when Supabase returns an error', async () => {
    const { chain } = mocks;
    chain.not.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(getLoginAccounts()).rejects.toThrow(/boom/);
  });
});
