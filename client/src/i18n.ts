// Minimal M0 strings. M1 replaces this with i18next + ICU plurals.
import { pickLocale } from '@pixel-farm/shared';

const STRINGS = {
  en: {
    login: 'Log in',
    logout: 'Log out',
    enableNotifications: 'Enable notifications',
    testPush: 'Send test notification',
    loggedOut: 'Not logged in',
    hello: 'Hi, {name}!',
    offline: 'Offline — cannot reach the farm',
    installHint: 'To get notifications on iPhone: Share → Add to Home Screen, then open the app from there.',
    pushUnsupported: 'This browser cannot show notifications.',
    pushDenied: 'Notifications are blocked. Allow them in settings.',
    pushEnabled: 'Notifications are on ✔',
    pushSent: 'Sent to {n} device(s). It should arrive in a moment.',
    pushNone: 'No device is subscribed yet. Enable notifications first.',
    loginFailed: 'Login failed. Try again.',
    loginForbidden: 'This account is not allowed to play. Ask Pavel.',
    error: 'Something went wrong: {msg}',
  },
  cs: {
    login: 'Přihlásit se',
    logout: 'Odhlásit se',
    enableNotifications: 'Zapnout upozornění',
    testPush: 'Poslat zkušební upozornění',
    loggedOut: 'Nejsi přihlášený',
    hello: 'Ahoj, {name}!',
    offline: 'Offline — farma není dostupná',
    installHint: 'Upozornění na iPhonu: Sdílet → Přidat na plochu a pak otevři aplikaci z plochy.',
    pushUnsupported: 'Tento prohlížeč neumí zobrazit upozornění.',
    pushDenied: 'Upozornění jsou zablokovaná. Povol je v nastavení.',
    pushEnabled: 'Upozornění jsou zapnutá ✔',
    pushSent: 'Odesláno na zařízení: {n}. Za chvíli by mělo dorazit.',
    pushNone: 'Žádné zařízení zatím není přihlášené k upozorněním. Nejdřív je zapni.',
    loginFailed: 'Přihlášení se nepovedlo. Zkus to znovu.',
    loginForbidden: 'Tento účet nemá povoleno hrát. Zeptej se Pavla.',
    error: 'Něco se pokazilo: {msg}',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['en'];

let locale: 'cs' | 'en' = pickLocale(navigator.language);

export const setLocale = (l: 'cs' | 'en') => (locale = l);
export const getLocale = () => locale;

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  return STRINGS[locale][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function applyStaticStrings(root: ParentNode = document): void {
  document.documentElement.lang = locale;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as StringKey);
  });
}
