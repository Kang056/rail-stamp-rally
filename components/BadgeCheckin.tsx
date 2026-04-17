'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import styles from './BadgeCheckin.module.css';

type Props = {
  user: User | null;
  onSuccess?: (result: { station_id: string; station_name: string; badge_image_url: string | null }) => void;
  onToast?: (message: string, type: 'success' | 'error' | 'info' | 'loading') => string;
};

export default function BadgeCheckin({ user, onSuccess, onToast }: Props) {
  const [loading, setLoading] = useState(false);

  if (!user) {
    return null;
  }

  const handleCheckin = async () => {
    setLoading(true);
    try {
      if (!navigator.geolocation) {
        onToast?.('您的瀏覽器不支援地理定位', 'error');
        return;
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject),
      );
      const { latitude, longitude } = pos.coords;

      const { data: rpcData, error: rpcErr } = await supabase.rpc('checkin', {
        user_lon: longitude,
        user_lat: latitude,
        p_user_id: user.id,
      });

      if (rpcErr) {
        onToast?.(rpcErr.message ?? '打卡失敗', 'error');
        return;
      }

      const result = rpcData as any;

      if (!result.ok) {
        onToast?.('打卡失敗！未在車站範圍內', 'error');
        return;
      }

      if (result.already_unlocked) {
        const d = new Date(result.unlocked_at);
        onToast?.(`${result.station_name}車站已在${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日打卡完成`, 'info');
        return;
      }

      if (typeof onSuccess === 'function') {
        onSuccess({
          station_id: result.station_id,
          station_name: result.station_name,
          badge_image_url: result.badge_image_url,
        });
      }
    } catch (e: any) {
      if (e && e.code === 1) {
        onToast?.('請允許定位權限以完成打卡', 'error');
      } else {
        onToast?.(e?.message ?? String(e), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckin}
      disabled={loading}
      aria-label="打卡"
      className={styles.checkinBtn}
      type="button"
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 2c2.76 0 5 2.24 5 5 0 3.53-4.03 8.43-5 9.58C11.03 17.43 7 12.53 7 9c0-2.76 2.24-5 5-5z"/>
          <polyline
            points="9.5,9.3 11.2,11 14.5,7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span className={styles.label}>打卡</span>
    </button>
  );
}

