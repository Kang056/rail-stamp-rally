'use client';

/**
 * BottomSheet.tsx — Shared bottom sheet dialog component
 *
 * Based on vaul Drawer. Defaults to half-screen height, swipeable
 * to full-screen or fully closed/dismissed.
 */

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
}

const SNAP_POINTS = [0.5, 1] as const;

export default function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  modal = false,
}: BottomSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={modal}
      snapPoints={[...SNAP_POINTS]}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content className={styles.content}>
          <Drawer.Title className={styles.visuallyHidden}>
            {title}
          </Drawer.Title>
          <div className={styles.header}>
            <div className={styles.handle} aria-hidden="true" />
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
