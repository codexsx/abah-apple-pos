import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { avatarImageStyle } from '@/services/avatarCrop';
import { WEB_CAPTURE_IMAGE_ACCEPT } from '@/services/mediaCore';
import {
  deleteStoreStory,
  getActiveStories,
  markStoryViewed,
  uploadStoreStory,
  type StoreStory,
  type StoreStoryGroup,
} from '@/services/stories';

const STORY_DURATION_MS = 6500;

function formatStoryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StoryAvatar({
  group,
  onOpen,
}: {
  group: StoreStoryGroup;
  onOpen: () => void;
}) {
  const author = group.author;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-[74px] shrink-0 flex-col items-center gap-1.5"
    >
      <span
        className={
          'relative flex h-[58px] w-[58px] items-center justify-center rounded-full p-[2px] transition-transform group-active:scale-95 ' +
          (group.hasUnseen
            ? 'bg-[conic-gradient(from_120deg,#2563eb,#06b6d4,#14b8a6,#2563eb)]'
            : 'bg-slate-200')
        }
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-white p-[3px]">
          {author.avatar_url ? (
            <img
              src={author.avatar_url}
              alt={author.name}
              className="h-full w-full rounded-full object-cover"
              style={avatarImageStyle(author)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-blue-600 text-[13px] font-bold text-white">
              {author.initials}
            </span>
          )}
        </span>
      </span>
      <span className="line-clamp-1 max-w-full text-center text-[11px] font-semibold text-slate-700">
        {author.name.split(' ')[0]}
      </span>
    </button>
  );
}

