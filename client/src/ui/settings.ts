import { APP_VERSION, type Me } from '@pixel-farm/shared';
import { locale, setLocale, t } from '../i18n/index.js';
import { enablePush, pushState, sendTestPush } from '../push.js';
import { h, sprite } from './dom.js';
import { prefersReducedMotion, setReducedMotion } from './prefs.js';

export interface SettingsHooks {
  onLocaleChange(): void;
  restartTutorial(): void;
  me(): Me | null;
  refreshMe(): Promise<void>;
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

  const account = h('p', { class: 'desc' });
  const login = h('button', { class: 'primary', on: { click: () => location.assign('/auth/login') } }, t('settings.login'));
  const logout = h('button', { on: { click: async () => { await fetch('/auth/logout', { method: 'POST' }); await hooks.refreshMe(); update(); } } }, t('settings.logout'));

  const pushHint = h('p', { class: 'desc' });
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
    section('sparkle', t('settings.motion'), motion),
    section('farmhand', t('settings.account'), account, h('div', { class: 'choices' }, login, logout)),
    section('star', t('settings.notifications'), pushHint, h('div', { class: 'choices' }, pushOn, pushTest)),
    section('hand', t('settings.tutorial'), h('button', { on: { click: () => hooks.restartTutorial() } }, t('settings.tutorial'))),
    section('barn-icon', t('settings.credits'), h('p', { class: 'desc' }, t('settings.creditsText')), h('p', { class: 'desc version' }, `v${APP_VERSION}`)),
  );

  const update = () => {
    const reduced = prefersReducedMotion();
    motion.setAttribute('aria-checked', String(reduced));
    motion.textContent = reduced ? '✔ ' + t('settings.motion') : t('settings.motion');
    motion.classList.toggle('active', reduced);

    const me = hooks.me();
    account.textContent = me ? t('settings.loggedInAs', { name: me.displayName }) : t('settings.notLoggedIn');
    login.hidden = !!me;
    logout.hidden = !me;

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
  void hooks.refreshMe().then(update);
  return update;
}
