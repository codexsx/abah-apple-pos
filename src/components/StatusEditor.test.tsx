// Feature: stock-source-of-truth (Phase 3)
// Component tests for the reusable StatusEditor (task 3.x).
// Validates: Requirements 5.2, 5.3, 5.4

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StatusEditor from './StatusEditor';
import { type StockStatus } from '@/services/stockCore';

function renderEditor(
  props: Partial<React.ComponentProps<typeof StatusEditor>> = {},
) {
  const onSelect = props.onSelect ?? vi.fn();
  const utils = render(
    <StatusEditor
      value={props.value ?? ('READY' as StockStatus)}
      onSelect={onSelect}
      disabled={props.disabled}
    />,
  );
  return { ...utils, onSelect };
}

describe('StatusEditor', () => {
  it('calls onSelect with a valid different target and shows no alert (Req 5.2)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderEditor({ value: 'READY' });

    await user.click(screen.getByRole('radio', { name: 'SERVIS' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('SERVIS');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the disallowed message and does not call onSelect for a same-status no-op (Req 5.4)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderEditor({ value: 'READY' });

    await user.click(screen.getByRole('radio', { name: 'READY' }));

    expect(onSelect).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Perubahan status tidak diizinkan');
  });

  it('renders a disabled control for a terminal TERJUAL value and ignores clicks (Req 5.3)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderEditor({ value: 'TERJUAL' });

    const readyRadio = screen.getByRole('radio', { name: 'READY' });
    expect(readyRadio).toBeDisabled();
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(readyRadio);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
