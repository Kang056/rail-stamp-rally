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
// Zoom-aware sizing helpers
//
// Station circle radius scales with zoom level so features remain legible at
// all zoom levels without cluttering the map at low zoom.
// Badge icon size follows the same breakpoints, proportional to the radius.
// ─────────────────────────────────────────────────────────────────────────────
function getStationRadius(zoom: number): number {
  if (zoom <= 8) return 12;
  if (zoom <= 10) return 14;
  if (zoom <= 12) return 16;
  if (zoom <= 14) return 20;
  return 24;
}

function getBadgeSize(zoom: number): number {
  if (zoom <= 8) return 24;
  if (zoom <= 10) return 28;
  if (zoom <= 12) return 32;
  if (zoom <= 14) return 40;
  return 48;
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
  // Updating refs directly in render is intentional — ref writes never cause re-renders.
  const geojsonRef = useRef(geojson);
  const onFeatureClickRef = useRef(onFeatureClick);
  const showAllBadgesRef = useRef(showAllBadges);
  geojsonRef.current = geojson;
  onFeatureClickRef.current = onFeatureClick;
  showAllBadgesRef.current = showAllBadges;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || initializingRef.current) return;
    initializingRef.current = true;

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
      // Use refs here so we pick up any geojson that arrived while Leaflet
      // was still loading (fixes the async race condition on mobile).
      if (geojsonRef.current) {
        renderGeoJSON(L, map, geojsonRef.current, onFeatureClickRef.current, showAllBadgesRef.current);
      }

      // attach cleanup hooks
      (map as any).__onCleanup = () => {
        window.removeEventListener('resize', onResize);
        tileLayer.off('load');
        const zoomHandler = (map as any).__zoomHandler;
        if (typeof zoomHandler === 'function') {
          map.off('zoomend', zoomHandler);
        }
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
      initializingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render GeoJSON when data changes after initial mount
  useEffect(() => {
    if (!mapRef.current || !geojson) return;

    import('leaflet').then((L) => {
      renderGeoJSON(L, mapRef.current!, geojson, onFeatureClick, showAllBadges);
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
// Three dedicated LayerGroups are used so that station circles and badge icons
// can be resized on zoom without touching the line layer.
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeEntry {
  lat: number;
  lng: number;
  badgeSvg: string;
}

function renderBadgeLayer(
  L: typeof import('leaflet'),
  badgeLayer: any,
  badgeEntries: BadgeEntry[],
  zoom: number,
) {
  badgeLayer.clearLayers();
  const badgeSize = getBadgeSize(zoom);
  badgeEntries.forEach(({ lat, lng, badgeSvg }) => {
    const badgeIcon = L.divIcon({
      className: '',
      html: `<img src="${badgeSvg}" style="width:${badgeSize}px;height:${badgeSize}px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3));" alt="badge" />`,
      iconSize: [badgeSize, badgeSize],
      iconAnchor: [badgeSize / 2, badgeSize / 2],
    });
    L.marker([lat, lng], { icon: badgeIcon, interactive: false }).addTo(badgeLayer);
  });
}

function renderGeoJSON(
  L: typeof import('leaflet'),
  map: LeafletMap,
  geojson: FeatureCollection<Geometry, RailwayFeatureProperties>,
  onFeatureClick: (properties: RailwayFeatureProperties) => void,
  showAllBadges: boolean = false,
) {
  // ── Ensure dedicated layer groups exist ────────────────────────────────
  let lineLayer: any = (map as any).__lineLayer;
  let stationLayer: any = (map as any).__stationLayer;
  let badgeLayer: any = (map as any).__badgeLayer;

  if (!lineLayer) {
    lineLayer = (map as any).__lineLayer = L.layerGroup().addTo(map);
    stationLayer = (map as any).__stationLayer = L.layerGroup().addTo(map);
    badgeLayer = (map as any).__badgeLayer = L.layerGroup().addTo(map);
  } else {
    lineLayer.clearLayers();
    stationLayer.clearLayers();
    badgeLayer.clearLayers();
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
        // Filmstrip style: HSR=orange-on-white, TRA=black-on-white per design spec §4.2
        const filmColor = props.system_type === 'HSR' ? '#db691d' : '#000000';
        addFilmstripPolyline(L, lineLayer, coords, filmColor, () => onFeatureClick(props));
      } else {
        // Solid colored line for metro/MRT systems
        const latLngs = coords.map(([lng, lat]) => L.latLng(lat, lng));
        L.polyline(latLngs, { color, weight: 4, opacity: 0.85 })
          .on('click', () => onFeatureClick(props))
          .addTo(lineLayer);
      }
    });
  });

  // ── Stations ─────────────────────────────────────────────────────────────
  const zoom = map.getZoom();
  const radius = getStationRadius(zoom);
  const circleMarkers: import('leaflet').CircleMarker[] = [];
  const badgeEntries: BadgeEntry[] = [];

  stations.forEach((feature) => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return;

    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const props = feature.properties;

    const cm = L.circleMarker([lat, lng], {
      radius,
      fillColor: '#ffffff',
      color: '#333333',
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
    })
      .on('click', () => onFeatureClick(props))
      .addTo(stationLayer);

    circleMarkers.push(cm);

    // Collect badge data when showAllBadges is enabled
    if (showAllBadges && props.feature_type === 'station' && (props as any).badge_image_url) {
      badgeEntries.push({ lat, lng, badgeSvg: (props as any).badge_image_url as string });
    }
  });

  // Render badge icons at the current zoom size
  renderBadgeLayer(L, badgeLayer, badgeEntries, zoom);

  // Store state on the map so the zoom handler can update sizes without re-fetching data
  (map as any).__circleMarkers = circleMarkers;
  (map as any).__badgeEntries = badgeEntries;

  // ── Register zoom handler (once per map instance) ─────────────────────
  if (!(map as any).__zoomHandler) {
    const zoomHandler = () => {
      const currentZoom = map.getZoom();
      const newRadius = getStationRadius(currentZoom);

      // Update circle marker radii in-place (no re-render needed)
      ((map as any).__circleMarkers as import('leaflet').CircleMarker[] | undefined)
        ?.forEach((cm) => cm.setRadius(newRadius));

      // Re-render badge layer with updated icon size
      const bl = (map as any).__badgeLayer;
      const entries = (map as any).__badgeEntries as BadgeEntry[] | undefined;
      if (bl && entries) {
        renderBadgeLayer(L, bl, entries, currentZoom);
      }
    };
    (map as any).__zoomHandler = zoomHandler;
    map.on('zoomend', zoomHandler);
  }

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
