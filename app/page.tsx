'use client';

/**
 * app/page.tsx — Rail Stamp Rally main page
 *
 * Layout strategy:
 *   Mobile  (<768 px): Full-screen map + shared BottomSheet for details/dialogs
 *   Desktop (≥768 px): Map fills the right side; fixed <aside> sidebar on the left
 */

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { RailwayFeatureProperties, CollectedBadge } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import FeatureDetails, { SYSTEM_LABELS } from '@/components/FeatureDetails';
import { MOCK_GEOJSON } from '@/lib/mockGeoJSON';
import { getAllRailwayGeoJSON, getUserCollectedBadges, upsertProfile } from '@/lib/supabaseClient';
import BadgeCheckin from '@/components/BadgeCheckin';
import AuthButton from '@/components/AuthButton';
import BottomSheet from '@/components/BottomSheet';
import TrainScheduleDialog from '@/components/TrainScheduleDialog';
import type { StationPickTarget } from '@/components/TrainScheduleDialog';
import styles from './page.module.css';

// ── Lazy-load heavy dependencies ──────────────────────────────────────────────
const LeafletMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className={styles.mapLoading} aria-live="polite">
      地圖載入中… / Loading map…
    </div>
  ),
});

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

  // Train schedule dialog state
  const [trainDialogOpen, setTrainDialogOpen] = useState(false);
  const [stationPickTarget, setStationPickTarget] = useState<StationPickTarget>(null);
  const [pickedStation, setPickedStation] = useState<{ stationId: string; stationName: string } | null>(null);

  // Map ref for flyTo (focus button)
  const mapFlyToRef = useRef<((lat: number, lng: number, zoom: number) => void) | null>(null);

  const handleMapReady = useCallback((flyTo: (lat: number, lng: number, zoom: number) => void) => {
    mapFlyToRef.current = flyTo;
  }, []);

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
    // If in station-picking mode for train schedule, capture the TRA station
    if (stationPickTarget && props.feature_type === 'station' && (props as any).system_type === 'TRA') {
      setPickedStation({
        stationId: (props as any).station_id,
        stationName: (props as any).station_name,
      });
      // Reopen train dialog
      setTrainDialogOpen(true);
      return;
    }

    setSelectedFeature(props);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSheetOpen(true);
    } else {
      setSheetOpen(false);
    }
  }, [stationPickTarget]);

  const handleClose = useCallback(() => {
    setSheetOpen(false);
    setSelectedFeature(null);
  }, []);

  const handleAuthChange = useCallback((u: User | null) => {
    setUser(u);
    if (!u) {
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

  // Mock login toggle
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
            ratio = 1;
          } else if (sys === 'KLRT') {
            ratio = 0;
          } else {
            ratio = 0.5 + Math.random() * 0.3;
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

  // Focus button: fly to user's current location
  const handleFocus = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapFlyToRef.current?.(latitude, longitude, 16);
      },
      (err) => {
        console.error('Geolocation error:', err.message);
      },
    );
  }, []);

  // Train schedule station pick callback
  const handleRequestPick = useCallback((target: StationPickTarget) => {
    setStationPickTarget(target);
    if (target) {
      setTrainDialogOpen(false); // close dialog so user can interact with map
    }
  }, []);

  const isLoggedIn = !!user || mockLogin;

  return (
    <main className={styles.main}>
      {/* ── Desktop sidebar (hidden on mobile via CSS) ── */}
      <aside className={styles.sidebar} aria-label="Feature details sidebar">
        <header className={styles.sidebarHeader}>
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

        {/* Station picking hint overlay */}
        {stationPickTarget && (
          <div className={styles.pickingOverlay}>
            📍 請點擊地圖上的台鐵車站作為{stationPickTarget === 'origin' ? '起站' : '迄站'}
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
          onMapReady={handleMapReady}
        />

        {/* ── Desktop bottom bar ── */}
        <div className={`${styles.bottomBar} ${styles.desktopOnly}`}>
          <AuthButton
            onAuthChange={handleAuthChange}
            mockLogin={mockLogin}
            onMockLoginToggle={handleMockLoginToggle}
            onOpenBadgeCollection={() => setMobileProgressOpen(true)}
            isLoggedIn={isLoggedIn}
          />
          <BadgeCheckin user={user} onSuccess={handleBadgeSuccess} />
          <button
            className={styles.iconBtn}
            onClick={handleFocus}
            aria-label="定位至目前位置"
          >
            <span className={styles.iconTooltip}>定位</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <circle cx="12" cy="12" r="8" />
            </svg>
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => setTrainDialogOpen(true)}
            aria-label="台鐵班次查詢"
          >
            <span className={styles.iconTooltip}>班次查詢</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M12 7v5l3 3" />
              <path d="M8 21h8" />
              <path d="M12 21v2" />
            </svg>
          </button>
        </div>

        {/* ── Mobile toolbar: 帳號 → 打卡 → Focus → 班次查詢 ── */}
        <nav className={styles.mobileToolbar} aria-label="主要功能列">
          <div className={styles.toolbarItem}>
            <AuthButton
              onAuthChange={handleAuthChange}
              mockLogin={mockLogin}
              onMockLoginToggle={handleMockLoginToggle}
              onOpenBadgeCollection={() => {
                setSheetOpen(false);
                setMobileProgressOpen(true);
              }}
              isLoggedIn={isLoggedIn}
            />
          </div>

          <div className={`${styles.toolbarItem} ${!isLoggedIn ? styles.toolbarItemHidden : ''}`}>
            <BadgeCheckin user={user} onSuccess={handleBadgeSuccess} />
          </div>

          <button
            className={styles.toolbarItem}
            onClick={handleFocus}
            aria-label="定位至目前位置"
          >
            <span className={styles.toolbarTooltip}>定位</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <circle cx="12" cy="12" r="8" />
            </svg>
          </button>

          <button
            className={styles.toolbarItem}
            onClick={() => setTrainDialogOpen(true)}
            aria-label="台鐵班次查詢"
          >
            <span className={styles.toolbarTooltip}>班次查詢</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M12 7v5l3 3" />
              <path d="M8 21h8" />
              <path d="M12 21v2" />
            </svg>
          </button>
        </nav>
      </section>

      {/* ── Mobile: Badge Collection Progress BottomSheet ── */}
      <div className={styles.mobileOnly}>
        <BottomSheet
          open={mobileProgressOpen}
          onOpenChange={setMobileProgressOpen}
          title="車站紀念章收集進度"
        >
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
        </BottomSheet>
      </div>

      {/* ── Mobile: Station/Line Details BottomSheet ── */}
      <div className={styles.mobileOnly}>
        <BottomSheet
          open={sheetOpen}
          onOpenChange={(open) => { if (!open) handleClose(); }}
          title="車站 / 路線詳情"
        >
          <FeatureDetails
            feature={selectedFeature}
            onClose={handleClose}
            collectedBadges={collectedBadgesMap}
            stationCountsBySystem={stationCountsBySystem}
            collectedCountsBySystem={collectedCountsBySystem}
          />
        </BottomSheet>
      </div>

      {/* ── Train Schedule Query BottomSheet (both mobile & desktop) ── */}
      <BottomSheet
        open={trainDialogOpen}
        onOpenChange={setTrainDialogOpen}
        title="台鐵班次查詢"
      >
        <TrainScheduleDialog
          pickedStation={pickedStation}
          pickTarget={stationPickTarget}
          onRequestPick={handleRequestPick}
          onClose={() => setTrainDialogOpen(false)}
        />
      </BottomSheet>
    </main>
  );
}
