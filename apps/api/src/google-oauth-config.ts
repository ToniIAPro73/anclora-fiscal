import { z } from 'zod';

const googleOAuthConfigSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  callbackUrl: z.string().url(),
});

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

type Environment = Record<string, string | undefined>;

export function readGoogleOAuthConfig(
  environment: Environment = process.env,
): GoogleOAuthConfig | null {
  const rawConfig = {
    clientId: environment.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: environment.GOOGLE_OAUTH_CLIENT_SECRET,
    callbackUrl: environment.GOOGLE_OAUTH_CALLBACK_URL,
  };

  const isConfigured = Object.values(rawConfig).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );

  if (!isConfigured) {
    return null;
  }

  return googleOAuthConfigSchema.parse(rawConfig);
}
