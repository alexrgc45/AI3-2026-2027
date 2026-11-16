
// public/bd.js

const DB_NAME = "sugestoes-bd";
const DB_VERSION = 2;

/**
 * Abre a base de dados.
 * A migração da versão 1 para a 2 preserva os registos existentes.
 */
export function abrirBD() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);

    req.onsuccess = () => {
      const db = req.result;

      // Fecha a ligação quando outra versão da aplicação é instalada.
      db.onversionchange = () => {
        db.close();

        // Notifica a página sem depender de window ou document.
        if (typeof globalThis.dispatchEvent === "function") {
          globalThis.dispatchEvent(
            new Event("sugestoes-bd-versionchange")
          );
        }
      };

      resolve(db);
    };

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;

      // Loja sugestões
      let storeSugestoes;

      if (!db.objectStoreNames.contains("sugestoes")) {
        storeSugestoes = db.createObjectStore("sugestoes", {
          keyPath: "id"
        });
      } else {
        storeSugestoes = tx.objectStore("sugestoes");
      }

      if (!storeSugestoes.indexNames.contains("porEstado")) {
        storeSugestoes.createIndex("porEstado", "estado", {
          unique: false
        });
      }

      if (!storeSugestoes.indexNames.contains("porData")) {
        storeSugestoes.createIndex("porData", "dataCriacao", {
          unique: false
        });
      }

      // Loja pendentes
      let storePendentes;

      if (!db.objectStoreNames.contains("pendentes")) {
        storePendentes = db.createObjectStore("pendentes", {
          keyPath: "idLocal",
          autoIncrement: true
        });
      } else {
        storePendentes = tx.objectStore("pendentes");
      }

      if (!storePendentes.indexNames.contains("porUtilizador")) {
        storePendentes.createIndex("porUtilizador", "utilizador", {
          unique: false
        });
      }

      // Migração das pendentes antigas.
      // Não apaga os registos: acrescenta apenas os campos em falta.
      const pendentesAntigas = storePendentes.getAll();

      pendentesAntigas.onsuccess = () => {
        for (const item of pendentesAntigas.result) {
          storePendentes.put({
            ...item,
            chave: item.chave || crypto.randomUUID(),
            tentativas: item.tentativas ?? 0,
            ultimaTentativa: item.ultimaTentativa ?? null
          });
        }
      };

      // Loja meta.
      // Mantém os dados existentes, incluindo "proprietario".
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    };
  });
}

/**
 * Executa uma operação e só resolve quando a transação termina.
 */
async function executarTransacao(lojas, modo, operacao) {
  const db = await abrirBD();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(lojas, modo);
    let resultado;

    try {
      resultado = operacao(tx);
    } catch (erro) {
      tx.abort();
      db.close();
      reject(erro);
      return;
    }

    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("A transação foi cancelada."));
    };

    tx.onerror = () => {
      // O evento abort trata da rejeição.
    };
  });
}

/**
 * Substitui as sugestões e atualiza atualizadoEm numa única transação.
 */
export async function substituirSugestoes(lista) {
  return executarTransacao(
    ["sugestoes", "meta"],
    "readwrite",
    (tx) => {
      const storeSugestoes = tx.objectStore("sugestoes");
      storeSugestoes.clear();

      for (const item of lista) {
        storeSugestoes.put(item);
      }

      const storeMeta = tx.objectStore("meta");
      const req = storeMeta.get("proprietario");

      req.onsuccess = () => {
        const prop = req.result || {};
        const agora = new Date();

        prop.atualizadoEm =
          `${String(agora.getHours()).padStart(2, "0")}:` +
          `${String(agora.getMinutes()).padStart(2, "0")}`;

        storeMeta.put(prop, "proprietario");
      };
    }
  );
}

/**
 * Lê sugestões por estado ou por data.
 */
