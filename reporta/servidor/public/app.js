// Tempo de espera, em milissegundos, depois de `falhas` falhas seguidas (1, 2, 3...)
function tempoDeEspera(falhas) {
  const segundos = [1, 2, 4, 8, 16, 32, 60];
  const base = segundos[Math.min(falhas, segundos.length) - 1];
  const variacao = 0.7 + Math.random() * 0.6; // entre 70 % e 130 % do valor base
  return Math.round(base * variacao * 1000);
}

const CATEGORIAS_OMISSAO = [
  { id: 'buraco', nome: 'Buraco no pavimento', raio: 15 },
  { id: 'semaforo', nome: 'Semaforo avariado', raio: 40 },
  { id: 'iluminacao', nome: 'Iluminacao publica', raio: 20 },
  { id: 'sinalizacao', nome: 'Sinalizacao danificada', raio: 20 },
  { id: 'outro', nome: 'Outro problema', raio: 10 }
];

let cidadaoAtual = null;
let falhasSeguidas = 0;
let temporizadorBackoff = null;

function registarLogSync(texto) {
  const hora = new Date().toLocaleTimeString('pt-PT', { hour12: false });
  const linha = `[${hora}] ${texto}`;
  console.log('[Reporta Sync]', linha);

  const listaLog = document.getElementById('log-sincronizacao');
  if (listaLog) {
    const li = document.createElement('li');
    li.textContent = linha;
    listaLog.prepend(li);
  }
}

function mostrarBanner(mensagem) {
  const banner = document.getElementById('aviso-sync');
  if (!banner) return;
  banner.textContent = mensagem;
  banner.classList.remove('oculto');
  clearTimeout(banner._timer);
  banner._timer = setTimeout(() => {
    banner.classList.add('oculto');
  }, 5000);
}

function atualizarIndicadorRede() {
  const el = document.getElementById('estado-rede');
  if (!el) return;
  if (navigator.onLine) {
    el.textContent = 'Com ligacao';
    el.classList.remove('offline');
  } else {
    el.textContent = 'Sem ligacao (offline)';
    el.classList.add('offline');
  }
}

// --- Gestao de sessao OAuth 2.0 + identidade do dispositivo ---

function atualizarUISessao(sessao) {
  const labelId = document.getElementById('label-identidade');
  const btnGithub = document.getElementById('btn-login-github');
  const btnGoogle = document.getElementById('btn-login-google');
  const btnLogout = document.getElementById('btn-logout');

  if (!labelId) return;

  if (sessao && sessao.autenticado) {
    labelId.innerHTML = `Conta (${sessao.fornecedor}): <strong>${sessao.nome}</strong> (<code>${sessao.cidadao}</code>)`;
    if (btnGithub) btnGithub.classList.add('oculto');
    if (btnGoogle) btnGoogle.classList.add('oculto');
    if (btnLogout) btnLogout.classList.remove('oculto');
  } else {
    labelId.innerHTML = `ID Dispositivo: <code>${cidadaoAtual}</code>`;
    if (btnLogout) btnLogout.classList.add('oculto');
    const disponiveis = (sessao && sessao.fornecedores) || ['github'];
    if (btnGithub) btnGithub.classList.toggle('oculto', disponiveis.length > 0 && !disponiveis.includes('github'));
    if (btnGoogle) btnGoogle.classList.toggle('oculto', !disponiveis.includes('google'));
  }
}

