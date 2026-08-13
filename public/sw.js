/* Service worker do Núcleo Clicker — PWA instalável + cache do app shell.
 *
 * Estratégia:
 * - Navegação (index.html): rede primeiro, fallback para a cópia cacheada
 *   (o jogo abre offline; o conteúdo ao vivo continua vindo do servidor).
 * - Assets com hash (/assets/*): cache-first (as URLs mudam a cada build,
 *   então o cache nunca fica com versão velha).
 * - /api/* e outros domínios: NUNCA são cacheados (backend sempre fresco).
 */
const CACHE = 'nucleo-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // outros domínios: padrão do navegador
  if (url.pathname.startsWith('/api/')) return; // backend nunca é cacheado

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((res) => {
        if (res.ok && url.pathname.startsWith('/assets/')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      });
    }),
  );
});
