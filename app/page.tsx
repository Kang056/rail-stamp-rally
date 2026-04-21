'use client';

/**
 * app/page.tsx — Rail Stamp Rally main page
 *
 * Layout strategy:
 *   Mobile  (<768 px): Full-screen map + shared BottomSheet for details/dialogs
 *   Desktop (≥768 px): Google Maps style — vertical icon bar on far left,
 *                       expandable panel to its right, map fills the rest
 */

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { RailwayFeatureProperties, CollectedBadge } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import FeatureDetails, { SYSTEM_LABELS } from '@/components/FeatureDetails';
import { MOCK_GEOJSON } from '@/lib/mockGeoJSON';
import { supabase, getAllRailwayGeoJSON, getUserCollectedBadges, upsertProfile, getUserCheckinCount } from '@/lib/supabaseClient';
import BadgeCheckin from '@/components/BadgeCheckin';
import AuthButton from '@/components/AuthButton';
import AccountSettings from '@/components/AccountSettings';
import BottomSheet from '@/components/BottomSheet';
import TrainScheduleDialog from '@/components/TrainScheduleDialog';
import type { StationPickTarget } from '@/components/TrainScheduleDialog';
import ToastContainer from '@/components/Toast';
import type { ToastItem } from '@/components/Toast';
import CheckinRecordsPanel from '@/components/CheckinRecordsPanel';
import { useIsMobile } from '@/lib/useIsMobile';
import { useTranslation } from '@/lib/i18n';
import { calculateTotalXp, getLevelInfo, getStationXp, CHECKIN_MILESTONES } from '@/lib/levelSystem';
import type { LevelInfo, RailwaySystemType } from '@/lib/levelSystem';
import styles from './page.module.css';

// ── Lazy-load heavy dependencies ──────────────────────────────────────────────
function MapLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className={styles.mapLoading} aria-live="polite">
      {t.map.loading}
    </div>
  );
}

const LeafletMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: MapLoadingFallback,
});
// ── Types ─────────────────────────────────────────────────────────────────────
type DesktopPanelType = 'details' | 'account' | 'progress' | 'train' | 'checkin' | null;

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();

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

  // Checkin count & mobile checkin panel
  const [checkinCount, setCheckinCount] = useState<number>(0);
  const [mobileCheckinOpen, setMobileCheckinOpen] = useState(false);

  // Train schedule dialog state
  const [trainDialogOpen, setTrainDialogOpen] = useState(false);
  const [stationPickTarget, setStationPickTarget] = useState<StationPickTarget>(null);
  const [pickedStation, setPickedStation] = useState<{ stationId: string; stationName: string } | null>(null);

  // Desktop panel state (Google Maps style)
  const [desktopPanel, setDesktopPanel] = useState<DesktopPanelType>(null);

  // Toast state
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    if (type !== 'loading') {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Map ref for flyTo (focus button)
  const mapFlyToRef = useRef<((lat: number, lng: number, zoom: number) => void) | null>(null);
  const prevUserRef = useRef<User | null>(null);
  // Ref to access latest geojson inside callbacks without re-creating them
  const geojsonRef = useRef<any>(null);

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

  // Close train dialog when desktop panel switches away from 'train'
  useEffect(() => {
    if (!isMobile && desktopPanel !== 'train') {
      setTrainDialogOpen(false);
    }
  }, [desktopPanel, isMobile]);

  // Clear station pick target whenever train dialog closes
  useEffect(() => {
    if (!trainDialogOpen) {
      setStationPickTarget(null);
    }
  }, [trainDialogOpen]);

  // Called by the Map component whenever the user clicks a feature
  const handleFeatureClick = useCallback((props: RailwayFeatureProperties) => {
    // If in station-picking mode for train schedule, intercept station clicks
    // Only intercept when the train dialog is actually open
    if (stationPickTarget && trainDialogOpen && props.feature_type === 'station') {
      if ((props as any).system_type === 'TRA') {
        setPickedStation({
          stationId: (props as any).station_id,
          stationName: (props as any).station_name,
        });
        showToast(
          stationPickTarget === 'origin'
            ? t.train.stationSelectedOrigin((props as any).station_name)
            : t.train.stationSelectedDest((props as any).station_name),
          'success',
        );
      } else {
        showToast(t.train.traOnly, 'error');
      }
      return; // Don't open station details during picking
    }

    setSelectedFeature(props);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSheetOpen(true);
    } else {
      setDesktopPanel('details');
    }
  }, [stationPickTarget, trainDialogOpen, showToast, t]);

  const handleClose = useCallback(() => {
    setSheetOpen(false);
    setSelectedFeature(null);
  }, []);

  const handleAuthChange = useCallback((u: User | null) => {
    if (u && !prevUserRef.current) {
      showToast(t.auth.signInSuccess, 'success');
    } else if (!u && prevUserRef.current) {
      showToast(t.auth.signOutSuccess, 'success');
    }
    prevUserRef.current = u;
    setUser(u);
    if (!u) {
      setCollectedStationIds(new Set());
      setCollectedBadgesMap(new Map());
      setNewBadgeStationId(null);
      setCheckinCount(0);
    }
  }, [showToast, t]);

  const handleBadgeSuccess = useCallback((result: { station_id: string; station_name: string; badge_image_url: string | null }) => {
    setCollectedStationIds((prev) => new Set(prev).add(result.station_id));
    setCollectedBadgesMap((prev) => {
      const next = new Map(prev);
      next.set(result.station_id, { unlocked_at: new Date().toISOString(), badge_image_url: result.badge_image_url });
      return next;
    });
    // Increment checkin count on every successful check-in
    setCheckinCount(prev => {
      const newCount = prev + 1;

      // Show XP gain notification for the station
      const stationFeature = geojsonRef.current?.features?.find(
        (f: any) => f.properties.feature_type === 'station' && f.properties.station_id === result.station_id
      );
      const systemType = (stationFeature?.properties?.system_type ?? 'TRA') as RailwaySystemType;
      const stationXp = getStationXp(result.station_name, systemType);
      setTimeout(() => showToast(t.checkin.xpGainStation(stationXp), 'success'), 400);

      // Check if this checkin count hits a milestone
      const milestone = CHECKIN_MILESTONES.find(m => m.count === newCount);
      if (milestone) {
        setTimeout(() => showToast(t.checkin.xpGainMilestone(milestone.count, milestone.xp), 'success'), 900);
      }

      return newCount;
    });
    setNewBadgeStationId(result.station_id);
    showToast(t.checkin.successMsg(result.station_name), 'success');
    setTimeout(() => setNewBadgeStationId(null), 2000);
  }, [showToast, t]);

  const [geojson, setGeojsonState] = useState<any | null>(null);
  const setGeojson = useCallback((data: any) => {
    geojsonRef.current = data;
    setGeojsonState(data);
  }, []);
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
  }, [setGeojson]);

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
    getUserCheckinCount(user.id).then(setCheckinCount).catch(() => {});
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

  const traStations = useMemo(() => {
    if (!geojson) return [];
    return geojson.features
      .filter((f: any) => f.properties.feature_type === 'station' && f.properties.system_type === 'TRA')
      .map((f: any) => ({ stationId: f.properties.station_id as string, stationName: f.properties.station_name as string }))
      .sort((a: { stationId: string }, b: { stationId: string }) => a.stationId.localeCompare(b.stationId, undefined, { numeric: true }));
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

  const totalXp = useMemo(
    () => calculateTotalXp(collectedBadgesMap, geojson, checkinCount),
    [collectedBadgesMap, geojson, checkinCount]
  );
  const levelInfo: LevelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp]);

  // Mock login toggle
  const handleMockLoginToggle = useCallback(() => {
    const next = !mockLogin;
    setMockLogin(next);
    if (next && geojson) {
      showToast(t.account.mockLoginOn, 'info');
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
      setCheckinCount(ids.size);
    } else {
      showToast(t.account.mockLoginOff, 'info');
      setCollectedStationIds(new Set());
      setCollectedBadgesMap(new Map());
      setShowAllBadges(false);
      setCheckinCount(0);
    }
  }, [mockLogin, geojson, showToast, t]);

  // Focus button: fly to user's current location
  const handleFocus = useCallback(() => {
    if (!navigator.geolocation) {
      showToast(t.map.locateNotSupported, 'error');
      return;
    }
    const loadingId = showToast(t.map.locating, 'loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        dismissToast(loadingId);
        const { latitude, longitude } = pos.coords;
        mapFlyToRef.current?.(latitude, longitude, 16);
        showToast(t.map.locateSuccess, 'success');
      },
      () => {
        dismissToast(loadingId);
        showToast(t.map.locateFail, 'error');
      },
    );
  }, [showToast, dismissToast, t]);

  // Train schedule station pick callback — dialog stays open
  const handleRequestPick = useCallback((target: StationPickTarget) => {
    setStationPickTarget(target);
    // Clear any stale picked station when starting a new pick
    if (target !== null) {
      setPickedStation(null);
    }
  }, []);

  // Desktop panel toggle
  const toggleDesktopPanel = useCallback((panel: DesktopPanelType) => {
    setDesktopPanel(prev => prev === panel ? null : panel);
  }, []);

  // Desktop sign-in (for icon bar account button)
  const handleDesktopSignIn = useCallback(() => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const basePath = path.startsWith('/rail-stamp-rally') ? '/rail-stamp-rally' : '';
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origin + basePath },
    });
  }, []);

  // Desktop sign-out
  const handleDesktopSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setDesktopPanel(null);
  }, []);

  const isLoggedIn = !!user || mockLogin;

  return (
    <main className={styles.main}>
      {/* Toast notifications (top-center) */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {/* ════════════════════════════════════════════════════════════
          Desktop: Vertical icon bar (Google Maps style, far left)
          ════════════════════════════════════════════════════════════ */}
      <nav className={styles.desktopIconBar} aria-label={t.map.navLabel}>
        <div className={styles.iconBarGroup}>
          {/* Account */}
          <button
            className={`${styles.iconBarBtn} ${desktopPanel === 'account' ? styles.iconBarBtnActive : ''} ${isLoggedIn ? styles.iconBarBtnLoggedIn : ''}`}
            onClick={() => {
              if (isLoggedIn) {
                toggleDesktopPanel('account');
              } else {
                handleDesktopSignIn();
              }
            }}
            aria-label={isLoggedIn ? t.account.label : t.common.signIn}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            <span className={styles.iconBarLabel}>{t.account.label}</span>
          </button>

          {/* Checkin (visible only when logged in) */}
          {isLoggedIn && (
            <div className={styles.iconBarBtnWrap}>
              <BadgeCheckin user={user} onSuccess={handleBadgeSuccess} onToast={showToast} />
            </div>
          )}

          {/* Focus */}
          <button
            className={styles.iconBarBtn}
            onClick={handleFocus}
            aria-label={t.map.locateAriaLabel}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h4" /><path d="M18 12h4" /><circle cx="12" cy="12" r="8" /></svg>
            <span className={styles.iconBarLabel}>{t.map.locate}</span>
          </button>

          {/* Train schedule */}
          <button
            className={`${styles.iconBarBtn} ${desktopPanel === 'train' ? styles.iconBarBtnActive : ''}`}
            onClick={() => {
              toggleDesktopPanel('train');
              if (desktopPanel !== 'train') {
                setTrainDialogOpen(true);
              } else {
                setTrainDialogOpen(false);
                setStationPickTarget(null);
              }
            }}
            aria-label={t.map.trainScheduleAriaLabel}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 7v5l3 3" /><path d="M8 21h8" /><path d="M12 21v2" /></svg>
            <span className={styles.iconBarLabel}>{t.map.trainSchedule}</span>
          </button>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════
          Desktop: Content panel (opens to the right of icon bar)
          ════════════════════════════════════════════════════════════ */}
      {desktopPanel && (
        <aside className={styles.desktopPanel} aria-label={t.map.infoPanel}>
          <button
            className={styles.panelClose}
            onClick={() => {
              setDesktopPanel(null);
              if (desktopPanel === 'train') {
                setTrainDialogOpen(false);
                setStationPickTarget(null);
              }
            }}
            aria-label={t.map.closePanel}
          >
            ✕
          </button>

          {/* Station / Line details */}
          {desktopPanel === 'details' && (
            <div className={styles.panelContent}>
              <FeatureDetails
                feature={selectedFeature}
                onClose={() => setDesktopPanel(null)}
                collectedBadges={collectedBadgesMap}
                stationCountsBySystem={stationCountsBySystem}
                collectedCountsBySystem={collectedCountsBySystem}
              />
            </div>
          )}

          {/* Account panel */}
          {desktopPanel === 'account' && (
            <div className={styles.panelContent}>
              <div className={styles.desktopAccount}>
                {user?.user_metadata?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata?.full_name ?? t.account.avatar}
                    className={styles.desktopAccountAvatar}
                  />
                ) : (
                  <div className={styles.desktopAccountAvatarPlaceholder}>
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </div>
                )}
                <span className={styles.desktopAccountName}>
                  {user?.user_metadata?.full_name ?? user?.email ?? (mockLogin ? t.account.mockUser : t.account.user)}
                </span>

                {/* Level + XP bar */}
                {isLoggedIn && (
                  <div className={styles.desktopLevelSection}>
                    <div className={styles.desktopLevelBadge}>
                      {levelInfo.isMax ? t.account.levelMax : t.account.level(levelInfo.level)}
                    </div>
                    <div className={styles.desktopXpBarOuter}>
                      <div
                        className={styles.desktopXpBarInner}
                        style={{ width: `${levelInfo.progressPercent}%` }}
                      />
                    </div>
                    <div className={styles.desktopXpText}>
                      {levelInfo.isMax
                        ? t.account.xpProgressMax(levelInfo.currentXp)
                        : t.account.xpProgress(levelInfo.earnedInLevel, levelInfo.rangeXp)}
                    </div>
                  </div>
                )}

                <button
                  className={styles.desktopAccountBtn}
                  onClick={() => setDesktopPanel('progress')}
                >
                  {t.account.badgeCollection}
                </button>

                <button
                  className={styles.desktopAccountBtn}
                  onClick={() => setDesktopPanel('checkin')}
                >
                  {t.account.checkinRecords}
                </button>

                {handleMockLoginToggle && (
                  <button
                    className={`${styles.desktopAccountBtn} ${mockLogin ? styles.desktopAccountBtnActive : ''}`}
                    onClick={handleMockLoginToggle}
                  >
                    {mockLogin ? t.account.closeMockLogin : t.account.mockLogin}
                  </button>
                )}

                {user && (
                  <button onClick={handleDesktopSignOut} className={styles.desktopAccountLogout}>
                    {t.common.signOut}
                  </button>
                )}

                <AccountSettings />
              </div>
            </div>
          )}

          {/* Badge collection progress */}
          {desktopPanel === 'progress' && (
            <div className={styles.panelContent}>
              <FeatureDetails
                feature={null}
                onClose={() => setDesktopPanel('account')}
                collectedBadges={collectedBadgesMap}
                stationCountsBySystem={stationCountsBySystem}
                collectedCountsBySystem={collectedCountsBySystem}
                visibleSystems={visibleSystems}
                onToggleSystem={handleToggleSystem}
                showStations={showStations}
                onToggleStations={handleToggleStations}
              />
            </div>
          )}

          {/* Checkin records */}
          {desktopPanel === 'checkin' && (
            <div className={styles.panelContent}>
              <CheckinRecordsPanel
                checkinCount={checkinCount}
                t={t}
              />
            </div>
          )}

          {/* Train schedule */}
          {desktopPanel === 'train' && (
            <div className={styles.panelContent}>
              <TrainScheduleDialog
                isOpen={trainDialogOpen}
                pickedStation={pickedStation}
                pickTarget={stationPickTarget}
                onRequestPick={handleRequestPick}
                onClose={() => {
                  setDesktopPanel(null);
                  setTrainDialogOpen(false);
                  setStationPickTarget(null);
                }}
                onToast={showToast}
                onDismissToast={dismissToast}
                traStations={traStations}
              />
            </div>
          )}
        </aside>
      )}

      {/* ── Map (full screen on mobile; right panel on desktop) ── */}
      <section className={styles.mapSection} aria-label="Interactive railway map">
        {loadingGeo && (
          <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 900 }} aria-live="polite">
            {t.map.dataLoading}
          </div>
        )}
        {geoError && (
          <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 900, background: '#fee', color: '#900', padding: '6px 8px', borderRadius: 6 }} role="status">
            {t.map.loadError}{geoError}
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

        {/* ── Mobile toolbar: 帳號 → 打卡 → Focus → 班次查詢 ── */}
        <nav className={styles.mobileToolbar} aria-label={t.map.navLabel}>
          <div className={styles.toolbarItem}>
            <AuthButton
              onAuthChange={handleAuthChange}
              mockLogin={mockLogin}
              onMockLoginToggle={handleMockLoginToggle}
              onOpenBadgeCollection={() => {
                setSheetOpen(false);
                setMobileProgressOpen(true);
              }}
              onOpenCheckinRecords={() => {
                setMobileCheckinOpen(true);
              }}
              isLoggedIn={isLoggedIn}
              levelInfo={isLoggedIn ? levelInfo : undefined}
            />
          </div>

          <div className={`${styles.toolbarItem} ${!isLoggedIn ? styles.toolbarItemHidden : ''}`}>
            <BadgeCheckin user={user} onSuccess={handleBadgeSuccess} onToast={showToast} />
          </div>

          <button
            className={styles.toolbarItem}
            onClick={handleFocus}
            aria-label={t.map.locateAriaLabel}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <circle cx="12" cy="12" r="8" />
            </svg>
            <span className={styles.toolbarLabel}>{t.map.locate}</span>
          </button>

          <button
            className={styles.toolbarItem}
            onClick={() => setTrainDialogOpen(true)}
            aria-label={t.map.trainScheduleAriaLabel}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M12 7v5l3 3" />
              <path d="M8 21h8" />
              <path d="M12 21v2" />
            </svg>
            <span className={styles.toolbarLabel}>{t.map.trainSchedule}</span>
          </button>
        </nav>
      </section>

      {/* ── Mobile: Badge Collection Progress BottomSheet ── */}
      {isMobile && (
        <BottomSheet
          open={mobileProgressOpen}
          onOpenChange={setMobileProgressOpen}
          title={t.bottomSheet.progressTitle}
          defaultSnap={1}
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
      )}

      {/* ── Mobile: Station/Line Details BottomSheet ── */}
      {isMobile && (
        <BottomSheet
          open={sheetOpen}
          onOpenChange={(open) => { if (!open) handleClose(); }}
          title={t.bottomSheet.detailsTitle}
          defaultSnap={1}
        >
          <FeatureDetails
            feature={selectedFeature}
            onClose={handleClose}
            collectedBadges={collectedBadgesMap}
            stationCountsBySystem={stationCountsBySystem}
            collectedCountsBySystem={collectedCountsBySystem}
          />
        </BottomSheet>
      )}

      {/* ── Mobile: Train Schedule Query BottomSheet ── */}
      {isMobile && (
        <BottomSheet
          open={trainDialogOpen}
          onOpenChange={(open) => {
            setTrainDialogOpen(open);
            if (!open) setStationPickTarget(null);
          }}
          title={t.bottomSheet.trainTitle}
          defaultSnap={1}
        >
          <TrainScheduleDialog
            isOpen={trainDialogOpen}
            pickedStation={pickedStation}
            pickTarget={stationPickTarget}
            onRequestPick={handleRequestPick}
            onClose={() => {
              setTrainDialogOpen(false);
              setStationPickTarget(null);
            }}
            onToast={showToast}
            onDismissToast={dismissToast}
            traStations={traStations}
          />
        </BottomSheet>
      )}

      {/* ── Mobile: Checkin Records BottomSheet ── */}
      {isMobile && (
        <BottomSheet
          open={mobileCheckinOpen}
          onOpenChange={setMobileCheckinOpen}
          title={t.bottomSheet.checkinTitle}
          defaultSnap={1}
        >
          <CheckinRecordsPanel
            checkinCount={checkinCount}
            t={t}
          />
        </BottomSheet>
      )}


    </main>
  );
}
