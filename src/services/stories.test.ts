import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insert = vi.fn();
  const from = vi.fn();
  return { from, insert };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}));

import { addStoryComment } from './stories';

beforeEach(() => {
  mocks.from.mockReset().mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReset().mockResolvedValue({ error: null });
});

describe('stories service comments', () => {
  it('trims comment body before inserting it for the current user', async () => {
    await addStoryComment({
      storyId: 'story-1',
      userId: 'staff-1',
      body: '  Hari ini rame  ',
    });

    expect(mocks.from).toHaveBeenCalledWith('story_comments');
    expect(mocks.insert).toHaveBeenCalledWith({
      story_id: 'story-1',
      author_id: 'staff-1',
      body: 'Hari ini rame',
    });
  });

  it('rejects blank comments before hitting Supabase', async () => {
    await expect(addStoryComment({
      storyId: 'story-1',
      userId: 'staff-1',
      body: '   ',
    })).rejects.toThrow('Komentar tidak boleh kosong.');

    expect(mocks.from).not.toHaveBeenCalled();
  });
});
