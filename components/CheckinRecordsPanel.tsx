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
      <p className={styles.totalCount}>{t.progress.checkinCount(checkinCount)}</p>
    </div>
  );
}
