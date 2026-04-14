'use client';

import type { RailwayFeatureProperties, StationProperties, LineProperties } from '@/lib/supabaseClient';
import styles from './FeatureDetails.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface FeatureDetailsProps {
  /** The clicked feature's properties, or null when nothing is selected */
  feature: RailwayFeatureProperties | null;
  /** Called when the user dismisses the details panel */
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// System type display labels
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_LABELS: Record<string, string> = {
  TRA: '台灣鐵路 (TRA)',
  HSR: '高速鐵路 (HSR)',
  TRTC: '台北捷運 (TRTC)',
  TYMC: '桃園捷運 (TYMC)',
  KRTC: '高雄捷運 (KRTC)',
  TMRT: '台中捷運 (TMRT)',
  NTMC: '新北捷運 (NTMC)',
  KLRT: '基隆輕軌 (KLRT)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function StationDetail({ station }: { station: StationProperties }) {
  return (
    <div className={styles.content}>
      <h2 className={styles.title}>{station.station_name}</h2>
      <dl className={styles.metaList}>
        <dt>系統</dt>
        <dd>{SYSTEM_LABELS[station.system_type] ?? station.system_type}</dd>

        <dt>路線代碼</dt>
        <dd>{station.line_id}</dd>

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

        <dt>路線代碼</dt>
        <dd>{line.line_id}</dd>
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
export default function FeatureDetails({ feature, onClose }: FeatureDetailsProps) {
  if (!feature) {
    return (
      <div className={styles.empty}>
        <p>點擊地圖上的車站或路線以查看詳情。</p>
        <p className={styles.emptyHint}>(Click a station or line on the map)</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <button
        className={styles.closeButton}
        onClick={onClose}
        aria-label="Close details panel"
      >
        ✕
      </button>

      {feature.feature_type === 'station' ? (
        <StationDetail station={feature as StationProperties} />
      ) : (
        <LineDetail line={feature as LineProperties} />
      )}
    </div>
  );
}
