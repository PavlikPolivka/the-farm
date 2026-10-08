/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Auth and API must always hit the network: never serve them from cache or the SPA fallback.
const isServerPath = (path: string) => /^\/(api|auth|healthz)(\/|$)/.test(path);
registerRoute(({ url }) => url.origin === self.location.origin && isServerPath(url.pathname), new NetworkOnly(), 'GET');
registerRoute(({ url }) => url.origin === self.location.origin && isServerPath(url.pathname), new NetworkOnly(), 'POST');
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/(api|auth|healthz)(\/|$)/] }));

interface PushMessage {
  title: string;
  body: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  const msg: PushMessage = event.data?.json() ?? { title: 'Pixel Farm', body: '' };
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: msg.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
