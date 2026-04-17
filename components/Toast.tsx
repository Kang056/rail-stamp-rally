'use client';

/**
 * Toast.tsx — Shared toast notification component
 *
 * Renders a stack of auto-dismissing toast messages.
 * 'loading' type toasts must be manually dismissed via onDismiss.
 */

import { useEffect } from 'react';
import styles from './Toast.module.css';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'loading';
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} aria-live="polite">
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.type === 'loading') return;
    const timer = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onDismiss]);

  const icons: Record<string, string> = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    loading: '⏳',
  };

  return (
    <div className={`${styles.toast} ${styles[toast.type]}`} role="status">
      <span className={styles.icon}>{icons[toast.type]}</span>
      <span className={styles.message}>{toast.message}</span>
      {toast.type === 'loading' && <span className={styles.spinner} />}
    </div>
  );
}