async function sincronizarEstadoSessao() {
  const dispositivoId = await obterOuCriarDispositivoId();
  const sessaoGuardada = await lerMeta('sessao');
  const avisoExpirada = document.getElementById('aviso-sessao-expirada');

  if (!navigator.onLine) {
    if (sessaoGuardada && sessaoGuardada.autenticado) {
      cidadaoAtual = sessaoGuardada.cidadao;
      atualizarUISessao(sessaoGuardada);
    } else {
      cidadaoAtual = dispositivoId;
      await gravarMeta('cidadao', cidadaoAtual);
      atualizarUISessao({ autenticado: false });
    }
    return;
  }

  try {
    const resp = await fetch('/v1/sessao', { credentials: 'same-origin' });
    if (resp.ok) {
      const dados = await resp.json();
      if (dados.autenticado) {
        cidadaoAtual = dados.cidadao;
        await gravarMeta('cidadao', cidadaoAtual);
        await gravarMeta('sessao', dados);
        if (avisoExpirada) avisoExpirada.classList.add('oculto');
        atualizarUISessao(dados);
        return;
      }

      if (sessaoGuardada && sessaoGuardada.autenticado) {
        cidadaoAtual = sessaoGuardada.cidadao;
        if (avisoExpirada) avisoExpirada.classList.remove('oculto');
        atualizarUISessao({ autenticado: false, fornecedores: dados.fornecedores });
        return;
      }

      cidadaoAtual = dispositivoId;
      await gravarMeta('cidadao', cidadaoAtual);
      atualizarUISessao(dados);
      return;
    }
  } catch (_) {}

  cidadaoAtual = (sessaoGuardada && sessaoGuardada.cidadao) || dispositivoId;
  atualizarUISessao(sessaoGuardada || { autenticado: false });
}

// --- Carregamento de categorias (rede -> IndexedDB meta -> omissao) ---

async function obterCategorias() {
  if (navigator.onLine) {
    try {
      const resp = await fetch('/v1/categorias');
      if (resp.ok) {
        const lista = await resp.json();
        await guardarCategorias(lista);
        return lista;
      }
    } catch (_) {}
  }

  const guardadas = await lerCategorias();
  if (guardadas.length > 0) return guardadas;

  await guardarCategorias(CATEGORIAS_OMISSAO);
  return CATEGORIAS_OMISSAO;
}

// --- Sincronizacao e Plano B ---

function agendarNovaTentativaPlanoB() {
  if (temporizadorBackoff) return;
  falhasSeguidas += 1;
  const esperaMs = tempoDeEspera(falhasSeguidas);
  registarLogSync(`Falha #${falhasSeguidas}. Nova tentativa agendada em ${esperaMs} ms.`);

  temporizadorBackoff = setTimeout(() => {
    temporizadorBackoff = null;
    pedirSync(true);
  }, esperaMs);
}

async function pedirSync(forcarPlanoB = false) {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registo = await navigator.serviceWorker.ready;

    if ('sync' in registo && !forcarPlanoB) {
      await registo.sync.register('sincronizar-reporta');
      registarLogSync('Sincronizacao registada via Background Sync (sincronizar-reporta).');
    } else if (registo.active) {
      registo.active.postMessage({ tipo: 'sincronizar' });
      registarLogSync('Pedido de sincronizacao enviado ao Service Worker via postMessage.');
    }
  } catch (err) {
    registarLogSync(`Erro ao pedir sincronizacao: ${err.message}`);
  }
}

// --- Renderizacao da vista "As minhas comunicacoes" ---

