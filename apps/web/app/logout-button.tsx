'use client';

interface LogoutButtonProps {
  compact?: boolean;
}

export function LogoutButton({ compact = false }: LogoutButtonProps) {
  async function logout() {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    window.location.assign('/auth/login');
  }

  return (
    <button
      className={`logout-button${compact ? ' logout-button-compact' : ''}`}
      type="button"
      onClick={logout}
      aria-label={compact ? 'Cerrar sesión' : undefined}
      title={compact ? 'Cerrar sesión' : undefined}
    >
      <svg
        className="logout-button-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M10 5H5v14h5" />
        <path d="m14 8 4 4-4 4" />
        <path d="M18 12H9" />
      </svg>

      <span className="logout-button-label">Cerrar sesión</span>
    </button>
  );
}