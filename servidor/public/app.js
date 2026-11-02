import { lerConfiguracoes, guardarConfiguracoes } from './configuracoes.js';

const formLogin = document.querySelector("#form-login");
const inputUtilizador = document.querySelector("#utilizador");
const inputPalavraPasse = document.querySelector("#palavra-passe");
const botaoLogin = document.querySelector("#botao-login");
const erroLogin = document.querySelector("#erro-login");
const selectTema = document.querySelector("#select-tema");
const selectOrdenacao = document.querySelector("#select-ordenacao");

const zonaLogin = document.querySelector("#zona-login");
const zonaSessao = document.querySelector("#zona-sessao");
const nomeUtilizador = document.querySelector("#nome-utilizador");
const papelUtilizador = document.querySelector("#papel-utilizador");
const tempoSessao = document.querySelector("#tempo-sessao");
const botaoLogout = document.querySelector("#botao-logout");
const botaoAtualizar = document.querySelector("#botao-atualizar");
const listaSugestoes = document.querySelector("#lista-sugestoes");
const mensagemSugestoes = document.querySelector("#mensagem-sugestoes");

const zonaNovaSugestao = document.querySelector("#zona-nova-sugestao");
const formSugestao = document.querySelector("#form-sugestao");
const inputTitulo = document.querySelector("#titulo-sugestao");
const inputCategoria = document.querySelector("#categoria-sugestao");
const inputDescricao = document.querySelector("#descricao-sugestao");
const erroSugestao = document.querySelector("#erro-sugestao");

let temporizador = null;
let fimSessao = null;

function mostrarErroLogin(mensagem) {
    erroLogin.textContent = mensagem;
    erroLogin.hidden = false;
}

function limparErroLogin() {
    erroLogin.textContent = "";
    erroLogin.hidden = true;
}

function mostrarMensagemSugestoes(mensagem) {
    mensagemSugestoes.textContent = mensagem;
    mensagemSugestoes.hidden = !mensagem;
}

async function lerResposta(resposta) {
    const texto = await resposta.text();
    if (!texto) return {};
    try {
        return JSON.parse(texto);
    } catch {
        return { mensagem: texto };
    }
}

function mensagemErro(dados, alternativa) {
    if (typeof dados.mensagem === "string") return dados.mensagem;
    if (typeof dados.message === "string") return dados.message;
    if (typeof dados.erro === "string") return dados.erro;
    return alternativa;
}

function formatarTempo(segundos) {
    const minutos = Math.floor(segundos / 60);
    const restantes = segundos % 60;
    return `${minutos} min ${String(restantes).padStart(2, "0")} s`;
}

function atualizarContagem() {
    if (!fimSessao) return;
    const segundos = Math.ceil((fimSessao - Date.now()) / 1000);

    if (segundos <= 0) {
        terminarSessaoLocal("Sessão expirada. É necessária nova autenticação.");
        return;
    }

    tempoSessao.textContent = `Tempo restante da sessão: ${formatarTempo(segundos)}`;
}

function iniciarContagem(dataExpiracaoISO) {
    clearInterval(temporizador);
    fimSessao = new Date(dataExpiracaoISO).getTime();
    atualizarContagem();
    temporizador = setInterval(atualizarContagem, 1000);
}

function terminarSessaoLocal(mensagem = "") {
    fimSessao = null;
    clearInterval(temporizador);
    temporizador = null;

    zonaSessao.hidden = true;
    zonaLogin.hidden = false;

    nomeUtilizador.textContent = "";
    papelUtilizador.textContent = "";
    tempoSessao.textContent = "";

    listaSugestoes.replaceChildren();
    mostrarMensagemSugestoes("");

    formLogin.reset();
    limparErroLogin();

    // Apagar o rascunho e esconder o formulário de nova sugestão quando a sessão termina
    sessionStorage.removeItem("rascunhoSugestao");
    if (zonaNovaSugestao) zonaNovaSugestao.hidden = true;
    if (formSugestao) formSugestao.reset();

    if (mensagem) {
        mostrarErroLogin(mensagem);
    }
}

