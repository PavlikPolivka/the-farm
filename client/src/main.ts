import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { APP_VERSION, type Me } from '@pixel-farm/shared';
import { FarmScene } from './scenes/FarmScene.js';
import { applyStaticStrings, setLocale, t } from './i18n.js';
import { enablePush, isStandalone, pushState, sendTestPush } from './push.js';
import './style.css';

registerSW({ immediate: true });

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#38b764',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [FarmScene],
});

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const hint = $('hint');
const buttons = {
  login: $<HTMLButtonElement>('login'),
  notify: $<HTMLButtonElement>('notify'),
  testpush: $<HTMLButtonElement>('testpush'),
  logout: $<HTMLButtonElement>('logout'),
};

$('version').textContent = `v${APP_VERSION} · ${isStandalone() ? 'app' : 'browser'}`;

function showLoginError(): void {
  const reason = new URLSearchParams(location.search).get('login');
  if (reason === 'forbidden') hint.textContent = t('loginForbidden');
  else if (reason) hint.textContent = t('loginFailed');
  if (reason) history.replaceState(null, '', '/');
}

function renderPush(): void {
  const state = pushState();
  buttons.notify.hidden = state === 'granted' || state === 'unsupported';
  buttons.testpush.hidden = state !== 'granted';
  if (state === 'needs-install') {
    buttons.notify.hidden = true;
    hint.textContent = t('installHint');
  } else if (state === 'unsupported') hint.textContent = t('pushUnsupported');
  else if (state === 'denied') hint.textContent = t('pushDenied');
}

async function refresh(): Promise<void> {
  applyStaticStrings();
  let res: Response;
  try {
    res = await fetch('/api/me', { cache: 'no-store' });
  } catch {
    status.textContent = t('offline');
    return;
  }
  if (res.status === 401) {
    status.textContent = t('loggedOut');
    buttons.login.hidden = false;
    for (const b of [buttons.notify, buttons.testpush, buttons.logout]) b.hidden = true;
    return;
  }
  const me = (await res.json()) as Me;
  setLocale(me.locale);
  applyStaticStrings();
  status.textContent = t('hello', { name: me.displayName });
  buttons.login.hidden = true;
  buttons.logout.hidden = false;
  renderPush();
}

async function withBusy(btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> {
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    hint.textContent = t('error', { msg: err instanceof Error ? err.message : String(err) });
  } finally {
    btn.disabled = false;
  }
}

// Top-level navigation, not fetch: the OIDC redirect chain must run in the page itself.
buttons.login.addEventListener('click', () => location.assign('/auth/login'));

buttons.notify.addEventListener('click', () =>
  withBusy(buttons.notify, async () => {
    const state = await enablePush();
    if (state === 'granted') hint.textContent = t('pushEnabled');
    renderPush();
  }),
);

buttons.testpush.addEventListener('click', () =>
  withBusy(buttons.testpush, async () => {
    const n = await sendTestPush();
    hint.textContent = n > 0 ? t('pushSent', { n }) : t('pushNone');
  }),
);

buttons.logout.addEventListener('click', () =>
  withBusy(buttons.logout, async () => {
    await fetch('/auth/logout', { method: 'POST' });
    hint.textContent = '';
    await refresh();
  }),
);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});

showLoginError();
void refresh();
