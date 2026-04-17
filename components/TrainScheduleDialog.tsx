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

import { useState, useCallback, useEffect, useRef } from 'react';
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
}

// ─────────────────────────────────────────────────────────────────────────────
// TDX API helper
// ─────────────────────────────────────────────────────────────────────────────
async function queryTdxTrainSchedule(
  originId: string,
  destId: string,
  date: string,
  timeFrom: string,
  timeTo: string,
): Promise<TrainResult[]> {
  // TDX v2 open API (no auth required for basic queries with rate limit)
  const baseUrl = 'https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD';
  // Use numeric station codes for TDX OD API (e.g., 1110), strip prefixes like 'TRA-'
  const sanitize = (id: string) => {
    if (!id) return '';
    const m = String(id).match(/(\d+)$/);
    return m ? m[1] : id;
  };
  const originCode = sanitize(originId);
  const destCode = sanitize(destId);
  const url = `${baseUrl}/${originCode}/to/${destCode}/${date}?$top=30&$format=JSON`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`TDX API 回應錯誤: ${resp.status}`);
    }
    const data = await resp.json();

    // Parse TDX response into our format
    const trains: TrainResult[] = [];
    const items = data?.TrainTimetables ?? data?.DailyTrainTimetableList ?? data ?? [];

    (Array.isArray(items) ? items : []).forEach((item: any) => {
      const info = item?.TrainInfo ?? item;
      const trainNo = info?.TrainNo ?? '';
      const trainType = info?.TrainTypeName?.Zh_tw ?? info?.TrainType ?? '';

      const stops = item?.StopTimes ?? [];
      const originStop = stops.find((s: any) =>
        s.StationID === originId || s.StationName?.Zh_tw === originId
      );
      const destStop = stops.find((s: any) =>
        s.StationID === destId || s.StationName?.Zh_tw === destId
      );

      const depTime = originStop?.DepartureTime ?? originStop?.ArrivalTime ?? '';
      const arrTime = destStop?.ArrivalTime ?? destStop?.DepartureTime ?? '';

      // Filter by time range
      if (depTime && timeFrom && depTime < timeFrom) return;
      if (depTime && timeTo && depTime > timeTo) return;

      // Calculate travel time
      let travelTime = '';
      if (depTime && arrTime) {
        const [dh, dm] = depTime.split(':').map(Number);
        const [ah, am] = arrTime.split(':').map(Number);
        const diffMin = (ah * 60 + am) - (dh * 60 + dm);
        if (diffMin > 0) {
          travelTime = `${Math.floor(diffMin / 60)}時${diffMin % 60}分`;
        }
      }

      const delay = info?.DelayTime ?? item?.DelayTime;

      trains.push({
        trainNo,
        trainType,
        departureTime: depTime,
        arrivalTime: arrTime,
        travelTime,
        delayMinutes: typeof delay === 'number' ? delay : undefined,
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
}: TrainScheduleDialogProps) {
  const [origin, setOrigin] = useState<StationInfo | null>(null);
  const [destination, setDestination] = useState<StationInfo | null>(null);

  // Default time range: now to +3 hours
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultFrom = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const laterHour = (now.getHours() + 3) % 24;
  const defaultTo = `${pad(laterHour)}:${pad(now.getMinutes())}`;

  const [timeFrom, setTimeFrom] = useState(defaultFrom);
  const [timeTo, setTimeTo] = useState(defaultTo);
  const [date] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const [results, setResults] = useState<TrainResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step guidance: 1=select origin, 2=select destination, 3=set time
  const currentStep = !origin ? 1 : !destination ? 2 : 3;

  // Auto-enter origin picking mode when dialog opens
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (isOpen && !origin && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      onRequestPick('origin');
    }
    if (!isOpen) {
      hasAutoStarted.current = false;
    }
  }, [isOpen, origin, onRequestPick]);

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
    const loadingId = onToast?.('班次查詢中…', 'loading');
    try {
      const trains = await queryTdxTrainSchedule(
        origin.stationId,
        destination.stationId,
        date,
        timeFrom,
        timeTo,
      );
      setResults(trains);
      if (loadingId) onDismissToast?.(loadingId);
      onToast?.(`查詢完成，共 ${trains.length} 筆班次`, 'success');
    } catch (err: any) {
      setError(err?.message ?? '查詢失敗');
      if (loadingId) onDismissToast?.(loadingId);
      onToast?.(err?.message ?? '查詢失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [origin, destination, date, timeFrom, timeTo, onToast, onDismissToast]);

  const stepMessages: Record<number, string> = {
    1: '步驟 1：請選取起站 — 點擊下方「起站」欄位，再點選地圖上的台鐵車站',
    2: '步驟 2：請選取迄站 — 點擊下方「迄站」欄位，再點選地圖上的台鐵車站',
    3: '步驟 3：請設定時間範圍，然後按「查詢班次」',
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>🚂 台鐵班次查詢</h3>

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
        <label className={styles.label}>起站</label>
        <button
          className={`${styles.pickerBtn} ${pickTarget === 'origin' ? styles.pickerBtnActive : ''}`}
          onClick={() => onRequestPick('origin')}
        >
          {origin ? `🚉 ${origin.stationName}` : '👆 點擊後請在地圖上選取台鐵車站'}
        </button>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>迄站</label>
        <button
          className={`${styles.pickerBtn} ${pickTarget === 'destination' ? styles.pickerBtnActive : ''}`}
          onClick={() => onRequestPick('destination')}
        >
          {destination ? `🚉 ${destination.stationName}` : '👆 點擊後請在地圖上選取台鐵車站'}
        </button>
      </div>

      {/* Time range (visible at step 3) */}
      <div className={`${styles.timeSection} ${currentStep >= 3 ? styles.timeSectionActive : ''}`}>
        <div className={styles.timeRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>開始時間</label>
            <input
              type="time"
              className={styles.timeInput}
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>結束時間</label>
            <input
              type="time"
              className={styles.timeInput}
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
            />
          </div>
        </div>

        {/* Query button */}
        <button
          className={styles.queryBtn}
          onClick={handleQuery}
          disabled={!origin || !destination || loading}
        >
          {loading ? '查詢中…' : '查詢班次'}
        </button>
      </div>

      {/* Error */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Results */}
      {results && results.length === 0 && (
        <div className={styles.noResult}>此時段無查詢到班次資料</div>
      )}

      {results && results.length > 0 && (
        <div className={styles.resultList}>
          <div className={styles.resultHeader}>
            <span>車次</span>
            <span>車種</span>
            <span>出發</span>
            <span>抵達</span>
            <span>行駛</span>
            <span>誤點</span>
          </div>
          {results.map((train) => (
            <div key={train.trainNo} className={styles.resultRow}>
              <span className={styles.trainNo}>{train.trainNo}</span>
              <span>{train.trainType}</span>
              <span>{train.departureTime}</span>
              <span>{train.arrivalTime}</span>
              <span>{train.travelTime}</span>
              <span className={train.delayMinutes ? styles.delayed : ''}>
                {train.delayMinutes != null
                  ? train.delayMinutes > 0
                    ? `${train.delayMinutes}分`
                    : '準點'
                  : '-'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
