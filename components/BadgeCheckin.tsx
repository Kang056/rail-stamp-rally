'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

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
      // Geolocation permission denied has code 1 in many browsers
      if (e && e.code === 1) {
        setError('請允許定位權限以完成打卡');
      } else {
        setError(e?.message ?? String(e));
      }
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }} aria-live="polite">
      <button
        onClick={handleCheckin}
        disabled={loading}
        aria-label="打卡 / 到訪"
        style={{
          background: '#0b7285',
          color: '#fff',
          border: 'none',
          padding: '0.6rem 0.9rem',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: '1rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? '打卡中…' : '打卡 / 到訪'}
      </button>

      {message && (
        <div style={{ marginTop: 8, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap:8 }}>
          <span>{message}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {badgeImage && <img src={badgeImage} alt="badge" style={{ width: 40, height:40, borderRadius:4, objectFit:'cover' }} />}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, background: '#ffe6e6', color:'#800', padding: '6px 10px', borderRadius: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}

