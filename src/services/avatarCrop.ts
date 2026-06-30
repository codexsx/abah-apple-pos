import type { CSSProperties } from 'react';

export interface AvatarCrop {
  avatar_crop_x: number;
  avatar_crop_y: number;
  avatar_zoom: number;
}

export const DEFAULT_AVATAR_CROP: AvatarCrop = {
  avatar_crop_x: 50,
  avatar_crop_y: 50,
  avatar_zoom: 1,
};

type AvatarCropInput = Partial<Record<keyof AvatarCrop, unknown>>;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (value == null || value === '') return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

export function normalizeAvatarCrop(input: AvatarCropInput | null | undefined): AvatarCrop {
  return {
    avatar_crop_x: clampNumber(input?.avatar_crop_x, 0, 100, DEFAULT_AVATAR_CROP.avatar_crop_x),
    avatar_crop_y: clampNumber(input?.avatar_crop_y, 0, 100, DEFAULT_AVATAR_CROP.avatar_crop_y),
    avatar_zoom: clampNumber(input?.avatar_zoom, 0.8, 2.5, DEFAULT_AVATAR_CROP.avatar_zoom),
  };
}

export function avatarImageStyle(input: AvatarCropInput | null | undefined): CSSProperties {
  const crop = normalizeAvatarCrop(input);
  return {
    objectPosition: `${crop.avatar_crop_x}% ${crop.avatar_crop_y}%`,
    transform: `scale(${crop.avatar_zoom})`,
    transformOrigin: `${crop.avatar_crop_x}% ${crop.avatar_crop_y}%`,
  };
}
