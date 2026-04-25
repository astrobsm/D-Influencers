/* ============================================================
   D'Influencers Mentorship Hub — Service Worker v1.0
   Offline-first PWA with background sync & cache strategies
   ============================================================ */

const CACHE_NAME = 'dinfluencers-v3';
const API_CACHE = 'dinfluencers-api-v3';
const OFFLINE_URL = '/index.html';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/assets/logo.jpeg',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http')));
    }).then(() => self.skipWaiting())
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== API_CACHE)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ==================== FETCH (Stale-While-Revalidate) ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests — Network-first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // HTML navigations should prefer the network so app updates are picked up.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets — Cache-first
  event.respondWith(cacheFirstStrategy(request));
});

async function networkFirstStrategy(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline — cached data unavailable', offline: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503
    });
  }
}

async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Return offline fallback
    const fallback = await cache.match(OFFLINE_URL);
    return fallback || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
  }
}

// ==================== BACKGROUND SYNC ====================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-actions') {
    event.waitUntil(syncPendingActions());
  }
});

async function syncPendingActions() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE', timestamp: Date.now() });
  });
}

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: "D'Influencers", body: "You have a new notification" };
  event.waitUntil(
    self.registration.showNotification(data.title || "D'Influencers Mentorship Hub", {
      body: data.body,
      icon: '/assets/logo.jpeg',
      badge: '/assets/logo.jpeg',
      vibrate: [200, 100, 200],
      tag: 'dinfluencers-notif',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});

// ==================== MESSAGE HANDLER ====================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => cache.addAll(event.data.urls || []))
    );
  }
});
