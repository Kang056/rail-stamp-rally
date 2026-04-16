'use client';

import { useState, useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import styles from './AuthButton.module.css';

export type { User };

interface AuthButtonProps {
  onAuthChange?: (user: User | null) => void;
}

export default function AuthButton({ onAuthChange }: AuthButtonProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const onAuthChangeRef = useRef(onAuthChange);
  onAuthChangeRef.current = onAuthChange;

  useEffect(() => {
    // Read initial session
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      onAuthChangeRef.current?.(data.user ?? null);
      setLoading(false);
    });

    // Subscribe to auth state changes (handles OAuth redirect callback automatically)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      onAuthChangeRef.current?.(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    // Build redirect URL that works for both local dev and GitHub Pages
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

  /* ── Logged-in state: icon button + account drawer ── */
  if (user) {
    return (
      <>
        <button
          className={styles.avatarBtn}
          onClick={() => setDrawerOpen(true)}
          aria-label="使用者選單"
        >
          <span className={styles.tooltip}>帳號</span>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>

        <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <Drawer.Portal>
            <Drawer.Overlay className={styles.drawerOverlay} />
            <Drawer.Content className={styles.drawerContent}>
              <Drawer.Title className={styles.visuallyHidden}>帳號</Drawer.Title>
              <div className={styles.sheetHandle} aria-hidden="true" />
              <div className={styles.drawerInner}>
                <div className={styles.accountContent}>
                  {user.user_metadata?.avatar_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={user.user_metadata?.full_name ?? '使用者頭像'}
                      className={styles.accountAvatar}
                    />
                  )}
                  <span className={styles.accountName}>
                    {user.user_metadata?.full_name ?? user.email ?? '使用者'}
                  </span>
                  <button onClick={handleSignOut} className={styles.logoutBtn}>
                    登出
                  </button>
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </>
    );
  }

  /* ── Logged-out state: sign-in icon button ── */
  return (
    <button onClick={handleSignIn} className={styles.signInBtn} aria-label="使用google登入">
      <span className={styles.tooltip}>帳號</span>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </button>
  );
}
