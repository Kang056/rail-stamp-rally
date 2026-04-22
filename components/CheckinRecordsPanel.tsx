'use client';

import type { Translations } from '@/lib/i18n/locales/zh-TW';
import styles from './CheckinRecordsPanel.module.css';

interface CheckinRecordsPanelProps {
  checkinCount: number;
  t: Translations;
  onBack?: () => void;
}

export default function CheckinRecordsPanel({ checkinCount, t, onBack }: CheckinRecordsPanelProps) {
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

      {checkinCount === 0 && (
        <p className={styles.emptyState}>{'尚無打卡紀錄'}</p>
      )}
    </div>
  );
}
