// public/app.js
import { CONFIG } from "./configuracoes.js";
// Assumindo funções auxiliares exportadas destes módulos:
// import { apagarBD, getProprietarioLocal, guardarProprietarioLocal } from "./bd.js";
// import { getPendentesCount, enviarPendentes } from "./pendentes.js";

let timerExpiracao = null;

/**
 * 1. Função central para mudança de estado da interface.
 * Guarda no dataset do body e oculta/mostra as áreas via atributo [hidden].
 */
export function mudarEstado(estado) {
  document.body.dataset.estado = estado;

  const zonas = document.querySelectorAll("main > section, form[data-estado]");
  zonas.forEach(zona => {
    if (zona.dataset.estado === estado || zona.id === estado) {
      zona.removeAttribute("hidden");
    } else {
      zona.setAttribute("hidden", "true");
    }
  });

  atualizarIndicadorLigacao();
}

function atualizarIndicadorLigacao() {
  const indicador = document.querySelector("#estado-ligacao");
  if (indicador) {
    if (navigator.onLine) {
      indicador.textContent = "Ligado à rede";
      indicador.className = "online";
    } else {
      indicador.textContent = "Sem ligação (Offline)";
      indicador.className = "offline";
    }
  }
}

/**
 * 2. Arranque da aplicação
 */
export async function arranque() {
  console.log("A usar API Base URL:", CONFIG.API_BASE_URL);

  // Registar o Service Worker
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
      console.log("Service Worker registado com sucesso.");
    } catch (err) {
      console.error("Falha ao registar o Service Worker:", err);
    }
  }

  mudarEstado("a-verificar");

  try {
    const resposta = await fetch(`${CONFIG.API_BASE_URL}/sessao`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      credentials: "include"
    });

    if (resposta.status === 200) {
      const dadosSessao = await resposta.json();
      iniciarSessaoUI(dadosSessao);
    } else if (resposta.status === 401) {
      mudarEstado("sem-sessao");
    } else {
      mudarEstado("sem-sessao");
    }
  } catch (erro) {
    mudarEstado("sem-ligacao");
  }
}

/**
 * 3. Entrar (Submissão do formulário de login)
 */
