/** @type {import('next').NextConfig} */
const nextConfig = {
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
