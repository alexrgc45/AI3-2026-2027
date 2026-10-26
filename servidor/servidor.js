import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  configuracaoJWT, emitirToken, exigirToken, compararPalavraPasse, compararComHashFixo
} from "./autenticacao.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const UTILIZADORES_PATH = path.join(__dirname, "dados", "utilizadores.json");
const SUGESTOES_PATH = path.join(__dirname, "dados", "sugestoes.json");
const OPENAPI_PATH = path.join(__dirname, "..", "Sprints", "OPENAPI02", "sugestoes.openapi.yaml");
function erro(res, codigo, mensagem, detalhes) {
  res.set("Cache-Control", "no-store");
  const corpo = { codigo, mensagem };
  if (detalhes?.length) corpo.detalhes = detalhes;
  return res.status(codigo).json(corpo);
}

async function lerJSON(caminho) {
  return JSON.parse(await fs.readFile(caminho, "utf8"));
}

function validarCredenciais(body) {
  const detalhes = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [{ campo: "body", problema: "Tem de ser um objeto JSON." }];
  }
  const permitidos = new Set(["utilizador", "palavraPasse"]);
  for (const chave of Object.keys(body)) {
    if (!permitidos.has(chave)) detalhes.push({ campo: chave, problema: "Campo não permitido." });
  }
  if (typeof body.utilizador !== "string") {
    detalhes.push({ campo: "utilizador", problema: "Campo obrigatório do tipo texto." });
} else if (!/^(\d{5,8}|[a-z]+\.[a-z]+)$/.test(body.utilizador)) {    detalhes.push({ campo: "utilizador", problema: "Formato inválido." });
  }
  if (typeof body.palavraPasse !== "string") {
    detalhes.push({ campo: "palavraPasse", problema: "Campo obrigatório do tipo texto." });
  } else if (body.palavraPasse.length < 8 || body.palavraPasse.length > 128) {
    detalhes.push({ campo: "palavraPasse", problema: "Deve ter entre 8 e 128 caracteres." });
  }
  return detalhes;
}

// Verificar a configuração antes de abrir a porta; sem segredo seguro, não arranca.
try {
  configuracaoJWT();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// O tratamento final converte JSON mal formado em Erro, em vez da página HTML do Express.
app.use(express.json({ limit: "32kb", strict: true }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/v2/tokens", async (req, res, next) => {
  try {
    const detalhes = validarCredenciais(req.body);
    if (detalhes.length) return erro(res, 400, "Credenciais em formato inválido.", detalhes);

    const utilizadores = await lerJSON(UTILIZADORES_PATH);
    const utilizador = utilizadores.find(u => u.utilizador === req.body.utilizador);
    if (!utilizador) {
      await compararComHashFixo(req.body.palavraPasse);
      return erro(res, 401, "Utilizador ou palavra-passe incorretos.");
    }
    const correta = await compararPalavraPasse(req.body.palavraPasse, utilizador.hashPalavraPasse);
    if (!correta) return erro(res, 401, "Utilizador ou palavra-passe incorretos.");

    res.set("Cache-Control", "no-store");
    return res.status(200).json(emitirToken(utilizador));
  } catch (e) { next(e); }
});

app.get("/v2/sugestoes", exigirToken, async (req, res, next) => {
  try {
    const sugestoes = await lerJSON(SUGESTOES_PATH);
    const itens = req.utilizador.papel === "servicos"
      ? sugestoes
      : sugestoes.filter(s => s.numeroAluno === req.utilizador.sub);
    res.set("Cache-Control", "private, no-cache");
    return res.status(200).json({ pagina: 1, tamanhoPagina: 20, total: itens.length, itens: itens.slice(0, 20) });
  } catch (e) { next(e); }
});

app.get("/v2/openapi.yaml", async (req, res, next) => {
  try {
    res.type("text/yaml");
    res.set("Cache-Control", "no-store");
    return res.send(await fs.readFile(OPENAPI_PATH, "utf8"));
  } catch (e) { next(e); }
});

// Rotas inexistentes devolvem JSON no formato Erro.
app.use((req, res) => erro(res, 404, "Recurso não encontrado."));

// Middleware final de erros, incluindo erro de parsing produzido por express.json.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return erro(res, 400, "Corpo JSON mal formado.", [{ campo: "body", problema: "JSON inválido." }]);
  }
  console.error("Erro interno no pedido.");
  return erro(res, 500, "Erro interno do servidor.");
});

app.listen(PORT, () => {
  console.log(`Servidor disponível em http://localhost:${PORT}`);
});
