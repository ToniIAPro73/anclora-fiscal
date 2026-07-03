import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PUBLIC_ROUTES = ['/auth/login', '/auth/forgot-password', '/auth/register', '/terms', '/privacy'];

export async function middleware(request: NextRequest) {
  // /api/* is proxied straight through to the API (see next.config.mjs
  // rewrites) — gating it here would block the login POST itself behind the
  // very auth check it's meant to satisfy.
  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route))) return NextResponse.next();
  try {
    const response = await fetch(`${API_URL}/api/v1/session`, { headers: { cookie: request.headers.get('cookie') ?? '' }, cache: 'no-store' });
    const session = await response.json() as { authenticated?: boolean };
    if (response.ok && session.authenticated) return NextResponse.next();
  } catch {
    // Fail closed when the identity service is unavailable.
  }
  const login = new URL('/auth/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp)$).*)'] };
