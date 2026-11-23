const fs = require('fs');
const path = require('path');
const express = require('express');
const { distanciaEmMetros } = require('./geo.js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SESSION_SECRET = process.env.SESSION_SECRET || 'segredo-sessao-desenvolvimento';
const SESSION_TTL_SEGUNDOS = Math.max(10, parseInt(process.env.SESSION_TTL_SEGUNDOS || '86400', 10) || 86400);
const REGEX_CONTA_OAUTH = /^(github|google):[a-zA-Z0-9._-]+$/;

const FORNECEDORES_OAUTH = {
  github: {
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    scope: 'read:user'
  },
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid profile'
  }
};

function lerCookies(req) {
  const bruto = req.headers.cookie;
  const cookies = {};
  if (!bruto) return cookies;
  for (const parte of bruto.split(';')) {
    const idx = parte.indexOf('=');
    if (idx === -1) continue;
    const nome = parte.slice(0, idx).trim();
    const valor = parte.slice(idx + 1).trim();
    cookies[nome] = decodeURIComponent(valor);
  }
  return cookies;
}

function lerSessaoValida(req) {
  const cookies = lerCookies(req);
  if (!cookies.sessao) return null;
  try {
    const dados = jwt.verify(cookies.sessao, SESSION_SECRET);
    if (dados && typeof dados.cidadao === 'string' && REGEX_CONTA_OAUTH.test(dados.cidadao)) {
      return dados;
    }
  } catch (_) {}
  return null;
}

function obterCidadao(req, permitirUuidComSessao = false) {
  const sessao = lerSessaoValida(req);
  const headerCidadao = req.get('X-Cidadao') ? req.get('X-Cidadao').trim() : null;

  // Se o pedido traz uma identidade OAuth (ex: github:12345), exige sessao valida correspondente
  if (headerCidadao && REGEX_CONTA_OAUTH.test(headerCidadao)) {
    if (!sessao || sessao.cidadao !== headerCidadao) {
      return null; // Sessao expirada ou invalida -> 401
    }
    return sessao.cidadao;
  }

  // Se o pedido traz um UUID anonimo (ex: pendente criada antes do login), preserva essa identidade
  if (headerCidadao && REGEX_UUID.test(headerCidadao)) {
    if (permitirUuidComSessao || !sessao) {
      return headerCidadao.toLowerCase();
    }
    return sessao.cidadao;
  }

  // Sem X-Cidadao, usa a sessao OAuth ativa se existir
  if (sessao) {
    return sessao.cidadao;
  }

  return null;
}

// Carregar variaveis de .env sem dependencias externas
function carregarEnv() {
  const caminhoEnv = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(caminhoEnv)) return;
  const linhas = fs.readFileSync(caminhoEnv, 'utf8').split(/\r?\n/);
  for (const linha of linhas) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const idx = limpa.indexOf('=');
    if (idx === -1) continue;
    const chave = limpa.slice(0, idx).trim();
    const valor = limpa.slice(idx + 1).trim();
    if (!(chave in process.env)) {
      process.env[chave] = valor;
    }
  }
}

carregarEnv();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const LIMITE_FOTOGRAFIA_BYTES = 300 * 1024; // 300 KB
const TTL_IDEMPOTENCIA_MS = 24 * 60 * 60 * 1000; // 24 horas
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let simulacoes503Restantes = Math.max(0, parseInt(process.env.SIMULAR_503 || '0', 10) || 0);

// Dados em memoria
const CATEGORIAS = [
  { id: 'buraco', nome: 'Buraco no pavimento', raio: 15 },
  { id: 'semaforo', nome: 'Semaforo avariado', raio: 40 },
  { id: 'iluminacao', nome: 'Iluminacao publica', raio: 20 },
  { id: 'sinalizacao', nome: 'Sinalizacao danificada', raio: 20 },
  { id: 'outro', nome: 'Outro problema', raio: 10 }
];

