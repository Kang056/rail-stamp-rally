'use client';

import { useState, useEffect } from 'react';
import type { RailwayFeatureProperties, StationProperties, LineProperties } from '@/lib/supabaseClient';
import { fetchStationLiveBoard } from '@/lib/tdxApi';
import type { LiveBoardItem } from '@/lib/tdxApi';
import styles from './FeatureDetails.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface FeatureDetailsProps {
  /** The clicked feature's properties, or null when nothing is selected */
  feature: RailwayFeatureProperties | null;
  /** Called when the user dismisses the details panel */
  onClose: () => void;
  /** Collected badges keyed by station_id */
  collectedBadges?: Map<string, { unlocked_at: string; badge_image_url: string | null }>;
  /** Total station counts per system type */
  stationCountsBySystem?: Map<string, number>;
  /** Collected station counts per system type */
  collectedCountsBySystem?: Map<string, number>;
  /** Set of currently visible system types (for toggle) */
  visibleSystems?: Set<string>;
  /** Called when user toggles a system's visibility */
  onToggleSystem?: (system: string) => void;
  /** Whether stations are currently visible on the map */
  showStations?: boolean;
  /** Toggle handler for global station visibility */
  onToggleStations?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// System type display labels (exported for use in page.tsx)
// ─────────────────────────────────────────────────────────────────────────────
export const SYSTEM_LABELS: Record<string, string> = {
  TRA: '台灣鐵路 (TRA)',
  HSR: '高速鐵路 (HSR)',
  TRTC: '台北捷運 (TRTC)',
  TYMC: '桃園捷運 (TYMC)',
  KRTC: '高雄捷運 (KRTC)',
  TMRT: '台中捷運 (TMRT)',
  NTMC: '新北捷運 (NTMC)',
  KLRT: '高雄輕軌 (KLRT)',
};

