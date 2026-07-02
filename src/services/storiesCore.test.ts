import { describe, expect, it } from 'vitest';

import {
  STORY_COMMENT_MAX_LENGTH,
  groupStoriesByAuthor,
  isActiveStory,
  normalizeStoryCommentBody,
  storyExpiresAt,
  type StoryRecordCore,
} from './storiesCore';

describe('storiesCore', () => {
  it('sets story expiry around 24 hours after creation', () => {
    const base = new Date('2026-07-01T03:00:00.000Z');
    expect(storyExpiresAt(base)).toBe('2026-07-02T03:00:00.000Z');
  });

  it('detects active stories from expires_at', () => {
    const now = new Date('2026-07-01T03:00:00.000Z');
    expect(isActiveStory('2026-07-01T03:01:00.000Z', now)).toBe(true);
    expect(isActiveStory('2026-07-01T03:00:00.000Z', now)).toBe(false);
  });

  it('groups stories by author with unseen groups first and stories sorted oldest first', () => {
    const rows: StoryRecordCore[] = [
      { id: '3', author_id: 'staff-2', created_at: '2026-07-01T03:10:00.000Z', viewed: true },
      { id: '2', author_id: 'staff-1', created_at: '2026-07-01T03:05:00.000Z', viewed: false },
      { id: '1', author_id: 'staff-1', created_at: '2026-07-01T03:00:00.000Z', viewed: true },
    ];

    const groups = groupStoriesByAuthor(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0].authorId).toBe('staff-1');
    expect(groups[0].hasUnseen).toBe(true);
    expect(groups[0].stories.map((story) => story.id)).toEqual(['1', '2']);
    expect(groups[1].authorId).toBe('staff-2');
  });

  it('normalizes story comments before insert', () => {
    expect(normalizeStoryCommentBody('  Mantap toko hari ini  ')).toEqual({
      ok: true,
      body: 'Mantap toko hari ini',
    });
    expect(normalizeStoryCommentBody('   ')).toEqual({
      ok: false,
      message: 'Komentar tidak boleh kosong.',
    });
    expect(normalizeStoryCommentBody('x'.repeat(STORY_COMMENT_MAX_LENGTH + 1))).toEqual({
      ok: false,
      message: `Komentar maksimal ${STORY_COMMENT_MAX_LENGTH} karakter.`,
    });
  });
});
