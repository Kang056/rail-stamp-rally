'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import BottomSheet from './BottomSheet';
import styles from './AuthButton.module.css';

export type { User };

interface AuthButtonProps {
  onAuthChange?: (user: User | null) => void;
  /** Whether mock login is active */
  mockLogin?: boolean;
  /** Toggle mock login on/off */
  onMockLoginToggle?: () => void;
  /** Open the badge collection / progress drawer */
  onOpenBadgeCollection?: () => void;
  /** Whether the user is considered logged in (real or mock) */
  isLoggedIn?: boolean;
}

export default function AuthButton({
  onAuthChange,
  mockLogin = false,
  onMockLoginToggle,
  onOpenBadgeCollection,
  isLoggedIn = false,
}: AuthButtonProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const onAuthChangeRef = useRef(onAuthChange);
  onAuthChangeRef.current = onAuthChange;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      onAuthChangeRef.current?.(data.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      onAuthChangeRef.current?.(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const basePath = path.startsWith('/rail-stamp-rally') ? '/rail-stamp-rally' : '';
    const redirectTo = origin + basePath;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  };

  const handleSignOut = async () => {
    setDrawerOpen(false);
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) return null;

  const showLoggedIn = !!user || isLoggedIn;

  /* ── Icon button (shared for both logged-in and logged-out) ── */
  const iconButton = (
    <button
      className={`${styles.avatarBtn} ${showLoggedIn ? styles.avatarBtnActive : ''}`}
      onClick={() => {
        if (user || isLoggedIn) {
          setDrawerOpen(true);
        } else {
          handleSignIn();
        }
      }}
      aria-label={showLoggedIn ? '使用者選單' : '使用google登入'}
    >
      <span className={styles.tooltip}>帳號</span>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </button>
  );

  return (
    <>
      {iconButton}

      <BottomSheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="帳號"
      >
        <div className={styles.accountContent}>
          {/* Avatar */}
          {user?.user_metadata?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.user_metadata.avatar_url}
              alt={user.user_metadata?.full_name ?? '使用者頭像'}
              className={styles.accountAvatar}
            />
          ) : (
            <div className={styles.accountAvatarPlaceholder}>
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}

          {/* Name */}
          <span className={styles.accountName}>
            {user?.user_metadata?.full_name ?? user?.email ?? (mockLogin ? '模擬使用者' : '使用者')}
          </span>

          {/* Badge collection button */}
          {showLoggedIn && onOpenBadgeCollection && (
            <button
              className={styles.accountActionBtn}
              onClick={() => {
                setDrawerOpen(false);
                onOpenBadgeCollection();
              }}
            >
              紀念章收集冊
            </button>
          )}

          {/* Mock login button */}
          {onMockLoginToggle && (
            <button
              className={`${styles.accountActionBtn} ${mockLogin ? styles.accountActionBtnActive : ''}`}
              onClick={onMockLoginToggle}
            >
              {mockLogin ? '關閉模擬登入' : '模擬登入'}
            </button>
          )}

          {/* Logout */}
          {user && (
            <button onClick={handleSignOut} className={styles.logoutBtn}>
              登出
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
