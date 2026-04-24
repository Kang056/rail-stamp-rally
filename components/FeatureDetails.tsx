'use client';

import { useState, useEffect } from 'react';
import type { RailwayFeatureProperties, StationProperties, LineProperties } from '@/lib/supabaseClient';
import { fetchStationLiveBoard } from '@/lib/tdxApi';
import type { LiveBoardItem } from '@/lib/tdxApi';
import { useTranslation } from '@/lib/i18n';
import { SYSTEM_LABELS } from '@/lib/railwayConstants';
import styles from './FeatureDetails.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface FeatureDetailsProps {
  /** The clicked feature's properties, or null when nothing is selected */
  feature: RailwayFeatureProperties | null;
  /** Called when the user dismisses the details panel */
  onClose: () => void;
  /** Called when the back button is pressed (returns to account dialog) */
  onBack?: () => void;
  /** Collected badges keyed by station_id */
  collectedBadges?: Map<string, { unlocked_at: string; badge_image_url: string | null }>;
  /** Total station counts per system type */
  stationCountsBySystem?: Map<string, number>;
  /** Collected station counts per system type */
  collectedCountsBySystem?: Map<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// System type display labels (re-exported from shared constants for backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export { SYSTEM_LABELS };

// ─────────────────────────────────────────────────────────────────────────────
// StationLiveBoard — 即時電子看板（僅 TRA 車站）
// ─────────────────────────────────────────────────────────────────────────────
function StationLiveBoard({ stationId }: { stationId: string }) {
  const [items, setItems] = useState<LiveBoardItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

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

  const northbound = items?.filter((item) => item.Direction === 0) ?? [];
  const southbound = items?.filter((item) => item.Direction === 1) ?? [];

  return (
    <div className={styles.liveBoardSection}>
      <h3 className={styles.liveBoardTitle}>{t.liveBoard.title}</h3>
      {loading && <p className={styles.liveBoardLoading}>{t.liveBoard.loading}</p>}
      {!loading && items && items.length === 0 && (
        <p className={styles.liveBoardEmpty}>{t.liveBoard.noData}</p>
      )}
      {!loading && items && items.length > 0 && (
        <div className={styles.liveBoardColumns}>
          {/* Northbound */}
          <div className={styles.liveBoardGroup}>
            <div className={styles.liveBoardGroupTitle}>{t.liveBoard.northbound}</div>
            {northbound.length === 0 ? (
              <p className={styles.liveBoardEmpty}>{t.liveBoard.noTrain}</p>
            ) : (
              northbound.map((item) => <LiveBoardRow key={item.TrainNo} item={item} />)
            )}
          </div>
          {/* Southbound */}
          <div className={styles.liveBoardGroup}>
            <div className={styles.liveBoardGroupTitle}>{t.liveBoard.southbound}</div>
            {southbound.length === 0 ? (
              <p className={styles.liveBoardEmpty}>{t.liveBoard.noTrain}</p>
            ) : (
              southbound.map((item) => <LiveBoardRow key={item.TrainNo} item={item} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveBoardRow({ item }: { item: LiveBoardItem }) {
  const time = item.ScheduledDepartureTime || item.ScheduledArrivalTime || '-';
  const type = item.TrainTypeName?.Zh_tw ?? '';
  const delayed = item.DelayTime > 0;
  const { t } = useTranslation();

  return (
    <div className={styles.liveBoardCard}>
      <div className={styles.liveBoardCardHeader}>
        <span className={styles.liveBoardTrainNo}>{item.TrainNo}</span>
        {type && <span className={styles.liveBoardType}>{type}</span>}
        <span className={`${styles.liveBoardDelay} ${delayed ? styles.liveBoardDelayed : ''}`}>
          {delayed ? t.liveBoard.delayed(item.DelayTime) : t.liveBoard.onTime}
        </span>
      </div>
      <div className={styles.liveBoardCardBody}>
        <span className={styles.liveBoardTime}>{time}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function StationDetail({ station, collectedBadges }: { station: StationProperties; collectedBadges?: Map<string, { unlocked_at: string; badge_image_url: string | null }> }) {
  const badge = collectedBadges?.get(station.station_id);
  const { t } = useTranslation();

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
                alt={t.station.badgeAlt(station.station_name)}
                className={styles.badgeImage}
              />
            )}
            <span className={styles.badgeDate}>
              {t.station.visited + ' · '}{new Date(badge.unlocked_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span className={styles.badgeTime}>
              🕐 {new Date(badge.unlocked_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ) : (
          <div className={styles.badgeNotVisited}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.badgePlaceholder}>
              <circle cx="32" cy="32" r="28" stroke="#666" strokeWidth="2" strokeDasharray="4 4" fill="none" />
              <text x="32" y="36" textAnchor="middle" fill="#666" fontSize="12" fontFamily="sans-serif">{t.station.notVisited}</text>
            </svg>
          </div>
        )}
      </div>

      <dl className={styles.metaList}>
        <dt>{t.station.system}</dt>
        <dd>{SYSTEM_LABELS[station.system_type] ?? station.system_type}</dd>

        {station.line_id && (
          <>
            <dt>{t.station.lineCode}</dt>
            <dd>{station.line_id}</dd>
          </>
        )}

        <dt>{t.station.stationCode}</dt>
        <dd>{station.station_id}</dd>

        {station.established_year && (
          <>
            <dt>{t.station.establishedYear}</dt>
            <dd>{station.established_year}</dd>
          </>
        )}
      </dl>

      {station.history_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={station.history_image_url}
          alt={t.station.historyPhotoAlt(station.station_name)}
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
  const { t } = useTranslation();
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
        <dt>{t.station.system}</dt>
        <dd>{SYSTEM_LABELS[line.system_type] ?? line.system_type}</dd>

        {line.line_id && (
          <>
            <dt>{t.station.lineCode}</dt>
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
export default function FeatureDetails({ feature, onClose, onBack, collectedBadges, stationCountsBySystem, collectedCountsBySystem }: FeatureDetailsProps) {
  const { t } = useTranslation();
  if (!feature) {
    return (
      <div className={styles.empty}>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack} type="button">
            ← {t.common.back}
          </button>
        )}

        {stationCountsBySystem && stationCountsBySystem.size > 0 && (
          <div className={styles.progressSection}>
            <h3 className={styles.progressTitle}>{t.progress.title}</h3>
            {Object.entries(SYSTEM_LABELS).map(([key, label]) => {
              const total = stationCountsBySystem?.get(key) ?? 0;
              const collected = collectedCountsBySystem?.get(key) ?? 0;
              if (total === 0) return null;
              const pct = Math.round((collected / total) * 100);
              return (
                <div key={key} className={styles.progressItem}>
                  <div className={styles.progressHeader}>
                    <div className={styles.progressLabel}>{label}</div>
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
