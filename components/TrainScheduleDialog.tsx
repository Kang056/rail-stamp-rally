'use client';

/**
 * TrainScheduleDialog.tsx — 台鐵班次查詢 Dialog
 *
 * Flow:
 * 1. Dialog opens → auto-enters origin picking mode → "步驟1: 請選取起站"
 * 2. User clicks TRA station on map → origin filled → auto-enters destination pick
 * 3. "步驟2: 請選取迄站" → user clicks station → destination filled
 * 4. "步驟3: 請選取時間範圍" → user sets time → query
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useIsMobile } from '@/lib/useIsMobile';
import { fetchLiveTrainDelay } from '@/lib/tdxApi';
import { useTranslation } from '@/lib/i18n';
import styles from './TrainScheduleDialog.module.css';

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

interface TrainScheduleDialogProps {
  /** Whether this dialog is currently open */
  isOpen: boolean;
  /** Currently picked station from map (set by parent when user clicks a TRA station) */
  pickedStation: StationInfo | null;
  /** Which field is currently waiting for a map pick */
  pickTarget: StationPickTarget;
  /** Request parent to enter station picking mode */
  onRequestPick: (target: StationPickTarget) => void;
  /** Called when dialog wants to close */
  onClose: () => void;
  /** Toast callback: returns toast id for loading toasts */
  onToast?: (message: string, type: 'success' | 'error' | 'info' | 'loading') => string;
  /** Dismiss a loading toast by id */
  onDismissToast?: (id: string) => void;
  /** TRA station list for mobile dropdown selection */
  traStations?: StationInfo[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TDX API helper
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
  traStations,
}: TrainScheduleDialogProps) {
  const isMobile = useIsMobile();
  const useDropdown = isMobile && traStations && traStations.length > 0;
  const { t } = useTranslation();

  const [origin, setOrigin] = useState<StationInfo | null>(null);
  const [destination, setDestination] = useState<StationInfo | null>(null);

  // Searchable dropdown state (mobile only)
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [originDropdownOpen, setOriginDropdownOpen] = useState(false);
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);

  const filteredOriginStations = useMemo(() => {
    if (!traStations || !originQuery) return traStations ?? [];
    const q = originQuery.toLowerCase();
    return traStations.filter((s) => s.stationName.toLowerCase().includes(q));
  }, [traStations, originQuery]);

  const filteredDestStations = useMemo(() => {
    if (!traStations || !destQuery) return traStations ?? [];
    const q = destQuery.toLowerCase();
    return traStations.filter((s) => s.stationName.toLowerCase().includes(q));
  }, [traStations, destQuery]);

  const pad = (n: number) => String(n).padStart(2, '0');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const [results, setResults] = useState<TrainResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step guidance: 1=select origin, 2=select destination, 3=set time
  const currentStep = !origin ? 1 : !destination ? 2 : 3;

  // Auto-enter origin picking mode when dialog opens (desktop only — mobile uses dropdown)
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (useDropdown) return;
    if (isOpen && !origin && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      onRequestPick('origin');
    }
    if (!isOpen) {
      hasAutoStarted.current = false;
    }
  }, [isOpen, origin, onRequestPick, useDropdown]);

  // When a station is picked from the map, assign to the correct field and auto-advance
  useEffect(() => {
    if (!pickedStation || !pickTarget) return;
    if (pickTarget === 'origin') {
      setOrigin(pickedStation);
      // Auto-advance to destination picking
      setTimeout(() => onRequestPick('destination'), 100);
    } else if (pickTarget === 'destination') {
      setDestination(pickedStation);
      onRequestPick(null);
    }
  }, [pickedStation, pickTarget, onRequestPick]);

  const handleQuery = useCallback(async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setResults(null);
    const loadingId = onToast?.(t.train.queryToast, 'loading');
    try {
      const trains = await queryTdxTrainSchedule(
        origin.stationId,
        destination.stationId,
        date,
      );
      setResults(trains);
      if (loadingId) onDismissToast?.(loadingId);
      onToast?.(t.train.querySuccess(trains.length), 'success');
    } catch (err: any) {
      setError(err?.message ?? t.train.queryFail);
      if (loadingId) onDismissToast?.(loadingId);
      onToast?.(err?.message ?? t.train.queryFail, 'error');
    } finally {
      setLoading(false);
    }
  }, [origin, destination, date, onToast, onDismissToast, t]);

  const stepMessages: Record<number, string> = useDropdown
    ? {
        1: t.train.stepDropdown1,
        2: t.train.stepDropdown2,
        3: t.train.stepDropdown3,
      }
    : {
        1: t.train.stepMap1,
        2: t.train.stepMap2,
        3: t.train.stepMap3,
      };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>{t.train.title}</h3>

      {/* Step guidance indicator */}
      <div className={styles.stepIndicator}>
        <div className={styles.stepDots}>
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={`${styles.stepDot} ${s === currentStep ? styles.stepDotActive : ''} ${s < currentStep ? styles.stepDotDone : ''}`}
            />
          ))}
        </div>
        <p className={styles.stepMessage}>{stepMessages[currentStep]}</p>
      </div>

      {/* Station picker fields */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>{t.train.origin}</label>
        {useDropdown ? (
          <div className={styles.stationSelect}>
            <input
              className={styles.stationSelectInput}
              placeholder={t.train.searchPlaceholder}
              value={origin ? origin.stationName : originQuery}
              onChange={(e) => {
                if (origin) setOrigin(null);
                setOriginQuery(e.target.value);
                setOriginDropdownOpen(true);
              }}
              onFocus={() => {
                if (origin) {
                  setOriginQuery(origin.stationName);
                  setOrigin(null);
                }
                setOriginDropdownOpen(true);
              }}
              onBlur={() => {
                setTimeout(() => setOriginDropdownOpen(false), 200);
              }}
            />
            {(origin || originQuery) && (
              <button
                className={styles.stationSelectClear}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOrigin(null);
                  setOriginQuery('');
                  setOriginDropdownOpen(false);
                }}
                aria-label={t.train.clearOrigin}
              >
                ✕
              </button>
            )}
            {originDropdownOpen && filteredOriginStations.length > 0 && (
              <ul className={styles.stationDropdown}>
                {filteredOriginStations.map((s) => (
                  <li
                    key={s.stationId}
                    className={styles.stationDropdownItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOrigin(s);
                      setOriginQuery('');
                      setOriginDropdownOpen(false);
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
            className={`${styles.pickerBtn} ${pickTarget === 'origin' ? styles.pickerBtnActive : ''}`}
            onClick={() => onRequestPick('origin')}
          >
            {origin ? `🚉 ${origin.stationName}` : t.train.selectOnMap}
          </button>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>{t.train.destination}</label>
        {useDropdown ? (
          <div className={styles.stationSelect}>
            <input
              className={styles.stationSelectInput}
              placeholder={t.train.searchPlaceholder}
              value={destination ? destination.stationName : destQuery}
              onChange={(e) => {
                if (destination) setDestination(null);
                setDestQuery(e.target.value);
                setDestDropdownOpen(true);
              }}
              onFocus={() => {
                if (destination) {
                  setDestQuery(destination.stationName);
                  setDestination(null);
                }
                setDestDropdownOpen(true);
              }}
              onBlur={() => {
                setTimeout(() => setDestDropdownOpen(false), 200);
              }}
            />
            {(destination || destQuery) && (
              <button
                className={styles.stationSelectClear}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setDestination(null);
                  setDestQuery('');
                  setDestDropdownOpen(false);
                }}
                aria-label={t.train.clearDest}
              >
                ✕
              </button>
            )}
            {destDropdownOpen && filteredDestStations.length > 0 && (
              <ul className={styles.stationDropdown}>
                {filteredDestStations.map((s) => (
                  <li
                    key={s.stationId}
                    className={styles.stationDropdownItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setDestination(s);
                      setDestQuery('');
                      setDestDropdownOpen(false);
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
            className={`${styles.pickerBtn} ${pickTarget === 'destination' ? styles.pickerBtnActive : ''}`}
            onClick={() => onRequestPick('destination')}
          >
            {destination ? `🚉 ${destination.stationName}` : t.train.selectOnMap}
          </button>
        )}
      </div>

      {/* Date picker (visible at step 3) */}
      <div className={`${styles.timeSection} ${currentStep >= 3 ? styles.timeSectionActive : ''}`}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>{t.train.queryDate}</label>
          <input
            type="date"
            className={styles.timeInput}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Query button */}
        <button
          className={styles.queryBtn}
          onClick={handleQuery}
          disabled={!origin || !destination || loading}
        >
          {loading ? t.train.querying : t.train.query}
        </button>
      </div>

      {/* Error */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Results */}
      {results && results.length === 0 && (
        <div className={styles.noResult}>{t.train.noResult}</div>
      )}

      {results && results.length > 0 && (
        <div className={styles.resultList}>
          {results.map((train) => (
            <div key={train.trainNo} className={styles.resultCard}>
              <div className={styles.cardHeader}>
                <span className={styles.trainNo}>{train.trainNo}</span>
                <span className={styles.trainType}>{train.trainType}</span>
                {train.price && <span className={styles.trainPrice}>{train.price}</span>}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTime}>
                  <div className={styles.cardTimeItem}>
                    <span className={styles.cardTimeLabel}>{t.train.departure}</span>
                    <span className={styles.cardTimeValue}>{train.departureTime || '-'}</span>
                  </div>
                  <span className={styles.cardArrow}>→</span>
                  <div className={styles.cardTimeItem}>
                    <span className={styles.cardTimeLabel}>{t.train.arrival}</span>
                    <span className={styles.cardTimeValue}>{train.arrivalTime || '-'}</span>
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardMetaItem}>
                    {t.train.travelTime(train.travelTime || '-')}
                  </span>
                  <span className={`${styles.cardMetaItem} ${train.delayMinutes ? styles.delayed : ''}`}>
                    {train.delayMinutes != null
                      ? train.delayMinutes > 0
                        ? t.train.delayed(train.delayMinutes)
                        : t.train.onTime
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
