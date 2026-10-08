import { createStore, get, set } from 'idb-keyval';
import { migrate, type FarmState } from '@pixel-farm/shared';

// One local save per device until M2 syncs it to the server.
const store = createStore('pixel-farm', 'saves');
const KEY = 'farm:local';

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
