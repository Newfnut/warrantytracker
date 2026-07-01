const CACHE = 'warrantyvault-v1';
const BASE = '/warrantytracker';
const PRECACHE = [BASE+'/', BASE+'/index.html', BASE+'/styles.css', BASE+'/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('firestore') || e.request.url.includes('firebase')) {
    return e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
      return cached || network;
    })
  );
});
