// Service Worker - RR Elétrica App
// Cache-first para assets, permite o app abrir 100% offline.
// IMPORTANTE: o número da versão do cache muda a cada atualização de
// código para forçar o navegador a buscar os arquivos novos.

const CACHE_NAME = 'rr-eletrica-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/app.js',
  './src/auth-pin.js',
  './src/config.js',
  './src/db/db.js',
  './src/db/backup.js',
  './src/db/schema.sql',
  './src/ui/style.css',
  './src/ui/cep.js',
  './src/ui/image.js',
  './src/pages/clientes.js',
  './src/pages/fornecedores.js',
  './src/pages/produtos.js',
  './src/pages/categorias.js',
  './src/pages/unidades.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Nunca cachear chamadas a APIs externas dinâmicas (Google, ViaCEP)
  if (
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('accounts.google.com') ||
    event.request.url.includes('viacep.com.br')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => cached);
    })
  );
});