export async function lerSugestoes(ordenacao) {
  const db = await abrirBD();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("sugestoes", "readonly");
    const store = tx.objectStore("sugestoes");
    const resultado = [];

    if (ordenacao === "estado") {
      const req = store.index("porEstado").getAll();

      req.onsuccess = () => {
        resultado.push(...req.result);
      };
    } else {
      const req = store.index("porData").openCursor(null, "prev");

      req.onsuccess = () => {
        const cursor = req.result;

        if (cursor) {
          resultado.push(cursor.value);
          cursor.continue();
        }
      };
    }

    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Acrescenta uma pendente com chave UUID e dados de tentativas.
 */
export async function acrescentarPendente(dados, utilizador) {
  return executarTransacao("pendentes", "readwrite", (tx) => {
    const item = {
      utilizador,
      titulo: dados.titulo,
      descricao: dados.descricao,
      categoria: dados.categoria,
      criadaEm: new Date().toISOString(),
      erro: null,
      chave: crypto.randomUUID(),
      tentativas: 0,
      ultimaTentativa: null
    };

    const req = tx.objectStore("pendentes").add(item);

    req.onsuccess = () => {
      // O resultado é lido depois, através do valor devolvido
      // pela transação, na implementação abaixo.
    };

    return req;
  }).then((req) => req.result);
}

/**
 * Devolve todas as pendentes.
 */
export async function lerPendentes() {
  return executarTransacao("pendentes", "readonly", (tx) => {
    const req = tx.objectStore("pendentes").getAll();

    req.onsuccess = () => {
      // O resultado é guardado na própria Promise abaixo.
    };

    return req;
  }).then((req) => req.result);
}

/**
 * Lê as pendentes de um utilizador, por idLocal,
 * excluindo as que já têm erro.
 */
export async function lerPendentesDe(utilizador) {
  return executarTransacao("pendentes", "readonly", (tx) => {
    const req = tx
      .objectStore("pendentes")
      .index("porUtilizador")
      .getAll(utilizador);

    return req;
  }).then((req) => req.result.filter((item) => !item.erro));
}

/**
 * Conta as pendentes sem erro de um utilizador.
 */
export async function contarPendentes(utilizador) {
  const pendentes = await lerPendentesDe(utilizador);
  return pendentes.length;
}

/**
 * Incrementa o número de tentativas e regista a data da última tentativa.
 */
export async function registarTentativa(idLocal) {
  return executarTransacao("pendentes", "readwrite", (tx) => {
    const store = tx.objectStore("pendentes");
    const req = store.get(idLocal);

    req.onsuccess = () => {
      const item = req.result;

      if (item) {
        item.tentativas = (item.tentativas || 0) + 1;
        item.ultimaTentativa = new Date().toISOString();
        store.put(item);
      }
    };
  });
}

/**
 * Marca uma pendente com erro.
 */
export async function marcarErro(idLocal, mensagem) {
  return executarTransacao("pendentes", "readwrite", (tx) => {
    const store = tx.objectStore("pendentes");
    const req = store.get(idLocal);

    req.onsuccess = () => {
      const item = req.result;

      if (item) {
        item.erro = mensagem;
        store.put(item);
      }
    };
  });
}

/**
 * Remove a pendente e acrescenta a sugestão numa única transação.
 */
export async function confirmarPendente(idLocal, sugestao) {
  return executarTransacao(
    ["pendentes", "sugestoes"],
    "readwrite",
    (tx) => {
      tx.objectStore("pendentes").delete(idLocal);
      tx.objectStore("sugestoes").put(sugestao);
    }
  );
}

/**
 * Descarta uma pendente.
 */
export async function descartarPendente(idLocal) {
  return executarTransacao("pendentes", "readwrite", (tx) => {
    tx.objectStore("pendentes").delete(idLocal);
  });
}

/**
 * Lê os dados do proprietário.
 */
export async function lerProprietario() {
  return executarTransacao("meta", "readonly", (tx) => {
    const req = tx.objectStore("meta").get("proprietario");
    return req;
  }).then((req) => req.result || null);
}

/**
 * Guarda os dados do proprietário.
 */
export async function guardarProprietario(sessao) {
  return executarTransacao("meta", "readwrite", (tx) => {
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
  });
}

/**
 * Lê o cursor de sincronização de um utilizador.
 * Se não existir, devolve 0.
 */
export async function lerCursor(utilizador) {
  return executarTransacao("meta", "readonly", (tx) => {
    const chave = `cursor:${utilizador}`;
    return tx.objectStore("meta").get(chave);
  }).then((req) => req.result?.valor ?? 0);
}

/**
 * Aplica as alterações e guarda o cursor na mesma transação.
 */
export async function aplicarAlteracoes(utilizador, alteracoes, cursor) {
  return executarTransacao(
    ["sugestoes", "meta"],
    "readwrite",
    (tx) => {
      const storeSugestoes = tx.objectStore("sugestoes");
      const storeMeta = tx.objectStore("meta");

      for (const sugestao of alteracoes) {
        storeSugestoes.put(sugestao);
      }

      const chave = `cursor:${utilizador}`;

      storeMeta.put(
        {
          chave,
          valor: cursor
        },
        chave
      );
    }
  );
}

/**
 * Limpa todas as lojas, incluindo o proprietário e os cursores.
 */
export async function limparBD() {
  return executarTransacao(
    ["sugestoes", "pendentes", "meta"],
    "readwrite",
    (tx) => {
      tx.objectStore("sugestoes").clear();
      tx.objectStore("pendentes").clear();
      tx.objectStore("meta").clear();
    }
  );
}
