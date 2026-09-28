/** @type {import('next').NextConfig} */

// Where the NestJS API actually lives. Only the Next server talks to this
// directly; browsers go through the rewrite below.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,

  async rewrites() {
    return [
      {
        // The browser only ever calls same-origin `/api/...`, and Next proxies
        // it to Nest. That removes cross-origin requests from the picture
        // entirely: no preflights, no CORS failures, and in production the API
        // does not need to be publicly reachable at all.
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },

  images: {
    // Token art is arbitrary user-uploaded IPFS/CDN content; we render it with
    // plain <img>, so no remote patterns are configured on purpose.
    unoptimized: true,
  },
};

export default nextConfig;