// ─────────────────────────────────────────────────────────────────────────────
// StationLiveBoard — 即時電子看板（僅 TRA 車站）
// ─────────────────────────────────────────────────────────────────────────────
function StationLiveBoard({ stationId }: { stationId: string }) {
  const [items, setItems] = useState<LiveBoardItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems(null);
    fetchStationLiveBoard(stationId).then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [stationId]);

  const northbound = items?.filter((t) => t.Direction === 0) ?? [];
  const southbound = items?.filter((t) => t.Direction === 1) ?? [];

  return (
    <div className={styles.liveBoardSection}>
      <h3 className={styles.liveBoardTitle}>🚃 即時看板（前後 30 分鐘）</h3>
      {loading && <p className={styles.liveBoardLoading}>載入中…</p>}
      {!loading && items && items.length === 0 && (
        <p className={styles.liveBoardEmpty}>目前無班次資料</p>
      )}
      {!loading && items && items.length > 0 && (
        <div className={styles.liveBoardColumns}>
          {/* Northbound */}
          <div className={styles.liveBoardGroup}>
            <div className={styles.liveBoardGroupTitle}>⬆ 北上</div>
            {northbound.length === 0 ? (
              <p className={styles.liveBoardEmpty}>無班次</p>
            ) : (
              northbound.map((t) => <LiveBoardRow key={t.TrainNo} item={t} />)
            )}
          </div>
          {/* Southbound */}
          <div className={styles.liveBoardGroup}>
            <div className={styles.liveBoardGroupTitle}>⬇ 南下</div>
            {southbound.length === 0 ? (
              <p className={styles.liveBoardEmpty}>無班次</p>
            ) : (
              southbound.map((t) => <LiveBoardRow key={t.TrainNo} item={t} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveBoardRow({ item }: { item: LiveBoardItem }) {
  const time = item.ScheduledDepartureTime || item.ScheduledArrivalTime || '-';
  const dest = item.DestinationStationName?.Zh_tw ?? '-';
  const type = item.TrainTypeName?.Zh_tw ?? '';
  const delayed = item.DelayTime > 0;

  return (
    <div className={styles.liveBoardRow}>
      <span className={styles.liveBoardTrainNo}>{item.TrainNo}</span>
      <span className={styles.liveBoardType}>{type}</span>
      <span className={styles.liveBoardTime}>{time}</span>
      <span className={styles.liveBoardDest}>→{dest}</span>
      <span className={`${styles.liveBoardDelay} ${delayed ? styles.liveBoardDelayed : ''}`}>
        {delayed ? `⚠${item.DelayTime}分` : '準點'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function StationDetail({ station, collectedBadges }: { station: StationProperties; collectedBadges?: Map<string, { unlocked_at: string; badge_image_url: string | null }> }) {
  const badge = collectedBadges?.get(station.station_id);

  return (
    <div className={styles.content}>
      <h2 className={styles.title}>{station.station_name}</h2>

      {/* Badge section */}
      <div className={styles.badgeSection}>
        {badge ? (
          <div className={styles.badgeCollected}>
            {badge.badge_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={badge.badge_image_url.startsWith('data:') || badge.badge_image_url.startsWith('http') ? badge.badge_image_url : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badge.badge_image_url)}`}
                alt={`${station.station_name} 車站紀念章`}
                className={styles.badgeImage}
              />
            )}
            <span className={styles.badgeDate}>
              ✅ 已到訪 · {new Date(badge.unlocked_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span className={styles.badgeTime}>
              🕐 {new Date(badge.unlocked_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ) : (
          <div className={styles.badgeNotVisited}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.badgePlaceholder}>
              <circle cx="32" cy="32" r="28" stroke="#666" strokeWidth="2" strokeDasharray="4 4" fill="none" />
              <text x="32" y="36" textAnchor="middle" fill="#666" fontSize="12" fontFamily="sans-serif">尚未到訪</text>
            </svg>
          </div>
        )}
      </div>

      <dl className={styles.metaList}>
        <dt>系統</dt>
        <dd>{SYSTEM_LABELS[station.system_type] ?? station.system_type}</dd>

        {station.line_id && (
          <>
            <dt>路線代碼</dt>
            <dd>{station.line_id}</dd>
          </>
        )}

        <dt>車站代碼</dt>
        <dd>{station.station_id}</dd>

        {station.established_year && (
          <>
            <dt>啟用年份</dt>
            <dd>{station.established_year}</dd>
          </>
        )}
      </dl>

      {station.history_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={station.history_image_url}
          alt={`${station.station_name} 歷史照片`}
          className={styles.historyImage}
        />
      )}

      {station.history_desc && (
        <p className={styles.historyDesc}>{station.history_desc}</p>
      )}

      {station.system_type === 'TRA' && (
        <StationLiveBoard stationId={station.station_id} />
      )}
    </div>
  );
}

function LineDetail({ line }: { line: LineProperties }) {
  return (
    <div className={styles.content}>
      <h2 className={styles.title}>
        <span
          className={styles.lineColorDot}
          style={{ backgroundColor: line.color_hex }}
          aria-hidden="true"
        />
        {line.line_name}
      </h2>
      <dl className={styles.metaList}>
        <dt>系統</dt>
        <dd>{SYSTEM_LABELS[line.system_type] ?? line.system_type}</dd>

        {line.line_id && (
          <>
            <dt>路線代碼</dt>
            <dd>{line.line_id}</dd>
          </>
        )}
      </dl>

      {line.history_desc && (
        <p className={styles.historyDesc}>{line.history_desc}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FeatureDetails — main export
// Renders detail content; layout (bottom-sheet vs sidebar) is handled by the
// parent page component.
// ─────────────────────────────────────────────────────────────────────────────
export default function FeatureDetails({ feature, onClose, collectedBadges, stationCountsBySystem, collectedCountsBySystem, visibleSystems, onToggleSystem, showStations, onToggleStations }: FeatureDetailsProps) {
  if (!feature) {
    return (
      <div className={styles.empty}>
        <div className={styles.stationToggleRow}>
          <div className={styles.stationToggleLabel}>車站顯示</div>
          {onToggleStations && (
            <button
              className={`${styles.toggleSwitch} ${showStations ? styles.toggleOn : styles.toggleOff}`}
              onClick={onToggleStations}
              aria-label={showStations ? '隱藏車站' : '顯示車站'}
              aria-pressed={!!showStations}
              type="button"
            >
              <span className={styles.toggleKnob} />
            </button>
          )}
        </div>

        {stationCountsBySystem && stationCountsBySystem.size > 0 && (
          <div className={styles.progressSection}>
            <h3 className={styles.progressTitle}>🏅 車站紀念章收集進度</h3>
            {Object.entries(SYSTEM_LABELS).map(([key, label]) => {
              const total = stationCountsBySystem?.get(key) ?? 0;
              const collected = collectedCountsBySystem?.get(key) ?? 0;
              if (total === 0) return null;
              const pct = Math.round((collected / total) * 100);
              const isVisible = !visibleSystems || visibleSystems.has(key);
              return (
                <div key={key} className={styles.progressItem}>
                  <div className={styles.progressHeader}>
                    <div className={styles.progressLabel}>{label}</div>
                    {onToggleSystem && (
                      <button
                        className={`${styles.toggleSwitch} ${isVisible ? styles.toggleOn : styles.toggleOff}`}
                        onClick={() => onToggleSystem(key)}
                        aria-label={`${isVisible ? '隱藏' : '顯示'} ${label}`}
                        aria-pressed={isVisible}
                        type="button"
                      >
                        <span className={styles.toggleKnob} />
                      </button>
                    )}
                  </div>
                  <div className={styles.progressBarOuter}>
                    <div
                      className={styles.progressBarInner}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={styles.progressCount}>
                    {collected}/{total}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {feature.feature_type === 'station' ? (
        <StationDetail station={feature as StationProperties} collectedBadges={collectedBadges} />
      ) : (
        <LineDetail line={feature as LineProperties} />
      )}
    </div>
  );
}
