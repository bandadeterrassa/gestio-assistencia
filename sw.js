/* Service worker: notificacions push + memòria cau de l'aplicació per obrir-la sense connexió.
   Les dades (Supabase) no passen per aquí: l'app en desa una còpia local pròpia. */
const CACHE = 'bt-shell-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'favicon-32.png', 'apple-touch-icon.png'];
const EXTRA = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await Promise.all(EXTRA.map(u => fetch(u).then(r => (r.ok || r.type === 'opaque') && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('bt-shell-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
const STATIC_HOST = /^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) {
    // Pàgina: primer la xarxa (així sempre hi ha l'última versió); sense connexió, la còpia desada.
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 5000))]);
        if (r && r.ok) c.put('index.html', r.clone());
        return r;
      } catch (_) { return (await c.match('index.html', { ignoreSearch: true })) || (await c.match('./', { ignoreSearch: true })) || Response.error(); }
    })());
    return;
  }
  if (url.origin === location.origin || STATIC_HOST.test(url.hostname)) {
    // Fitxers estàtics: es serveixen de la còpia i s'actualitzen en segon pla.
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || Response.error();
    })());
  }
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Banda de Terrassa', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Banda de Terrassa', {
    body: d.body || '', icon: 'icon-192.png', badge: 'favicon-32.png', tag: d.tag || undefined,
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
