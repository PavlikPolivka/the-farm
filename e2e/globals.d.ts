import type { FarmState } from '@pixel-farm/shared';

declare global {
  interface Window {
    __pf?: {
      store: { state: FarmState; flush(): Promise<void> };
      scene(): { screenPos(target: string): { x: number; y: number } | null } | null;
    };
  }
}
