import { advance, apply, startGame, type Action, type FarmState, type Result, type SimEvent } from '@pixel-farm/shared';
import { loadSave, writeSave } from './save.js';

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type Command = DistributiveOmit<Action, 'at'>;
export type Listener = (events: SimEvent[], state: FarmState) => void;

const TICK_MS = 250;
const SAVE_DEBOUNCE_MS = 1000;

/** Owns the single FarmState: runs the clock, applies commands, saves. */
export class Store {
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(public state: FarmState) {}

  /** Loads the save (or starts a new farm) and catches up on offline time. */
  static async open(): Promise<{ store: Store; awayMs: number; away: SimEvent[] }> {
    const saved = await loadSave();
    const now = Date.now();
    const state = saved ?? startGame(now, (Math.random() * 2 ** 31) | 0);
    const awayMs = saved ? Math.max(0, now - saved.t) : 0;
    const away = advance(state, now);
    const store = new Store(state);
    store.scheduleSave();
    return { store, awayMs, away };
  }

  start(): void {
    this.tickTimer ??= setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
      else this.tick();
    });
    window.addEventListener('pagehide', () => void this.flush());
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: Command): Result {
    const result = apply(this.state, { ...cmd, at: Date.now() } as Action);
    this.emit(result.events);
    this.scheduleSave();
    return result;
  }

  tick(): void {
    const events = advance(this.state, Date.now());
    this.emit(events);
    if (events.length) this.scheduleSave();
  }

  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await writeSave(this.state);
  }

  /** Replaces the farm (used by tests and a future "start over"). */
  replace(state: FarmState): void {
    this.state = state;
    this.emit([]);
    this.scheduleSave();
  }

  private emit(events: SimEvent[]): void {
    for (const fn of this.listeners) fn(events, this.state);
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void writeSave(this.state);
    }, SAVE_DEBOUNCE_MS);
  }
}
