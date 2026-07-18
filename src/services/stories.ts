import { supabase } from '@/lib/supabase';
import { normalizeAvatarCrop, type AvatarCrop } from '@/services/avatarCrop';
import {
  convertImageFileToWebp,
  groupStoriesByAuthor,
  normalizeStoryCommentBody,
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
  media_url: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  created_at: string;
  expires_at: string;
  viewed: boolean;
  comment_count: number;
  author: StoryAuthor;
}

export interface StoreStoryGroup extends Omit<StoryGroupCore<StoreStory>, 'authorId'> {
  author: StoryAuthor;
}

export interface StoryComment {
  id: string;
  story_id: string;
  author_id: string;
  body: string;
  created_at: string;
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

interface RawStoryCommentRow {
  id: string;
  story_id: string;
  author_id: string;
  body: string;
  created_at: string;
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

function normalizeStoryComment(row: RawStoryCommentRow, author: StoryAuthor): StoryComment {
  return {
    id: row.id,
    story_id: row.story_id,
    author_id: row.author_id,
    body: row.body,
    created_at: row.created_at,
    author,
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

  const [
    { data: profileRows, error: profileError },
    { data: viewRows, error: viewError },
    { data: commentRows, error: commentError },
  ] =
    await Promise.all([
      supabase.rpc('get_story_authors', { p_author_ids: authorIds }),
      supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', currentUserId)
        .in('story_id', storyIds),
      supabase
        .from('story_comments')
        .select('story_id')
        .is('deleted_at', null)
        .in('story_id', storyIds),
    ]);

  if (profileError) throw profileError;
  if (viewError) throw viewError;
  if (commentError) throw commentError;

  const profiles = new Map(
    ((profileRows ?? []) as RawProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const viewed = new Set(((viewRows ?? []) as Array<{ story_id: string }>).map((row) => row.story_id));
  const commentCounts = ((commentRows ?? []) as Array<{ story_id: string }>).reduce((counts, row) => {
    counts.set(row.story_id, (counts.get(row.story_id) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  // The dashboard only needs story metadata and avatars. Do not create signed
  // URLs for every active image until a user opens the specific story.
  const enriched = stories.map((story) => ({
    ...story,
    media_type: 'image' as const,
    media_url: null,
    viewed: viewed.has(story.id),
    comment_count: commentCounts.get(story.id) ?? 0,
    author: normalizeAuthor(profiles.get(story.author_id), story.author_id),
  }));

  return groupStoriesByAuthor(enriched).map((group) => ({
    author: group.stories[0].author,
    stories: group.stories,
    hasUnseen: group.hasUnseen,
    latestCreatedAt: group.latestCreatedAt,
  }));
}

export async function getStoreStoryMediaUrl(mediaPath: string): Promise<string | null> {
  if (!mediaPath) return null;

  const { data, error } = await supabase.storage
    .from(STORE_STORIES_BUCKET)
    .createSignedUrl(mediaPath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadStoreStory(input: {
  userId: string;
  file: File;
  caption?: string;
  mirror?: boolean;
}): Promise<StoreStory['id']> {
  const storyId = crypto.randomUUID();
  const media = await convertImageFileToWebp(input.file, undefined, undefined, {
    mirror: input.mirror ?? false,
  });
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

export async function getStoryComments(storyId: string): Promise<StoryComment[]> {
  const { data: rows, error } = await supabase
    .from('story_comments')
    .select('id, story_id, author_id, body, created_at')
    .eq('story_id', storyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const comments = (rows ?? []) as RawStoryCommentRow[];
  if (comments.length === 0) return [];

  const authorIds = Array.from(new Set(comments.map((comment) => comment.author_id)));
  const { data: authorRows, error: authorError } = await supabase
    .rpc('get_story_comment_authors', { p_author_ids: authorIds });
  if (authorError) throw authorError;

  const authors = new Map(
    ((authorRows ?? []) as RawProfileRow[]).map((author) => [author.id, author]),
  );

  return comments.map((comment) => normalizeStoryComment(
    comment,
    normalizeAuthor(authors.get(comment.author_id), comment.author_id),
  ));
}

export async function addStoryComment(input: {
  storyId: string;
  userId: string;
  body: string;
}): Promise<void> {
  const normalized = normalizeStoryCommentBody(input.body);
  if (!normalized.ok) throw new Error(normalized.message);

  const { error } = await supabase.from('story_comments').insert({
    story_id: input.storyId,
    author_id: input.userId,
    body: normalized.body,
  });
  if (error) throw error;
}

export async function deleteStoryComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('story_comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
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
