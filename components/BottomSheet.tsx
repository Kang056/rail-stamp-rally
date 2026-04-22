'use client';

/**
 * BottomSheet.tsx — Shared bottom sheet dialog component
 *
 * Based on vaul Drawer. Defaults to half-screen height, swipeable
 * to full-screen or fully closed/dismissed.
 */

import { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Called when open state changes (close via swipe or overlay tap) */
  onOpenChange: (open: boolean) => void;
  /** Accessible title (visually hidden by default) */
  title: string;
  /** Content rendered inside the scrollable area */
  children: React.ReactNode;
  /** Whether to block interaction with content behind the sheet */
  modal?: boolean;
  defaultSnap?: number;
}

const SNAP_POINTS = [0.5, 1] as const;
const DEFAULT_SNAP = SNAP_POINTS[0]; // 50% of viewport

export default function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  modal = false,
  defaultSnap,
}: BottomSheetProps) {
  // Initialize with the configured default snap so the sheet opens at the intended height immediately
  const [activeSnap, setActiveSnap] = useState<number | string | null>(defaultSnap ?? DEFAULT_SNAP);

  // Reset to the configured default snap point every time the sheet re-opens
  useEffect(() => {
    if (open) {
      setActiveSnap(defaultSnap ?? DEFAULT_SNAP);
    }
  }, [open, defaultSnap]);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={modal}
      snapPoints={[...SNAP_POINTS]}
      activeSnapPoint={activeSnap}
      setActiveSnapPoint={setActiveSnap}
      fadeFromIndex={1}
      disablePreventScroll={false}
    >
      <Drawer.Portal>
        {modal && <Drawer.Overlay className={styles.overlay} />}
        <Drawer.Content className={styles.content}>
          <Drawer.Title className={styles.visuallyHidden}>
            {title}
          </Drawer.Title>
          <div className={styles.header}>
            <Drawer.Handle className={styles.handle} aria-hidden="true" />
            <Drawer.Close asChild>
              <button className={styles.closeBtn} aria-label="關閉">✕</button>
            </Drawer.Close>
          </div>
          <div className={styles.inner}>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
