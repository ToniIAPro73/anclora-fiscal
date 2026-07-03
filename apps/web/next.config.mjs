/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@anclora/ui', '@anclora/core', '@anclora/tax-engine'],
  experimental: { typedRoutes: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
