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

  const isLoggedIn = !!user || mockLogin;

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

        {/* ── Desktop bottom bar: 帳號 + 打卡 + 模擬登入 (no badge progress) ── */}
        <div className={`${styles.bottomBar} ${styles.desktopOnly}`}>
          <AuthButton onAuthChange={handleAuthChange} />
          <BadgeCheckin user={user} onSuccess={handleBadgeSuccess} />
          <button
            className={`${styles.iconBtn} ${mockLogin ? styles.iconBtnActive : ''}`}
            onClick={handleMockLoginToggle}
            aria-label={mockLogin ? '關閉模擬登入' : '開啟模擬登入'}
          >
            <span className={styles.iconTooltip}>模擬登入</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 2h6" />
              <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
            </svg>
          </button>
        </div>

        {/* ── Mobile toolbar (icon-only bottom nav with tooltips) ── */}
        <nav className={styles.mobileToolbar} aria-label="主要功能列">
          <div className={styles.toolbarItem}>
            <AuthButton onAuthChange={handleAuthChange} />
          </div>

          <div className={`${styles.toolbarItem} ${!isLoggedIn ? styles.toolbarItemHidden : ''}`}>
            <BadgeCheckin user={user} onSuccess={handleBadgeSuccess} />
          </div>

          <button
            className={`${styles.toolbarItem} ${!isLoggedIn ? styles.toolbarItemHidden : ''}`}
            onClick={() => {
              setSheetOpen(false);
              setMobileProgressOpen(true);
            }}
            aria-label="開啟車站紀念章收集進度"
            disabled={!isLoggedIn}
          >
            <span className={styles.toolbarTooltip}>收集進度</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </button>

          <button
            className={`${styles.toolbarItem} ${mockLogin ? styles.toolbarItemActive : ''}`}
            onClick={handleMockLoginToggle}
            aria-label={mockLogin ? '關閉模擬登入' : '開啟模擬登入'}
          >
            <span className={styles.toolbarTooltip}>模擬登入</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2h6" />
              <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
            </svg>
          </button>
        </nav>
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
                車站紀念章收集進度
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
