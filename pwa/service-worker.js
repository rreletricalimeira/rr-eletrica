// Service Worker - RR Elétrica PWA
// Escopo: /pwa/
// Cache local dos arquivos necessários para o app funcionar offline.

const CACHE_NAME = 'rr-eletrica-pwa-v1';
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
  './src/pages/colaboradores.js',
  './src/pages/os.js',
  './src/pages/financeiro.js',
  './src/pages/taxas_cartao.js',
  './src/pages/contas_caixa.js',
  './src/pages/veiculos.js',
  './src/pages/manutencao_veiculo.js',
  './src/pages-tecnico/laudos.js',
  './src/pages-tecnico/visitas.js',
  './src/pages-tecnico/documentos.js',

  // Bibliotecas usadas pelo app e pelo SQL.js.
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
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
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Não cachear autenticação/serviços externos dinâmicos.
  if (
    url.includes('googleapis.com') ||
    url.includes('accounts.google.com') ||
    url.includes('viacep.com.br')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Só guardar respostas válidas.
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
