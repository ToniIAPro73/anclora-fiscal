/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@anclora/ui', '@anclora/core', '@anclora/tax-engine'],
  typedRoutes: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
