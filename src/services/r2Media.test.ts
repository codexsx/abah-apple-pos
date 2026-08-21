import { describe, expect, it } from 'vitest';
import { getR2PublicMediaUrl } from './r2Media';

describe('r2Media public media URLs', () => {
  it('keeps legacy URLs unchanged', () => {
    expect(getR2PublicMediaUrl('https://example.test/logo.png')).toBe('https://example.test/logo.png');
  });

  it('routes R2 avatar keys through the application redirect', () => {
    expect(getR2PublicMediaUrl('r2:avatar/user-1/photo.webp'))
      .toBe('/api/media/public?key=r2%3Aavatar%2Fuser-1%2Fphoto.webp');
  });
});
