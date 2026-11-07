// public/bd.js

const DB_NAME = "sugestoes-bd";
const DB_VERSION = 1;

export function abrirBD() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("sugestoes")) {
        const store = db.createObjectStore("sugestoes", { keyPath: "id" });
        store.createIndex("porEstado", "estado", { unique: false });
        store.createIndex("porData", "dataCriacao", { unique: false });
      }
      if (!db.objectStoreNames.contains("pendentes")) {
        db.createObjectStore("pendentes", { keyPath: "idLocal", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    };
  });
}

/**
 * Apaga e volta a preencher a loja sugestoes e atualiza atualizadoEm, numa única transação.
 */
export async function substituirSugestoes(lista) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["sugestoes", "meta"], "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();

    const storeSug = tx.objectStore("sugestoes");
    storeSug.clear();
    for (const item of lista) {
      storeSug.add(item);
    }

    const storeMeta = tx.objectStore("meta");
    const getReq = storeMeta.get("proprietario");
    getReq.onsuccess = () => {
      const prop = getReq.result || {};
      const agora = new Date();
      prop.atualizadoEm = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
      storeMeta.put(prop, "proprietario");
    };
  });
}

/**
 * Devolve as sugestões percorrendo porData em sentido decrescente ("recentes") ou porEstado ("estado").
 */
export async function lerSugestoes(ordenacao) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sugestoes", "readonly");
    const store = tx.objectStore("sugestoes");
    let request;

    if (ordenacao === "estado") {
      request = store.index("porEstado").getAll();
    } else {
      request = store.index("porData").getAll(null, "prev");
    }

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function acrescentarPendente(dados, utilizador) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendentes", "readwrite");
    const store = tx.objectStore("pendentes");
    const item = {
      utilizador,
      titulo: dados.titulo,
      descricao: dados.descricao,
      categoria: dados.categoria,
      criadaEm: new Date().toISOString(),
      erro: null
    };
    const req = store.add(item);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function lerPendentes() {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendentes", "readonly");
    const store = tx.objectStore("pendentes");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function marcarErro(idLocal, mensagem) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendentes", "readwrite");
    const store = tx.objectStore("pendentes");
    const req = store.get(idLocal);
    req.onsuccess = () => {
      const item = req.result;
      if (item) {
        item.erro = mensagem;
        store.put(item);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove a pendente e acrescenta a Sugestao criada, numa única transação sobre as duas lojas.
 */
export async function confirmarPendente(idLocal, sugestao) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["pendentes", "sugestoes"], "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();

    tx.objectStore("pendentes").delete(idLocal);
    tx.objectStore("sugestoes").put(sugestao);
  });
}

export async function descartarPendente(idLocal) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendentes", "readwrite");
    const store = tx.objectStore("pendentes");
    store.delete(idLocal);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function lerProprietario() {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const store = tx.objectStore("meta");
    const req = store.get("proprietario");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarProprietario(sessao) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    const getReq = store.get("proprietario");
    getReq.onsuccess = () => {
      const existing = getReq.result || {};
      const prop = {
        utilizador: sessao.utilizador,
        nome: sessao.nome,
        papel: sessao.papel,
        expiracao: sessao.expiracao,
        atualizadoEm: existing.atualizadoEm || null
      };
      store.put(prop, "proprietario");
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function limparBD() {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["sugestoes", "pendentes", "meta"], "readwrite");
    tx.objectStore("sugestoes").clear();
    tx.objectStore("pendentes").clear();
    tx.objectStore("meta").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}