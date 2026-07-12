import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/auth/login');
});

describe('LoginForm contract', () => {
  it('renderiza el formulario y habilita el acceso mediante GitHub y Google', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<LoginForm />);
    const email = screen.getByLabelText('Correo electrónico');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveFocus();
    const password = screen.getByLabelText('Contraseña');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
    expect(screen.getByRole('link', { name: '¿Has olvidado tu contraseña?' })).toHaveAttribute('href', '/auth/forgot-password');
    expect(screen.getByRole('link', { name: 'términos de uso' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'política de privacidad' })).toHaveAttribute('href', '/privacy');

    const googleButton = screen.getByRole('button', { name: 'Google' });
    expect(googleButton).toBeEnabled();
    expect(googleButton).not.toHaveAttribute('title', 'Próximamente');

    const githubButton = screen.getByRole('button', { name: 'GitHub' });
    expect(githubButton).toBeEnabled();
    expect(githubButton).not.toHaveAttribute('title', 'Próximamente');
  });

  it('redirige a /api/v1/auth/oauth/google/start al pulsar Google', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Google' }));
    expect(assign).toHaveBeenCalledWith('/api/v1/auth/oauth/google/start');
    vi.unstubAllGlobals();
  });

  it('completa la navegación cuando la sesión OAuth ya está disponible', async () => {
    window.history.replaceState({}, '', '/auth/login?next=/tax-periods');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true }),
    }));
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    render(<LoginForm />);

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/tax-periods');
    });
    expect(fetch).toHaveBeenCalledWith('/api/v1/session', {
      credentials: 'include',
      cache: 'no-store',
    });
    vi.unstubAllGlobals();
  });
});
