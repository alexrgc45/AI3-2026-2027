
const formLogin = document.querySelector("#form-login");
const inputUtilizador = document.querySelector("#utilizador");
const inputPalavraPasse = document.querySelector("#palavra-passe");
const botaoLogin = document.querySelector("#botao-login");
const erroLogin = document.querySelector("#erro-login");

const zonaLogin = document.querySelector("#zona-login");
const zonaSessao = document.querySelector("#zona-sessao");
const nomeUtilizador = document.querySelector("#nome-utilizador");
const papelUtilizador = document.querySelector("#papel-utilizador");
const tempoSessao = document.querySelector("#tempo-sessao");
const botaoLogout = document.querySelector("#botao-logout");
const botaoAtualizar = document.querySelector("#botao-atualizar");
const listaSugestoes = document.querySelector("#lista-sugestoes");
const mensagemSugestoes = document.querySelector("#mensagem-sugestoes");

let tokenAtual = null;
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

    if (!texto) {
        return {};
    }

    try {
        return JSON.parse(texto);
    } catch {
        return { mensagem: texto };
    }
}

function mensagemErro(dados, alternativa) {
    if (typeof dados.mensagem === "string") {
        return dados.mensagem;
    }

    if (typeof dados.message === "string") {
        return dados.message;
    }

    if (typeof dados.erro === "string") {
        return dados.erro;
    }

    if (Array.isArray(dados.detalhes)) {
        return dados.detalhes
            .map((item) => typeof item === "string"
                ? item
                : item.mensagem || item.message || JSON.stringify(item))
            .join(" ");
    }

    return alternativa;
}

// Decodifica o payload JWT em UTF-8.
// O payload serve para apresentar informação, não para validar o token.
function descodificarPayload(token) {
    const partes = token.split(".");

    if (partes.length !== 3) {
        throw new Error("O token recebido não tem um formato JWT válido.");
    }

    const base64 = partes[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const preenchido = base64.padEnd(
        base64.length + ((4 - base64.length % 4) % 4),
        "="
    );

    const bytes = Uint8Array.from(
        atob(preenchido),
        (caractere) => caractere.charCodeAt(0)
    );

    return JSON.parse(new TextDecoder().decode(bytes));
}

function formatarTempo(segundos) {
    const minutos = Math.floor(segundos / 60);
    const restantes = segundos % 60;

    return `${minutos} min ${String(restantes).padStart(2, "0")} s`;
}

function atualizarContagem() {
    if (!tokenAtual || !fimSessao) {
        return;
    }

    const segundos = Math.ceil((fimSessao - Date.now()) / 1000);

    if (segundos <= 0) {
        terminarSessao("Sessão expirada. É necessária nova autenticação.");
        return;
    }

    tempoSessao.textContent =
        `Tempo restante da sessão: ${formatarTempo(segundos)}`;
}

function iniciarContagem(expiracao) {
    clearInterval(temporizador);

    fimSessao = expiracao * 1000;
    atualizarContagem();

    temporizador = setInterval(atualizarContagem, 1000);
}

function terminarSessao(mensagem = "") {
    tokenAtual = null;
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

    if (mensagem) {
        mostrarErroLogin(mensagem);
    }
}

function mostrarSessao(payload) {
    zonaLogin.hidden = true;
    zonaSessao.hidden = false;

    nomeUtilizador.textContent =
        typeof payload.nome === "string" ? payload.nome : payload.sub || "Utilizador";

    papelUtilizador.textContent =
        typeof payload.papel === "string" ? payload.papel : "Não indicado";
}

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
        const resposta = await fetch("/v2/tokens", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                utilizador: document.querySelector("#utilizador").value.trim(),
    palavraPasse: document.querySelector("#palavra-passe").value
  })
        });

        const dados = await lerResposta(resposta);

        if (!resposta.ok) {
            mostrarErroLogin(
                mensagemErro(dados, "Não foi possível iniciar sessão.")
            );
            return;
        }

        if (typeof dados.token !== "string" || !dados.token) {
            mostrarErroLogin("A resposta do servidor não contém um token válido.");
            return;
        }

        let payload;

        try {
            payload = descodificarPayload(dados.token);
        } catch {
            mostrarErroLogin("O servidor devolveu um token inválido.");
            return;
        }

        if (!Number.isFinite(payload.exp)) {
            mostrarErroLogin("O token não contém uma data de expiração válida.");
            return;
        }

        if (payload.exp * 1000 <= Date.now()) {
            mostrarErroLogin("O servidor devolveu um token já expirado.");
            return;
        }

        // O token permanece apenas em memória.
        tokenAtual = dados.token;
        inputPalavraPasse.value = "";

        mostrarSessao(payload);
        iniciarContagem(payload.exp);

        await carregarSugestoes();
    } catch {
        mostrarErroLogin(
            "Não foi possível contactar o servidor. Confirma que está em execução."
        );
    } finally {
        botaoLogin.disabled = false;
        botaoLogin.textContent = "Iniciar sessão";
    }
});