async function atualizarListaComunicacoes() {
  if (!cidadaoAtual) return;

  const contentor = document.getElementById('lista-comunicacoes');
  const badgePendentes = document.getElementById('contador-pendentes');
  if (!contentor) return;

  const [pendentes, minhas, ocorrencias] = await Promise.all([
    lerTodasPendentes(),
    lerMinhasDe(null),
    lerTodasOcorrencias()
  ]);

  const mapaOcorrencias = new Map(ocorrencias.map((o) => [o.id, o]));
  const pendentesPorEnviar = pendentes.filter((p) => !p.erro).length;

  if (pendentesPorEnviar > 0) {
    badgePendentes.textContent = `${pendentesPorEnviar} por enviar`;
    badgePendentes.classList.remove('oculto');
  } else {
    badgePendentes.classList.add('oculto');
  }

  contentor.innerHTML = '';

  if (pendentes.length === 0 && minhas.length === 0) {
    contentor.innerHTML = '<p class="vazio">Ainda nao efetuou nenhuma comunicacao neste dispositivo.</p>';
    return;
  }

  for (const p of [...pendentes].reverse()) {
    const card = document.createElement('article');
    card.className = 'item-comunicacao';

    const categoria = (p.dados && p.dados.categoria) || 'ocorrencia';
    const descricao = (p.dados && (p.dados.descricao || p.dados.comentario)) || '(Sem descricao)';
    const eErro410 = Boolean(p.erro && p.erro.includes('[410]'));

    const etiquetaTexto = p.erro
      ? `Erro: ${p.erro}`
      : `Por enviar (${p.tentativas || 0} ${p.tentativas === 1 ? 'tentativa' : 'tentativas'})`;
    const etiquetaClasse = p.erro ? 'sync-erro' : 'sync-pendente';

    card.innerHTML = `
      <div class="item-topo">
        <span class="item-categoria">${categoria} ${p.tipo === 'reforco' ? `(Reforco a n.º ${p.dados.ocorrenciaId})` : ''}</span>
        <span class="etiqueta-sync ${etiquetaClasse}">${etiquetaTexto}</span>
      </div>
      <p class="item-descricao">${descricao}</p>
      <div class="item-rodape">
        <span>Registada localmente em ${new Date(p.criadaEm).toLocaleString('pt-PT')}</span>
        <span class="estado-ocorrencia">local</span>
      </div>
    `;

    if (eErro410) {
      const acoes410 = document.createElement('div');
      acoes410.className = 'acoes-erro-410';
      acoes410.innerHTML = `
        <span class="ajuda">Esta ocorrencia ja foi resolvida no servidor. O que pretende fazer?</span>
        <button type="button" class="btn-primario btn-pequeno btn-criar-nova-410">Comunicar como nova ocorrencia</button>
        <button type="button" class="btn-secundario btn-pequeno btn-descartar-410">Descartar</button>
      `;

      acoes410.querySelector('.btn-criar-nova-410').addEventListener('click', async () => {
        const lat = Number(document.getElementById('lat').value) || 40.281;
        const lng = Number(document.getElementById('lng').value) || -7.504;
        const precisao = Number(document.getElementById('precisao').value) || 15;

        await removerPendente(p.idLocal);
        await registarNovaPendente({
          tipo: 'ocorrencia',
          dados: {
            categoria: p.dados.categoria || 'buraco',
            descricao: p.dados.descricao || p.dados.comentario || 'Nova comunicacao apos resolucao anterior',
            localizacao: { lat, lng, precisao },
            recusadas: [p.dados.ocorrenciaId]
          },
          fotografia: null
        });
      });

      acoes410.querySelector('.btn-descartar-410').addEventListener('click', async () => {
        await removerPendente(p.idLocal);
        await atualizarListaComunicacoes();
      });

      card.appendChild(acoes410);
    }

    contentor.appendChild(card);
  }

  for (const m of minhas) {
    const oc = mapaOcorrencias.get(m.ocorrenciaId);
    const totalCom = oc ? oc.comunicacoes : 1;
    const estadoAtual = oc ? oc.estado : 'aberta';
    const categoria = (oc && oc.categoria) || m.categoria || 'ocorrencia';
    const descricao = m.descricao || (oc && oc.descricao) || '';

    let textoResultado;
    let classeResultado;

    if (m.resultado === 'criada') {
      textoResultado = `Criada — n.º ${m.ocorrenciaId}`;
      classeResultado = 'sync-criada';
    } else if (m.resultado === 'reforcada') {
      textoResultado = `Juntada à n.º ${m.ocorrenciaId} (${totalCom} ${totalCom === 1 ? 'comunicacao' : 'comunicacoes'})`;
      classeResultado = 'sync-reforcada';
    } else {
      textoResultado = `Ja tinha comunicado — n.º ${m.ocorrenciaId} (${totalCom} ${totalCom === 1 ? 'comunicacao' : 'comunicacoes'})`;
      classeResultado = 'sync-reforcada';
    }

    const card = document.createElement('article');
    card.className = 'item-comunicacao';
    card.innerHTML = `
      <div class="item-topo">
        <span class="item-categoria">${categoria}</span>
        <span class="etiqueta-sync ${classeResultado}">${textoResultado}</span>
      </div>
      <p class="item-descricao">${descricao}</p>
      <div class="item-rodape">
        <span>Sincronizada em ${new Date(m.enviadaEm).toLocaleString('pt-PT')}</span>
        <span class="estado-ocorrencia ${estadoAtual}">Estado: ${estadoAtual}</span>
      </div>
    `;

    contentor.appendChild(card);
  }
}