function mostrarSessao(dados) {
    zonaLogin.hidden = true;
    zonaSessao.hidden = false;

    nomeUtilizador.textContent = dados.nome || dados.utilizador || "Utilizador";
    papelUtilizador.textContent = dados.papel || "Não indicado";

    // Apenas mostrar a zona de nova sugestão se for aluno
    if (dados.papel === "aluno") {
        zonaNovaSugestao.hidden = false;
        reporRascunho(); // Repõe o rascunho guardado
    } else {
        zonaNovaSugestao.hidden = true;
    }

    if (dados.expiracao) {
        iniciarContagem(dados.expiracao);
    }
}

// Botão Entrar usa POST /v2/sessao
formLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    limparErroLogin();

    const utilizador = inputUtilizador.value.trim();
    const palavraPasse = inputPalavraPasse.value;

    if (!utilizador || !palavraPasse) {
        mostrarErroLogin("Preenche o utilizador e a palavra-passe.");
        return;
    }

    botaoLogin.disabled = true;
    botaoLogin.textContent = "A autenticar...";

    try {
        const resposta = await fetch("/v2/sessao", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ utilizador, palavraPasse })
        });

        const dados = await lerResposta(resposta);

        if (!resposta.ok) {
            mostrarErroLogin(mensagemErro(dados, "Não foi possível iniciar sessão."));
            return;
        }

        inputPalavraPasse.value = "";
        mostrarSessao(dados);
        await carregarSugestoes();
    } catch {
        mostrarErroLogin("Não foi possível contactar o servidor.");
    } finally {
        botaoLogin.disabled = false;
        botaoLogin.textContent = "Iniciar sessão";
    }
});

async function pedidoAutenticado(url) {
    const resposta = await fetch(url, { cache: "no-store" });

    if (resposta.status === 401) {
        terminarSessaoLocal("Sessão expirada. É necessária nova autenticação.");
        throw new Error("Sessão expirada.");
    }

    return resposta;
}

function obterLista(dados) {
    if (Array.isArray(dados)) return dados;
    for (const chave of ["sugestoes", "itens", "resultados", "items"]) {
        if (Array.isArray(dados[chave])) return dados[chave];
    }
    return [];
}

function criarCampo(texto) {
    const paragrafo = document.createElement("p");
    paragrafo.textContent = texto;
    return paragrafo;
}

function criarCartao(sugestao) {
    const cartao = document.createElement("article");
    cartao.className = "sugestao";

    const titulo = document.createElement("h4");
    titulo.textContent = sugestao.titulo || sugestao.title || "Sugestão";
    cartao.append(titulo);

    const categoria = sugestao.categoria || sugestao.category;
    if (categoria) cartao.append(criarCampo(`Categoria: ${categoria}`));

    const estado = sugestao.estado || sugestao.status;
    if (estado) {
        const etiqueta = document.createElement("p");
        etiqueta.className = "estado";
        etiqueta.textContent = `Estado: ${estado}`;
        cartao.append(etiqueta);
    }

    const descricao = sugestao.descricao || sugestao.description;
    if (descricao) cartao.append(criarCampo(descricao));

    return cartao;
}

async function carregarSugestoes() {
    botaoAtualizar.disabled = true;
    mostrarMensagemSugestoes("A carregar sugestões...");
    listaSugestoes.replaceChildren();

    try {
        const resposta = await pedidoAutenticado("/v2/sugestoes");
        if (!resposta.ok) {
            const dados = await lerResposta(resposta);
            mostrarMensagemSugestoes(mensagemErro(dados, "Não foi possível carregar as sugestões."));
            return;
        }

        const dados = await lerResposta(resposta);
        const sugestoes = obterLista(dados);

        // Ordenação baseada nas configurações guardadas
        const config = lerConfiguracoes();
        sugestoes.sort((a, b) => {
            if (config.ordenacao === "estado") {
                return (a.estado || "").localeCompare(b.estado || "");
            } else {
                return new Date(b.dataCriacao || 0) - new Date(new Date(a.dataCriacao || 0));
            }
        });

        if (sugestoes.length === 0) {
            mostrarMensagemSugestoes("Não existem sugestões para apresentar.");
            return;
        }

        for (const sugestao of sugestoes) {
            listaSugestoes.append(criarCartao(sugestao));
        }

        mostrarMensagemSugestoes("");
    } catch {
        mostrarMensagemSugestoes("Não foi possível carregar as sugestões.");
    } finally {
        botaoAtualizar.disabled = false;
    }
}

