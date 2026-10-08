export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'default' | 'granted';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushState(): PushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iOS only exposes Web Push inside an installed home-screen app.
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Must be called from a tap handler: iOS only shows the permission prompt for a user gesture. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = (await (await fetch('/api/push/key')).json()) as { publicKey: string };
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
  return 'granted';
}

export async function sendTestPush(): Promise<number> {
  const res = await fetch('/api/push/test', { method: 'POST' });
  if (!res.ok) throw new Error(`test push failed: ${res.status}`);
  return ((await res.json()) as { sent: number }).sent;
}
