// Feature: user-management (Phase 9, task 6.5)
// Component tests for the NotificationsMenu bell. The notifications service is
// mocked so the badge count and the popover list are fully controllable. The
// component navigates via react-router's useNavigate, so renders are wrapped in
// <MemoryRouter>; a small route harness verifies navigation on item click.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';

import { getNotificationsWithCount } from '@/services/notifications';
import type { NotificationItem } from '@/services/notificationsCore';

// ---- Mock the service layer ----------------------------------------------
vi.mock('@/services/notifications');

// Import after the mock is registered.
import NotificationsMenu from './NotificationsMenu';

// ---- Fixtures --------------------------------------------------------------

const ITEMS: NotificationItem[] = [
  {
    id: 'a',
    kind: 'overdraft',
    severity: 'critical',
    title: 'Saldo minus',
    detail: 'x',
    route: '/akun-kas',
  },
  {
    id: 'b',
    kind: 'activity',
    severity: 'info',
    title: 'Aktivitas',
    detail: 'y',
    route: '/riwayat/penjualan',
  },
] as unknown as NotificationItem[];

describe('NotificationsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the actionable count badge after loading on mount', async () => {
    vi.mocked(getNotificationsWithCount).mockResolvedValue({
      items: ITEMS,
      actionableCount: 1,
    });

    render(
      <MemoryRouter>
        <NotificationsMenu />
      </MemoryRouter>,
    );

    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  it('opens the popover and navigates to the item route on click', async () => {
    vi.mocked(getNotificationsWithCount).mockResolvedValue({
      items: ITEMS,
      actionableCount: 1,
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/akun-kas" element={<div>AKUN KAS PAGE</div>} />
          <Route path="*" element={<NotificationsMenu />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for the badge so we know loading finished.
    await screen.findByText('1');

    // Open the popover (the trigger's aria-label is "Notifications").
    await user.click(screen.getByRole('button', { name: /notifications/i }));

    // The critical notification appears in the popover (rendered to a portal).
    const item = await screen.findByText('Saldo minus');
    await user.click(item);

    // Navigation occurred: the target route content renders.
    expect(await screen.findByText('AKUN KAS PAGE')).toBeInTheDocument();
  });
});
