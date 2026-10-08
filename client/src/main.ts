import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import type { Store as StoreT } from './game/store.js';
import { Store } from './game/store.js';
import { initI18n, t } from './i18n/index.js';
import { FarmScene } from './scenes/FarmScene.js';
import { toast } from './ui/effects.js';
import { Ui } from './ui/index.js';
import { prefersReducedMotion, setReducedMotion } from './ui/prefs.js';
import './style.css';

declare global {
  interface Window {
    /** Debug / e2e handle. Only touches this device's local farm. */
    __pf?: { store: StoreT; ui: Ui; scene: () => FarmScene | null };
  }
}

registerSW({ immediate: true });

async function boot(): Promise<void> {
  await initI18n();
  setReducedMotion(prefersReducedMotion());
  const { store, awayMs, away } = await Store.open();
  const ui = new Ui(store);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    backgroundColor: '#84c669',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    banner: false,
  });
  game.scene.add('farm', FarmScene, true, {
    store,
    callbacks: {
      onField: (i: number, at: { x: number; y: number }) => ui.field(i, at),
      onWindmill: (at: { x: number; y: number }) => ui.windmill(at),
      onBarn: () => ui.open('barn'),
      onPen: () => ui.open('shop'),
      onLand: () => ui.open('shop'),
      // Keep the boot screen up until the farm can take taps.
      onReady: (farm: FarmScene) => {
        ui.scene = farm;
        document.getElementById('boot')?.remove();
      },
    },
  });
  const scene = () => (game.scene.getScene('farm') as FarmScene | null) ?? null;

  store.start();
  ui.welcome(awayMs, away);
  void ui.refreshMe();

  const login = new URLSearchParams(location.search).get('login');
  if (login) {
    toast(t(login === 'forbidden' ? 'login.forbidden' : login === 'expired' ? 'login.expired' : 'login.failed'), 'lock', 5000);
    history.replaceState(null, '', '/');
  }

  window.__pf = { store, ui, scene };
}

void boot();
