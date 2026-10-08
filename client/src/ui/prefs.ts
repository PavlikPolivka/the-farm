const MOTION_KEY = 'pf:reduced-motion';

let reduced: boolean | null = null;

/** In-game toggle wins; otherwise follow the OS setting. */
export function prefersReducedMotion(): boolean {
  if (reduced === null) {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MOTION_KEY);
    } catch {
      // ignore
    }
    reduced = stored !== null ? stored === '1' : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return reduced;
}

export function setReducedMotion(on: boolean): void {
  reduced = on;
  document.documentElement.classList.toggle('reduced-motion', on);
  try {
    localStorage.setItem(MOTION_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

/** Android only: iOS has no web vibration API, so nothing may depend on this. */
export function buzz(ms = 10): void {
  // WebKit can expose `vibrate` as undefined, so check for a function, and never let it throw.
  if (prefersReducedMotion() || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(ms);
  } catch {
    // ignore
  }
}