export default function StoreStories() {
  const { user, profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<StoreStoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<{ groupIndex: number; storyIndex: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [mirrorUpload, setMirrorUpload] = useState(false);

  const activeGroup = viewer ? groups[viewer.groupIndex] : null;
  const activeStory = activeGroup ? activeGroup.stories[viewer?.storyIndex ?? 0] : null;
  const activeStoryId = activeStory?.id;
  const activeStoryViewed = activeStory?.viewed ?? true;
  const canDeleteActiveStory = Boolean(
    activeStory && (activeStory.author_id === user?.id || profile?.role === 'MANAJER'),
  );

  const refreshStories = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      setGroups(await getActiveStories(user.id));
    } catch (err) {
      console.error('[StoreStories] load error:', err);
      setError(err instanceof Error ? err.message : 'Story toko tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshStories();
  }, [refreshStories]);

  const openViewer = useCallback((groupIndex: number) => {
    const firstUnseen = groups[groupIndex]?.stories.findIndex((story) => !story.viewed) ?? -1;
    setViewer({ groupIndex, storyIndex: firstUnseen >= 0 ? firstUnseen : 0 });
  }, [groups]);

  const closeViewer = useCallback(() => {
    setViewer(null);
    setProgress(0);
  }, []);

  const goNext = useCallback(() => {
    setViewer((current) => {
      if (!current) return current;
      const group = groups[current.groupIndex];
      if (!group) return null;
      if (current.storyIndex < group.stories.length - 1) {
        return { ...current, storyIndex: current.storyIndex + 1 };
      }
      if (current.groupIndex < groups.length - 1) {
        return { groupIndex: current.groupIndex + 1, storyIndex: 0 };
      }
      return null;
    });
  }, [groups]);

  const goPrev = useCallback(() => {
    setViewer((current) => {
      if (!current) return current;
      if (current.storyIndex > 0) return { ...current, storyIndex: current.storyIndex - 1 };
      if (current.groupIndex > 0) {
        const previousGroup = groups[current.groupIndex - 1];
        return { groupIndex: current.groupIndex - 1, storyIndex: Math.max(0, previousGroup.stories.length - 1) };
      }
      return current;
    });
  }, [groups]);

  useEffect(() => {
    if (!activeStoryId || !user?.id) return;

    setProgress(0);
    if (!activeStoryViewed) {
      markStoryViewed(activeStoryId, user.id)
        .then(() => {
          setGroups((current) => current.map((group) => {
            const stories = group.stories.map((story) => (
              story.id === activeStoryId ? { ...story, viewed: true } : story
            ));
            return {
              ...group,
              stories,
              hasUnseen: stories.some((story) => !story.viewed),
            };
          }));
        })
        .catch((err) => console.warn('[StoreStories] mark viewed failed:', err));
    }
  }, [activeStoryId, activeStoryViewed, user?.id]);

  useEffect(() => {
    if (!activeStoryId) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.min(100, ((Date.now() - startedAt) / STORY_DURATION_MS) * 100);
      setProgress(next);
      if (next >= 100) {
        window.clearInterval(timer);
        goNext();
      }
    }, 80);

    return () => window.clearInterval(timer);
  }, [activeStoryId, goNext]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user?.id || uploading) return;

    setUploading(true);
    setError('');
    try {
      await uploadStoreStory({ userId: user.id, file, mirror: mirrorUpload });
      await refreshStories();
    } catch (err) {
      console.error('[StoreStories] upload error:', err);
      setError(err instanceof Error ? err.message : 'Story tidak dapat diupload.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteStory(story: StoreStory) {
    if (!canDeleteActiveStory) return;
    setError('');
    try {
      await deleteStoreStory(story);
      closeViewer();
      await refreshStories();
    } catch (err) {
      console.error('[StoreStories] delete error:', err);
      setError(err instanceof Error ? err.message : 'Story tidak dapat dihapus.');
    }
  }

  const totalStories = useMemo(
    () => groups.reduce((sum, group) => sum + group.stories.length, 0),
    [groups],
  );

  return (
    <>
      <section className="relative z-10 mb-6">
        <div className="rounded-[28px] border border-slate-100 bg-white/85 px-4 py-4 shadow-card backdrop-blur-xl sm:px-5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Story Toko</h2>
              <p className="text-[12px] text-slate-500">
                {totalStories > 0 ? `${totalStories} story aktif` : 'Belum ada story aktif'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMirrorUpload((value) => !value)}
                aria-pressed={mirrorUpload}
                className={
                  'inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors ' +
                  (mirrorUpload
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
                }
              >
                <FlipHorizontal2 size={15} />
                Mirror {mirrorUpload ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-md shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                Upload
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={WEB_CAPTURE_IMAGE_ACCEPT}
              className="sr-only"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex w-[74px] shrink-0 flex-col items-center gap-1.5 disabled:cursor-wait"
            >
              <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full border border-dashed border-blue-200 bg-blue-50 text-blue-600">
                {uploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={22} />}
              </span>
              <span className="line-clamp-1 text-center text-[11px] font-semibold text-slate-700">Story Saya</span>
            </button>

            {loading ? (
              <div className="flex min-h-[78px] flex-1 items-center justify-center">
                <Loader2 size={22} className="animate-spin text-slate-300" />
              </div>
            ) : groups.map((group, index) => (
              <StoryAvatar
                key={group.author.id}
                group={group}
                onOpen={() => openViewer(index)}
              />
            ))}
          </div>

          {error && <p className="mt-3 text-[12px] font-medium text-rose-600">{error}</p>}
        </div>
      </section>

      <AnimatePresence>
        {activeStory && activeGroup && (
          <motion.div
            key={activeStory.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950"
          >
            <div className="relative h-full w-full max-w-[520px] overflow-hidden bg-slate-950">
              <div className="absolute left-0 right-0 top-0 z-20 bg-gradient-to-b from-black/75 via-black/25 to-transparent px-4 pb-8 pt-4">
                <div className="mb-4 flex gap-1">
                  {activeGroup.stories.map((story, index) => (
                    <div key={story.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-white transition-[width] duration-100"
                        style={{
                          width: index < (viewer?.storyIndex ?? 0)
                            ? '100%'
                            : index === (viewer?.storyIndex ?? 0)
                              ? `${progress}%`
                              : '0%',
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {activeGroup.author.avatar_url ? (
                      <img
                        src={activeGroup.author.avatar_url}
                        alt={activeGroup.author.name}
                        className="h-10 w-10 rounded-full object-cover ring-1 ring-white/30"
                        style={avatarImageStyle(activeGroup.author)}
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-[13px] font-bold text-white ring-1 ring-white/30">
                        {activeGroup.author.initials}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-white">{activeGroup.author.name}</p>
                      <p className="text-[11px] font-medium text-white/60">{formatStoryTime(activeStory.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canDeleteActiveStory && (
                      <button
                        type="button"
                        onClick={() => handleDeleteStory(activeStory)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                        aria-label="Hapus story"
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeViewer}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                      aria-label="Tutup story"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <img
                src={activeStory.media_url}
                alt={activeStory.caption || 'Story toko'}
                className="h-full w-full object-contain"
              />

              {activeStory.caption && (
                <div className="absolute bottom-8 left-4 right-4 z-20 rounded-2xl bg-black/45 px-4 py-3 text-[14px] font-medium text-white backdrop-blur">
                  {activeStory.caption}
                </div>
              )}

              <button
                type="button"
                onClick={goPrev}
                className="absolute bottom-0 left-0 top-24 z-10 flex w-1/3 items-center justify-start px-3 text-white/70"
                aria-label="Story sebelumnya"
              >
                <ChevronLeft size={30} />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute bottom-0 right-0 top-24 z-10 flex w-1/3 items-center justify-end px-3 text-white/70"
                aria-label="Story berikutnya"
              >
                <ChevronRight size={30} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
