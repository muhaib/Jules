const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy the API through this origin so the session cookie is first-party.
  // Without it the dashboard and API are cross-site and the cookie needs
  // SameSite=None; Secure, which does not work over plain http in development.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/auth/:path*', destination: `${API_URL}/auth/:path*` },
    ];
  },
};

module.exports = nextConfig;
