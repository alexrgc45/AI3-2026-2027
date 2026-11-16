import jwt from 'jsonwebtoken';

const ALGORITMO = 'HS256';

/**
 * Lê e valida a configuração a partir das variáveis de ambiente.
 * Lança um erro com mensagem explícita se o segredo faltar ou for curto.
 */
export function lerConfiguracao() {
    const segredo = process.env.JWT_SEGREDO;

    if (!segredo) {
        throw new Error('JWT_SEGREDO não está definido. Crie o ficheiro .env a partir de .env.exemplo.');
    }
    if (segredo.length < 32) {
        throw new Error(`JWT_SEGREDO tem ${segredo.length} caracteres; são necessários pelo menos 32.`);
    }

    const validade = Number.parseInt(process.env.JWT_VALIDADE ?? '900', 10);
    if (!Number.isInteger(validade) || validade < 1) {
        throw new Error('JWT_VALIDADE tem de ser um inteiro positivo (segundos).');
    }

    return { segredo, validade };
}

let configuracao = null;

function config() {
    if (!configuracao) configuracao = lerConfiguracao();
    return configuracao;
}

export function validadeToken() {
    return config().validade;
}

/** Emite um token HS256 com sub, nome e papel; iat e exp são acrescentados pela biblioteca. */
export function emitirToken(utilizador) {
    const { segredo, validade } = config();
    return jwt.sign(
        { sub: utilizador.utilizador, nome: utilizador.nome, papel: utilizador.papel },
        segredo,
        { algorithm: ALGORITMO, expiresIn: validade }
    );
}

function naoAutenticado(res, cabecalho, mensagem) {
    return res
        .status(401)
        .set('WWW-Authenticate', cabecalho)
        .set('Cache-Control', 'no-store')
        .json({ codigo: 401, mensagem });
}

/**
 * Middleware de proteção.
 * - sem cabeçalho Bearer: 401 com "WWW-Authenticate: Bearer"
 * - token inválido/expirado/algoritmo errado: 401 com error="invalid_token"
 */
export function exigirToken(req, res, next) {
    const cabecalho = req.get('Authorization') || '';
    const correspondencia = /^Bearer ([^\s]+)$/.exec(cabecalho);

    if (!correspondencia) {
        return naoAutenticado(res, 'Bearer', 'Token em falta.');
    }

    try {
        // algorithms: só HS256 (rejeita "none" e confusão de algoritmos).
        // A expiração (exp) é verificada por omissão (ignoreExpiration=false).
        const payload = jwt.verify(correspondencia[1], config().segredo, { algorithms: [ALGORITMO] });
        req.utilizador = { sub: payload.sub, nome: payload.nome, papel: payload.papel };
        return next();
    } catch {
        return naoAutenticado(res, 'Bearer error="invalid_token"', 'Token inválido ou expirado.');
    }
}

/** Devolve um middleware que responde 403 se o papel do token for diferente de `papel`. */
export function exigirPapel(papel) {
    return function (req, res, next) {
        if (req.utilizador?.papel !== papel) {
            return res
                .status(403)
                .set('Cache-Control', 'no-store')
                .json({ codigo: 403, mensagem: 'Sem permissão para esta operação.' });
        }
        return next();
    };
}
