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
  /** When true, display badge icons on all stations that have badge_image_url */
  showAllBadges?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zoom-based sizing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Maps zoom level to station CircleMarker radius (px). Default zoom 8 → 12px. */
function getRadiusForZoom(zoom: number): number {
  if (zoom <= 7) return 8;
  if (zoom <= 8) return 12;
  if (zoom <= 10) return 14;
  if (zoom <= 12) return 16;
  if (zoom <= 14) return 20;
  return 24;
}

/** Badge icon size scales proportionally to station radius. */
function getBadgeSizeForZoom(zoom: number): number {
  return Math.round(getRadiusForZoom(zoom) * 1.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG data URI helper — badge_image_url may contain raw SVG markup
// ─────────────────────────────────────────────────────────────────────────────

function toBadgeDataUri(raw: string): string {
  if (raw.startsWith('data:') || raw.startsWith('http')) return raw;
  // Raw SVG string → data URI
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
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
  coordinates: [number, number][],
  color: string,
  onClick?: () => void,
) {
  const latLngs = coordinates.map(([lng, lat]) => L.latLng(lat, lng));

  // Layer 1 — thick white base (the "film" strip background)
  L.polyline(latLngs, {
    color: '#FFFFFF',
    weight: 6,
    opacity: 1,
    interactive: false,
  }).addTo(target);

  // Layer 2 — dashed colored top line (the railway track color)
  const topLine = L.polyline(latLngs, {
    color,
    weight: 4,
    opacity: 0.9,
    dashArray: '10, 10',
    interactive: true,
  }).addTo(target);

  if (onClick) {
    topLine.on('click', onClick);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MapComponent
// ─────────────────────────────────────────────────────────────────────────────
export default function MapComponent({ geojson, onFeatureClick, showAllBadges = false }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const initializingRef = useRef(false);

  // Keep refs up-to-date so the async Leaflet init callback always uses the
  // latest prop values, even if they arrive before the map is ready.
  const geojsonRef = useRef(geojson);
  const onFeatureClickRef = useRef(onFeatureClick);
  const showAllBadgesRef = useRef(showAllBadges);
  geojsonRef.current = geojson;
  onFeatureClickRef.current = onFeatureClick;
  showAllBadgesRef.current = showAllBadges;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || initializingRef.current) return;
    initializingRef.current = true;

    // Track whether this effect was cleaned up (React Strict Mode double-invoke)
    let cancelled = false;

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
      // Guard: component may have unmounted or another init may have won the race
      if (cancelled || !containerRef.current || mapRef.current) {
        initializingRef.current = false;
        return;
      }

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
      const map = L.map(containerRef.current, {
        renderer: L.canvas(),
        center: [23.9, 121.0],
        zoom: 8,
        zoomControl: true,
        attributionControl: true,
      });

      mapRef.current = map;

      // Feature layer group for geojson layers
      (map as any).__featureLayer = L.layerGroup().addTo(map);
      // Arrays for zoom-based size updates
      (map as any).__stationCircles = [] as any[];
      (map as any).__badgeMarkers = [] as any[];

      // ── Zoom-based marker scaling ────────────────────────────────────────
      map.on('zoomend', () => {
        const zoom = map.getZoom();
        const radius = getRadiusForZoom(zoom);
        const badgeSize = getBadgeSizeForZoom(zoom);

        ((map as any).__stationCircles || []).forEach((c: any) => {
          c.setRadius(radius);
        });
        ((map as any).__badgeMarkers || []).forEach(({ marker, dataUri }: any) => {
          marker.setIcon(L.divIcon({
            className: '',
            html: `<img src="${dataUri}" style="width:${badgeSize}px;height:${badgeSize}px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3));border-radius:50%;" alt="badge" />`,
            iconSize: [badgeSize, badgeSize],
            iconAnchor: [badgeSize / 2, badgeSize / 2],
          }));
        });
      });

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

      map.whenReady(() => {
        try { map.invalidateSize(true); } catch (e) { /* ignore */ }
        setTimeout(() => { try { map.invalidateSize(true); } catch (e) { /* ignore */ } }, 500);
      });

      // Resize handler
      const onResize = () => { try { map.invalidateSize(); } catch (e) { /* ignore */ } };
      window.addEventListener('resize', onResize);

      // ── Render GeoJSON features ──────────────────────────────────────────
      if (geojsonRef.current) {
        renderGeoJSON(L, map, geojsonRef.current, onFeatureClickRef.current, showAllBadgesRef.current);
      }

      // Attach cleanup hooks
      (map as any).__onCleanup = () => {
        window.removeEventListener('resize', onResize);
        tileLayer.off('load');
        map.off('zoomend');
      };
    });

    // Cleanup on unmount
    return () => {
      cancelled = true;
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
      initializingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render GeoJSON when data changes after initial mount
  useEffect(() => {
    if (!mapRef.current || !geojson) return;

    import('leaflet').then((L) => {
      if (mapRef.current) {
        renderGeoJSON(L, mapRef.current, geojson, onFeatureClick, showAllBadges);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, showAllBadges]);

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
  showAllBadges: boolean = false,
) {
  // Ensure a dedicated feature layer exists
  let featureLayer: any = (map as any).__featureLayer;
  if (!featureLayer) {
    featureLayer = (map as any).__featureLayer = L.layerGroup().addTo(map);
  } else {
    featureLayer.clearLayers();
  }

  // Reset stored references for zoom scaling
  (map as any).__stationCircles = [];
  (map as any).__badgeMarkers = [];

  const currentZoom = map.getZoom();
  const radius = getRadiusForZoom(currentZoom);
  const badgeSize = getBadgeSizeForZoom(currentZoom);

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
        const filmColor = props.system_type === 'HSR' ? '#db691d' : '#000000';
        addFilmstripPolyline(L, featureLayer, coords, filmColor, () => onFeatureClick(props));
      } else {
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

    const circle = L.circleMarker([lat, lng], {
      radius,
      fillColor: '#ffffff',
      color: '#333333',
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
    })
      .on('click', () => onFeatureClick(props))
      .addTo(featureLayer);

    (map as any).__stationCircles.push(circle);

    // Show badge overlay when showAllBadges is enabled
    if (showAllBadges && props.feature_type === 'station' && (props as any).badge_image_url) {
      const rawBadge = (props as any).badge_image_url as string;
      const dataUri = toBadgeDataUri(rawBadge);
      const badgeIcon = L.divIcon({
        className: '',
        html: `<img src="${dataUri}" style="width:${badgeSize}px;height:${badgeSize}px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3));border-radius:50%;" alt="badge" />`,
        iconSize: [badgeSize, badgeSize],
        iconAnchor: [badgeSize / 2, badgeSize / 2],
      });
      const badgeMarker = L.marker([lat, lng], { icon: badgeIcon, interactive: false })
        .addTo(featureLayer);

      (map as any).__badgeMarkers.push({ marker: badgeMarker, dataUri });
    }
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
