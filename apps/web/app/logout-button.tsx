'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function LogoutButton() {
  async function logout() {
    await fetch(`${API_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.assign('/auth/login');
  }

  return <button className="logout-button" type="button" onClick={logout}>Cerrar sesión</button>;
}
