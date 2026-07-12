'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useState } from 'react';
import medal from '../../../../../packages/ui/assets/brand/anclora-fiscal-medalla-oro-transparente.png';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  github_cancelled: 'Has cancelado el acceso mediante GitHub.',
  github_invalid_state:
    'La solicitud de acceso mediante GitHub ha caducado o no es válida.',
  github_not_authorized:
    'La cuenta de GitHub no está autorizada para acceder a Anclora Fiscal.',
  github_error:
    'No se ha podido completar el acceso mediante GitHub.',
  google_cancelled: 'Has cancelado el acceso mediante Google.',
  google_invalid_state:
    'La solicitud de acceso mediante Google ha caducado o no es válida.',
  google_not_authorized:
    'La cuenta de Google no está autorizada para acceder a Anclora Fiscal.',
  google_error:
    'No se ha podido completar el acceso mediante Google.',
};

function safeNextPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const oauthError = params.get('oauth');

    if (oauthError && OAUTH_ERROR_MESSAGES[oauthError]) {
      setError(OAUTH_ERROR_MESSAGES[oauthError]);
      return;
    }

    if (!params.has('next')) {
      return;
    }

    // A SameSite=Strict session cookie created during the cross-site OAuth
    // callback may be withheld during that redirect chain. Once the login page
    // has loaded, a same-origin session check can see the cookie and complete
    // the navigation without asking the user to click Google a second time.
    void (async () => {
      try {
        const response = await fetch('/api/v1/session', {
          credentials: 'include',
          cache: 'no-store',
        });
        const session = (await response.json()) as { authenticated?: boolean };

        if (response.ok && session.authenticated) {
          window.location.assign(safeNextPath(search));
        }
      } catch {
        // The normal credential form remains available if the check fails.
      }
    })();
  }, []);

  function startGitHubLogin() {
    window.location.assign('/api/v1/auth/oauth/github/start');
  }

  function startGoogleLogin() {
    window.location.assign('/api/v1/auth/oauth/google/start');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      if (!response.ok) {
        setError('No se ha podido iniciar sesión. Revisa tus credenciales.');
        return;
      }
      window.location.assign('/');
    } catch {
      setError('El servicio de acceso no está disponible en este momento.');
    } finally {
      setPending(false);
    }
  }

  return <main className="login-page">
    <div className="login-blob login-blob-one" aria-hidden="true" />
    <div className="login-blob login-blob-two" aria-hidden="true" />
    <section className="login-card" aria-labelledby="login-title">
      <header className="login-brand">
        <Image className="login-logo" src={medal} width={50} height={50} alt="Logotipo de Anclora Fiscal" priority />
        <div className="login-divider" aria-hidden="true" />
        <h1 id="login-title">Anclora Fiscal</h1>
      </header>
      <form className="login-form" onSubmit={submit}>
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="email" required aria-required="true" autoFocus />
        <label htmlFor="password">Contraseña</label>
        <div className="password-field">
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required aria-required="true" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <button className="login-submit" type="submit" disabled={pending}>{pending ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
        <a className="login-forgot" href="/auth/forgot-password">¿Has olvidado tu contraseña?</a>
        <p className="login-register">¿No tienes una cuenta? <a href="/auth/register">Solicitar acceso</a></p>
        <div className="social-separator"><span>Acceso social</span></div>
        <div className="social-buttons">
          <button type="button" onClick={startGoogleLogin}>Google</button>
          <button type="button" onClick={startGitHubLogin}>GitHub</button>
        </div>
      </form>
      <footer className="login-legal">Al iniciar sesión aceptas los <a href="/terms">términos de uso</a> y la <a href="/privacy">política de privacidad</a>.<br />© {new Date().getFullYear()} Anclora Group — Todos los derechos reservados.</footer>
    </section>
  </main>;
}
