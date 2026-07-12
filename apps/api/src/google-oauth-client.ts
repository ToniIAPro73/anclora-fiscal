import { z } from 'zod';
import type { GoogleOAuthConfig } from './google-oauth-config.js';

const GOOGLE_ACCESS_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

const googleUserSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});

export interface GoogleOAuthIdentity {
  provider: 'google';
  providerAccountId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface GoogleOAuthCodeInput {
  code: string;
  codeVerifier: string;
}

export type GoogleFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

async function exchangeCodeForAccessToken(
  config: GoogleOAuthConfig,
  input: GoogleOAuthCodeInput,
  fetchImplementation: GoogleFetch,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: config.callbackUrl,
    grant_type: 'authorization_code',
    code_verifier: input.codeVerifier,
  });

  const response = await fetchImplementation(GOOGLE_ACCESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error('Google OAuth token exchange failed');
  }

  const parsed = tokenResponseSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error('Google OAuth returned an invalid token response');
  }

  return parsed.data.access_token;
}

async function readGoogleUser(
  accessToken: string,
  fetchImplementation: GoogleFetch,
): Promise<z.infer<typeof googleUserSchema>> {
  const response = await fetchImplementation(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Google OAuth user lookup failed');
  }

  const parsed = googleUserSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error('Google OAuth returned an invalid user');
  }

  return parsed.data;
}

export async function resolveGoogleOAuthIdentity(
  config: GoogleOAuthConfig,
  input: GoogleOAuthCodeInput,
  fetchImplementation: GoogleFetch = fetch,
): Promise<GoogleOAuthIdentity> {
  const accessToken = await exchangeCodeForAccessToken(
    config,
    input,
    fetchImplementation,
  );
  const user = await readGoogleUser(accessToken, fetchImplementation);

  if (!user.email_verified) {
    throw new Error('Google account email is not verified');
  }

  return {
    provider: 'google',
    providerAccountId: user.sub,
    email: user.email.toLowerCase(),
    displayName: user.name?.trim() || user.email,
    ...(user.picture ? { avatarUrl: user.picture } : {}),
  };
}
