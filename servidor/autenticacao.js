import jwt from 'jsonwebtoken';
import { lerCookie } from './cookies.js';

export function exigirToken(req, res, next) {
    let token = null;
    const cabecalhoAuth = req.get('Authorization');

    if (cabecalhoAuth && cabecalhoAuth.startsWith('Bearer ')) {
        token = cabecalhoAuth.split(' ')[1];
    } else {
        token = lerCookie(req, 'sessao');
    }

    if (!token) {
        return res.status(401)
            .set('WWW-Authenticate', 'Bearer')
            .set('Cache-Control', 'no-store')
            .json({
                codigo: 401,
                mensagem: "Token em falta ou inválido."
            });
    }

    try {
        const segredo = process.env.JWT_SEGREDO || 'este-segredo-tem-de-ter-no-minimo-32-caracteres';
        const payload = jwt.verify(token, segredo, { algorithms: ['HS256'] });
        req.utilizador = {
            sub: payload.sub,
            nome: payload.nome,
            papel: payload.papel,
            exp: payload.exp
        };
        next();
    } catch (erro) {
        return res.status(401)
            .set('WWW-Authenticate', 'Bearer error="invalid_token"')
            .set('Cache-Control', 'no-store')
            .json({
                codigo: 401,
                mensagem: "Token com assinatura inválida ou expirado."
            });
    }
}

export function exigirPapel(papelPermitido) {
    return function (req, res, next) {
        if (req.utilizador.papel !== papelPermitido) {
            return res.status(403)
                .set('Cache-Control', 'no-store')
                .json({
                    codigo: 403,
                    mensagem: "Acesso negado por falta de permissões."
                });
        }
        next();
    };
}