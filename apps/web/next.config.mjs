const apiInternalUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@anclora/ui', '@anclora/core', '@anclora/tax-engine'],
  typedRoutes: true,
  eslint: { ignoreDuringBuilds: true },

  // Proxies browser calls to /api/* through this same origin so the session
  // cookie set by the API is scoped to the web domain the browser actually
  // visits, instead of the separate anclora-fiscal-api domain (cross-domain
  // cookies are otherwise never sent back on subsequent page loads).
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
