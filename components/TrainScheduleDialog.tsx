'use client';

/**
 * TrainScheduleDialog.tsx — 多系統班次查詢 Dialog
 *
 * 頁籤結構:
 *   TRA  (台鐵)  — OD 時刻表查詢（含誤點資訊）
 *   HSR  (高鐵)  — OD 時刻表查詢（含票價）
 *   TRTC (台北捷運) — 服務資訊（首末班 + 班距 + 票價）
 *   TYMC (桃園捷運) — 同上
 *   KRTC (高雄捷運) — 同上
 *   TMRT (台中捷運) — 同上
 *   NTMC (新北捷運) — 同上
 *   KLRT (高雄輕軌) — 同上
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useIsMobile } from '@/lib/useIsMobile';
import { fetchLiveTrainDelay, queryHsrODSchedule, queryMetroServiceInfo } from '@/lib/tdxApi';
import type { HsrTrainResult, MetroQueryResult } from '@/lib/tdxApi';
import { useTranslation } from '@/lib/i18n';
import styles from './TrainScheduleDialog.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEDULE_TABS = [
  { id: 'TRA',  labelKey: 'tabTRA'  },
  { id: 'HSR',  labelKey: 'tabHSR'  },
  { id: 'TRTC', labelKey: 'tabTRTC' },
  { id: 'TYMC', labelKey: 'tabTYMC' },
  { id: 'KRTC', labelKey: 'tabKRTC' },
  { id: 'TMRT', labelKey: 'tabTMRT' },
  { id: 'NTMC', labelKey: 'tabNTMC' },
  { id: 'KLRT', labelKey: 'tabKLRT' },
] as const;

export type ScheduleTabId = typeof SCHEDULE_TABS[number]['id'];

const METRO_SYSTEMS = new Set<string>(['TRTC', 'TYMC', 'KRTC', 'TMRT', 'NTMC', 'KLRT']);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type StationPickTarget = 'origin' | 'destination' | null;

interface StationInfo {
  stationId: string;
  stationName: string;
}

interface TrainResult {
  trainNo: string;
  trainType: string;
  departureTime: string;
  arrivalTime: string;
  travelTime: string;
  delayMinutes?: number;
  price?: string;
}

interface TabState {
  origin: StationInfo | null;
  destination: StationInfo | null;
  date: string;
  trainResults: TrainResult[] | null;
  metroInfo: MetroQueryResult | null;
  loading: boolean;
  error: string | null;
}

interface TrainScheduleDialogProps {
  isOpen: boolean;
  pickedStation: StationInfo | null;
  pickTarget: StationPickTarget;
  /** Request parent to enter station picking mode for a specific system */
  onRequestPick: (target: StationPickTarget, system?: string) => void;
  onClose: () => void;
  onToast?: (message: string, type: 'success' | 'error' | 'info' | 'loading') => string;
  onDismissToast?: (id: string) => void;
  /** Stations keyed by system_type (all 8 systems) */
  systemStations?: Record<string, StationInfo[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

const getDefaultDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const defaultTabState = (): TabState => ({
  origin: null,
  destination: null,
  date: getDefaultDate(),
  trainResults: null,
  metroInfo: null,
  loading: false,
  error: null,
});

// ─────────────────────────────────────────────────────────────────────────────
// TDX API helpers (TRA)
// ─────────────────────────────────────────────────────────────────────────────

/** Strip any prefix (e.g. 'TRA-') and return numeric station code only */
const sanitize = (id: string) => {
  if (!id) return '';
  const m = String(id).match(/(\d+)$/);
  return m ? m[1] : id;
};

/** Query TDX ODFare to get adult standard price (TicketType=1, FareClass=1) per train type code */
async function queryTdxFare(
  originId: string,
  destId: string,
): Promise<Map<number, number>> {
  const originCode = sanitize(originId);
  const destCode = sanitize(destId);
  const url = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/ODFare/${originCode}/to/${destCode}?$format=JSON`;
  const fareMap = new Map<number, number>(); // trainType → price
  try {
    const resp = await fetch(url);
    if (!resp.ok) return fareMap;
    const data = await resp.json();
    const items = data?.ODFares ?? [];
    (Array.isArray(items) ? items : []).forEach((od: any) => {
      const trainType = od?.TrainType as number;
      const fares = od?.Fares ?? [];
      // Find adult standard fare: TicketType=1 (adult), FareClass=1 (standard)
      const adultFare = fares.find(
        (f: any) => f.TicketType === 1 && f.FareClass === 1,
      );
      if (adultFare && typeof adultFare.Price === 'number') {
        fareMap.set(trainType, adultFare.Price);
      }
    });
  } catch {
    // Fare is optional; don't block schedule results
  }
  return fareMap;
}

/** Map TDX TrainTypeCode to fare trainType category */
function mapTrainTypeCodeToFareType(code: string): number {
  // TDX TrainTypeCode → ODFare TrainType mapping
  // 1=太魯閣, 2=普悠瑪, 3=自強, 4=莒光, 5=復興, 6=區間, 10=區間快, 11=普快
  const c = parseInt(code, 10);
  if (c === 1 || c === 2 || c === 3) return 1; // 自強級 → fare trainType 1
  if (c === 4) return 2; // 莒光 → fare trainType 2
  if (c === 5) return 3; // 復興 → fare trainType 3
  if (c === 6 || c === 10 || c === 11) return 10; // 區間/區間快 → fare trainType 10
  return 10; // fallback to 區間
}

async function queryTdxTrainSchedule(
  originId: string,
  destId: string,
  date: string,
): Promise<TrainResult[]> {
  const originCode = sanitize(originId);
  const destCode = sanitize(destId);

  // Fetch timetable, fare, and live delays in parallel
  const [timetableResp, fareMap, delayMap] = await Promise.all([
    fetch(
      `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/${originCode}/to/${destCode}/${date}?$top=300&$format=JSON`,
    ),
    queryTdxFare(originId, destId),
    fetchLiveTrainDelay(),
  ]);

  if (!timetableResp.ok) {
    throw new Error(`TDX API 回應錯誤: ${timetableResp.status}`);
  }

  try {
    const data = await timetableResp.json();
    const trains: TrainResult[] = [];
    const items = data?.TrainTimetables ?? data?.DailyTrainTimetableList ?? data ?? [];

    (Array.isArray(items) ? items : []).forEach((item: any) => {
      const info = item?.TrainInfo ?? item;
      const trainNo = info?.TrainNo ?? '';
      const trainType = info?.TrainTypeName?.Zh_tw ?? info?.TrainType ?? '';
      const trainTypeCode = info?.TrainTypeCode ?? '';

      const stops = item?.StopTimes ?? [];
      // Match stops using sanitized numeric codes
      const originStop = stops.find((s: any) => s.StationID === originCode);
      const destStop = stops.find((s: any) => s.StationID === destCode);

      const depTime = originStop?.DepartureTime ?? originStop?.ArrivalTime ?? '';
      const arrTime = destStop?.ArrivalTime ?? destStop?.DepartureTime ?? '';

      // Calculate travel time
      let travelTime = '';
      if (depTime && arrTime) {
        const [dh, dm] = depTime.split(':').map(Number);
        const [ah, am] = arrTime.split(':').map(Number);
        let diffMin = (ah * 60 + am) - (dh * 60 + dm);
        if (diffMin < 0) diffMin += 24 * 60; // handle overnight
        if (diffMin > 0) {
          const h = Math.floor(diffMin / 60);
          const m = diffMin % 60;
          travelTime = h > 0 ? `${h}時${m}分` : `${m}分`;
        }
      }

      const delayMin = delayMap.get(String(trainNo));

      // Look up fare by train type
      const fareType = mapTrainTypeCodeToFareType(trainTypeCode);
      const price = fareMap.get(fareType);

      trains.push({
        trainNo,
        trainType,
        departureTime: depTime,
        arrivalTime: arrTime,
        travelTime,
        delayMinutes: delayMin != null ? delayMin : undefined,
        price: typeof price === 'number' ? `$${price}` : undefined,
      });
    });

    return trains;
  } catch (err: any) {
    console.error('TDX query failed:', err);
    throw new Error(err?.message ?? '查詢失敗');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function TrainScheduleDialog({
  isOpen,
  pickedStation,
  pickTarget,
  onRequestPick,
  onClose,
  onToast,
  onDismissToast,
  systemStations,
}: TrainScheduleDialogProps) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  // ── Active tab ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ScheduleTabId>('TRA');

  // ── Per-tab state ───────────────────────────────────────────────────────────
  const [tabStates, setTabStates] = useState<Record<string, TabState>>(
    () => Object.fromEntries(SCHEDULE_TABS.map((tab) => [tab.id, defaultTabState()])),
  );

  const updateTab = useCallback((tabId: string, update: Partial<TabState>) => {
    setTabStates((prev) => ({
      ...prev,
      [tabId]: { ...prev[tabId], ...update },
    }));
  }, []);

  const state = tabStates[activeTab];

  // ── Dropdown UI state (reset on tab switch) ─────────────────────────────────
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [originDropdownOpen, setOriginDropdownOpen] = useState(false);
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);

  const handleTabChange = useCallback(
    (tabId: ScheduleTabId) => {
      setActiveTab(tabId);
      setOriginQuery('');
      setDestQuery('');
      setOriginDropdownOpen(false);
      setDestDropdownOpen(false);
      onRequestPick(null);
    },
    [onRequestPick],
  );

  // ── Station lists ───────────────────────────────────────────────────────────
  const currentStations = useMemo(
    () => systemStations?.[activeTab] ?? [],
    [systemStations, activeTab],
  );

  const useDropdown = isMobile && currentStations.length > 0;

  const filteredOriginStations = useMemo(() => {
    if (!originQuery) return currentStations;
    const q = originQuery.toLowerCase();
    return currentStations.filter((s) => s.stationName.toLowerCase().includes(q));
  }, [currentStations, originQuery]);

  const filteredDestStations = useMemo(() => {
    if (!destQuery) return currentStations;
    const q = destQuery.toLowerCase();
    return currentStations.filter((s) => s.stationName.toLowerCase().includes(q));
  }, [currentStations, destQuery]);

  // ── Auto-enter pick mode on desktop ─────────────────────────────────────────
  const hasAutoStarted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (useDropdown) return;
    if (!isOpen) {
      hasAutoStarted.current = new Set();
      return;
    }
    if (state.origin || hasAutoStarted.current.has(activeTab)) return;
    hasAutoStarted.current.add(activeTab);
    onRequestPick('origin', activeTab);
  }, [isOpen, state.origin, onRequestPick, useDropdown, activeTab]);

  // ── Handle pickedStation from map ───────────────────────────────────────────
  useEffect(() => {
    if (!pickedStation || !pickTarget) return;
    if (pickTarget === 'origin') {
      updateTab(activeTab, { origin: pickedStation });
      setTimeout(() => onRequestPick('destination', activeTab), 100);
    } else if (pickTarget === 'destination') {
      updateTab(activeTab, { destination: pickedStation });
      onRequestPick(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedStation, pickTarget]);

  // ── Query ────────────────────────────────────────────────────────────────────
  const isMetro = METRO_SYSTEMS.has(activeTab);

  const handleQuery = useCallback(async () => {
    const { origin, destination, date } = state;
    if (!origin) return;
    if (!isMetro && !destination) return;

    updateTab(activeTab, { loading: true, error: null, trainResults: null, metroInfo: null });
    const loadingId = onToast?.(t.train.queryToast, 'loading');

    try {
      if (activeTab === 'TRA') {
        const trains = await queryTdxTrainSchedule(origin.stationId, destination!.stationId, date);
        updateTab(activeTab, { trainResults: trains });
        if (loadingId) onDismissToast?.(loadingId);
        onToast?.((t.train.querySuccess as (n: number) => string)(trains.length), 'success');
      } else if (activeTab === 'HSR') {
        const hsrList: HsrTrainResult[] = await queryHsrODSchedule(
          origin.stationId,
          destination!.stationId,
          date,
        );
        const trains: TrainResult[] = hsrList.map((r) => ({
          trainNo: r.trainNo,
          trainType: '高鐵',
          departureTime: r.departureTime,
          arrivalTime: r.arrivalTime,
          travelTime: r.travelTime,
          price: r.standardFare != null
            ? (t.train.hsrFare as (n: number) => string)(r.standardFare)
            : undefined,
        }));
        updateTab(activeTab, { trainResults: trains });
        if (loadingId) onDismissToast?.(loadingId);
        onToast?.((t.train.querySuccess as (n: number) => string)(trains.length), 'success');
      } else {
        // Metro
        const metroInfo = await queryMetroServiceInfo(
          activeTab,
          origin.stationId,
          destination?.stationId,
        );
        updateTab(activeTab, { metroInfo });
        if (loadingId) onDismissToast?.(loadingId);
        onToast?.(t.train.metroQuerySuccess as string, 'success');
      }
    } catch (err: any) {
      const msg = err?.message ?? (t.train.queryFail as string);
      updateTab(activeTab, { error: msg });
      if (loadingId) onDismissToast?.(loadingId);
      onToast?.(msg, 'error');
    } finally {
      updateTab(activeTab, { loading: false });
    }
  }, [state, activeTab, isMetro, onToast, onDismissToast, t, updateTab]);

  // ── Step guidance ─────────────────────────────────────────────────────────
  const systemLabel = t.train[`tab${activeTab}` as keyof typeof t.train] as string;

  const currentStep = isMetro
    ? !state.origin ? 1 : 2
    : !state.origin ? 1 : !state.destination ? 2 : 3;

  const totalSteps = isMetro ? 2 : 3;

  const stepMessages = useMemo(() => {
    if (isMetro) {
      return { 1: t.train.metroStep1 as string, 2: t.train.metroStep2 as string };
    }
    return useDropdown
      ? {
          1: t.train.stepDropdown1 as string,
          2: t.train.stepDropdown2 as string,
          3: t.train.stepDropdown3 as string,
        }
      : {
          1: (t.train.stepMap1 as (s: string) => string)(systemLabel),
          2: (t.train.stepMap2 as (s: string) => string)(systemLabel),
          3: t.train.stepMap3 as string,
        };
  }, [isMetro, useDropdown, t, systemLabel]);

  // ── Station field renderer ────────────────────────────────────────────────
  const renderStationField = (which: 'origin' | 'destination', optional?: boolean) => {
    const value = which === 'origin' ? state.origin : state.destination;
    const query = which === 'origin' ? originQuery : destQuery;
    const setQuery = which === 'origin' ? setOriginQuery : setDestQuery;
    const dropOpen = which === 'origin' ? originDropdownOpen : destDropdownOpen;
    const setDropOpen = which === 'origin' ? setOriginDropdownOpen : setDestDropdownOpen;
    const filtered = which === 'origin' ? filteredOriginStations : filteredDestStations;
    const clearLabel = which === 'origin' ? t.train.clearOrigin : t.train.clearDest;
    const baseLabel = which === 'origin' ? t.train.origin : t.train.destination;
    const label = optional ? `${baseLabel}（選填）` : baseLabel;

    return (
      <div className={styles.fieldGroup} key={which}>
        <label className={styles.label}>{label}</label>
        {useDropdown ? (
          <div className={styles.stationSelect}>
            <input
              className={styles.stationSelectInput}
              placeholder={t.train.searchPlaceholder as string}
              value={value ? value.stationName : query}
              onChange={(e) => {
                if (value) updateTab(activeTab, { [which]: null });
                setQuery(e.target.value);
                setDropOpen(true);
              }}
              onFocus={() => {
                if (value) {
                  setQuery(value.stationName);
                  updateTab(activeTab, { [which]: null });
                }
                setDropOpen(true);
              }}
              onBlur={() => setTimeout(() => setDropOpen(false), 200)}
            />
            {(value || query) && (
              <button
                className={styles.stationSelectClear}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  updateTab(activeTab, { [which]: null });
                  setQuery('');
                  setDropOpen(false);
                }}
                aria-label={clearLabel as string}
              >
                ✕
              </button>
            )}
            {dropOpen && filtered.length > 0 && (
              <ul className={styles.stationDropdown}>
                {filtered.map((s) => (
                  <li
                    key={s.stationId}
                    className={styles.stationDropdownItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      updateTab(activeTab, { [which]: s });
                      setQuery('');
                      setDropOpen(false);
                    }}
                  >
                    {s.stationName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <button
            className={`${styles.pickerBtn} ${pickTarget === which ? styles.pickerBtnActive : ''}`}
            onClick={() => onRequestPick(which, activeTab)}
          >
            {value
              ? `🚉 ${value.stationName}`
              : (t.train.selectOnMap as (s: string) => string)(systemLabel)}
          </button>
        )}
      </div>
    );
  };

  // ── TRA/HSR results ────────────────────────────────────────────────────────
  const renderTrainResults = () => (
    <>
      {state.error && <div className={styles.error}>{state.error}</div>}
      {state.trainResults && state.trainResults.length === 0 && (
        <div className={styles.noResult}>{t.train.noResult as string}</div>
      )}
      {state.trainResults && state.trainResults.length > 0 && (
        <div className={styles.resultList}>
          {state.trainResults.map((train, idx) => (
            <div key={`${train.trainNo}-${idx}`} className={styles.resultCard}>
              <div className={styles.cardHeader}>
                <span className={styles.trainNo}>{train.trainNo}</span>
                <span className={styles.trainType}>{train.trainType}</span>
                {train.price && <span className={styles.trainPrice}>{train.price}</span>}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTime}>
                  <div className={styles.cardTimeItem}>
                    <span className={styles.cardTimeLabel}>{t.train.departure as string}</span>
                    <span className={styles.cardTimeValue}>{train.departureTime || '-'}</span>
                  </div>
                  <span className={styles.cardArrow}>→</span>
                  <div className={styles.cardTimeItem}>
                    <span className={styles.cardTimeLabel}>{t.train.arrival as string}</span>
                    <span className={styles.cardTimeValue}>{train.arrivalTime || '-'}</span>
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardMetaItem}>
                    {(t.train.travelTime as (s: string) => string)(train.travelTime || '-')}
                  </span>
                  <span
                    className={`${styles.cardMetaItem} ${train.delayMinutes ? styles.delayed : ''}`}
                  >
                    {train.delayMinutes != null
                      ? train.delayMinutes > 0
                        ? (t.train.delayed as (n: number) => string)(train.delayMinutes)
                        : (t.train.onTime as string)
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ── Metro results ─────────────────────────────────────────────────────────
  const renderMetroResults = () => (
    <>
      {state.error && <div className={styles.error}>{state.error}</div>}
      {state.metroInfo && (
        <div className={styles.resultList}>
          {(state.metroInfo.fare != null || state.metroInfo.travelDistance != null) && (
            <div className={styles.metroFareCard}>
              {state.metroInfo.fare != null && (
                <span className={styles.metroFareText}>
                  {(t.train.metroFare as (n: number) => string)(state.metroInfo.fare)}
                </span>
              )}
              {state.metroInfo.travelDistance != null && (
                <span className={styles.metroDistText}>
                  {(t.train.metroDistance as (n: number) => string)(state.metroInfo.travelDistance)}
                </span>
              )}
            </div>
          )}

          {state.metroInfo.originServices.length === 0 ? (
            <div className={styles.noResult}>{t.train.metroNoService as string}</div>
          ) : (
            state.metroInfo.originServices.map((svc, i) => (
              <div key={`${svc.lineNo}-${i}`} className={styles.resultCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.trainNo}>{svc.lineNo}</span>
                  <span className={styles.trainType}>{svc.tripHeadSign}</span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.metroServiceRow}>
                    <span>{t.train.metroFirstTrain as string}：{svc.firstTrainTime}</span>
                    <span>{t.train.metroLastTrain as string}：{svc.lastTrainTime}</span>
                  </div>
                  {(svc.peakHeadwayMins != null || svc.offPeakHeadwayMins != null) && (
                    <div className={styles.metroHeadwayRow}>
                      {svc.peakHeadwayMins != null && (
                        <span>
                          {(t.train.metroPeakHeadway as (n: number) => string)(svc.peakHeadwayMins)}
                        </span>
                      )}
                      {svc.offPeakHeadwayMins != null && (
                        <span>
                          {(t.train.metroOffPeakHeadway as (n: number) => string)(svc.offPeakHeadwayMins)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          <p className={styles.metroNote}>{t.train.metroNote as string}</p>
        </div>
      )}
    </>
  );

  // ── Dialog title ──────────────────────────────────────────────────────────
  const dialogTitle = activeTab === 'TRA'
    ? (t.train.title as string)
    : activeTab === 'HSR'
    ? (t.train.hsrTitle as string)
    : `${systemLabel} 服務查詢`;

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {/* ── Tab bar ── */}
      <div className={styles.tabBar} role="tablist">
        {SCHEDULE_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => handleTabChange(tab.id as ScheduleTabId)}
          >
            {t.train[tab.labelKey as keyof typeof t.train] as string}
          </button>
        ))}
      </div>

      {/* ── Title ── */}
      <h3 className={styles.title}>{dialogTitle}</h3>

      {/* ── Step indicator ── */}
      <div className={styles.stepIndicator}>
        <div className={styles.stepDots}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <span
              key={s}
              className={`${styles.stepDot} ${s === currentStep ? styles.stepDotActive : ''} ${s < currentStep ? styles.stepDotDone : ''}`}
            />
          ))}
        </div>
        <p className={styles.stepMessage}>{stepMessages[currentStep]}</p>
      </div>

      {/* ── Station fields ── */}
      {renderStationField('origin')}
      {renderStationField('destination', isMetro)}

      {/* ── Date + query (TRA / HSR) ── */}
      {!isMetro && (
        <div className={`${styles.timeSection} ${currentStep >= 3 ? styles.timeSectionActive : ''}`}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>{t.train.queryDate as string}</label>
            <input
              type="date"
              className={styles.timeInput}
              value={state.date}
              onChange={(e) => updateTab(activeTab, { date: e.target.value })}
            />
          </div>
          <button
            className={styles.queryBtn}
            onClick={handleQuery}
            disabled={!state.origin || !state.destination || state.loading}
          >
            {state.loading ? (t.train.querying as string) : (t.train.query as string)}
          </button>
        </div>
      )}

      {/* ── Metro query button ── */}
      {isMetro && (
        <div className={styles.metroQuerySection}>
          <button
            className={styles.queryBtn}
            onClick={handleQuery}
            disabled={!state.origin || state.loading}
          >
            {state.loading ? (t.train.querying as string) : (t.train.query as string)}
          </button>
        </div>
      )}

      {/* ── Results ── */}
      {isMetro ? renderMetroResults() : renderTrainResults()}
    </div>
  );
}


