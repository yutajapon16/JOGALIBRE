import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.yimg.jp',
      },
      {
        protocol: 'https',
        hostname: '**.afimg.jp',
      },
      {
        protocol: 'https',
        hostname: '**.yahoo.co.jp',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
    ],
  },
};

export default nextConfig;
