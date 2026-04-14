/** @type {import('next').NextConfig} */
const nextConfig = {
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