const ESTADOS_VALIDOS = new Set(['aberta', 'em-resolucao', 'resolvida']);

let proximoIdOcorrencia = 1;
let versaoGlobal = 0;

/**
 * Cada ocorrencia interna guarda:
 * { id, categoria, descricao, localizacao, temFotografia, estado,
 *   comunicacoes, criadaEm, atualizadaEm, versao, participantes: Set<string>, reforcos: Array }
 */
const ocorrencias = [];

// Mapa: ocorrenciaId -> Buffer JPEG
const fotografias = new Map();

// Mapa: `${cidadao}:${chave}` -> { corpoCanonico, status, location, body, criadoEm, perdaSimulada }
const chavesIdempotencia = new Map();

// Limpeza periodica de chaves expiradas (> 24h)
setInterval(() => {
  const agora = Date.now();
  for (const [k, registo] of chavesIdempotencia.entries()) {
    if (agora - registo.criadoEm > TTL_IDEMPOTENCIA_MS) {
      chavesIdempotencia.delete(k);
    }
  }
}, 60 * 60 * 1000).unref();

app.use(express.json({ limit: '1mb' }));

// Servir ficheiros estaticos da PWA (servidor/public)
app.use(express.static(path.join(__dirname, 'public')));

// --- Funcoes auxiliares ---

function serializarCanonicamente(valor) {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) {
    return '[' + valor.map(serializarCanonicamente).join(',') + ']';
  }
  const chaves = Object.keys(valor).sort();
  return '{' + chaves.map((k) => JSON.stringify(k) + ':' + serializarCanonicamente(valor[k])).join(',') + '}';
}

function formatarOcorrencia(o) {
  return {
    id: o.id,
    categoria: o.categoria,
    descricao: o.descricao,
    localizacao: { ...o.localizacao },
    temFotografia: o.temFotografia,
    estado: o.estado,
    comunicacoes: o.comunicacoes,
    criadaEm: o.criadaEm,
    atualizadaEm: o.atualizadaEm,
    versao: o.versao
  };
}

function validarLocalizacao(loc) {
  if (!loc || typeof loc !== 'object') return false;
  const { lat, lng, precisao } = loc;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return false;
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return false;
  if (typeof precisao !== 'number' || !Number.isFinite(precisao) || precisao < 0) return false;
  return true;
}

function extrairBufferFotografia(dataUrl) {
  if (dataUrl === undefined || dataUrl === null || dataUrl === '') {
    return { ok: true, buffer: null };
  }
  if (typeof dataUrl !== 'string') {
    return { ok: false, erro: 'Formato de fotografia invalido.' };
  }
  const prefixo = 'data:image/jpeg;base64,';
  if (!dataUrl.startsWith(prefixo)) {
    return { ok: false, erro: 'A fotografia tem de ser um data URL JPEG (data:image/jpeg;base64,...).' };
  }
  const base64 = dataUrl.slice(prefixo.length);
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    return { ok: false, erro: 'Fotografia vazia.' };
  }
  if (buffer.length > LIMITE_FOTOGRAFIA_BYTES) {
    return { ok: false, erro: 'A fotografia excede o limite maximo de 300 KB.' };
  }
  return { ok: true, buffer };
}

/**
 * Funcao pura de detecao de duplicados.
 * Devolve ocorrências não resolvidas da mesma categoria dentro do raio,
 * excluindo os IDs indicados, ordenadas por distância crescente.
 */
function procurarSemelhantes(categoria, localizacao, excluir = []) {
  const cat = CATEGORIAS.find((c) => c.id === categoria);
  if (!cat) return [];

  const excluirSet = new Set(Array.isArray(excluir) ? excluir.map(Number) : []);

  return ocorrencias
    .filter((o) => o.estado !== 'resolvida' && o.categoria === categoria && !excluirSet.has(o.id))
    .map((o) => ({
      ocorrenciaInterna: o,
      ocorrencia: formatarOcorrencia(o),
      distancia: Number(distanciaEmMetros(o.localizacao, localizacao).toFixed(1))
    }))
    .filter((item) => item.distancia <= cat.raio)
    .sort((a, b) => a.distancia - b.distancia);
}

