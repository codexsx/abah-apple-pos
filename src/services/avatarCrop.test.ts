import { describe, expect, it } from 'vitest';
import { avatarImageStyle, normalizeAvatarCrop } from './avatarCrop';

describe('avatarCrop helpers', () => {
  it('normalizes missing and out-of-range crop settings', () => {
    expect(
      normalizeAvatarCrop({
        avatar_crop_x: -20,
        avatar_crop_y: 140,
        avatar_zoom: 9,
      }),
    ).toEqual({
      avatar_crop_x: 0,
      avatar_crop_y: 100,
      avatar_zoom: 2.5,
    });

    expect(normalizeAvatarCrop(null)).toEqual({
      avatar_crop_x: 50,
      avatar_crop_y: 50,
      avatar_zoom: 1,
    });
  });

  it('creates object-fit styles from stored crop settings', () => {
    expect(
      avatarImageStyle({
        avatar_crop_x: 42,
        avatar_crop_y: 61,
        avatar_zoom: 1.35,
      }),
    ).toEqual({
      objectPosition: '42% 61%',
      transform: 'scale(1.35)',
      transformOrigin: '42% 61%',
    });
  });
});