async function registarNovaPendente(objetoPendente) {
  await acrescentarPendente(objetoPendente, cidadaoAtual);
  await atualizarListaComunicacoes();
  mostrarBanner('Comunicacao guardada no dispositivo. A sincronizar...');
  await pedirSync();
}

// --- Arranque da aplicacao ---

async function iniciarAplicacao() {
  atualizarIndicadorRede();
  window.addEventListener('online', () => {
    atualizarIndicadorRede();
    pedirSync();
    carregarOcorrenciasNoMapa();
  });
  window.addEventListener('offline', atualizarIndicadorRede);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pedirSync();
    }
  });

  await sincronizarEstadoSessao();

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');

      navigator.serviceWorker.addEventListener('message', async (evento) => {
        const msg = evento.data;
        if (!msg) return;

        if (msg.tipo === 'sincronizado') {
          falhasSeguidas = 0;
          if (temporizadorBackoff) {
            clearTimeout(temporizadorBackoff);
            temporizadorBackoff = null;
          }

          registarLogSync(
            `Sincronizado: criadas=${msg.criadas}, reforcadas=${msg.reforcadas}, recusadas=${msg.recusadas}, recebidas=${msg.recebidas}, porEnviar=${msg.porEnviar}`
          );

          await atualizarListaComunicacoes();
          await carregarOcorrenciasNoMapa();

          if (msg.criadas > 0 || msg.reforcadas > 0 || msg.recebidas > 0) {
            mostrarBanner('Sincronizacao concluida com sucesso.');
          }
        } else if (msg.tipo === 'sessao-expirada') {
          registarLogSync('Sincronizacao pausada: sessao OAuth expirada (401).');
          const avisoExpirada = document.getElementById('aviso-sessao-expirada');
          if (avisoExpirada) avisoExpirada.classList.remove('oculto');
          await atualizarListaComunicacoes();
        } else if (msg.tipo === 'erro-sincronizacao') {
          await atualizarListaComunicacoes();
          const reg = await navigator.serviceWorker.ready;
          if (!('sync' in reg)) {
            agendarNovaTentativaPlanoB();
          } else {
            registarLogSync(`Erro na sincronizacao (Chromium gerira nova tentativa): ${msg.erro}`);
          }
        }
      });
    } catch (err) {
      console.error('Falha ao registar Service Worker:', err);
    }
  }

  const btnSync = document.getElementById('btn-sincronizar-agora');
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      pedirSync(true);
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await fetch('/v1/sessao', { method: 'DELETE', credentials: 'same-origin' });
      } catch (_) {}
      await gravarMeta('sessao', null);
      const dispositivoId = await obterOuCriarDispositivoId();
      cidadaoAtual = dispositivoId;
      await gravarMeta('cidadao', cidadaoAtual);
      const avisoExpirada = document.getElementById('aviso-sessao-expirada');
      if (avisoExpirada) avisoExpirada.classList.add('oculto');
      atualizarUISessao({ autenticado: false });
      await atualizarListaComunicacoes();
      mostrarBanner('Sessao terminada.');
    });
  }

  const categorias = await obterCategorias();
  inicializarFormulario(categorias);
  await atualizarListaComunicacoes();

  // Sincronizar ao arrancar a aplicacao
  await pedirSync();
}

window.ReportaApp = {
  registarNovaPendente,
  atualizarListaComunicacoes,
  pedirSync
};

document.addEventListener('DOMContentLoaded', iniciarAplicacao);