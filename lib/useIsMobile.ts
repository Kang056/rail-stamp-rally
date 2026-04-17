import { useState, useEffect } from 'react';

/**
 * Returns true when the viewport is narrower than `breakpoint` px (mobile).
 * Starts as `true` (mobile-first) until the browser confirms otherwise.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(true);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isMobile;
}
