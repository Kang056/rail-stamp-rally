'use client';

/**
 * LevelUpAnimation — fireworks + star sparkle overlay shown when the user levels up.
 * Renders for ~4 seconds then calls onDone.
 */

import { useEffect } from 'react';
import styles from './LevelUpAnimation.module.css';

interface LevelUpAnimationProps {
  /** New level number to display */
  level: number;
  /** Whether the animation is visible */
  show: boolean;
  /** Called when the animation has finished */
  onDone: () => void;
}

// ── Deterministic-ish positions for explosions ──────────────────────────────
const EXPLOSION_CONFIGS = [
  { x: '20%', y: '25%', delay: 0,    dur: 1.1, color: '#ff4e50' },
  { x: '75%', y: '20%', delay: 0.3,  dur: 1.2, color: '#fc913a' },
  { x: '15%', y: '65%', delay: 0.6,  dur: 1.0, color: '#f9ca24' },
  { x: '80%', y: '60%', delay: 0.9,  dur: 1.3, color: '#6ab04c' },
  { x: '50%', y: '15%', delay: 1.2,  dur: 1.1, color: '#22a6b3' },
  { x: '30%', y: '78%', delay: 1.5,  dur: 1.2, color: '#be2edd' },
  { x: '68%', y: '75%', delay: 1.8,  dur: 1.0, color: '#e056fd' },
  { x: '45%', y: '70%', delay: 2.1,  dur: 1.2, color: '#ff7979' },
];

// 8 directions for each particle in an explosion (angles in degrees)
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const RADIUS = 70;

// Star sparkle positions
const STAR_CONFIGS = [
  { x: '10%', y: '40%', delay: 0.2, dur: 1.4, size: 18 },
  { x: '88%', y: '35%', delay: 0.5, dur: 1.2, size: 14 },
  { x: '55%', y: '85%', delay: 0.8, dur: 1.5, size: 20 },
  { x: '25%', y: '50%', delay: 1.1, dur: 1.3, size: 16 },
  { x: '70%', y: '45%', delay: 1.4, dur: 1.2, size: 22 },
  { x: '40%', y: '20%', delay: 1.7, dur: 1.4, size: 18 },
  { x: '82%', y: '78%', delay: 2.0, dur: 1.1, size: 16 },
  { x: '12%', y: '80%', delay: 2.3, dur: 1.3, size: 14 },
  { x: '60%', y: '55%', delay: 2.6, dur: 1.4, size: 20 },
  { x: '35%', y: '30%', delay: 0.4, dur: 1.2, size: 12 },
  { x: '90%', y: '55%', delay: 0.7, dur: 1.5, size: 16 },
  { x: '5%',  y: '60%', delay: 1.0, dur: 1.3, size: 14 },
];

const ANIMATION_DURATION_MS = 4200;

export default function LevelUpAnimation({ level, show, onDone }: LevelUpAnimationProps) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(onDone, ANIMATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div className={styles.overlay} aria-hidden="true">
      {/* Explosions */}
      {EXPLOSION_CONFIGS.map((cfg, ei) => (
        <div
          key={ei}
          className={styles.explosion}
          style={{ left: cfg.x, top: cfg.y }}
        >
          {ANGLES.map((angle, pi) => {
            const rad = (angle * Math.PI) / 180;
            const tx = Math.round(Math.cos(rad) * RADIUS);
            const ty = Math.round(Math.sin(rad) * RADIUS);
            return (
              <span
                key={pi}
                className={styles.firework}
                style={{
                  background: cfg.color,
                  '--tx': `translate(${tx}px, ${ty}px)`,
                  '--fly-dur': `${cfg.dur}s`,
                  '--fly-delay': `${cfg.delay}s`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      ))}

      {/* Star sparkles */}
      {STAR_CONFIGS.map((sc, i) => (
        <svg
          key={i}
          className={styles.star}
          width={sc.size}
          height={sc.size}
          viewBox="0 0 24 24"
          fill="gold"
          style={{
            left: sc.x,
            top: sc.y,
            '--delay': `${sc.delay}s`,
            '--duration': `${sc.dur}s`,
          } as React.CSSProperties}
        >
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}

      {/* Level-up banner */}
      <div className={styles.banner}>
        <div className={styles.bannerTitle}>LEVEL UP!</div>
        <div className={styles.bannerSub}>🎉 Lv. {level} 🎉</div>
      </div>
    </div>
  );
}
