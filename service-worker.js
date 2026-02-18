const CACHE_NAME = 'Cartola-v4';
const assets = [
  './',
  './index.html',
  './manifest.json'
  '.icons/icon-192x192.png'
  '.icons/icon-512x512.png'
];

// Instalação: Salva os arquivos essenciais no cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// Ativação: Limpa caches antigos (como o v1)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Estratégia de busca: Tenta a rede primeiro, se falhar (offline), usa o cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