// Middleware de simulacao de falhas transitorias 503 em pedidos POST
app.use('/v1', (req, res, next) => {
  if (req.method === 'POST' && simulacoes503Restantes > 0) {
    simulacoes503Restantes -= 1;
    res.set('Retry-After', '2');
    return res.status(503).json({ erro: 'Servidor temporariamente indisponivel.' });
  }
  next();
});

// --- Rotas da API /v1 ---

// GET /v1/categorias
app.get('/v1/categorias', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(CATEGORIAS);
});

// GET /v1/ocorrencias/semelhantes?categoria=&lat=&lng=
app.get('/v1/ocorrencias/semelhantes', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { categoria, lat, lng } = req.query;

  const cat = CATEGORIAS.find((c) => c.id === categoria);
  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!cat || lat === undefined || lng === undefined || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ erro: 'Parametros categoria, lat e lng validos sao obrigatorios.' });
  }
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return res.status(400).json({ erro: 'Coordenadas fora dos limites validos.' });
  }

  const candidatas = procurarSemelhantes(categoria, { lat: latNum, lng: lngNum })
    .slice(0, 5)
    .map(({ ocorrencia, distancia }) => ({ ocorrencia, distancia }));

  res.json({ candidatas });
});

// GET /v1/ocorrencias?bbox=minLng,minLat,maxLng,maxLat
app.get('/v1/ocorrencias', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { bbox } = req.query;
  if (typeof bbox !== 'string') {
    return res.status(400).json({ erro: 'Parametro bbox obrigatorio.' });
  }

  const partes = bbox.split(',').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) {
    return res.status(400).json({ erro: 'Formato de bbox invalido. Use minLng,minLat,maxLng,maxLat.' });
  }

  const [minLng, minLat, maxLng, maxLat] = partes;
  if (minLng > maxLng || minLat > maxLat) {
    return res.status(400).json({ erro: 'Limites de bbox inconsistentes.' });
  }

  const resultado = ocorrencias
    .filter(
      (o) =>
        o.estado !== 'resolvida' &&
        o.localizacao.lng >= minLng &&
        o.localizacao.lng <= maxLng &&
        o.localizacao.lat >= minLat &&
        o.localizacao.lat <= maxLat
    )
    .map(formatarOcorrencia);

  res.json(resultado);
});

// GET /v1/ocorrencias/alteracoes?desde=<inteiro >= 0>
app.get('/v1/ocorrencias/alteracoes', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const cidadao = obterCidadao(req);
  if (!cidadao) {
    return res.status(401).json({ erro: 'Cabecalho X-Cidadao em falta ou invalido.' });
  }

  const desdeTexto = req.query.desde;
  if (desdeTexto === undefined || !/^\d+$/.test(String(desdeTexto))) {
    return res.status(400).json({ erro: 'Parametro desde tem de ser um inteiro maior ou igual a 0.' });
  }

  const desde = Number(desdeTexto);
  const alteracoes = ocorrencias
    .filter((o) => o.participantes.has(cidadao) && o.versao > desde)
    .map(formatarOcorrencia);

  res.json({
    alteracoes,
    cursor: versaoGlobal
  });
});

// GET /v1/ocorrencias/:id/fotografia
app.get('/v1/ocorrencias/:id/fotografia', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(404).json({ erro: 'Ocorrencia nao encontrada.' });
  }

  const buffer = fotografias.get(id);
  if (!buffer) {
    return res.status(404).json({ erro: 'Fotografia nao encontrada.' });
  }

  res.set('Content-Type', 'image/jpeg');
  res.send(buffer);
});

