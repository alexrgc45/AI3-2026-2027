// Converte um Blob guardado em IndexedDB para Data URL JPEG (esperado pela API)
async function blobParaDataUrl(blob) {
  if (!blob) return null;
  if (typeof blob === 'string') return blob;

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = '';
  const bloco = 0x8000;

  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + bloco));
  }

  const tipo = blob.type || 'image/jpeg';
  return `data:${tipo};base64,${btoa(binario)}`;
}

async function enviarUmaPendente(pendente) {
  await registarTentativa(pendente.idLocal);

  const cabecalhos = {
    'Content-Type': 'application/json',
    'X-Cidadao': pendente.cidadao,
    'Idempotency-Key': pendente.chave
  };

  let url;
  let corpo;

  if (pendente.tipo === 'reforco') {
    url = `/v1/ocorrencias/${pendente.dados.ocorrenciaId}/reforcos`;
    corpo = {
      comentario: pendente.dados.comentario || ''
    };
  } else {
    url = '/v1/ocorrencias';
    const fotografiaDataUrl = await blobParaDataUrl(pendente.fotografia);
    corpo = {
      categoria: pendente.dados.categoria,
      descricao: pendente.dados.descricao,
      localizacao: pendente.dados.localizacao,
      fotografia: fotografiaDataUrl,
      recusadas: pendente.dados.recusadas || []
    };
  }

  return fetch(url, {
    method: 'POST',
    headers: cabecalhos,
    credentials: 'same-origin',
    body: JSON.stringify(corpo)
  });
}

async function executarSincronizacao() {
  const cidadao = await lerMeta('cidadao');
  if (!cidadao) {
    return {
      tipo: 'sincronizado',
      criadas: 0,
      reforcadas: 0,
      recusadas: 0,
      recebidas: 0,
      porEnviar: 0
    };
  }

  let criadas = 0;
  let reforcadas = 0;
  let recusadas = 0;
  let recebidas = 0;

  // Ler pendentes ativas (sem erro definitivo 4xx) ordenadas por idLocal
  const todasPendentes = await lerPendentesDe(cidadao);
  const filaAtiva = todasPendentes.filter((p) => !p.erro);

  for (const pendente of filaAtiva) {
    let resposta;
    try {
      resposta = await enviarUmaPendente(pendente);
    } catch (erroRede) {
      // Falha de rede: para com erro sem remover a pendente
      throw new Error('Falha de ligacao ao enviar pendentes.');
    }

    if (resposta.status === 201 || resposta.status === 200) {
      const dados = await resposta.json();
      await confirmarPendente(pendente.idLocal, dados.resultado, dados.ocorrencia);

      if (dados.resultado === 'criada') {
        criadas += 1;
      } else {
        reforcadas += 1;
      }
    } else if (
      resposta.status === 400 ||
      resposta.status === 404 ||
      resposta.status === 409 ||
      resposta.status === 410
    ) {
      // Erro definitivo do pedido: marca com erro e continua para a pendente seguinte
      let detalhe = `Erro ${resposta.status}`;
      try {
        const errJson = await resposta.json();
        if (errJson && errJson.erro) {
          detalhe = resposta.status === 410 ? `[410] ${errJson.erro}` : errJson.erro;
        }
      } catch (_) {}

      await marcarErro(pendente.idLocal, detalhe);
      recusadas += 1;
    } else if (resposta.status === 401) {
      // Sessao expirada ou identidade invalida: para sem erro para nao gastar tentativas
      const restantes = (await lerPendentesDe(cidadao)).filter((p) => !p.erro).length;
      return {
        tipo: 'sincronizado',
        criadas,
        reforcadas,
        recusadas,
        recebidas: 0,
        porEnviar: restantes
      };
    } else {
      // 5xx (ex: 503): para com erro para voltar a tentar com backoff
      throw new Error(`Servidor respondeu com estado ${resposta.status}.`);
    }
  }

  // Verificar se a fila ativa ficou vazia antes de fazer o pull
  const porEnviar = (await lerPendentesDe(cidadao)).filter((p) => !p.erro).length;

  if (porEnviar === 0) {
    const desde = await lerCursor(cidadao);
    let respPull;
    try {
      respPull = await fetch(`/v1/ocorrencias/alteracoes?desde=${desde}`, {
        headers: { 'X-Cidadao': cidadao },
        credentials: 'same-origin'
      });
    } catch (erroRede) {
      throw new Error('Falha de ligacao ao obter alteracoes.');
    }

    if (respPull.status === 401) {
      return {
        tipo: 'sincronizado',
        criadas,
        reforcadas,
        recusadas,
        recebidas: 0,
        porEnviar: 0
      };
    }

    if (!respPull.ok) {
      throw new Error(`Erro ${respPull.status} ao obter alteracoes.`);
    }

    const dadosPull = await respPull.json();
    const alteracoes = Array.isArray(dadosPull.alteracoes) ? dadosPull.alteracoes : [];
    const novoCursor = typeof dadosPull.cursor === 'number' ? dadosPull.cursor : desde;

    await aplicarAlteracoes(cidadao, alteracoes, novoCursor);
    recebidas = alteracoes.length;
  }

  return {
    tipo: 'sincronizado',
    criadas,
    reforcadas,
    recusadas,
    recebidas,
    porEnviar
  };
}

