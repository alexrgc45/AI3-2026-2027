

const codigosCategoria = [
  "instalacoes",
  "ensino",
  "servicos",
  "atividades",
  "outra"
];

// As descrições são exemplos, pois o OpenAPI03
// define os códigos, mas não fornece as descrições.
const categorias = [
  { codigo: "instalacoes", descricao: "Instalações e espaços da instituição" },
  { codigo: "ensino", descricao: "Ensino e atividades letivas" },
  { codigo: "servicos", descricao: "Serviços académicos e administrativos" },
  { codigo: "atividades", descricao: "Atividades e eventos académicos" },
  { codigo: "outra", descricao: "Outras sugestões" }
];

const sugestoes = [];
let proximoId = 1;

function respostaJSON(dados, status, headers = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

// 1. GET /v2/categorias
function listarCategorias() {
  return respostaJSON(categorias, 200, {
    "Cache-Control": "public, max-age=86400"
  });
}

// Extrai o número de aluno (claim sub) do JWT.
// NOTA: descodificar não equivale a validar a assinatura.
function obterNumeroAluno(token) {
  try {
    if (!token || !token.startsWith("Bearer ")) {
      return null;
    }

    const jwt = token.substring(7);
    const partes = jwt.split(".");

    if (partes.length !== 3) {
      return null;
    }

    const payload = partes[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const dados = JSON.parse(
      atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))
    );

    if (
      !dados.sub ||
      !/^\d{5,8}$/.test(String(dados.sub)) ||
      (dados.exp && dados.exp <= Math.floor(Date.now() / 1000))
    ) {
      return null;
    }

    return String(dados.sub);
  } catch {
    return null;
  }
}

// 2. POST /v2/sugestoes
async function criarSugestao(request) {
  let corpo;

  try {
    corpo = await request.json();
  } catch {
    return respostaJSON({
      codigo: 400,
      mensagem: "Corpo do pedido inválido.",
      detalhes: [
        {
          campo: "body",
          problema: "O corpo tem de conter JSON válido."
        }
      ]
    }, 400, {
      "Cache-Control": "no-store"
    });
  }

  const detalhes = [];

  if (
    typeof corpo.titulo !== "string" ||
    corpo.titulo.length < 10 ||
    corpo.titulo.length > 120
  ) {
    detalhes.push({
      campo: "titulo",
      problema: "Deve ser texto com 10 a 120 caracteres."
    });
  }

  if (
    typeof corpo.descricao !== "string" ||
    corpo.descricao.length < 20 ||
    corpo.descricao.length > 2000
  ) {
    detalhes.push({
      campo: "descricao",
      problema: "Deve ser texto com 20 a 2000 caracteres."
    });
  }

  if (
    typeof corpo.categoria !== "string" ||
    !codigosCategoria.includes(corpo.categoria)
  ) {
    detalhes.push({
      campo: "categoria",
      problema: "O código da categoria não é válido."
    });
  }

  if (detalhes.length > 0) {
    return respostaJSON({
      codigo: 400,
      mensagem: "Os dados enviados não cumprem SugestaoNova.",
      detalhes
    }, 400, {
      "Cache-Control": "no-store"
    });
  }

  // A identidade vem do token, nunca do corpo do pedido.
  const numeroAluno = obterNumeroAluno(
    request.headers.get("Authorization")
  );

  if (!numeroAluno) {
    return respostaJSON({
      codigo: 401,
      mensagem: "Token em falta, inválido ou expirado."
    }, 401, {
      "Cache-Control": "no-store",
      "WWW-Authenticate": "Bearer"
    });
  }

  const agora = new Date().toISOString();

  const novaSugestao = {
    id: proximoId++,
    titulo: corpo.titulo,
    descricao: corpo.descricao,
    categoria: corpo.categoria,
    numeroAluno: numeroAluno,
    estado: "submetida",
    dataCriacao: agora,
    dataAtualizacao: agora,
    dataResolucao: null
  };

  sugestoes.push(novaSugestao);

  return respostaJSON(novaSugestao, 201, {
    "Location": `/v2/sugestoes/${novaSugestao.id}`,
    "Cache-Control": "no-store"
  });
}

// Tratamento dos pedidos pelo Service Worker
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (
    url.pathname === "/v2/categorias" &&
    event.request.method === "GET"
  ) {
    event.respondWith(listarCategorias());
    return;
  }

  if (
    url.pathname === "/v2/sugestoes" &&
    event.request.method === "POST"
  ) {
    event.respondWith(criarSugestao(event.request));
    return;
  }
});
