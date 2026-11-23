importScripts('/bd.js', '/sincronizacao.js');

const CACHE_INTERFACE = 'interface-v2';
const FICHEIROS_INTERFACE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/estilos.css',
  '/app.js',
  '/formulario.js',
  '/bd.js',
  '/sincronizacao.js',
  '/icones/icone-192.png',
  '/icones/icone-512.png'
];

let sincronizacaoEmCurso = null;

// Pre-carregar a interface no install
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_INTERFACE).then((cache) => cache.addAll(FICHEIROS_INTERFACE))
  );
  self.skipWaiting();
});

// Limpar caches antigas no activate
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_INTERFACE)
          .map((chave) => caches.delete(chave))
      )
    ).then(() => self.clients.claim())
  );
});

// Estrategias de pedido:
// 1. /v1/ -> nunca passa pela Cache API (network-only)
// 2. Mosaicos do mapa (ex: openstreetmap) -> network-only
// 3. Interface local -> cache-first
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);

  // Pedidos a API /v1/ nunca passam pela Cache API
  if (url.origin === self.location.origin && url.pathname.startsWith('/v1/')) {
    return;
  }

  // Mosaicos do mapa (externos ou /tiles) usam network-only
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.pathname.includes('/tiles/')
  ) {
    evento.respondWith(fetch(pedido));
    return;
  }

  // Interface da aplicacao: cache-first
  evento.respondWith(
    caches.match(pedido).then((emCache) => {
      if (emCache) return emCache;
      return fetch(pedido).then((respostaRede) => {
        if (respostaRede && respostaRede.status === 200) {
          const copia = respostaRede.clone();
          caches.open(CACHE_INTERFACE).then((cache) => cache.put(pedido, copia));
        }
        return respostaRede;
      });
    })
  );
});

async function avisarPaginas(mensagem) {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const janela of janelas) {
    janela.postMessage(mensagem);
  }
}

function iniciarSincronizacaoUnica() {
  if (!sincronizacaoEmCurso) {
    sincronizacaoEmCurso = executarSincronizacao()
      .then(async (resultado) => {
        await avisarPaginas(resultado);
        return resultado;
      })
      .catch(async (erro) => {
        await avisarPaginas({
          tipo: 'erro-sincronizacao',
          erro: erro.message || 'Erro na sincronizacao.'
        });
        throw erro;
      })
      .finally(() => {
        sincronizacaoEmCurso = null;
      });
  }
  return sincronizacaoEmCurso;
}

// Background Sync (Chromium)
self.addEventListener('sync', (evento) => {
  if (evento.tag === 'sincronizar-reporta') {
    evento.waitUntil(iniciarSincronizacaoUnica());
  }
});

// Plano B via postMessage (Firefox, Safari e arranque da pagina)
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'sincronizar') {
    evento.waitUntil(
      iniciarSincronizacaoUnica().catch(() => {
        // O erro ja foi comunicado via postMessage; evita rejeicao nao tratada no evento message
      })
    );
  }
});