const API_PREFIX = "/v2";
const CATEGORIAS = [
  {
    codigo: "instalacoes",
    descricao: "Edifícios, salas, equipamentos e espaços da instituição."
  },
  {
    codigo: "ensino",
    descricao: "Aulas, métodos de ensino, avaliação e apoio pedagógico."
  },
  {
    codigo: "servicos",
    descricao: "Serviços administrativos, atendimento e apoio aos alunos."
  },
  {
    codigo: "atividades",
    descricao: "Atividades extracurriculares, eventos e iniciativas."
  },
  {
    codigo: "outra",
    descricao: "Sugestões que não se enquadram nas restantes categorias."
  }
];

const CATEGORIAS_VALIDAS = new Set([
  "instalacoes",
  "ensino",
  "servicos",
  "atividades",
  "outra"
]);

// Dados em memória: suficientes para demonstrar a resposta da operação.
// O contador é inicializado com um valor inteiro positivo.
let proximoIdSugestao = 1;

function respostaJSON(dados, status = 200, headersAdicionais = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headersAdicionais
    }
  });
}

function erroHTTP(status, mensagem, detalhes = undefined) {
  const corpo = { codigo: status, mensagem };
  if (detalhes && detalhes.length) corpo.detalhes = detalhes;

  const headers = status === 401
    ? { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" }
    : { "Cache-Control": "no-store" };

  return respostaJSON(corpo, status, headers);
}

/*
 * Extrai o claim "sub" do JWT.
 * Importante: descodificar o payload NÃO comprova que o token é autêntico.
 */
function obterNumeroAlunoDoToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const correspondencia = authorization.match(/^Bearer\s+([^\s]+)$/i);

  if (!correspondencia) return null;

  try {
    const partes = correspondencia[1].split(".");
    if (partes.length !== 3) return null;

    const payloadBase64 = partes[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const payloadCompleto = payloadBase64 + "=".repeat((4 - payloadBase64.length % 4) % 4);
    const payloadTexto = atob(payloadCompleto);
    const bytes = Uint8Array.from(payloadTexto, c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));

    // No contrato, o número de aluno é obtido da identidade autenticada (sub).
    if (typeof payload.sub !== "string" || !/^\d{5,8}$/.test(payload.sub)) {
      return null;
    }

    // Se existir exp, rejeita tokens expirados na simulação.
    if (typeof payload.exp === "number" && payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}

async function tratarListarCategorias() {
  return respostaJSON(CATEGORIAS, 200, {
    "Cache-Control": "public, max-age=86400"
  });
}

async function tratarCriarSugestao(request) {
  const numeroAluno = obterNumeroAlunoDoToken(request);

  if (!numeroAluno) {
    return erroHTTP(401, "É necessário um token Bearer válido.");
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return erroHTTP(400, "O corpo do pedido tem de ser JSON.", [
      { campo: "body", problema: "JSON inválido ou ausente." }
    ]);
  }

  const detalhes = [];

  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return erroHTTP(400, "O corpo do pedido não cumpre o esquema SugestaoNova.", [
      { campo: "body", problema: "Tem de ser um objeto JSON." }
    ]);
  }

  // titulo: obrigatório, string, entre 10 e 120 caracteres.
  if (typeof corpo.titulo !== "string") {
    detalhes.push({
      campo: "titulo",
      problema: "É obrigatório e tem de ser uma cadeia de caracteres."
    });
  } else if (corpo.titulo.length < 10 || corpo.titulo.length > 120) {
    detalhes.push({
      campo: "titulo",
      problema: "Tem de ter entre 10 e 120 caracteres."
    });
  }

  // descricao: obrigatório, string, entre 20 e 2000 caracteres.
  if (typeof corpo.descricao !== "string") {
    detalhes.push({
      campo: "descricao",
      problema: "É obrigatória e tem de ser uma cadeia de caracteres."
    });
  } else if (corpo.descricao.length < 20 || corpo.descricao.length > 2000) {
    detalhes.push({
      campo: "descricao",
      problema: "Tem de ter entre 20 e 2000 caracteres."
    });
  }

  // categoria: obrigatório e limitado ao enum CodigoCategoria do OpenAPI03.
  if (typeof corpo.categoria !== "string") {
    detalhes.push({
      campo: "categoria",
      problema: "É obrigatória e tem de ser uma cadeia de caracteres."
    });
  } else if (!CATEGORIAS_VALIDAS.has(corpo.categoria)) {
    detalhes.push({
      campo: "categoria",
      problema: "Tem de ser uma das categorias permitidas."
    });
  }

  if (detalhes.length) {
    return erroHTTP(400, "O corpo do pedido não cumpre o esquema SugestaoNova.", detalhes);
  }

  const agora = new Date().toISOString();
  const id = proximoIdSugestao++;

  /*
   * numeroAluno do corpo, caso tenha sido enviado, é deliberadamente ignorado.
   * O valor usado na resposta vem sempre do claim sub do token.
   */
  const sugestaoCriada = {
    id,
    titulo: corpo.titulo,
    descricao: corpo.descricao,
    categoria: corpo.categoria,
    numeroAluno,
    estado: "submetida",
    dataCriacao: agora,
    dataAtualizacao: agora,
    dataResolucao: null
  };

  return respostaJSON(sugestaoCriada, 201, {
    "Location": `${API_PREFIX}/sugestoes/${id}`,
    "Cache-Control": "no-store"
  });
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Só intercetar os pedidos da API simulada.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(API_PREFIX + "/")) {
    return;
  }

  if (url.pathname === `${API_PREFIX}/categorias` && event.request.method === "GET") {
    event.respondWith(tratarListarCategorias());
    return;
  }

  if (url.pathname === `${API_PREFIX}/sugestoes` && event.request.method === "POST") {
    event.respondWith(tratarCriarSugestao(event.request));
    return;
  }

  // As restantes rotas /v2 não são implementadas por esta etapa.
});
