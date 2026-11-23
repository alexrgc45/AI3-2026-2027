const NOME_BD = 'reporta-bd';
const VERSAO_BD = 1;

let ligacaoBD = null;

function abrirBD() {
  if (ligacaoBD) return Promise.resolve(ligacaoBD);

  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(NOME_BD, VERSAO_BD);

    pedido.onupgradeneeded = (evento) => {
      const bd = pedido.result;

      if (evento.oldVersion < 1) {
        // 1. Loja ocorrencias: objetos Ocorrencia recebidos do servidor
        const lojaOcorrencias = bd.createObjectStore('ocorrencias', { keyPath: 'id' });
        lojaOcorrencias.createIndex('porEstado', 'estado', { unique: false });

        // 2. Loja pendentes: fila de saida local
        const lojaPendentes = bd.createObjectStore('pendentes', {
          keyPath: 'idLocal',
          autoIncrement: true
        });
        lojaPendentes.createIndex('porCidadao', 'cidadao', { unique: false });

        // 3. Loja minhas: historico de pendentes ja enviadas e confirmadas
        const lojaMinhas = bd.createObjectStore('minhas', { keyPath: 'idLocal' });
        lojaMinhas.createIndex('porOcorrencia', 'ocorrenciaId', { unique: false });

        // 4. Loja meta: cidadao, categorias e cursor:<cidadao>
        bd.createObjectStore('meta', { keyPath: 'chave' });
      }
    };

    pedido.onblocked = () => {
      console.warn('reporta-bd: a espera que outra ligacao feche antes de atualizar.');
    };

    pedido.onsuccess = () => {
      ligacaoBD = pedido.result;
      ligacaoBD.onversionchange = () => {
        ligacaoBD.close();
        ligacaoBD = null;
      };
      resolver(ligacaoBD);
    };

    pedido.onerror = () => rejeitar(pedido.error);
  });
}

// --- Operacoes na loja meta ---

async function lerMeta(chave) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('meta', 'readonly');
    const pedido = tx.objectStore('meta').get(chave);
    pedido.onsuccess = () => resolver(pedido.result ? pedido.result.valor : null);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function gravarMeta(chave, valor) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ chave, valor });
    tx.oncomplete = () => resolver(valor);
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

async function obterOuCriarCidadao() {
  const existente = await lerMeta('cidadao');
  if (existente) return existente;
  const novo = crypto.randomUUID();
  await gravarMeta('cidadao', novo);
  return novo;
}

async function lerCursor(cidadao) {
  const valor = await lerMeta(`cursor:${cidadao}`);
  return typeof valor === 'number' ? valor : 0;
}

async function guardarCategorias(categorias) {
  return gravarMeta('categorias', categorias);
}

async function lerCategorias() {
  const cats = await lerMeta('categorias');
  return Array.isArray(cats) ? cats : [];
}

// --- Operacoes na loja pendentes ---