// POST /v1/ocorrencias
app.post('/v1/ocorrencias', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const cidadao = obterCidadao(req, true);
  if (!cidadao) {
    return res.status(401).json({ erro: 'Cabecalho X-Cidadao em falta ou invalido.' });
  }

  const chaveIdempotencia = req.get('Idempotency-Key');
  if (chaveIdempotencia !== undefined && !REGEX_UUID.test(chaveIdempotencia.trim())) {
    return res.status(400).json({ erro: 'Idempotency-Key tem de ser um UUID valido.' });
  }

  const chaveNormalizada = chaveIdempotencia ? chaveIdempotencia.trim().toLowerCase() : null;
  const chaveComposta = chaveNormalizada ? `${cidadao}:${chaveNormalizada}` : null;
  const corpoCanonico = serializarCanonicamente(req.body || {});

  // Verificar idempotencia antes de executar
  if (chaveComposta && chavesIdempotencia.has(chaveComposta)) {
    const registo = chavesIdempotencia.get(chaveComposta);
    if (Date.now() - registo.criadoEm <= TTL_IDEMPOTENCIA_MS) {
      if (registo.corpoCanonico !== corpoCanonico) {
        return res.status(409).json({ erro: 'Idempotency-Key ja utilizada com um corpo diferente.' });
      }
      if (registo.location) res.set('Location', registo.location);
      res.set('Idempotent-Replayed', 'true');
      return res.status(registo.status).json(registo.body);
    }
    chavesIdempotencia.delete(chaveComposta);
  }

  // Validacao do corpo
  const { categoria, descricao, localizacao, fotografia, recusadas } = req.body || {};

  if (!CATEGORIAS.some((c) => c.id === categoria)) {
    return res.status(400).json({ erro: 'Categoria invalida.' });
  }
  if (typeof descricao !== 'string' || descricao.trim().length < 10 || descricao.trim().length > 500) {
    return res.status(400).json({ erro: 'A descricao deve ter entre 10 e 500 caracteres.' });
  }
  if (!validarLocalizacao(localizacao)) {
    return res.status(400).json({ erro: 'Localizacao invalida.' });
  }
  if (recusadas !== undefined && (!Array.isArray(recusadas) || recusadas.some((x) => !Number.isInteger(x)))) {
    return res.status(400).json({ erro: 'O campo recusadas deve ser uma lista de IDs inteiros.' });
  }

  const fotoValidada = extrairBufferFotografia(fotografia);
  if (!fotoValidada.ok) {
    return res.status(400).json({ erro: fotoValidada.erro });
  }

  // --- Inicio da secao critica sincrona (sem await entre procura e escrita) ---
  const semelhantes = procurarSemelhantes(categoria, localizacao, recusadas || []);
  const agora = new Date().toISOString();

  let statusResposta;
  let corpoResposta;
  let locationResposta;

  if (semelhantes.length > 0) {
    const alvo = semelhantes[0].ocorrenciaInterna;
    locationResposta = `/v1/ocorrencias/${alvo.id}`;

    if (alvo.participantes.has(cidadao)) {
      statusResposta = 200;
      corpoResposta = {
        resultado: 'ja-comunicada',
        ocorrencia: formatarOcorrencia(alvo)
      };
    } else {
      alvo.participantes.add(cidadao);
      alvo.comunicacoes += 1;
      alvo.atualizadaEm = agora;
      versaoGlobal += 1;
      alvo.versao = versaoGlobal;

      if (fotoValidada.buffer && !alvo.temFotografia) {
        fotografias.set(alvo.id, fotoValidada.buffer);
        alvo.temFotografia = true;
      }

      statusResposta = 200;
      corpoResposta = {
        resultado: 'reforcada',
        ocorrencia: formatarOcorrencia(alvo)
      };
    }
  } else {
    const novoId = proximoIdOcorrencia++;
    versaoGlobal += 1;

    const novaOcorrencia = {
      id: novoId,
      categoria,
      descricao: descricao.trim(),
      localizacao: {
        lat: localizacao.lat,
        lng: localizacao.lng,
        precisao: localizacao.precisao
      },
      temFotografia: Boolean(fotoValidada.buffer),
      estado: 'aberta',
      comunicacoes: 1,
      criadaEm: agora,
      atualizadaEm: agora,
      versao: versaoGlobal,
      participantes: new Set([cidadao]),
      reforcos: []
    };

    ocorrencias.push(novaOcorrencia);
    if (fotoValidada.buffer) {
      fotografias.set(novoId, fotoValidada.buffer);
    }

    locationResposta = `/v1/ocorrencias/${novoId}`;
    statusResposta = 201;
    corpoResposta = {
      resultado: 'criada',
      ocorrencia: formatarOcorrencia(novaOcorrencia)
    };
  }
  // --- Fim da secao critica sincrona ---

  // Guardar chave de idempotencia apenas apos sucesso
  if (chaveComposta) {
    chavesIdempotencia.set(chaveComposta, {
      corpoCanonico,
      status: statusResposta,
      location: locationResposta,
      body: corpoResposta,
      criadoEm: Date.now()
    });

    if (process.env.SIMULAR_PERDA_RESPOSTA === '1') {
      req.socket.destroy();
      return;
    }
  }

  res.set('Location', locationResposta);
  return res.status(statusResposta).json(corpoResposta);
});

