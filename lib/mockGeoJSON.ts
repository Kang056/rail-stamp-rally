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
        // Sample badge for demo/development mode — a gold circle with "TRA" label
        badge_image_url:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PGNpcmNsZSBjeD0iMTgiIGN5PSIxOCIgcj0iMTYiIGZpbGw9IiNmZmQ3MDAiIHN0cm9rZT0iI2I4ODYwYiIgc3Ryb2tlLXdpZHRoPSIyIi8+PHRleHQgeD0iMTgiIHk9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjE0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMzMzMiPlRSQTwvdGV4dD48L3N2Zz4K',
      } as RailwayFeatureProperties,
    },
  ],
};
