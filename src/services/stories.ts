import { supabase } from '@/lib/supabase';
import { normalizeAvatarCrop, type AvatarCrop } from '@/services/avatarCrop';
import {
  convertImageFileToWebp,
  groupStoriesByAuthor,
  type StoryGroupCore,
} from '@/services/storiesCore';

export const STORE_STORIES_BUCKET = 'store-stories';

export interface StoryAuthor extends AvatarCrop {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatar_url: string | null;
}

export interface StoreStory {
  id: string;
  author_id: string;
  media_path: string;
  media_type: 'image';
  media_url: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  created_at: string;
  expires_at: string;
  viewed: boolean;
  author: StoryAuthor;
}

export interface StoreStoryGroup extends Omit<StoryGroupCore<StoreStory>, 'authorId'> {
  author: StoryAuthor;
}

interface RawStoryRow {
  id: string;
  author_id: string;
  media_path: string;
  media_type: 'image';
  caption: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  created_at: string;
  expires_at: string;
}

interface RawProfileRow {
  id: string;
  name: string | null;
  role: string | null;
  initials: string | null;
  avatar_url: string | null;
  avatar_crop_x?: number | null;
  avatar_crop_y?: number | null;
  avatar_zoom?: number | null;
}

function normalizeAuthor(row: RawProfileRow | undefined, fallbackId: string): StoryAuthor {
  const name = row?.name?.trim() || 'Staff';
  return {
    id: row?.id ?? fallbackId,
    name,
    role: row?.role || 'STAFF',
    initials: row?.initials || name.slice(0, 2).toUpperCase(),
    avatar_url: row?.avatar_url ?? null,
    ...normalizeAvatarCrop(row ?? null),
  };
}

function buildStoryPath(userId: string, storyId: string): string {
  return `${userId}/${storyId}.webp`;
}

export async function cleanupExpiredStories(): Promise<void> {
  const { error } = await supabase.rpc('cleanup_expired_stories');
  if (error) {
    console.warn('[stories] cleanup skipped:', error.message);
  }
}

export async function getActiveStories(currentUserId: string): Promise<StoreStoryGroup[]> {
  await cleanupExpiredStories();

  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('stories')
    .select('id, author_id, media_path, media_type, caption, width, height, size_bytes, created_at, expires_at')
    .is('deleted_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const stories = (rows ?? []) as RawStoryRow[];
  if (stories.length === 0) return [];

  const authorIds = Array.from(new Set(stories.map((story) => story.author_id)));
  const storyIds = stories.map((story) => story.id);

  const [{ data: profileRows, error: profileError }, { data: viewRows, error: viewError }] =
    await Promise.all([
      supabase.rpc('get_story_authors', { p_author_ids: authorIds }),
      supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', currentUserId)
        .in('story_id', storyIds),
    ]);

  if (profileError) throw profileError;
  if (viewError) throw viewError;

  const profiles = new Map(
    ((profileRows ?? []) as RawProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const viewed = new Set(((viewRows ?? []) as Array<{ story_id: string }>).map((row) => row.story_id));

  const enriched = await Promise.all(
    stories.map(async (story) => {
      const { data, error: signedError } = await supabase.storage
        .from(STORE_STORIES_BUCKET)
        .createSignedUrl(story.media_path, 15 * 60);
      if (signedError) throw signedError;

      return {
        ...story,
        media_type: 'image' as const,
        media_url: data.signedUrl,
        viewed: viewed.has(story.id),
        author: normalizeAuthor(profiles.get(story.author_id), story.author_id),
      };
    }),
  );

  return groupStoriesByAuthor(enriched).map((group) => ({
    author: group.stories[0].author,
    stories: group.stories,
    hasUnseen: group.hasUnseen,
    latestCreatedAt: group.latestCreatedAt,
  }));
}

export async function uploadStoreStory(input: {
  userId: string;
  file: File;
  caption?: string;
}): Promise<StoreStory['id']> {
  const storyId = crypto.randomUUID();
  const media = await convertImageFileToWebp(input.file);
  const path = buildStoryPath(input.userId, storyId);

  const { error: uploadError } = await supabase.storage
    .from(STORE_STORIES_BUCKET)
    .upload(path, media.blob, {
      contentType: 'image/webp',
      cacheControl: '86400',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('stories').insert({
    id: storyId,
    author_id: input.userId,
    media_path: path,
    media_type: 'image',
    caption: input.caption?.trim() || null,
    width: media.width,
    height: media.height,
    size_bytes: media.blob.size,
  });

  if (insertError) {
    await supabase.storage.from(STORE_STORIES_BUCKET).remove([path]);
    throw insertError;
  }

  return storyId;
}

export async function markStoryViewed(storyId: string, viewerId: string): Promise<void> {
  const { error } = await supabase.from('story_views').upsert(
    {
      story_id: storyId,
      viewer_id: viewerId,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: 'story_id,viewer_id' },
  );
  if (error) throw error;
}

export async function deleteStoreStory(story: Pick<StoreStory, 'id' | 'media_path'>): Promise<void> {
  const { error } = await supabase
    .from('stories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', story.id);
  if (error) throw error;
  await supabase.storage.from(STORE_STORIES_BUCKET).remove([story.media_path]);
}
