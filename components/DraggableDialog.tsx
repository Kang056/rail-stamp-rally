'use client';

/**
 * DraggableDialog — a floating, draggable dialog with expand/collapse.
 *
 * Drag the entire dialog to move it. Click the collapse button (⌄/⌃) to
 * toggle between expanded and collapsed (header-only) states.
 * The whole surface is a drag handle — click-without-drag does nothing extra.
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import styles from './DraggableDialog.module.css';

interface DraggableDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Dialog title shown in the header */
  title: string;
  /** Content to render when expanded */
  children: ReactNode;
  /** Called when the close button is clicked */
  onClose: () => void;
  /** Initial position (px from top-left of viewport) */
  initialX?: number;
  initialY?: number;
}

export default function DraggableDialog({
  isOpen,
  title,
  children,
  onClose,
  initialX = 80,
  initialY = 80,
}: DraggableDialogProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [collapsed, setCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Reset position when dialog opens so it appears at its initial position
  const prevOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      setPos({ x: initialX, y: initialY });
      setCollapsed(false);
    }
    prevOpen.current = isOpen;
  }, [isOpen, initialX, initialY]);

  // Drag state refs (avoid re-renders during drag)
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore clicks on buttons inside the header
    if ((e.target as HTMLElement).closest('button')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    setIsDragging(false);
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;

    if (!dragState.current.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      dragState.current.moved = true;
      setIsDragging(true);
    }

    if (dragState.current.moved) {
      const newX = dragState.current.origX + dx;
      const newY = dragState.current.origY + dy;
      // Clamp to viewport
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 40;
      setPos({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
    setIsDragging(false);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className={`${styles.dialog} ${collapsed ? styles.dialogCollapsed : ''} ${isDragging ? styles.dragging : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Header */}
      <div className={styles.header}>
        {/* Drag-handle icon */}
        <div className={styles.dragDots} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <span className={styles.title}>{title}</span>

        {/* Collapse / expand */}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? '展開' : '收合'}
          type="button"
        >
          {collapsed ? '⌃' : '⌄'}
        </button>

        {/* Close */}
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="關閉"
          type="button"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
