import { z } from 'zod';
import type { GitHubOAuthConfig } from './github-oauth-config.js';

const GITHUB_ACCESS_TOKEN_ENDPOINT =
  'https://github.com/login/oauth/access_token';

const GITHUB_USER_ENDPOINT = 'https://api.github.com/user';
const GITHUB_EMAILS_ENDPOINT = 'https://api.github.com/user/emails';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  scope: z.string(),
});

const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string().nullable(),
  email: z.string().email().nullable(),
  avatar_url: z.string().url(),
});

const githubEmailSchema = z.object({
  email: z.string().email(),
  primary: z.boolean(),
  verified: z.boolean(),
  visibility: z.string().nullable(),
});

export interface GitHubOAuthIdentity {
  provider: 'github';
  providerAccountId: string;
  login: string;
  email: string;
  displayName: string;
  avatarUrl: string;
}

export interface GitHubOAuthCodeInput {
  code: string;
  codeVerifier: string;
}

export type GitHubFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

function githubApiHeaders(accessToken: string): HeadersInit {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${accessToken}`,
    'user-agent': 'Anclora-Fiscal',
    'x-github-api-version': '2022-11-28',
  };
}

async function exchangeCodeForAccessToken(
  config: GitHubOAuthConfig,
  input: GitHubOAuthCodeInput,
  fetchImplementation: GitHubFetch,
): Promise<string> {
  const response = await fetchImplementation(GITHUB_ACCESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'Anclora-Fiscal',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: input.code,
      redirect_uri: config.callbackUrl,
      code_verifier: input.codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error('GitHub OAuth token exchange failed');
  }

  const parsed = tokenResponseSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error('GitHub OAuth returned an invalid token response');
  }

  return parsed.data.access_token;
}

async function readGitHubUser(
  accessToken: string,
  fetchImplementation: GitHubFetch,
): Promise<z.infer<typeof githubUserSchema>> {
  const response = await fetchImplementation(GITHUB_USER_ENDPOINT, {
    headers: githubApiHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error('GitHub OAuth user lookup failed');
  }

  const parsed = githubUserSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error('GitHub OAuth returned an invalid user');
  }

  return parsed.data;
}

async function readVerifiedGitHubEmail(
  accessToken: string,
  fetchImplementation: GitHubFetch,
): Promise<string | null> {
  const response = await fetchImplementation(GITHUB_EMAILS_ENDPOINT, {
    headers: githubApiHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error('GitHub OAuth email lookup failed');
  }

  const parsed = z.array(githubEmailSchema).safeParse(await response.json());

  if (!parsed.success) {
    throw new Error('GitHub OAuth returned an invalid email list');
  }

  const primaryEmail = parsed.data.find(
    (candidate) => candidate.primary && candidate.verified,
  );

  const fallbackEmail = parsed.data.find(
    (candidate) => candidate.verified,
  );

  return primaryEmail?.email ?? fallbackEmail?.email ?? null;
}

export async function resolveGitHubOAuthIdentity(
  config: GitHubOAuthConfig,
  input: GitHubOAuthCodeInput,
  fetchImplementation: GitHubFetch = fetch,
): Promise<GitHubOAuthIdentity> {
  const accessToken = await exchangeCodeForAccessToken(
    config,
    input,
    fetchImplementation,
  );

  const [user, verifiedEmail] = await Promise.all([
    readGitHubUser(accessToken, fetchImplementation),
    readVerifiedGitHubEmail(accessToken, fetchImplementation),
  ]);

  const email = verifiedEmail ?? user.email;

  if (!email) {
    throw new Error('GitHub account has no verified email');
  }

  return {
    provider: 'github',
    providerAccountId: String(user.id),
    login: user.login,
    email: email.toLowerCase(),
    displayName: user.name?.trim() || user.login,
    avatarUrl: user.avatar_url,
  };
}
