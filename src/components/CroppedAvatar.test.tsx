import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CroppedAvatar } from './CroppedAvatar';

describe('CroppedAvatar', () => {
  it('clips zoomed profile photos inside the avatar frame', () => {
    render(
      <CroppedAvatar
        src="/radiva.jpg"
        alt="Radiva"
        crop={{
          avatar_crop_x: 49,
          avatar_crop_y: 67,
          avatar_zoom: 1.65,
        }}
        className="h-9 w-9 rounded-full"
      />,
    );

    const image = screen.getByRole('img', { name: 'Radiva' });
    const frame = image.parentElement;

    expect(frame).toHaveClass('overflow-hidden', 'h-9', 'w-9', 'rounded-full');
    expect(image).toHaveClass('h-full', 'w-full', 'object-cover');
    expect(image).toHaveStyle({
      objectPosition: '49% 67%',
      transform: 'scale(1.65)',
      transformOrigin: '49% 67%',
    });
  });
});
