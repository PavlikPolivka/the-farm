import type { FarmState } from '@pixel-farm/shared';

declare global {
  interface Window {
    __pf?: {
      store: { state: FarmState; flush(): Promise<void> };
      sync: { me: { id: number; displayName: string } | null; status: string; upload(): void; idle(): Promise<void> };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each game's state differs; tests poke at it
      game(): { session: { state: any; log: unknown[] }; finish(): void; at(): number } | null;
      scene(): { screenPos(target: string): { x: number; y: number } | null } | null;
    };
  }
}