// POST /v1/ocorrencias/:id/reforcos
app.post('/v1/ocorrencias/:id/reforcos', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const cidadao = obterCidadao(req, true);
  if (!cidadao) {
    return res.status(401).json({ erro: 'Cabecalho X-Cidadao em falta ou invalido.' });
  }

  const chaveIdempotencia = req.get('Idempotency-Key');
  if (chaveIdempotencia !== undefined && !REGEX_UUID.test(chaveIdempotencia.trim())) {
    return res.status(400).json({ erro: 'Idempotency-Key tem de ser um UUID valido.' });
  }

  const chaveNormalizada = chaveIdempotencia ? chaveIdempotencia.trim().toLowerCase() : null;
  const chaveComposta = chaveNormalizada ? `${cidadao}:${chaveNormalizada}` : null;
  const corpoCanonico = serializarCanonicamente(req.body || {});

  if (chaveComposta && chavesIdempotencia.has(chaveComposta)) {
    const registo = chavesIdempotencia.get(chaveComposta);
    if (Date.now() - registo.criadoEm <= TTL_IDEMPOTENCIA_MS) {
      if (registo.corpoCanonico !== corpoCanonico) {
        return res.status(409).json({ erro: 'Idempotency-Key ja utilizada com um corpo diferente.' });
      }
      if (registo.location) res.set('Location', registo.location);
      res.set('Idempotent-Replayed', 'true');
      return res.status(registo.status).json(registo.body);
    }
    chavesIdempotencia.delete(chaveComposta);
  }

  const id = Number(req.params.id);
  const alvo = Number.isInteger(id) ? ocorrencias.find((o) => o.id === id) : null;
  if (!alvo) {
    return res.status(404).json({ erro: 'Ocorrencia nao encontrada.' });
  }
  if (alvo.estado === 'resolvida') {
    return res.status(410).json({ erro: 'A ocorrencia ja se encontra resolvida.' });
  }

  const { comentario } = req.body || {};
  if (comentario !== undefined && comentario !== null && (typeof comentario !== 'string' || comentario.length > 500)) {
    return res.status(400).json({ erro: 'Comentario invalido (maximo 500 caracteres).' });
  }

  const locationResposta = `/v1/ocorrencias/${alvo.id}`;
  let statusResposta;
  let corpoResposta;

  if (alvo.participantes.has(cidadao)) {
    statusResposta = 200;
    corpoResposta = {
      resultado: 'ja-comunicada',
      ocorrencia: formatarOcorrencia(alvo)
    };
  } else {
    alvo.participantes.add(cidadao);
    alvo.comunicacoes += 1;
    alvo.atualizadaEm = new Date().toISOString();
    versaoGlobal += 1;
    alvo.versao = versaoGlobal;

    if (comentario && comentario.trim()) {
      alvo.reforcos.push({ cidadao, comentario: comentario.trim(), criadoEm: alvo.atualizadaEm });
    }

    statusResposta = 201;
    corpoResposta = {
      resultado: 'reforcada',
      ocorrencia: formatarOcorrencia(alvo)
    };
  }

  if (chaveComposta) {
    chavesIdempotencia.set(chaveComposta, {
      corpoCanonico,
      status: statusResposta,
      location: locationResposta,
      body: corpoResposta,
      criadoEm: Date.now()
    });

    if (process.env.SIMULAR_PERDA_RESPOSTA === '1') {
      req.socket.destroy();
      return;
    }
  }

  res.set('Location', locationResposta);
  return res.status(statusResposta).json(corpoResposta);
});

