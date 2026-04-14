'use client';

/**
 * app/page.tsx — Rail Stamp Rally main page
 *
 * Layout strategy:
 *   Mobile  (<768 px): Full-screen map + react-spring-bottom-sheet for details
 *   Desktop (≥768 px): Map fills the right side; fixed <aside> sidebar on the left
 */

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect } from 'react';
import type { RailwayFeatureProperties } from '@/lib/supabaseClient';
import FeatureDetails from '@/components/FeatureDetails';
import { MOCK_GEOJSON } from '@/lib/mockGeoJSON';
import { getAllRailwayGeoJSON } from '@/lib/supabaseClient';
import BadgeCheckin from '@/components/BadgeCheckin';
import styles from './page.module.css';

// ── Lazy-load heavy dependencies ──────────────────────────────────────────────
// Map must be dynamically imported with ssr:false (Leaflet is browser-only).
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className={styles.mapLoading} aria-live="polite">
      地圖載入中… / Loading map…
    </div>
  ),
});

// react-spring-bottom-sheet is also browser-only; import dynamically to be safe.
const BottomSheet = dynamic(
  () => import('react-spring-bottom-sheet').then((m) => m.BottomSheet),
  { ssr: false },
);

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [selectedFeature, setSelectedFeature] =
    useState<RailwayFeatureProperties | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Called by the Map component whenever the user clicks a feature
  const handleFeatureClick = useCallback((props: RailwayFeatureProperties) => {
    setSelectedFeature(props);
    setSheetOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setSheetOpen(false);
    setSelectedFeature(null);
  }, []);

  const useMockGeo = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [geojson, setGeojson] = useState<any | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchGeo = useCallback(async () => {
    setLoadingGeo(true);
    setGeoError(null);
    try {
      const data = await getAllRailwayGeoJSON();
      setGeojson(data);
    } catch (e: any) {
      setGeoError(e?.message ?? String(e));
    } finally {
      setLoadingGeo(false);
    }
  }, []);

  useEffect(() => {
    if (!useMockGeo) {
      fetchGeo();
    } else {
      // When using mock data, set it immediately so Map can render instantly
      setGeojson(MOCK_GEOJSON as any);
    }
  }, [useMockGeo, fetchGeo]);

  return (
    <main className={styles.main}>
      {/* ── Desktop sidebar (hidden on mobile via CSS) ── */}
      <aside className={styles.sidebar} aria-label="Feature details sidebar">
        <header className={styles.sidebarHeader}>
          <h1 className={styles.appTitle}>🚂 鐵道集旅</h1>
          <p className={styles.appSubtitle}>Rail Stamp Rally</p>
        </header>

        <div className={styles.sidebarContent}>
          <FeatureDetails
            feature={selectedFeature}
            onClose={handleClose}
          />
        </div>
      </aside>

      {/* ── Map (full screen on mobile; right panel on desktop) ── */}
      <section className={styles.mapSection} aria-label="Interactive railway map">
        {/* Badge checkin overlay (non-blocking) */}
        {!useMockGeo && (
          <div className={styles.badgeOverlay}>
            <BadgeCheckin onSuccess={fetchGeo} />
          </div>
        )}

        {/* Show a small loading / error indicator when fetching real data */}
        {loadingGeo && (
          <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 900 }} aria-live="polite">
            地圖資料載入中…
          </div>
        )}
        {geoError && (
          <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 900, background: '#fee', color: '#900', padding: '6px 8px', borderRadius: 6 }} role="status">
            載入資料失敗：{geoError}
          </div>
        )}

        <Map geojson={useMockGeo ? MOCK_GEOJSON : geojson} onFeatureClick={handleFeatureClick} />
      </section>

      {/* ── Mobile bottom sheet (hidden on desktop via CSS) ── */}
      <div className={styles.mobileOnly}>
        <BottomSheet
          open={sheetOpen}
          onDismiss={handleClose}
          snapPoints={({ maxHeight }: { maxHeight: number }) => [
            maxHeight * 0.4,
            maxHeight * 0.85,
          ]}
          defaultSnap={({ snapPoints }: { snapPoints: number[] }) => snapPoints[0]}
          header={
            <div className={styles.sheetHandle} aria-hidden="true" />
          }
          blocking={false}
        >
          <FeatureDetails
            feature={selectedFeature}
            onClose={handleClose}
          />
        </BottomSheet>
      </div>
    </main>
  );
}
