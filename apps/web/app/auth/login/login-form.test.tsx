import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

describe('LoginForm contract', () => {
  it('renderiza el formulario y habilita el acceso mediante GitHub y Google', () => {
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
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Google' }));
    expect(assign).toHaveBeenCalledWith('/api/v1/auth/oauth/google/start');
    vi.unstubAllGlobals();
  });
});
