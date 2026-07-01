export const STORY_TTL_HOURS = 24;
export const STORY_MAX_DIMENSION = 1080;
export const STORY_WEBP_QUALITY = 0.76;

export interface StoryMediaResult {
  blob: Blob;
  width: number;
  height: number;
}

export interface StoryRecordCore {
  id: string;
  author_id: string;
  created_at: string;
  viewed: boolean;
}

export interface StoryGroupCore<T extends StoryRecordCore = StoryRecordCore> {
  authorId: string;
  stories: T[];
  hasUnseen: boolean;
  latestCreatedAt: string;
}

export function storyExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + STORY_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function isActiveStory(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() > now.getTime();
}

export function groupStoriesByAuthor<T extends StoryRecordCore>(stories: T[]): StoryGroupCore<T>[] {
  const grouped = new Map<string, StoryGroupCore<T>>();

  for (const story of stories) {
    const existing = grouped.get(story.author_id);
    if (existing) {
      existing.stories.push(story);
      existing.hasUnseen = existing.hasUnseen || !story.viewed;
      if (new Date(story.created_at).getTime() > new Date(existing.latestCreatedAt).getTime()) {
        existing.latestCreatedAt = story.created_at;
      }
    } else {
      grouped.set(story.author_id, {
        authorId: story.author_id,
        stories: [story],
        hasUnseen: !story.viewed,
        latestCreatedAt: story.created_at,
      });
    }
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      stories: [...group.stories].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    }))
    .sort((a, b) => Number(b.hasUnseen) - Number(a.hasUnseen)
      || new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gambar story tidak dapat dibaca.'));
    };
    img.src = url;
  });
}

export async function convertImageFileToWebp(
  file: File,
  maxDimension = STORY_MAX_DIMENSION,
  quality = STORY_WEBP_QUALITY,
): Promise<StoryMediaResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Story saat ini hanya menerima file gambar.');
  }

  const img = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Browser tidak mendukung kompresi gambar.');
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });

  if (!blob) throw new Error('Gambar tidak dapat dikonversi ke WebP.');
  return { blob, width, height };
}
