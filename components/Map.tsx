'use client';

/**
 * Map.tsx — Leaflet WebGIS map component for Rail Stamp Rally (鐵道集旅)
 *
 * IMPORTANT: This component must be imported with next/dynamic + ssr:false
 * because Leaflet relies on browser-only APIs (window, document).
 *
 * Usage in a page:
 *   const Map = dynamic(() => import('@/components/Map'), { ssr: false });
 */

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { FeatureCollection, Geometry } from 'geojson';
import type { RailwayFeatureProperties, LineProperties } from '@/lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface MapProps {
  /** Full GeoJSON FeatureCollection fetched from Supabase RPC */
  geojson: FeatureCollection<Geometry, RailwayFeatureProperties> | null;
  /** Called when the user clicks on a station or line feature */
  onFeatureClick: (properties: RailwayFeatureProperties) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filmstrip (膠捲) polyline helper
//
// Intercity railways (TRA / HSR) are rendered as two stacked polylines:
//   1. A thick white base layer  → creates the "film border" effect
//   2. A thin dashed colored top layer → represents the actual rail line
//
// This replicates the look of a classic photographic film strip.
// ─────────────────────────────────────────────────────────────────────────────
function addFilmstripPolyline(
  L: typeof import('leaflet'),
  target: any,
  // GeoJSON coordinates array: [lng, lat][]
  coordinates: [number, number][],
  color: string,
) {
  const latLngs = coordinates.map(([lng, lat]) => L.latLng(lat, lng));

  // Layer 1 — thick white base (the "film" strip background)
  L.polyline(latLngs, {
    color: '#ffffff',
    weight: 8,
    opacity: 1,
    interactive: false,
  }).addTo(target);

  // Layer 2 — dashed colored top line (the railway track color)
  L.polyline(latLngs, {
    color,
    weight: 3,
    opacity: 0.9,
    dashArray: '12, 6',
    interactive: true,
  }).addTo(target);
}

