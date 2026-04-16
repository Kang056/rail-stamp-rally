/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export for GitHub Pages hosting
  output: 'export',
  // Repo is served at https://<user>.github.io/rail-stamp-rally/
  basePath: process.env.NODE_ENV === 'production' ? '/rail-stamp-rally' : '',
  // next/image optimization requires a server; disable for static export
  images: { unoptimized: true },
  // Mark the project root explicitly to avoid Next inferring the wrong workspace root
  outputFileTracingRoot: __dirname,
  // Suppress Leaflet SSR warnings by marking leaflet as external on the server
  webpack: (config, { isServer }) => {
    if (isServer) {
      // leaflet and leaflet.vectorgrid are browser-only libraries
      config.externals = [...(config.externals || []), 'leaflet', 'leaflet.vectorgrid'];
    }
    return config;
  },
};

module.exports = nextConfig;
