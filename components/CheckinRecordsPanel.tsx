'use client';

import type { Translations } from '@/lib/i18n/locales/zh-TW';
import styles from './CheckinRecordsPanel.module.css';

interface CheckinRecordsPanelProps {
  checkinCount: number;
  t: Translations;
}

export default function CheckinRecordsPanel({ checkinCount, t }: CheckinRecordsPanelProps) {
  return (
    <div className={styles.container}>
      <p className={styles.totalCount}>{t.progress.checkinCount(checkinCount)}</p>
    </div>
  );
}