async function pedidoAutenticado(url) {
    if (!tokenAtual) {
        throw new Error("É necessário iniciar sessão.");
    }

    const resposta = await fetch(url, {
        headers: {
            Authorization: `Bearer ${tokenAtual}`
        },
        cache: "no-store"
    });

    if (resposta.status === 401) {
        terminarSessao("Sessão expirada. É necessária nova autenticação.");
        throw new Error("Sessão expirada.");
    }

    return resposta;
}

function obterLista(dados) {
    if (Array.isArray(dados)) {
        return dados;
    }

    for (const chave of ["sugestoes", "itens", "resultados", "items"]) {
        if (Array.isArray(dados[chave])) {
            return dados[chave];
        }
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
    titulo.textContent =
        sugestao.titulo || sugestao.tituloSugestao || sugestao.title || "Sugestão";

    cartao.append(titulo);

    const categoria =
        sugestao.categoria || sugestao.categoriaNome || sugestao.category;

    if (categoria) {
        cartao.append(criarCampo(`Categoria: ${categoria}`));
    }

    const estado = sugestao.estado || sugestao.status;

    if (estado) {
        const etiqueta = document.createElement("p");
        etiqueta.className = "estado";
        etiqueta.textContent = `Estado: ${estado}`;
        cartao.append(etiqueta);
    }

    const descricao = sugestao.descricao || sugestao.description;

    if (descricao) {
        cartao.append(criarCampo(descricao));
    }

    return cartao;
}

async function carregarSugestoes() {
    if (!tokenAtual) {
        return;
    }

    botaoAtualizar.disabled = true;
    mostrarMensagemSugestoes("A carregar sugestões...");
    listaSugestoes.replaceChildren();

    try {
        const resposta = await pedidoAutenticado("/v2/sugestoes");

        if (!resposta.ok) {
            const dados = await lerResposta(resposta);
            mostrarMensagemSugestoes(
                mensagemErro(dados, "Não foi possível carregar as sugestões.")
            );
            return;
        }

        const dados = await lerResposta(resposta);
        const sugestoes = obterLista(dados);

        if (sugestoes.length === 0) {
            mostrarMensagemSugestoes("Não existem sugestões para apresentar.");
            return;
        }

        for (const sugestao of sugestoes) {
            listaSugestoes.append(criarCartao(sugestao));
        }

        mostrarMensagemSugestoes("");
    } catch (erro) {
        if (tokenAtual) {
            mostrarMensagemSugestoes(
                erro.message === "É necessário iniciar sessão."
                    ? erro.message
                    : "Não foi possível carregar as sugestões. Verifica a ligação ao servidor."
            );
        }
    } finally {
        botaoAtualizar.disabled = false;
    }
}

botaoLogout.addEventListener("click", () => {
    terminarSessao();
});

botaoAtualizar.addEventListener("click", () => {
    carregarSugestoes();
});
