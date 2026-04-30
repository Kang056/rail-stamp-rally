'use client';

import type { Translations } from '@/lib/i18n/locales/zh-TW';
import type { CheckinLogRecord } from '@/lib/supabaseClient';
import styles from './CheckinRecordsPanel.module.css';

interface CheckinRecordsPanelProps {
  checkinRecords: CheckinLogRecord[];
  t: Translations;
  onBack?: () => void;
}

export default function CheckinRecordsPanel({ checkinRecords, t, onBack }: CheckinRecordsPanelProps) {
  const checkinCount = checkinRecords.length;

  return (
    <div className={styles.container}>
      {onBack && (
        <button className={styles.backBtn} onClick={onBack} type="button">
          ← {t.common.back}
        </button>
      )}
      <p className={styles.panelTitle}>{t.account.checkinRecords}</p>

      <div className={styles.statsCard}>
        <span className={styles.statsIcon}>🏁</span>
        <div className={styles.statsInfo}>
          <span className={styles.statsCount}>{checkinCount}</span>
          <span className={styles.statsLabel}>{t.progress.checkinCount(checkinCount)}</span>
        </div>
      </div>

      {checkinCount === 0 ? (
        <p className={styles.emptyState}>{'尚無打卡紀錄'}</p>
      ) : (
        <ul className={styles.recordsList}>
          {checkinRecords.map((record, idx) => (
            <li key={`${record.created_at}-${idx}`} className={styles.recordItem}>
              <span className={styles.recordTime}>
                {new Date(record.created_at).toLocaleString('zh-TW', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className={styles.recordStation}>{record.station_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
