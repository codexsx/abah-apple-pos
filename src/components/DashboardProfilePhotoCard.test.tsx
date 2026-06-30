import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardProfilePhotoCard from './DashboardProfilePhotoCard';

describe('DashboardProfilePhotoCard', () => {
  it('renders the profile photo with a blurred overlay containing name and role', () => {
    const onEdit = vi.fn();

    render(
      <DashboardProfilePhotoCard
        avatarUrl="https://example.test/avatar.png"
        avatarCrop={{ avatar_crop_x: 45, avatar_crop_y: 35, avatar_zoom: 1.25 }}
        displayName="Alex Chen"
        initials="AC"
        role="UI/UX Designer"
        onEditPhoto={onEdit}
      />,
    );

    expect(screen.getByRole('img', { name: 'Alex Chen' })).toHaveAttribute(
      'src',
      'https://example.test/avatar.png',
    );
    expect(screen.getByRole('img', { name: 'Alex Chen' })).toHaveStyle({
      objectPosition: '45% 35%',
      transform: 'scale(1.25)',
    });
    expect(screen.getByText('Alex Chen')).toBeVisible();
    expect(screen.getByText('UI/UX Designer')).toBeVisible();
    expect(screen.getByTestId('profile-photo-overlay')).toHaveClass('backdrop-blur-md');
  });

  it('can render the whole dashboard profile as the photo-card shape', () => {
    render(
      <DashboardProfilePhotoCard
        variant="hero"
        avatarUrl=""
        displayName="Alex Chen"
        initials="AC"
        role="UI/UX Designer"
        onEditPhoto={vi.fn()}
      />,
    );

    expect(screen.getByTestId('profile-shape-card')).toHaveClass('rounded-[32px]');
    expect(screen.getByTestId('profile-photo-overlay')).toHaveClass('backdrop-blur-md');
    expect(screen.getByText('AC')).toBeVisible();
    expect(screen.getByText('Alex Chen')).toBeVisible();
    expect(screen.getByText('UI/UX Designer')).toBeVisible();
  });
});
