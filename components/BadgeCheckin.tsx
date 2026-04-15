'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  onSuccess?: () => void;
};

export default function BadgeCheckin({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badgeImage, setBadgeImage] = useState<string | null>(null);

  const handleCheckin = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!navigator.geolocation) {
        setError('您的瀏覽器不支援地理定位');
        return;
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject),
      );
      const { latitude, longitude } = pos.coords;

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        setError('無法取得使用者資訊，請重新登入');
        return;
      }
      const user = (data as any)?.user;
      if (!user) {
        setError('請先登入才能打卡');
        return;
      }

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
      setBadgeImage(result?.badge_image_url ?? null);
      setMessage('打卡成功！');
      if (typeof onSuccess === 'function') onSuccess();
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

