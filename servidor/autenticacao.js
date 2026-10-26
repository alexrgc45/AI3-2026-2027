import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SEGREDO = process.env.JWT_SEGREDO;
const JWT_VALIDADE = Number.parseInt(process.env.JWT_VALIDADE ?? "900", 10);

// Hash bcrypt de custo 10 usado apenas para manter uma comparação semelhante
// quando o nome de utilizador não existe. Não corresponde a uma conta.
const HASH_COMPARACAO_FIXO = "$2b$10$RLtPaFqLF1qiwmm8ZAVcc.SDhfGvtXYww6IH/2KVPF8plpETvXE16";

export function configuracaoJWT() {
  if (!JWT_SEGREDO) {
    throw new Error("Configuração inválida: defina JWT_SEGREDO no ficheiro .env.");
  }
  if (JWT_SEGREDO.length < 32) {
    throw new Error("Configuração inválida: JWT_SEGREDO tem de ter pelo menos 32 caracteres.");
  }
  if (!Number.isInteger(JWT_VALIDADE) || JWT_VALIDADE < 1) {
    throw new Error("Configuração inválida: JWT_VALIDADE tem de ser um número inteiro positivo de segundos.");
  }
  return { segredo: JWT_SEGREDO, validade: JWT_VALIDADE };
}

export async function compararPalavraPasse(palavraPasse, hashPalavraPasse) {
  return bcrypt.compare(palavraPasse, hashPalavraPasse);
}

export async function hashPalavraPasse(palavraPasse) {
  return bcrypt.hash(palavraPasse, 10);
}

export function emitirToken(utilizador) {
  const { segredo, validade } = configuracaoJWT();
  const token = jwt.sign(
    { nome: utilizador.nome, papel: utilizador.papel },
    segredo,
    { algorithm: "HS256", subject: utilizador.utilizador, expiresIn: validade }
  );
  return { token, tipo: "Bearer", expiraEm: validade };
}

export async function compararComHashFixo(palavraPasse) {
  return bcrypt.compare(palavraPasse, HASH_COMPARACAO_FIXO);
}

export function exigirToken(req, res, next) {
  const authorization = req.get("Authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    res.set("WWW-Authenticate", "Bearer");
    res.set("Cache-Control", "no-store");
    return res.status(401).json({ codigo: 401, mensagem: "Token em falta ou inválido." });
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  try {
    // algorithms restringe a verificação a HS256; ignoreExpiration:false faz
    // com que tokens expirados sejam rejeitados; clockTolerance:0 não dá
    // margem extra à validade. Não se ativa ignoreExpiration nem ignoreNotBefore.
    const payload = jwt.verify(token, configuracaoJWT().segredo, {
      algorithms: ["HS256"],
      ignoreExpiration: false,
      clockTolerance: 0
    });
    if (typeof payload === "string" || !payload.sub || !payload.nome || !payload.papel) {
      throw new Error("Payload JWT inválido");
    }
    req.utilizador = { sub: payload.sub, nome: payload.nome, papel: payload.papel };
    return next();
  } catch {
    res.set("WWW-Authenticate", 'Bearer error="invalid_token"');
    res.set("Cache-Control", "no-store");
    return res.status(401).json({ codigo: 401, mensagem: "Token em falta ou inválido." });
  }
}

export function exigirPapel(papel) {
  return (req, res, next) => {
    if (!req.utilizador || req.utilizador.papel !== papel) {
      res.set("Cache-Control", "no-store");
      return res.status(403).json({ codigo: 403, mensagem: "Acesso negado por falta de permissões." });
    }
    return next();
  };
}
