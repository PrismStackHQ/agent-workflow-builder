import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@agent-workflow/sdk'],
  serverExternalPackages: ['ws'],
};

export default nextConfig;
