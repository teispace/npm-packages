import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@teispace/teieditor'],
};

export default nextConfig;