export async function configurarFormularioLogin() {
  const formLogin = document.querySelector("#form-login");
  if (!formLogin) return;

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btnSubmeter = formLogin.querySelector("button[type='submit']");
    const textoOriginalBtn = btnSubmeter.textContent;
    const inputUtilizador = formLogin.querySelector("#utilizador");
    const inputPalavraPasse = formLogin.querySelector("#palavraPasse");
    const containerErro = formLogin.querySelector(".erro-mensagem");

    btnSubmeter.disabled = true;
    btnSubmeter.textContent = "A entrar…";
    if (containerErro) containerErro.textContent = "";

    const credenciais = {
      utilizador: inputUtilizador.value,
      palavraPasse: inputPalavraPasse.value
    };

    try {
      const resposta = await fetch(`${CONFIG.API_BASE_URL}/sessao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credenciais),
        credentials: "include"
      });

      if (resposta.status === 200) {
        const dadosSessao = await resposta.json();
        
        // Verificação de proprietário local (etapa 17)
        // const proprietarioAtual = await getProprietarioLocal();
        // if (proprietarioAtual && proprietarioAtual !== dadosSessao.utilizador) {
        //   await apagarBD();
        // }
        // await guardarProprietarioLocal(dadosSessao.utilizador);

        iniciarSessaoUI(dadosSessao);
        
        const tituloSessao = document.querySelector("#com-sessao h2");
        if (tituloSessao) tituloSessao.focus();

      } else if (resposta.status === 400 || resposta.status === 401) {
        const erroJson = await resposta.json();
        if (containerErro) containerErro.textContent = erroJson.mensagem || "Erro de autenticação.";
        inputPalavraPasse.value = "";
        inputPalavraPasse.focus();
      }
    } catch (erro) {
      mudarEstado("sem-ligacao");
      const aviso = document.querySelector("#aviso-sem-ligacao");
      if (aviso) aviso.textContent = "Sem ligação: não é possível entrar.";
    } finally {
      btnSubmeter.disabled = false;
      btnSubmeter.textContent = textoOriginalBtn;
    }
  });
}

/**
 * 4. Expiração da Sessão
 */
function iniciarSessaoUI(sessao) {
  mudarEstado("com-sessao");

  if (timerExpiracao) clearInterval(timerExpiracao);

  const dataExpiracao = new Date(sessao.expiracao).getTime();
  const elemTempoRestante = document.querySelector("#tempo-restante");

  timerExpiracao = setInterval(() => {
    const agora = Date.now();
    const restante = dataExpiracao - agora;

    if (restante <= 0) {
      clearInterval(timerExpiracao);
      expirarSessao("A sessão expirou. Entre de novo.");
      return;
    }

    if (elemTempoRestante) {
      const segundosTotais = Math.floor(restante / 1000);
      const mins = Math.floor(segundosTotais / 60);
      const segs = segundosTotais % 60;
      elemTempoRestante.textContent = `${mins}m ${segs < 10 ? '0' : ''}${segs}s`;
    }
  }, 1000);
}

export function expirarSessao(mensagem) {
  if (timerExpiracao) clearInterval(timerExpiracao);
  mudarEstado("sem-sessao");
  const containerErro = document.querySelector("#sem-sessao .erro-mensagem");
  if (containerErro) containerErro.textContent = mensagem;
  // Nota: Conforme especificado, não se apagam o rascunho, as pendentes nem a cópia local.
}

/**
 * 5. Terminar sessão
 */
export async function configurarTerminarSessao() {
  const btnTerminar = document.querySelector("#btn-terminar-sessao");
  const dialogConfirmacao = document.querySelector("#dialog-confirmacao-terminar");

  if (!btnTerminar) return;

  if (!navigator.onLine) {
    btnTerminar.disabled = true;
    btnTerminar.title = "Indisponível offline: não é possível terminar sessão sem ligação.";
  }

  btnTerminar.addEventListener("click", async () => {
    // const numPendentes = await getPendentesCount();
    const numPendentes = 0; // Substituir pela contagem real quando integrado com pendentes.js

    if (numPendentes > 0 && dialogConfirmacao) {
      const textoDialog = dialogConfirmacao.querySelector(".dialog-texto");
      if (textoDialog) {
        textoDialog.textContent = `Há ${numPendentes} sugestões por enviar, que serão apagadas. Terminar sessão?`;
      }
      
      dialogConfirmacao.showModal();

      const confirmado = await new Promise((resolve) => {
        const fecharHandler = () => {
          dialogConfirmacao.removeEventListener("close", fecharHandler);
          resolve(dialogConfirmacao.returnValue === "default");
        };
        dialogConfirmacao.addEventListener("close", fecharHandler, { once: true });
      });

      if (!confirmado) return; // Se escolheu cancelar / não, aborta o término
    }

    await executarTerminarSessao();
  });
}

async function executarTerminarSessao() {
  try {
    const resposta = await fetch(`${CONFIG.API_BASE_URL}/sessao`, {
      method: "DELETE",
      credentials: "include"
    });

    if (resposta.status === 204) {
      // await apagarBD();
      // localStorage.removeItem("rascunho");
      mudarEstado("sem-sessao");
      
      const inputUtilizador = document.querySelector("#utilizador");
      if (inputUtilizador) inputUtilizador.focus();
    }
  } catch (erro) {
    console.error("Erro ao terminar sessão:", erro);
  }
}

/**
 * 6. Gestão de Ligação (Online / Offline)
 */
export function configurarEventosRede() {
  window.addEventListener("online", async () => {
    atualizarIndicadorLigacao();
    try {
      const resposta = await fetch(`${CONFIG.API_BASE_URL}/sessao`, {
        method: "GET",
        credentials: "include"
      });
      if (resposta.status === 200) {
        // Se houver sessão ativa, enviar pendentes
        // await enviarPendentes();
      }
    } catch (err) {
      console.error("Erro ao revalidar sessão após ficar online:", err);
    }
  });

  window.addEventListener("offline", () => {
    atualizarIndicadorLigacao();
    // A decisão de passar a sem-ligacao resulta exclusivamente de um fetch rejeitado.
  });
}



export async function detetarAtualizacaoServiceWorker() {
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    // Se já houver um worker em espera ao abrir a página
    if (reg.waiting) {
      mostrarBotaoAtualizacao(reg.waiting);
    }

    // Detetar novo worker a instalar que passe a "waiting"
    reg.addEventListener("updatefound", () => {
      const novoWorker = reg.installing;
      if (novoWorker) {
        novoWorker.addEventListener("statechange", () => {
          if (novoWorker.state === "installed" && navigator.serviceWorker.controller) {
            mostrarBotaoAtualizacao(novoWorker);
          }
        });
      }
    });

    // Recarregar a página automaticamente no evento controllerchange
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

function mostrarBotaoAtualizacao(worker) {
  const container = document.querySelector("#atualizacao-container");
  if (!container) return;

  container.innerHTML = `<button id="btn-atualizar-app">Atualizar a aplicação</button>`;
  container.removeAttribute("hidden");

  const btn = container.querySelector("#btn-atualizar-app");
  btn.addEventListener("click", () => {
    // Envia ao service worker a mensagem { tipo: 'ativar' }
    worker.postMessage({ tipo: "ativar" });
  });
}

import { 
  substituirSugestoes, 
  lerSugestoes, 
  lerPendentes, 
  acrescentarPendente, 
  descartarPendente, 
  lerProprietario, 
  guardarProprietario 
} from "./bd.js";
import { enviarPendentes } from "./pendentes.js";

// Configuração de ordenação atual (ex: "recentes" ou "estado")
let ordenacaoAtual = "recentes";

/**
 * 8. Carregar Categorias e configurar o formulário de Nova Sugestão
 */
export async function configurarFormularioSugestao() {
  const selectCategoria = document.querySelector("#categoria-sugestao");
  const formSugestao = document.querySelector("#form-nova-sugestao");
  const avisoCategorias = document.querySelector("#aviso-categorias");

  if (!selectCategoria || !formSugestao) return;

  try {
    const resposta = await fetch(`${CONFIG.API_BASE_URL}/categorias`);
    if (resposta.ok) {
      const categorias = await resposta.json();
      selectCategoria.innerHTML = "";
      categorias.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.codigo;
        opt.textContent = cat.descricao;
        selectCategoria.appendChild(opt);
      });
      formSugestao.removeAttribute("disabled");
      if (avisoCategorias) avisoCategorias.textContent = "";
    } else {
      throw new Error("Falha ao obter categorias");
    }
  } catch (err) {
    // Sem categorias (nem rede nem cache) -> desativar formulário com explicação
    formSugestao.setAttribute("disabled", "true");
    if (avisoCategorias) {
      avisoCategorias.textContent = "Formulário indisponível: não foi possível carregar as categorias.";
    }
  }

  // Submissão de nova sugestão
  formSugestao.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = formSugestao.querySelector("#titulo").value;
    const descricao = formSugestao.querySelector("#descricao").value;
    const categoria = selectCategoria.value;

    const dadosNova = { titulo, descricao, categoria };
    const prop = await lerProprietario();
    const utilizador = prop ? prop.utilizador : "desconhecido";

    try {
      const resposta = await fetch(`${CONFIG.API_BASE_URL}/sugestoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosNova),
        credentials: "include"
      });

      if (resposta.status === 201) {
        const sugestaoCriada = await resposta.json();
        // Guardar na loja sugestoes
        await substituirSugestoes([...await lerSugestoes(ordenacaoAtual), sugestaoCriada]);
        localStorage.removeItem("rascunho");
        formSugestao.reset();
        atualizarListagemUI();
      } else {
        throw new Error("Erro no envio");
      }
    } catch (err) {
      // Em sem-ligacao ou fetch rejeitado -> guardar como pendente
      await acrescentarPendente(dadosNova, utilizador);
      localStorage.removeItem("rascunho");
      formSugestao.reset();
      atualizarListagemUI();
    }
  });
}

