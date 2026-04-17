'use client';

/**
 * TrainScheduleDialog.tsx — 台鐵班次查詢 Dialog
 *
 * Flow:
 * 1. User opens dialog → sees origin/destination fields + time range
 * 2. Tap origin field → enters "picking" mode → tap station on map → fills origin
 * 3. Tap destination field → enters "picking" mode → tap station on map → fills destination
 * 4. Set time range → tap query → calls TDX API
 */

import { useState, useCallback, useEffect } from 'react';
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
  /** Currently picked station from map (set by parent when user clicks a TRA station) */
  pickedStation: StationInfo | null;
  /** Which field is currently waiting for a map pick */
  pickTarget: StationPickTarget;
  /** Request parent to enter station picking mode */
  onRequestPick: (target: StationPickTarget) => void;
  /** Called when dialog wants to close */
  onClose: () => void;
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
  const url = `${baseUrl}/${originId}/to/${destId}/${date}?$format=JSON`;

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
  pickedStation,
  pickTarget,
  onRequestPick,
  onClose,
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

  // When a station is picked from the map, assign to the correct field
  useEffect(() => {
    if (!pickedStation || !pickTarget) return;
    if (pickTarget === 'origin') {
      setOrigin(pickedStation);
    } else if (pickTarget === 'destination') {
      setDestination(pickedStation);
    }
    onRequestPick(null); // clear picking mode
  }, [pickedStation, pickTarget, onRequestPick]);

  const handleQuery = useCallback(async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const trains = await queryTdxTrainSchedule(
        origin.stationId,
        destination.stationId,
        date,
        timeFrom,
        timeTo,
      );
      setResults(trains);
    } catch (err: any) {
      setError(err?.message ?? '查詢失敗');
    } finally {
      setLoading(false);
    }
  }, [origin, destination, date, timeFrom, timeTo]);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>🚂 台鐵班次查詢</h3>

      {/* Station picker fields */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>起站</label>
        <button
          className={`${styles.pickerBtn} ${pickTarget === 'origin' ? styles.pickerBtnActive : ''}`}
          onClick={() => {
            onRequestPick('origin');
            onClose();
          }}
        >
          {origin ? origin.stationName : '👆 點擊後請在地圖上選取車站'}
        </button>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>迄站</label>
        <button
          className={`${styles.pickerBtn} ${pickTarget === 'destination' ? styles.pickerBtnActive : ''}`}
          onClick={() => {
            onRequestPick('destination');
            onClose();
          }}
        >
          {destination ? destination.stationName : '👆 點擊後請在地圖上選取車站'}
        </button>
      </div>

      {/* Picking mode hint */}
      {pickTarget && (
        <div className={styles.pickingHint}>
          📍 請在地圖上點擊一個台鐵車站作為{pickTarget === 'origin' ? '起站' : '迄站'}
        </div>
      )}

      {/* Time range */}
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
