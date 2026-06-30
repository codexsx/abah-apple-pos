import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Login from './Login';

// Mock the auth context so rendering the Login page never touches Supabase.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signIn: vi.fn() }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

describe('Login — demo credential exposure', () => {
  // Feature: phase0-critical-bugfixes, Requirement 3.1: no demo credentials rendered
  it('does not render the demo email credential', () => {
    renderLogin();
    expect(screen.queryByText(/lutfi@drhtm\.com/i)).toBeNull();
  });

  it('does not render the demo password credential', () => {
    renderLogin();
    expect(screen.queryByText(/password123/i)).toBeNull();
  });

  it('does not render any "default demo" hint text', () => {
    renderLogin();
    expect(screen.queryByText(/default demo/i)).toBeNull();
  });
});

describe('Login — form still renders', () => {
  it('renders email and password inputs and a Login button', () => {
    const { container } = renderLogin();

    // The identifier field accepts a username OR email, so it is type="text".
    const identifierInput = container.querySelector('input[type="text"]');
    const passwordInput = container.querySelector('input[type="password"]');

    expect(identifierInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(
      screen.getByRole('button', { name: /login/i }),
    ).toBeTruthy();
  });
});
