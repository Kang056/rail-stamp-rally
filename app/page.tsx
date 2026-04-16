'use client';

/**
 * app/page.tsx — Rail Stamp Rally main page
 *
 * Layout strategy:
 *   Mobile  (<768 px): Full-screen map + react-spring-bottom-sheet for details
 *   Desktop (≥768 px): Map fills the right side; fixed <aside> sidebar on the left
 */

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useMemo } from 'react';
import type { RailwayFeatureProperties, CollectedBadge } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import FeatureDetails, { SYSTEM_LABELS } from '@/components/FeatureDetails';
import { MOCK_GEOJSON } from '@/lib/mockGeoJSON';
import { getAllRailwayGeoJSON, getUserCollectedBadges, upsertProfile } from '@/lib/supabaseClient';
import BadgeCheckin from '@/components/BadgeCheckin';
import AuthButton from '@/components/AuthButton';
import styles from './page.module.css';

// ── Lazy-load heavy dependencies ──────────────────────────────────────────────
// Map must be dynamically imported with ssr:false (Leaflet is browser-only).
const LeafletMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className={styles.mapLoading} aria-live="polite">
      地圖載入中… / Loading map…
    </div>
  ),
});

import { Drawer } from 'vaul';

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [selectedFeature, setSelectedFeature] =
    useState<RailwayFeatureProperties | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [collectedStationIds, setCollectedStationIds] = useState<Set<string>>(new Set());
  const [collectedBadgesMap, setCollectedBadgesMap] = useState<Map<string, { unlocked_at: string; badge_image_url: string | null }>>(new Map());
  const [newBadgeStationId, setNewBadgeStationId] = useState<string | null>(null);
  const [mobileProgressOpen, setMobileProgressOpen] = useState(false);
  const [mockLogin, setMockLogin] = useState(false);
  const [visibleSystems, setVisibleSystems] = useState<Set<string>>(
    () => new Set(Object.keys(SYSTEM_LABELS))
  );

  const handleToggleSystem = useCallback((system: string) => {
    setVisibleSystems((prev) => {
      const next = new Set(prev);
      if (next.has(system)) {
        next.delete(system);
      } else {
        next.add(system);
      }
      return next;
    });
  }, []);
  const [showStations, setShowStations] = useState<boolean>(true);
  const handleToggleStations = useCallback(() => setShowStations((v) => !v), []);

  // Called by the Map component whenever the user clicks a feature
  const handleFeatureClick = useCallback((props: RailwayFeatureProperties) => {
    setSelectedFeature(props);
    // Only open the bottom sheet on small viewports (mobile).
    // On desktop (>=768px) details are shown in the left sidebar.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSheetOpen(true);
    } else {
      setSheetOpen(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setSheetOpen(false);
    setSelectedFeature(null);
  }, []);

  const handleAuthChange = useCallback((u: User | null) => {
    setUser(u);
    if (!u) {
      // Requirement 9: Logout resets map
      setCollectedStationIds(new Set());
      setCollectedBadgesMap(new Map());
      setNewBadgeStationId(null);
    }
  }, []);

  const handleBadgeSuccess = useCallback((result: { station_id: string; station_name: string; badge_image_url: string | null }) => {
    setCollectedStationIds((prev) => new Set(prev).add(result.station_id));
    setCollectedBadgesMap((prev) => {
      const next = new Map(prev);
      next.set(result.station_id, { unlocked_at: new Date().toISOString(), badge_image_url: result.badge_image_url });
      return next;
    });
    setNewBadgeStationId(result.station_id);
    setTimeout(() => setNewBadgeStationId(null), 2000);
  }, []);

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
      setGeojson(MOCK_GEOJSON as any);
    } finally {
      setLoadingGeo(false);
    }
  }, []);

  useEffect(() => {
    fetchGeo();
  }, [fetchGeo]);

  useEffect(() => {
    if (!user) return;
    // Record/update user profile info in DB
    upsertProfile(user);
    getUserCollectedBadges(user.id).then((badges) => {
      const ids = new Set(badges.map((b) => b.station_id));
      const map = new Map(badges.map((b) => [b.station_id, { unlocked_at: b.unlocked_at, badge_image_url: b.badge_image_url }]));
      setCollectedStationIds(ids);
      setCollectedBadgesMap(map);
    }).catch((err) => {
      console.error('Failed to fetch user badges:', err);
    });
  }, [user]);

  // Compute station counts per system for progress bars
  const stationCountsBySystem = useMemo(() => {
    if (!geojson) return new Map<string, number>();
    const counts = new Map<string, number>();
    geojson.features.forEach((f: any) => {
      if (f.properties.feature_type === 'station') {
        const sys = f.properties.system_type;
        counts.set(sys, (counts.get(sys) ?? 0) + 1);
      }
    });
    return counts;
  }, [geojson]);

  const collectedCountsBySystem = useMemo(() => {
    if (!geojson || collectedBadgesMap.size === 0) return new Map<string, number>();
    const counts = new Map<string, number>();
    geojson.features.forEach((f: any) => {
      if (f.properties.feature_type === 'station') {
        const stationId = f.properties.station_id;
        if (collectedBadgesMap.has(stationId)) {
          const sys = f.properties.system_type;
          counts.set(sys, (counts.get(sys) ?? 0) + 1);
        }
      }
    });
    return counts;
  }, [geojson, collectedBadgesMap]);

  // Generate mock badge data for "模擬登入" mode
  const handleMockLoginToggle = useCallback(() => {
    setMockLogin((prev) => {
      const next = !prev;
      if (next && geojson) {
        const ids = new Set<string>();
        const badgesMap = new Map<string, { unlocked_at: string; badge_image_url: string | null }>();

        const stationsBySystem = new Map<string, Array<{ station_id: string; badge_image_url: string | null }>>();
        geojson.features.forEach((f: any) => {
          if (f.properties.feature_type === 'station') {
            const sys = f.properties.system_type as string;
            if (!stationsBySystem.has(sys)) stationsBySystem.set(sys, []);
            stationsBySystem.get(sys)!.push({
              station_id: f.properties.station_id,
              badge_image_url: f.properties.badge_image_url ?? null,
            });
          }
        });

        stationsBySystem.forEach((stations, sys) => {
          let ratio: number;
          if (sys === 'HSR') {
            ratio = 1; // 100%
          } else if (sys === 'KLRT') {
            ratio = 0; // 0%
          } else {
            ratio = 0.5 + Math.random() * 0.3; // 50%-80%
          }

          const shuffled = [...stations].sort(() => Math.random() - 0.5);
          const count = Math.round(shuffled.length * ratio);
          for (let i = 0; i < count; i++) {
            const s = shuffled[i];
            ids.add(s.station_id);
            badgesMap.set(s.station_id, {
              unlocked_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
              badge_image_url: s.badge_image_url,
            });
          }
        });

        setCollectedStationIds(ids);
        setCollectedBadgesMap(badgesMap);
      } else {
        setCollectedStationIds(new Set());
        setCollectedBadgesMap(new Map());
        setShowAllBadges(false);
      }
      return next;
    });
  }, [geojson]);

  return (
    <main className={styles.main}>
      {/* ── Desktop sidebar (hidden on mobile via CSS) ── */}
      <aside className={styles.sidebar} aria-label="Feature details sidebar">
        <header className={styles.sidebarHeader}>
          {/* <h1 className={styles.appTitle}>🚂 鐵道集旅</h1> */}
          <h1 className={styles.appSubtitle}>Rail Stamp Rally</h1>
        </header>

        <div className={styles.sidebarContent}>
          <FeatureDetails
            feature={selectedFeature}
            onClose={handleClose}
            collectedBadges={collectedBadgesMap}
            stationCountsBySystem={stationCountsBySystem}
            collectedCountsBySystem={collectedCountsBySystem}
            visibleSystems={visibleSystems}
            onToggleSystem={handleToggleSystem}
            showStations={showStations}
            onToggleStations={handleToggleStations}
          />
        </div>
      </aside>

      {/* ── Map (full screen on mobile; right panel on desktop) ── */}
      <section className={styles.mapSection} aria-label="Interactive railway map">
        {/* ── Top-right: 登入/登出 + 模擬登入 ── */}
        <div className={styles.topRightOverlay}>
          <AuthButton onAuthChange={handleAuthChange} />
          <button
            className={styles.mockLoginBtn}
            onClick={handleMockLoginToggle}
            aria-label={mockLogin ? '關閉模擬登入' : '開啟模擬登入'}
          >
            {mockLogin ? '🔓 模擬登入中' : '🔐 模擬登入'}
          </button>
        </div>

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

        <LeafletMap
          geojson={geojson}
          onFeatureClick={handleFeatureClick}
          showAllBadges={showAllBadges}
          collectedStationIds={collectedStationIds}
          newBadgeStationId={newBadgeStationId}
          visibleSystems={visibleSystems}
          showStations={showStations}
        />

        {/* ── Bottom bar: 打卡 (center) + 手機收集進度 (left) ── */}
        <div className={styles.bottomBar}>
          {/* Mobile-only: 收集進度 trigger */}
          <button
            className={`${styles.mapActionBtn} ${styles.mobileOnly}`}
            onClick={() => {
              setSheetOpen(false);
              setMobileProgressOpen(true);
            }}
            aria-label="開啟徽章收集進度"
          >
            🏅
            <span className={styles.btnLabel}>收集進度</span>
          </button>

          {/* 打卡 icon button (center) */}
          <BadgeCheckin user={user} onSuccess={handleBadgeSuccess} />

          {/* Spacer for symmetry on mobile */}
          <div className={`${styles.mapActionSpacer} ${styles.mobileOnly}`} aria-hidden="true" />
        </div>
      </section>

      {/* ── Mobile: 收集進度 Drawer ── */}
      <div className={styles.mobileOnly}>
        <Drawer.Root
          open={mobileProgressOpen}
          onOpenChange={(open) => {
            setMobileProgressOpen(open);
          }}
          modal={false}
        >
          <Drawer.Portal>
            <Drawer.Overlay className={styles.drawerOverlay} />
            <Drawer.Content className={styles.drawerContent}>
              <Drawer.Title className={styles.visuallyHidden}>
                徽章收集進度
              </Drawer.Title>
              <div className={styles.sheetHandle} aria-hidden="true" />
              <div className={styles.drawerInner}>
                <FeatureDetails
                  feature={null}
                  onClose={() => setMobileProgressOpen(false)}
                  collectedBadges={collectedBadgesMap}
                  stationCountsBySystem={stationCountsBySystem}
                  collectedCountsBySystem={collectedCountsBySystem}
                  visibleSystems={visibleSystems}
                  onToggleSystem={handleToggleSystem}
                  showStations={showStations}
                  onToggleStations={handleToggleStations}
                />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>

      {/* ── Mobile: 車站/路線詳情 Drawer ── */}
      <div className={styles.mobileOnly}>
        <Drawer.Root
          open={sheetOpen}
          onOpenChange={(open) => { if (!open) handleClose(); }}
          modal={false}
        >
          <Drawer.Portal>
            <Drawer.Overlay className={styles.drawerOverlay} />
            <Drawer.Content className={styles.drawerContent}>
              <Drawer.Title className={styles.visuallyHidden}>
                車站 / 路線詳情
              </Drawer.Title>
              <div className={styles.sheetHandle} aria-hidden="true" />
              <div className={styles.drawerInner}>
                <FeatureDetails
                  feature={selectedFeature}
                  onClose={handleClose}
                  collectedBadges={collectedBadgesMap}
                  stationCountsBySystem={stationCountsBySystem}
                  collectedCountsBySystem={collectedCountsBySystem}
                />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </main>
  );
}