// Botão Terminar Sessão usa DELETE /v2/sessao
botaoLogout.addEventListener("click", async () => {
    try {
        await fetch("/v2/sessao", { method: "DELETE" });
    } catch (e) {
        console.error("Erro ao apagar cookie no servidor", e);
    }
    terminarSessaoLocal();
});

botaoAtualizar.addEventListener("click", () => {
    carregarSugestoes();
});

function aplicarTemaVisual(tema) {
    if (tema === "escuro") {
        document.body.style.backgroundColor = "#121212";
        document.body.style.color = "#e0e0e0";
    } else {
        document.body.style.backgroundColor = "#f3f6fb";
        document.body.style.color = "#202b3c";
    }
}

function inicializarConfiguracoes() {
    const config = lerConfiguracoes();

    if (selectTema) selectTema.value = config.tema;
    if (selectOrdenacao) selectOrdenacao.value = config.ordenacao;

    aplicarTemaVisual(config.tema);
}

if (selectTema) {
    selectTema.addEventListener("change", (e) => {
        const configAtual = lerConfiguracoes();
        configAtual.tema = e.target.value;
        guardarConfiguracoes(configAtual);
        aplicarTemaVisual(configAtual.tema);
    });
}

if (selectOrdenacao) {
    selectOrdenacao.addEventListener("change", (e) => {
        const configAtual = lerConfiguracoes();
        configAtual.ordenacao = e.target.value;
        guardarConfiguracoes(configAtual);
        carregarSugestoes();
    });
}

// Guardar rascunho no sessionStorage enquanto o aluno escreve
function guardarRascunho() {
    const rascunho = {
        titulo: inputTitulo.value,
        categoria: inputCategoria.value,
        descricao: inputDescricao.value
    };
    sessionStorage.setItem("rascunhoSugestao", JSON.stringify(rascunho));
}

// Repor rascunho quando o formulário é apresentado
function reporRascunho() {
    const bruto = sessionStorage.getItem("rascunhoSugestao");
    if (!bruto) return;
    try {
        const rascunho = JSON.parse(bruto);
        inputTitulo.value = rascunho.titulo || "";
        inputCategoria.value = rascunho.categoria || "";
        inputDescricao.value = rascunho.descricao || "";
    } catch {
        sessionStorage.removeItem("rascunhoSugestao");
    }
}

if (inputTitulo) inputTitulo.addEventListener("input", guardarRascunho);
if (inputCategoria) inputCategoria.addEventListener("input", guardarRascunho);
if (inputDescricao) inputDescricao.addEventListener("input", guardarRascunho);

// Submeter nova sugestão (POST /v2/sugestoes)
if (formSugestao) {
    formSugestao.addEventListener("submit", async (e) => {
        e.preventDefault();
        erroSugestao.hidden = true;

        const novaSugestao = {
            titulo: inputTitulo.value.trim(),
            categoria: inputCategoria.value.trim(),
            descricao: inputDescricao.value.trim()
        };

        try {
            const resposta = await fetch("/v2/sugestoes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(novaSugestao),
                cache: "no-store"
            });

            if (!resposta.ok) {
                const dados = await lerResposta(resposta);
                erroSugestao.textContent = mensagemErro(dados, "Erro ao criar sugestão.");
                erroSugestao.hidden = false;
                return;
            }

            formSugestao.reset();
            sessionStorage.removeItem("rascunhoSugestao");
            await carregarSugestoes();
        } catch {
            erroSugestao.textContent = "Erro de ligação ao servidor.";
            erroSugestao.hidden = false;
        }
    });
}

// Executar na inicialização da página
document.addEventListener("DOMContentLoaded", async () => {
    inicializarConfiguracoes();

    try {
        const resposta = await fetch("/v2/sessao", { cache: "no-store" });
        if (resposta.ok) {
            const dados = await resposta.json();
            mostrarSessao(dados);
            await carregarSugestoes();
        } else {
            terminarSessaoLocal();
        }
    } catch {
        terminarSessaoLocal();
    }
});