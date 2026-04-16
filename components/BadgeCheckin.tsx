'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import styles from './BadgeCheckin.module.css';

type Props = {
  user: User | null;
  onSuccess?: (result: { station_id: string; station_name: string; badge_image_url: string | null }) => void;
};

export default function BadgeCheckin({ user, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badgeImage, setBadgeImage] = useState<string | null>(null);

  if (!user) return null;

  const handleCheckin = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!navigator.geolocation) {
        setError('您的瀏覽器不支援地理定位');
        return;
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject),
      );
      const { latitude, longitude } = pos.coords;

      const { data: rpcData, error: rpcErr } = await supabase.rpc('checkin', {
        user_lon: longitude,
        user_lat: latitude,
        user_id: user.id,
      });

      if (rpcErr) {
        setError(rpcErr.message ?? '打卡失敗');
        return;
      }

      const result = rpcData as any;

      if (!result.ok) {
        setError('打卡失敗！未在車站範圍內');
        return;
      }

      if (result.already_unlocked) {
        const d = new Date(result.unlocked_at);
        setError(`${result.station_name}車站已在${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日打卡完成`);
        return;
      }

      // New badge!
      setBadgeImage(result.badge_image_url ?? null);
      setMessage(`打卡成功，歡迎到訪${result.station_name}車站`);
      if (typeof onSuccess === 'function') {
        onSuccess({
          station_id: result.station_id,
          station_name: result.station_name,
          badge_image_url: result.badge_image_url,
        });
      }
    } catch (e: any) {
      if (e && e.code === 1) {
        setError('請允許定位權限以完成打卡');
      } else {
        setError(e?.message ?? String(e));
      }
    } finally {
      setLoading(false);
      setTimeout(() => {
        setMessage(null);
        setBadgeImage(null);
        setError(null);
      }, 4000);
    }
  };

  return (
    <div className={styles.wrapper} aria-live="polite">
      {/* Feedback area (above button) */}
      {(message || error) && (
        <div className={styles.feedbackArea}>
          {message && (
            <div className={styles.success}>
              <span>{message}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {badgeImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={badgeImage} alt="badge" className={styles.successBadge} />
              )}
            </div>
          )}
          {error && (
            <div className={styles.error}>{error}</div>
          )}
        </div>
      )}

      {/* Icon button */}
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
          /* Location pin + stamp checkmark icon */
          <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
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
        <span className={styles.tooltip}>打卡</span>
      </button>
    </div>
  );
}

