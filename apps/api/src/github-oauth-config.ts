import { z } from 'zod';

const githubOAuthConfigSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  callbackUrl: z.string().url(),
});

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

type Environment = Record<string, string | undefined>;

export function readGitHubOAuthConfig(
  environment: Environment = process.env,
): GitHubOAuthConfig | null {
  const rawConfig = {
    clientId: environment.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: environment.GITHUB_OAUTH_CLIENT_SECRET,
    callbackUrl: environment.GITHUB_OAUTH_CALLBACK_URL,
  };

  const isConfigured = Object.values(rawConfig).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );

  if (!isConfigured) {
    return null;
  }

  return githubOAuthConfigSchema.parse(rawConfig);
}