async function executarSincronizacao() {
  const cidadao = await lerMeta('cidadao');
  if (!cidadao) {
    return {
      tipo: 'sincronizado',
      criadas: 0,
      reforcadas: 0,
      recusadas: 0,
      recebidas: 0,
      porEnviar: 0
    };
  }

  let criadas = 0;
  let reforcadas = 0;
  let recusadas = 0;
  let recebidas = 0;

  const todasPendentes = await lerTodasPendentes();
  const filaAtiva = todasPendentes.filter((p) => !p.erro);

  for (const pendente of filaAtiva) {
    let resposta;
    try {
      resposta = await enviarUmaPendente(pendente);
    } catch (erroRede) {
      throw new Error('Falha de ligacao ao enviar pendentes.');
    }

    if (resposta.status === 201 || resposta.status === 200) {
      const dados = await resposta.json();
      await confirmarPendente(pendente.idLocal, dados.resultado, dados.ocorrencia);

      if (dados.resultado === 'criada') {
        criadas += 1;
      } else {
        reforcadas += 1;
      }
    } else if (
      resposta.status === 400 ||
      resposta.status === 404 ||
      resposta.status === 409 ||
      resposta.status === 410
    ) {
      let detalhe = `Erro ${resposta.status}`;
      try {
        const errJson = await resposta.json();
        if (errJson && errJson.erro) {
          detalhe = resposta.status === 410 ? `[410] ${errJson.erro}` : errJson.erro;
        }
      } catch (_) {}

      await marcarErro(pendente.idLocal, detalhe);
      recusadas += 1;
    } else if (resposta.status === 401) {
      // Sessao expirada: para a sincronizacao sem apagar nem marcar erro na pendente
      const restantes = (await lerTodasPendentes()).filter((p) => !p.erro).length;
      return {
        tipo: 'sessao-expirada',
        criadas,
        reforcadas,
        recusadas,
        recebidas: 0,
        porEnviar: restantes
      };
    } else {
      throw new Error(`Servidor respondeu com estado ${resposta.status}.`);
    }
  }

  const porEnviar = (await lerTodasPendentes()).filter((p) => !p.erro).length;

  if (porEnviar === 0) {
    const desde = await lerCursor(cidadao);
    let respPull;
    try {
      respPull = await fetch(`/v1/ocorrencias/alteracoes?desde=${desde}`, {
        headers: { 'X-Cidadao': cidadao },
        credentials: 'same-origin'
      });
    } catch (erroRede) {
      throw new Error('Falha de ligacao ao obter alteracoes.');
    }

    if (respPull.status === 401) {
      return {
        tipo: 'sessao-expirada',
        criadas,
        reforcadas,
        recusadas,
        recebidas: 0,
        porEnviar: 0
      };
    }

    if (!respPull.ok) {
      throw new Error(`Erro ${respPull.status} ao obter alteracoes.`);
    }

    const dadosPull = await respPull.json();
    const alteracoes = Array.isArray(dadosPull.alteracoes) ? dadosPull.alteracoes : [];
    const novoCursor = typeof dadosPull.cursor === 'number' ? dadosPull.cursor : desde;

    await aplicarAlteracoes(cidadao, alteracoes, novoCursor);
    recebidas = alteracoes.length;
  }

  return {
    tipo: 'sincronizado',
    criadas,
    reforcadas,
    recusadas,
    recebidas,
    porEnviar
  };
}