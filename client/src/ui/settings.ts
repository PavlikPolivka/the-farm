import { APP_VERSION, PUSH_TYPES, type Me, type PushPrefs } from '@pixel-farm/shared';
import type { SyncStatus } from '../game/sync.js';
import { locale, setLocale, t } from '../i18n/index.js';
import { enablePush, pushState, sendTestPush } from '../push.js';
import { h, sprite } from './dom.js';
import { prefersReducedMotion, setReducedMotion } from './prefs.js';
import { audio } from '../audio.js';

export interface SettingsHooks {
  onLocaleChange(): void;
  restartTutorial(): void;
  me(): Me | null;
  refreshMe(): Promise<unknown>;
  sync(): { status: SyncStatus; lastSyncAt: number | null };
}

/** Renders the settings sheet body; returns its update function. */
export function renderSettings(body: HTMLElement, hooks: SettingsHooks): () => void {
  const section = (icon: string, title: string, ...children: (Node | null)[]) =>
    h('section', { class: 'setting' }, h('h3', null, sprite(icon, 1), title), ...children);

  const langBtn = (l: 'cs' | 'en', label: string) =>
    h('button', { class: locale() === l ? 'choice active' : 'choice', data: { lang: l }, on: { click: async () => { await setLocale(l); hooks.onLocaleChange(); } } }, label);

  const motion = h('button', {
    class: 'choice toggle',
    role: 'switch',
    on: { click: () => { setReducedMotion(!prefersReducedMotion()); update(); } },
  });

  const toggle = (key: string, on: () => boolean, set: (v: boolean) => void) => {
    const b = h('button', { class: 'choice toggle', role: 'switch', data: { toggle: key }, on: { click: () => { set(!on()); update(); } } });
    return { b, update: () => { b.setAttribute('aria-checked', String(on())); b.textContent = (on() ? '✔ ' : '') + t(`settings.${key}`); b.classList.toggle('active', on()); } };
  };
  const soundT = toggle('sounds', () => audio.sound, (v) => audio.setSound(v));
  const musicT = toggle('music', () => audio.music, (v) => audio.setMusic(v));

  const account = h('p', { class: 'desc' });
  const syncLine = h('p', { class: 'desc sync', 'data-testid': 'sync-status' });
  const login = h('button', { class: 'primary', on: { click: () => location.assign('/auth/login') } }, t('settings.login'));
  const logout = h('button', { on: { click: async () => { await fetch('/auth/logout', { method: 'POST' }); await hooks.refreshMe(); update(); } } }, t('settings.logout'));

  const pushHint = h('p', { class: 'desc' });

  // Credits: every art pack with its licence (credits.json is written by the asset build).
  const credits = h('div', { class: 'credits', 'data-testid': 'credits' }, h('p', { class: 'desc' }, t('settings.creditsText')));
  void fetch('/credits.json')
    .then((r) => (r.ok ? (r.json() as Promise<{ name: string; url: string; license: string }[]>) : []))
    .then((list) =>
      credits.append(
        h('ul', { class: 'desc' }, ...list.map((c) => h('li', null, h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.name), ` (${c.license})`))),
        h('p', { class: 'desc' }, t('settings.creditsOwn')),
      ),
    )
    .catch(() => {});

  // What to be told about, and when not to be disturbed.
  let prefs: PushPrefs | null = null;
  const prefsBox = h('div', { class: 'push-prefs', hidden: true });
  const typeBtns = PUSH_TYPES.map((type) =>
    h('button', { class: 'choice', role: 'switch', data: { pushType: type }, on: { click: () => prefs && savePrefs({ ...prefs, types: { ...prefs.types, [type]: !prefs.types[type] } }) } }, t(`settings.push.${type}`)),
  );
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const hourSelect = (which: 'start' | 'end') => {
    const sel = h('select', { class: 'hour', data: { quiet: which }, 'aria-label': t(`settings.quiet.${which}`) }, ...hours.map((x) => h('option', { value: x }, x)));
    sel.addEventListener('change', () => prefs && savePrefs({ ...prefs, quiet: { ...prefs.quiet, [which]: sel.value } }));
    return sel;
  };
  const quietStart = hourSelect('start');
  const quietEnd = hourSelect('end');
  prefsBox.append(
    h('div', { class: 'choices' }, ...typeBtns),
    h('p', { class: 'desc quiet' }, t('settings.quiet.label'), ' ', quietStart, ' – ', quietEnd),
  );
  async function savePrefs(next: PushPrefs) {
    prefs = next;
    update();
    await fetch('/api/push/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }).catch(() => null);
  }
  async function loadPrefs() {
    if (!hooks.me()) return;
    try {
      const res = await fetch('/api/push/prefs', { cache: 'no-store' });
      if (res.ok) prefs = (await res.json()) as PushPrefs;
    } catch {
      // offline
    }
    update();
  }
  const pushOn = h('button', { class: 'primary', on: { click: () => void enable() } }, t('settings.enableNotifications'));
  const pushTest = h('button', { on: { click: () => void test() } }, t('settings.testPush'));

  async function enable() {
    try {
      await enablePush();
    } catch (err) {
      pushHint.textContent = err instanceof Error ? err.message : String(err);
    }
    update();
  }
  async function test() {
    try {
      await sendTestPush();
      pushHint.textContent = t('settings.pushSent');
    } catch (err) {
      pushHint.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  body.append(
    section('sign', t('settings.language'), h('div', { class: 'choices' }, langBtn('cs', 'Čeština'), langBtn('en', 'English'))),
    section('sparkle', t('settings.sound'), h('div', { class: 'choices' }, soundT.b, musicT.b), motion),
    section('farmhand', t('settings.account'), account, syncLine, h('div', { class: 'choices' }, login, logout)),
    section('star', t('settings.notifications'), pushHint, h('div', { class: 'choices' }, pushOn, pushTest), prefsBox),
    section('hand', t('settings.tutorial'), h('button', { on: { click: () => hooks.restartTutorial() } }, t('settings.tutorial'))),
    section('barn-icon', t('settings.credits'), credits, h('p', { class: 'desc version' }, `v${APP_VERSION}`)),
  );

  const update = () => {
    soundT.update();
    musicT.update();
    const reduced = prefersReducedMotion();
    motion.setAttribute('aria-checked', String(reduced));
    motion.textContent = reduced ? '✔ ' + t('settings.motion') : t('settings.motion');
    motion.classList.toggle('active', reduced);

    const me = hooks.me();
    account.textContent = me ? t('settings.loggedInAs', { name: me.displayName }) : t('settings.notLoggedIn');
    login.hidden = !!me;
    logout.hidden = !me;
    const sync = hooks.sync();
    syncLine.hidden = !me;
    syncLine.textContent =
      sync.status === 'offline' ? t('sync.offline')
      : sync.status === 'syncing' ? t('sync.syncing')
      : sync.lastSyncAt ? t('sync.ok', { time: new Date(sync.lastSyncAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })
      : '';

    prefsBox.hidden = !me || !prefs;
    if (prefs) {
      typeBtns.forEach((b, i) => {
        const on = prefs!.types[PUSH_TYPES[i]!];
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      });
      quietStart.value = prefs.quiet.start;
      quietEnd.value = prefs.quiet.end;
    }

    const state = pushState();
    pushOn.hidden = !me || state === 'granted' || state === 'unsupported' || state === 'needs-install';
    pushTest.hidden = !me || state !== 'granted';
    if (!pushHint.textContent || ['needs-install', 'unsupported', 'denied', 'granted'].includes(state))
      pushHint.textContent =
        state === 'needs-install' ? t('settings.pushInstall')
        : state === 'unsupported' ? t('settings.pushUnsupported')
        : state === 'denied' ? t('settings.pushDenied')
        : state === 'granted' && !pushHint.textContent ? t('settings.pushOn')
        : pushHint.textContent;
  };
  update();
  void loadPrefs();
  return update;
}
