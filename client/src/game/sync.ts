import {
  advance,
  startGame,
  type FarmState,
  type Me,
  type SaveAccepted,
  type SaveResponse,
} from '@pixel-farm/shared';
import { loadMeta, writeMeta, type SyncMeta } from './save.js';
import type { Store } from './store.js';

const EVERY_MS = 30_000;

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'offline';
export type SyncNotice = 'loaded' | 'clamped' | 'rejected';

/**
 * Keeps the local farm and the server copy together (docs/DESIGN.md, "Sync and validation").
 * Uploads every 30 s and when the app is hidden. If another device synced in between, or the
 * device changes hands, the server copy wins and replaces the local farm.
 */
export class Sync {
  me: Me | null = null;
  status: SyncStatus = 'off';
  lastSyncAt: number | null = null;
  private meta: SyncMeta = { userId: null, version: 0 };
  private busy: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(notice?: SyncNotice) => void>();

  constructor(private store: Store) {}

  async start(): Promise<void> {
    this.meta = await loadMeta();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.upload(true);
      else void this.refreshMe();
    });
    await this.refreshMe();
  }

  subscribe(fn: (notice?: SyncNotice) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Re-reads the logged-in player; starts or stops syncing to match. */
  async refreshMe(): Promise<Me | null> {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      this.me = res.ok ? ((await res.json()) as Me) : null;
    } catch {
      // Offline: keep whoever we had and try again later.
      this.setStatus('offline');
      return this.me;
    }
    if (this.me) {
      this.timer ??= setInterval(() => this.upload(), EVERY_MS);
      await this.run(() => this.reconcile());
    } else {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.setStatus('off');
    }
    return this.me;
  }

  /** Uploads now. `leaving`: the page is being hidden, so use a request that outlives it. */
  upload(leaving = false): void {
    if (this.me) void this.run(() => this.put(leaving));
  }

  /** Waits for any running sync; for tests. */
  async idle(): Promise<void> {
    while (this.busy) await this.busy;
  }

  private async run(job: () => Promise<void>): Promise<void> {
    if (this.busy) return this.busy;
    this.busy = job().finally(() => (this.busy = null));
    return this.busy;
  }

  /** First contact after login or app start: decide which farm is the real one. */
  private async reconcile(): Promise<void> {
    const me = this.me!;
    this.setStatus('syncing');
    let server: SaveResponse;
    try {
      const res = await fetch('/api/save', { cache: 'no-store' });
      if (!res.ok) return this.setStatus('offline');
      server = (await res.json()) as SaveResponse;
    } catch {
      return this.setStatus('offline');
    }
    const otherPlayer = this.meta.userId !== null && this.meta.userId !== me.id;
    if (otherPlayer || (server.version > 0 && server.version !== this.meta.version)) {
      // Quietly, when it's just our own upload whose answer got lost while the app was closing.
      const theirs = server.state as FarmState | null;
      const ours = this.store.state;
      const news = otherPlayer || !theirs || theirs.createdAt !== ours.createdAt || theirs.t > ours.t;
      await this.adopt(server, news ? 'loaded' : undefined);
      this.setStatus('ok');
      return;
    }
    // The server lost its copy (fresh database): upload ours as the first.
    if (server.version === 0) this.meta.version = 0;
    // In step with the server (or nothing there yet): this device's farm is the newest.
    await this.put(false);
  }

  private async put(leaving: boolean): Promise<void> {
    const me = this.me;
    if (!me) return;
    if (!leaving) this.setStatus('syncing');
    let res: Response;
    try {
      res = await fetch('/api/save', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseVersion: this.meta.version, state: this.store.state }),
        keepalive: leaving,
      });
    } catch {
      return this.setStatus('offline');
    }
    // When leaving, the page may be gone before the answer comes; the next start reconciles.
    if (res.status === 200) {
      const body = (await res.json()) as SaveAccepted;
      this.meta = { userId: me.id, version: body.version };
      await writeMeta(this.meta);
      if (body.state) await this.adopt({ version: body.version, state: body.state }, 'clamped');
      return this.setStatus('ok');
    }
    if (res.status === 409 || res.status === 422) {
      await this.adopt((await res.json()) as SaveResponse, res.status === 409 ? 'loaded' : 'rejected');
      return this.setStatus('ok');
    }
    this.setStatus('offline');
  }

  /** The server copy wins: replace the local farm and catch it up to now. */
  private async adopt(server: SaveResponse, notice?: SyncNotice): Promise<void> {
    const now = Date.now();
    const state = (server.state as FarmState | null) ?? startGame(now, (Math.random() * 2 ** 31) | 0);
    advance(state, now);
    this.meta = { userId: this.me!.id, version: server.version };
    await writeMeta(this.meta);
    await this.store.replace(state);
    this.lastSyncAt = now;
    for (const fn of this.listeners) fn(notice);
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    if (status === 'ok') this.lastSyncAt = Date.now();
    for (const fn of this.listeners) fn();
  }
}
