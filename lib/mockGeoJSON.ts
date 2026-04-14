import type { FeatureCollection, Geometry } from 'geojson';
import type { RailwayFeatureProperties } from '@/lib/supabaseClient';

export const MOCK_GEOJSON: FeatureCollection<Geometry, RailwayFeatureProperties> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[120.0, 23.5], [121.0, 23.9], [121.5, 24.0]] },
      properties: {
        id: 'mock-line-1',
        feature_type: 'line',
        name: 'Mock TRA Line',
        system_type: 'TRA',
        color_hex: '#ff0000',
      } as RailwayFeatureProperties,
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121.0, 23.9] },
      properties: {
        id: 'mock-station-1',
        feature_type: 'station',
        name: 'Mock Station 1',
        system_type: 'TRA',
      } as RailwayFeatureProperties,
    },
  ],
};
