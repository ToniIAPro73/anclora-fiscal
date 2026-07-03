'use client';

export function LogoutButton() {
  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.assign('/auth/login');
  }

  return <button className="logout-button" type="button" onClick={logout}>Cerrar sesión</button>;
}