// ─────────────────────────────────────────────────────────────────────────────
// MapComponent
// ─────────────────────────────────────────────────────────────────────────────
export default function MapComponent({ geojson, onFeatureClick }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Ensure Leaflet CSS is present (CDN fallback)
    if (typeof document !== 'undefined' && !document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.crossOrigin = '';
      link.setAttribute('data-leaflet-css', 'true');
      document.head.appendChild(link);
    }

    // Dynamically import Leaflet (browser-only)
    import('leaflet').then((L) => {
      // Fix default marker icon paths broken by webpack
      /* eslint-disable */
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      /* eslint-enable */
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl: '/leaflet/marker-icon.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      });

      // ── Initialize map with Canvas renderer for performance ──────────────
      // Canvas renderer is crucial when rendering thousands of station points.
      const map = L.map(containerRef.current!, {
        renderer: L.canvas(),
        center: [23.9, 121.0], // Geographic center of Taiwan
        zoom: 8,
        zoomControl: true,
        attributionControl: true,
      });

      mapRef.current = map;

      // Create/attach a feature layer group for geojson layers (so we can clear and re-add)
      if (!(map as any).__featureLayer) {
        (map as any).__featureLayer = L.layerGroup().addTo(map);
      } else {
        (map as any).__featureLayer.clearLayers();
      }

      // ── Base tile layer (OpenStreetMap) ───────────────────────────────────
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Once tiles load, ensure sizing is correct
      tileLayer.on('load', () => {
        try { map.invalidateSize(true); } catch (e) { /* ignore */ }
        setTimeout(() => { try { map.invalidateSize(true); } catch (e) { /* ignore */ } }, 300);
      });

      // Ensure correct sizing after layout/rendering (fixes visual tile artifacts)
      map.whenReady(() => {
        try { map.invalidateSize(true); } catch (e) { /* ignore */ }
        setTimeout(() => { try { map.invalidateSize(true); } catch (e) { /* ignore */ } }, 500);
      });

      // Resize handler to keep tiles in sync with container size
      const onResize = () => { try { map.invalidateSize(); } catch (e) { /* ignore */ } };
      window.addEventListener('resize', onResize);

      // ── Render GeoJSON features ──────────────────────────────────────────
      if (geojson) {
        renderGeoJSON(L, map, geojson, onFeatureClick);
      }

      // attach cleanup hooks
      (map as any).__onCleanup = () => {
        window.removeEventListener('resize', onResize);
        tileLayer.off('load');
      };
    });

    // Cleanup on unmount
    return () => {
      try {
        const map = mapRef.current;
        if (map) {
          const cb = (map as any).__onCleanup;
          if (typeof cb === 'function') cb();
          map.remove();
        }
      } catch (e) {
        // ignore
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render GeoJSON when data changes after initial mount
  useEffect(() => {
    if (!mapRef.current || !geojson) return;

    import('leaflet').then((L) => {
      renderGeoJSON(L, mapRef.current!, geojson, onFeatureClick);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      aria-label="Rail Stamp Rally interactive map"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// renderGeoJSON
// Separates features into lines (rendered first / behind) and stations.
// For TRA and HSR lines the Filmstrip style is applied.
// For MRT/metro lines a solid polyline is used.
// Stations are rendered as CircleMarkers for canvas performance.
// ─────────────────────────────────────────────────────────────────────────────
function renderGeoJSON(
  L: typeof import('leaflet'),
  map: LeafletMap,
  geojson: FeatureCollection<Geometry, RailwayFeatureProperties>,
  onFeatureClick: (properties: RailwayFeatureProperties) => void,
) {
  // Ensure a dedicated feature layer exists
  let featureLayer: any = (map as any).__featureLayer;
  if (!featureLayer) {
    featureLayer = (map as any).__featureLayer = L.layerGroup().addTo(map);
  } else {
    featureLayer.clearLayers();
  }

  const lines = geojson.features.filter((f) => f.properties.feature_type === 'line');
  const stations = geojson.features.filter((f) => f.properties.feature_type === 'station');

  // ── Railway lines ────────────────────────────────────────────────────────
  lines.forEach((feature) => {
    if (!feature.geometry) return;

    const props = feature.properties as LineProperties;
    const color = props.color_hex ?? '#888888';
    const isIntercity = props.system_type === 'TRA' || props.system_type === 'HSR';

    const extractCoordinateArrays = (): [number, number][][] => {
      if (feature.geometry.type === 'LineString') {
        return [feature.geometry.coordinates as [number, number][]];
      }
      if (feature.geometry.type === 'MultiLineString') {
        return feature.geometry.coordinates as [number, number][][];
      }
      return [];
    };

    extractCoordinateArrays().forEach((coords) => {
      if (isIntercity) {
        // Filmstrip style for intercity railways
        addFilmstripPolyline(L, featureLayer, coords, color);
      } else {
        // Solid colored line for metro/MRT systems
        const latLngs = coords.map(([lng, lat]) => L.latLng(lat, lng));
        L.polyline(latLngs, { color, weight: 4, opacity: 0.85 })
          .on('click', () => onFeatureClick(props))
          .addTo(featureLayer);
      }
    });
  });

  // ── Stations ─────────────────────────────────────────────────────────────
  stations.forEach((feature) => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return;

    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const props = feature.properties;

    L.circleMarker([lat, lng], {
      radius: 5,
      fillColor: '#ffffff',
      color: '#333333',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 1,
    })
      .on('click', () => onFeatureClick(props))
      .addTo(featureLayer);
  });

  // Ensure tiles/layout update after rendering
  try {
    map.invalidateSize(true);
    setTimeout(() => { try { map.invalidateSize(true); } catch (e) { /* ignore */ } }, 250);
  } catch (e) {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: VectorGrid integration (geojson-vt + Leaflet.VectorGrid)
//
// For very large datasets (10 000+ features) consider switching to VectorGrid
// which tiles the GeoJSON client-side for better performance at low zoom:
//
//   import geojsonvt from 'geojson-vt';
//   import 'leaflet.vectorgrid';
//
//   const tileIndex = geojsonvt(geojson, { maxZoom: 18, tolerance: 3 });
//
//   const vectorGrid = (L as any).vectorGrid.slicer(geojson, {
//     maxZoom: 18,
//     vectorTileLayerStyles: {
//       sliced: (properties: RailwayFeatureProperties) => ({
//         weight: 2,
//         color: (properties as LineProperties).color_hex ?? '#888',
//         fillColor: '#fff',
//         fill: properties.feature_type === 'station',
//         radius: 4,
//       }),
//     },
//     interactive: true,
//     getFeatureId: (f: { properties: RailwayFeatureProperties }) => f.properties.id,
//   });
//
//   vectorGrid.on('click', (e: L.LeafletMouseEvent & { layer: { properties: RailwayFeatureProperties } }) => {
//     onFeatureClick(e.layer.properties);
//   });
//
//   vectorGrid.addTo(map);
// ─────────────────────────────────────────────────────────────────────────────
