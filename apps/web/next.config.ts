import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/product",
        destination: "/",
      },
      {
        source: "/features",
        destination: "/",
      },
      {
        source: "/how-it-works",
        destination: "/",
      },
      {
        source: "/platforms",
        destination: "/",
      },
      {
        source: "/byok",
        destination: "/",
      },
    ];
  },
};

export default nextConfig;