/**
 * 5. & 7. Atualização e Renderização da Listagem a partir da IndexedDB
 */
export async function atualizarListagemUI() {
  const containerLista = document.querySelector("#lista-sugestoes");
  const elemAtualizadoEm = document.querySelector("#atualizado-em");
  const prop = await lerProprietario();

  if (!containerLista) return;
  containerLista.innerHTML = "";

  // 1. Em com-sessao, tentar fetch GET /v2/sugestoes
  if (navigator.onLine && document.body.dataset.estado === "com-sessao") {
    try {
      const resposta = await fetch(`${CONFIG.API_BASE_URL}/sugestoes`, {
        credentials: "include"
      });
      if (resposta.status === 200) {
        const dados = await resposta.json();
        await substituirSugestoes(dados.itens);
        if (elemAtualizadoEm && dados.atualizadoEm) {
          elemAtualizadoEm.textContent = `Atualizado às ${dados.atualizadoEm}`;
        }
      }
    } catch (err) {
      // Ignora erro de rede para continuar a ler da BD local
    }
  }

  // 2. Ler pendentes e mostrar no topo
  const pendentes = await lerPendentes();
  const minhasPendentes = prop ? pendentes.filter(p => p.utilizador === prop.utilizador) : [];

  minhasPendentes.forEach(p => {
    const card = document.createElement("div");
    card.className = "card-pendente";

    const titulo = document.createElement("h4");
    titulo.textContent = p.titulo; // Uso estrito de textContent contra XSS

    const desc = document.createElement("p");
    desc.textContent = p.descricao;

    const status = document.createElement("span");
    status.className = "status-pendente";
    status.textContent = p.erro ? `Erro: ${p.erro}` : "Por enviar";

    const btnDescartar = document.createElement("button");
    btnDescartar.textContent = "Descartar";
    btnDescartar.addEventListener("click", async () => {
      await descartarPendente(p.idLocal);
      atualizarListagemUI();
    });

    card.appendChild(titulo);
    card.appendChild(desc);
    card.appendChild(status);
    card.appendChild(btnDescartar);
    containerLista.appendChild(card);
  });

  // 3. Ler sugestões da BD local usando a ordenação escolhida
  const sugestoes = await lerSugestoes(ordenacaoAtual);
  sugestoes.forEach(s => {
    const card = document.createElement("div");
    card.className = "card-sugestao";

    const titulo = document.createElement("h4");
    titulo.textContent = s.titulo;

    const desc = document.createElement("p");
    desc.textContent = s.descricao;

    const estado = document.createElement("span");
    estado.textContent = `Estado: ${s.estado}`;

    card.appendChild(titulo);
    card.appendChild(desc);
    card.appendChild(estado);
    containerLista.appendChild(card);
  });
}

/**
 * 7. Tratamento do Estado "Sem Ligação" com validação da expiração do proprietário
 */
export async function verificarEstadoSemLigacao() {
  const prop = await lerProprietario();
  const agora = new Date().getTime();
  const secSemLigacao = document.querySelector("#sem-ligacao");
  const infoLocal = document.querySelector("#info-copia-local");

  if (!secSemLigacao) return;

  if (prop && new Date(prop.expiracao).getTime() > agora) {
    // Mostrar cópia local se o proprietário existir e a expiração não tiver passado
    if (infoLocal) {
      infoLocal.textContent = `Cópia de ${prop.atualizadoEm || '--:--'} — pode estar desatualizada (Utilizador: ${prop.nome})`;
    }
    mudarEstado("com-sessao"); // Mantém visualização da cópia local com aviso
  } else {
    mudarEstado("sem-ligacao");
  }
}