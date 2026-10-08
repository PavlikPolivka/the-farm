import { createStore, get, set } from 'idb-keyval';
import { migrate, type FarmState } from '@pixel-farm/shared';

// One farm per device. `farm:sync` records whose farm it is and which server version it's built on.
const store = createStore('pixel-farm', 'saves');
const KEY = 'farm:local';
const META = 'farm:sync';

export interface SyncMeta {
  /** Player the local farm belongs to; null for a farm never synced. */
  userId: number | null;
  version: number;
}

export async function loadSave(): Promise<FarmState | null> {
  try {
    const raw = await get(KEY, store);
    return raw ? migrate(raw) : null;
  } catch (err) {
    console.warn('[pf] could not load save', err);
    return null;
  }
}

export async function writeSave(state: FarmState): Promise<void> {
  try {
    await set(KEY, state, store);
  } catch (err) {
    console.warn('[pf] could not write save', err);
  }
}

export async function loadMeta(): Promise<SyncMeta> {
  try {
    return ((await get(META, store)) as SyncMeta | undefined) ?? { userId: null, version: 0 };
  } catch {
    return { userId: null, version: 0 };
  }
}

export async function writeMeta(meta: SyncMeta): Promise<void> {
  try {
    await set(META, meta, store);
  } catch (err) {
    console.warn('[pf] could not write sync meta', err);
  }
}