// PATCH /v1/admin/ocorrencias/:id
app.patch('/v1/admin/ocorrencias/:id', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const tokenEsperado = process.env.ADMIN_TOKEN;
  const tokenRecebido = req.get('X-Admin-Token');

  if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
    return res.status(403).json({ erro: 'Token de administracao invalido ou em falta.' });
  }

  const id = Number(req.params.id);
  const alvo = Number.isInteger(id) ? ocorrencias.find((o) => o.id === id) : null;
  if (!alvo) {
    return res.status(404).json({ erro: 'Ocorrencia nao encontrada.' });
  }

  const { estado } = req.body || {};
  if (!ESTADOS_VALIDOS.has(estado)) {
    return res.status(400).json({ erro: 'Estado invalido. Valores permitidos: aberta, em-resolucao, resolvida.' });
  }

  alvo.estado = estado;
  alvo.atualizadaEm = new Date().toISOString();
  versaoGlobal += 1;
  alvo.versao = versaoGlobal;

  return res.json(formatarOcorrencia(alvo));
});

// --- Rotas de Autenticacao OAuth 2.0 + PKCE ---

// GET /v1/auth/:fornecedor/inicio
app.get('/v1/auth/:fornecedor/inicio', (req, res) => {
  const fornecedor = req.params.fornecedor;
  const cfg = FORNECEDORES_OAUTH[fornecedor];

  if (!cfg) {
    return res.status(404).json({ erro: 'Fornecedor OAuth nao suportado.' });
  }
  if (!cfg.clientId() || !cfg.clientSecret()) {
    return res.status(500).json({ erro: `Credenciais de ${fornecedor} nao configuradas no ficheiro .env.` });
  }

  // Gerar state e code_verifier + code_challenge (S256)
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const tokenPkce = jwt.sign(
    { state, codeVerifier, fornecedor },
    SESSION_SECRET,
    { expiresIn: '10m' }
  );

  const redirectUri = `${req.protocol}://${req.get('host')}/v1/auth/${fornecedor}/retorno`;
  const urlAutorizacao = new URL(cfg.authUrl);
  urlAutorizacao.searchParams.set('client_id', cfg.clientId());
  urlAutorizacao.searchParams.set('redirect_uri', redirectUri);
  urlAutorizacao.searchParams.set('response_type', 'code');
  urlAutorizacao.searchParams.set('scope', cfg.scope);
  urlAutorizacao.searchParams.set('state', state);
  urlAutorizacao.searchParams.set('code_challenge', codeChallenge);
  urlAutorizacao.searchParams.set('code_challenge_method', 'S256');

  res.setHeader(
    'Set-Cookie',
    `oauth_pkce=${encodeURIComponent(tokenPkce)}; Path=/v1/auth; HttpOnly; SameSite=Lax; Max-Age=600`
  );
  return res.redirect(urlAutorizacao.toString());
});

