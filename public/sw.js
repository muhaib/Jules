/*
 * BranchCheck service worker.
 *
 * Scope is deliberately narrow: cache the application shell and static assets so
 * an inspector can reopen the app inside a branch with no signal. API responses
 * are never cached — stale inspection data would be worse than none, and pending
 * work lives in IndexedDB with its own sync queue.
 */
const CACHE = 'branchcheck-shell-v1';
const SHELL = ['/offline', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never serve an API response from cache.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, fall back to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((hit) => hit || caches.match('/offline')),
      ),
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});
