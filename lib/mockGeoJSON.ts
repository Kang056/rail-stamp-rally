import type { FeatureCollection, Geometry } from 'geojson';
import type { RailwayFeatureProperties } from '@/lib/supabaseClient';

// Demo badge: gold circle with "TRA" label (used in development / fallback mode)
const MOCK_BADGE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">',
  '<circle cx="18" cy="18" r="16" fill="#ffd700" stroke="#b8860b" stroke-width="2"/>',
  '<text x="18" y="24" text-anchor="middle" font-size="14"',
  ' font-family="sans-serif" font-weight="bold" fill="#333">TRA</text>',
  '</svg>',
].join('');
const MOCK_BADGE_URL = `data:image/svg+xml;base64,${btoa(MOCK_BADGE_SVG)}`;

export const MOCK_GEOJSON: FeatureCollection<Geometry, RailwayFeatureProperties> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[120.0, 23.5], [121.0, 23.9], [121.5, 24.0]] },
      properties: {
        id: 'mock-line-1',
        feature_type: 'line',
        line_id: 'mock-line-1',
        line_name: 'Mock TRA Line',
        system_type: 'TRA',
        color_hex: '#ff0000',
        history_desc: null,
      } as RailwayFeatureProperties,
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121.0, 23.9] },
      properties: {
        id: 'mock-station-1',
        feature_type: 'station',
        station_id: 'mock-station-1',
        station_name: 'Mock Station 1',
        system_type: 'TRA',
        line_id: 'mock-line-1',
        established_year: null,
        history_desc: null,
        history_image_url: null,
        badge_image_url: MOCK_BADGE_URL,
      } as RailwayFeatureProperties,
    },
  ],
};