// GET /v1/auth/:fornecedor/retorno
app.get('/v1/auth/:fornecedor/retorno', async (req, res) => {
  const fornecedor = req.params.fornecedor;
  const cfg = FORNECEDORES_OAUTH[fornecedor];
  const { code, state } = req.query;

  if (!cfg || typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).send('Pedido de retorno OAuth invalido.');
  }

  const cookies = lerCookies(req);
  if (!cookies.oauth_pkce) {
    return res.status(400).send('Cookie de verificacao PKCE em falta ou expirado.');
  }

  let dadosPkce;
  try {
    dadosPkce = jwt.verify(cookies.oauth_pkce, SESSION_SECRET);
  } catch (_) {
    return res.status(400).send('Estado PKCE expirado ou invalido.');
  }

  if (dadosPkce.fornecedor !== fornecedor || dadosPkce.state !== state) {
    return res.status(400).send('Parametro state nao corresponde.');
  }

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/v1/auth/${fornecedor}/retorno`;

    // 1. Trocar authorization code + code_verifier pelo access_token do fornecedor
    const corpoToken = new URLSearchParams({
      client_id: cfg.clientId(),
      client_secret: cfg.clientSecret(),
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: dadosPkce.codeVerifier
    });

    const respToken = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: corpoToken.toString()
    });

    const dadosToken = await respToken.json();
    if (!respToken.ok || !dadosToken.access_token) {
      return res.status(401).send('Falha ao trocar o codigo de autorizacao pelo token.');
    }

    // 2. Ler o identificador da conta no fornecedor (o token nunca vai para o cliente)
    const respPerfil = await fetch(cfg.userUrl, {
      headers: {
        Authorization: `Bearer ${dadosToken.access_token}`,
        Accept: 'application/json',
        'User-Agent': 'Reporta-PWA'
      }
    });

    const perfil = await respPerfil.json();
    if (!respPerfil.ok) {
      return res.status(401).send('Falha ao obter perfil do utilizador.');
    }

    const idConta = fornecedor === 'github' ? perfil.id : perfil.sub;
    const nomeConta = fornecedor === 'github'
      ? (perfil.name || perfil.login || `github:${idConta}`)
      : (perfil.name || perfil.email || `google:${idConta}`);

    if (!idConta) {
      return res.status(401).send('Identificador de conta nao devolvido pelo fornecedor.');
    }

    const cidadaoConta = `${fornecedor}:${idConta}`;

    // 3. Criar sessao propria do servidor num cookie HttpOnly; Secure; SameSite=Lax
    const tokenSessao = jwt.sign(
      { cidadao: cidadaoConta, nome: nomeConta, fornecedor },
      SESSION_SECRET,
      { expiresIn: SESSION_TTL_SEGUNDOS }
    );

    res.setHeader('Set-Cookie', [
      'oauth_pkce=; Path=/v1/auth; HttpOnly; SameSite=Lax; Max-Age=0',
      `sessao=${encodeURIComponent(tokenSessao)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SEGUNDOS}`
    ]);

    return res.redirect('/');
  } catch (erro) {
    console.error('Erro no retorno OAuth:', erro);
    return res.status(500).send('Erro interno durante a autenticacao OAuth.');
  }
});

// GET /v1/sessao
app.get('/v1/sessao', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const sessao = lerSessaoValida(req);
  const fornecedores = Object.keys(FORNECEDORES_OAUTH).filter(
    (f) => Boolean(FORNECEDORES_OAUTH[f].clientId() && FORNECEDORES_OAUTH[f].clientSecret())
  );

  if (!sessao) {
    return res.json({ autenticado: false, fornecedores });
  }

  return res.json({
    autenticado: true,
    cidadao: sessao.cidadao,
    nome: sessao.nome,
    fornecedor: sessao.fornecedor,
    fornecedores
  });
});

// DELETE /v1/sessao
app.delete('/v1/sessao', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.setHeader(
    'Set-Cookie',
    'sessao=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );
  return res.json({ autenticado: false });
});

app.listen(PORT, () => {
  console.log(`Servidor Reporta a correr em http://localhost:${PORT}`);
});