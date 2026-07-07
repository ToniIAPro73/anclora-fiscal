import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoginForm } from './login-form';

describe('LoginForm contract', () => {
  it('renderiza el orden funcional, accesibilidad, legales y OAuth deshabilitado', () => {
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
    expect(screen.getByRole('button', { name: 'Google' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'GitHub' })).toBeDisabled();
  });
});