async function acrescentarPendente(dados, cidadao) {
  const bd = await abrirBD();
  const registo = {
    tipo: dados.tipo, // 'ocorrencia' ou 'reforco'
    dados: dados.dados,
    fotografia: dados.fotografia || null, // Blob opcional
    chave: crypto.randomUUID(),
    cidadao,
    criadaEm: new Date().toISOString(),
    tentativas: 0,
    ultimaTentativa: null,
    erro: null
  };

  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('pendentes', 'readwrite');
    const loja = tx.objectStore('pendentes');
    const pedido = loja.add(registo);
    let idGerado = null;

    pedido.onsuccess = () => {
      idGerado = pedido.result;
    };

    tx.oncomplete = () => resolver({ ...registo, idLocal: idGerado });
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

async function lerPendentesDe(cidadao) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('pendentes', 'readonly');
    const indice = tx.objectStore('pendentes').index('porCidadao');
    const pedido = indice.getAll(cidadao);

    pedido.onsuccess = () => {
      const lista = pedido.result || [];
      lista.sort((a, b) => a.idLocal - b.idLocal);
      resolver(lista);
    };
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function registarTentativa(idLocal) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('pendentes', 'readwrite');
    const loja = tx.objectStore('pendentes');
    const pedido = loja.get(idLocal);

    pedido.onsuccess = () => {
      const item = pedido.result;
      if (item) {
        item.tentativas = (item.tentativas || 0) + 1;
        item.ultimaTentativa = new Date().toISOString();
        item.erro = null;
        loja.put(item);
      }
    };

    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

async function marcarErro(idLocal, mensagem) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('pendentes', 'readwrite');
    const loja = tx.objectStore('pendentes');
    const pedido = loja.get(idLocal);

    pedido.onsuccess = () => {
      const item = pedido.result;
      if (item) {
        item.erro = mensagem;
        loja.put(item);
      }
    };

    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

// --- Confirmacao e Sincronizacao (transacoes atomicas) ---

async function confirmarPendente(idLocal, resultado, ocorrencia) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction(['pendentes', 'minhas', 'ocorrencias'], 'readwrite');
    const lojaPendentes = tx.objectStore('pendentes');
    const lojaMinhas = tx.objectStore('minhas');
    const lojaOcorrencias = tx.objectStore('ocorrencias');

    const pedidoLeitura = lojaPendentes.get(idLocal);

    pedidoLeitura.onsuccess = () => {
      const pendente = pedidoLeitura.result;
      lojaPendentes.delete(idLocal);

      lojaMinhas.put({
        idLocal,
        ocorrenciaId: ocorrencia.id,
        resultado, // 'criada', 'reforcada' ou 'ja-comunicada'
        enviadaEm: new Date().toISOString(),
        cidadao: pendente ? pendente.cidadao : null,
        categoria: pendente && pendente.dados ? pendente.dados.categoria : ocorrencia.categoria,
        descricao: pendente && pendente.dados ? pendente.dados.descricao : ocorrencia.descricao
      });

      lojaOcorrencias.put(ocorrencia);
    };

    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

async function aplicarAlteracoes(cidadao, alteracoes, cursor) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction(['ocorrencias', 'meta'], 'readwrite');
    const lojaOcorrencias = tx.objectStore('ocorrencias');
    const lojaMeta = tx.objectStore('meta');

    for (const ocorrencia of alteracoes) {
      lojaOcorrencias.put(ocorrencia);
    }

    lojaMeta.put({
      chave: `cursor:${cidadao}`,
      valor: cursor
    });

    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

// --- Leitura de ocorrencias e historico ---

async function guardarOcorrencias(lista) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('ocorrencias', 'readwrite');
    const loja = tx.objectStore('ocorrencias');
    for (const oc of lista) {
      loja.put(oc);
    }
    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

async function lerTodasOcorrencias() {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('ocorrencias', 'readonly');
    const pedido = tx.objectStore('ocorrencias').getAll();
    pedido.onsuccess = () => resolver(pedido.result || []);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function lerMinhasDe(cidadao) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('minhas', 'readonly');
    const pedido = tx.objectStore('minhas').getAll();
    pedido.onsuccess = () => {
      const todas = pedido.result || [];
      const filtradas = cidadao ? todas.filter((m) => m.cidadao === cidadao) : todas;
      filtradas.sort((a, b) => b.idLocal - a.idLocal);
      resolver(filtradas);
    };
    pedido.onerror = () => rejeitar(pedido.error);
  });
}
async function removerPendente(idLocal) {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('pendentes', 'readwrite');
    tx.objectStore('pendentes').delete(idLocal);
    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

async function obterOuCriarDispositivoId() {
  const existente = await lerMeta('dispositivoId');
  if (existente) return existente;
  const legado = await lerMeta('cidadao');
  const novo = legado && !legado.includes(':') ? legado : crypto.randomUUID();
  await gravarMeta('dispositivoId', novo);
  return novo;
}

async function obterOuCriarCidadao() {
  const existente = await lerMeta('cidadao');
  if (existente) return existente;
  const dispositivoId = await obterOuCriarDispositivoId();
  await gravarMeta('cidadao', dispositivoId);
  return dispositivoId;
}

async function lerTodasPendentes() {
  const bd = await abrirBD();
  return new Promise((resolver, rejeitar) => {
    const tx = bd.transaction('pendentes', 'readonly');
    const pedido = tx.objectStore('pendentes').getAll();
    pedido.onsuccess = () => {
      const lista = pedido.result || [];
      lista.sort((a, b) => a.idLocal - b.idLocal);
      resolver(lista);
    };
    pedido.onerror = () => rejeitar(pedido.error);
  });
}