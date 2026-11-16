// Cliente da API de Sugestões (ficha API02).
// O token é conservado apenas nesta variável do módulo: não vai para
// localStorage nem sessionStorage e perde-se ao recarregar a página.
let token = null;
let expiraEmMs = null;
let temporizador = null;

const $ = (id) => document.getElementById(id);

const areaEntrada = $('entrada');
const areaSessao = $('sessao');
const zonaMensagem = $('mensagem');
const formEntrada = $('form-entrada');
const campoUtilizador = $('utilizador');
const campoPalavraPasse = $('palavraPasse');
const botaoEntrar = $('botao-entrar');
const botaoSugestoes = $('botao-sugestoes');
const botaoSair = $('botao-sair');
const lista = $('lista-sugestoes');

const MENSAGEM_EXPIRADA = 'Sessão expirada. É necessária nova autenticação.';

// ---------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------
function mostrarErro(texto) {
    zonaMensagem.textContent = texto; // textContent, nunca innerHTML
    zonaMensagem.hidden = false;
}

function limparErro() {
    zonaMensagem.textContent = '';
    zonaMensagem.hidden = true;
}

// ---------------------------------------------------------------
// Payload do JWT (apenas para apresentação; a assinatura não é verificável aqui)
// ---------------------------------------------------------------
export function descodificarPayload(tokenJWT) {
    const parte = tokenJWT.split('.')[1];
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const preenchido = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binario = atob(preenchido);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

// ---------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------
function formatarRestante(segundos) {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m} min ${String(s).padStart(2, '0')} s`;
}

function atualizarRestante() {
    if (expiraEmMs === null) return;
    const segundos = Math.ceil((expiraEmMs - Date.now()) / 1000);
    if (segundos <= 0) {
        terminarSessao(MENSAGEM_EXPIRADA); // termina sem aguardar um pedido
        return;
    }
    $('sessao-restante').textContent = formatarRestante(segundos);
}

function iniciarSessao(novoToken) {
    const payload = descodificarPayload(novoToken);
    token = novoToken;
    expiraEmMs = payload.exp * 1000;

    $('sessao-nome').textContent = payload.nome;
    $('sessao-papel').textContent = payload.papel;
    $('sessao-expira').textContent = new Date(expiraEmMs).toLocaleTimeString('pt-PT');
    botaoSugestoes.textContent =
        payload.papel === 'servicos' ? 'Todas as sugestões' : 'As minhas sugestões';

    areaEntrada.hidden = true;
    areaSessao.hidden = false;
    limparErro();

    clearInterval(temporizador);
    atualizarRestante();
    temporizador = setInterval(atualizarRestante, 1000);

    $('titulo-sessao').focus();
}

function terminarSessao(mensagem = '') {
    clearInterval(temporizador);
    temporizador = null;
    token = null; // o token é descartado
    expiraEmMs = null;

    lista.replaceChildren();
    $('sessao-nome').textContent = '';
    $('sessao-papel').textContent = '';
    $('sessao-expira').textContent = '';
    $('sessao-restante').textContent = '';

    areaSessao.hidden = true;
    areaEntrada.hidden = false;
    formEntrada.reset();

    if (mensagem) mostrarErro(mensagem); else limparErro();
    campoUtilizador.focus();
}

// ---------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------
formEntrada.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limparErro();

    botaoEntrar.disabled = true;
    botaoEntrar.textContent = 'A entrar…';

    try {
        const resposta = await fetch('/v2/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                utilizador: campoUtilizador.value.trim(),
                palavraPasse: campoPalavraPasse.value
            })
        });

        if (resposta.status === 200) {
            const dados = await resposta.json();
            campoPalavraPasse.value = '';
            iniciarSessao(dados.token);
        } else if (resposta.status === 400 || resposta.status === 401) {
            const erro = await resposta.json();
            campoPalavraPasse.value = '';
            // Mesma mensagem do servidor: não distingue utilizador inexistente de palavra-passe errada.
            mostrarErro(erro.mensagem || 'Não foi possível entrar.');
        } else {
            mostrarErro(`O servidor respondeu com o código ${resposta.status}.`);
        }
    } catch {
        mostrarErro('Não foi possível contactar o servidor. Verifique a ligação e tente de novo.');
    } finally {
        botaoEntrar.disabled = false;
        botaoEntrar.textContent = 'Entrar';
    }
});

// ---------------------------------------------------------------
// Pedidos protegidos
// ---------------------------------------------------------------
async function pedidoAutenticado(url) {
    const resposta = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (resposta.status === 401) {
        terminarSessao(MENSAGEM_EXPIRADA);
        throw new Error('401');
    }
    return resposta;
}

function criarItem(sugestao) {
    const item = document.createElement('li');

    const titulo = document.createElement('div');
    titulo.className = 'titulo';
    titulo.textContent = sugestao.titulo;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Categoria: ${sugestao.categoria} · Estado: ${sugestao.estado}`;

    item.append(titulo, meta);
    return item;
}

botaoSugestoes.addEventListener('click', async () => {
    limparErro();
    botaoSugestoes.disabled = true;
    try {
        const resposta = await pedidoAutenticado('/v2/sugestoes');
        if (!resposta.ok) {
            mostrarErro(`Não foi possível obter as sugestões (código ${resposta.status}).`);
            return;
        }
        const dados = await resposta.json();
        lista.replaceChildren(...dados.itens.map(criarItem));
        if (dados.itens.length === 0) {
            const vazio = document.createElement('li');
            vazio.textContent = 'Não existem sugestões.';
            lista.append(vazio);
        }
    } catch (e) {
        if (e.message !== '401') {
            mostrarErro('Não foi possível contactar o servidor.');
        }
    } finally {
        botaoSugestoes.disabled = false;
    }
});

botaoSair.addEventListener('click', () => terminarSessao());
