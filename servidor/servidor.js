import express from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    lerConfiguracao,
    validadeToken,
    emitirToken,
    exigirToken
} from './autenticacao.js';

// Falha cedo, com mensagem explícita, se o segredo faltar ou for curto.
try {
    lerConfiguracao();
} catch (erro) {
    console.error(`Erro de configuração: ${erro.message}`);
    process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function lerJSON(nome) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', nome), 'utf-8'));
}

const utilizadores = lerJSON('utilizadores.json');
const sugestoes = lerJSON('sugestoes.json');

// Hash fixo para comparar quando o utilizador não existe (tempo de resposta semelhante).
const HASH_FIXO = bcrypt.hashSync('palavra-passe-que-nunca-coincide', 10);

const PADRAO_UTILIZADOR = /^(\d{5,8}|[a-z]+\.[a-z]+)$/;

function erro(res, estado, mensagem, detalhes) {
    const corpo = { codigo: estado, mensagem };
    if (detalhes && detalhes.length) corpo.detalhes = detalhes;
    return res.status(estado).set('Cache-Control', 'no-store').json(corpo);
}

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------
app.get('/v2/openapi.yaml', (req, res) => {
    res.type('application/yaml').sendFile(path.join(__dirname, '..', 'sugestoes.openapi.yaml'));
});

// ---------------------------------------------------------------
// POST /v2/tokens (criarToken)
// ---------------------------------------------------------------
app.post('/v2/tokens', async (req, res, next) => {
    try {
        const corpo = req.body;

        if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
            return erro(res, 400, 'O corpo do pedido não cumpre o esquema Credenciais.', [
                { campo: 'body', problema: 'Tem de ser um objeto JSON.' }
            ]);
        }

        const { utilizador, palavraPasse } = corpo;
        const detalhes = [];

        if (typeof utilizador !== 'string' || !PADRAO_UTILIZADOR.test(utilizador)) {
            detalhes.push({
                campo: 'utilizador',
                problema: 'Tem de ser um número de aluno (5 a 8 algarismos) ou nome.apelido.'
            });
        }
        if (typeof palavraPasse !== 'string' || palavraPasse.length < 8 || palavraPasse.length > 128) {
            detalhes.push({ campo: 'palavraPasse', problema: 'Tem de ter entre 8 e 128 caracteres.' });
        }
        if (detalhes.length) {
            return erro(res, 400, 'O corpo do pedido não cumpre o esquema Credenciais.', detalhes);
        }

        const registo = utilizadores.find((u) => u.utilizador === utilizador);

        // Compara sempre com um hash, exista ou não o utilizador.
        const correto = await bcrypt.compare(palavraPasse, registo ? registo.hashPalavraPasse : HASH_FIXO);

        if (!registo || !correto) {
            return erro(res, 401, 'Credenciais inválidas.');
        }

        return res
            .status(200)
            .set('Cache-Control', 'no-store')
            .json({ token: emitirToken(registo), tipo: 'Bearer', expiraEm: validadeToken() });
    } catch (e) {
        return next(e);
    }
});

// ---------------------------------------------------------------
// GET /v2/sugestoes (listarSugestoes) — operação protegida de demonstração
// ---------------------------------------------------------------
app.get('/v2/sugestoes', exigirToken, (req, res) => {
    const visiveis =
        req.utilizador.papel === 'servicos'
            ? sugestoes
            : sugestoes.filter((s) => s.numeroAluno === req.utilizador.sub);

    return res
        .status(200)
        .set('Cache-Control', 'private, no-cache')
        .json({ pagina: 1, tamanhoPagina: 20, total: visiveis.length, itens: visiveis });
});

// ---------------------------------------------------------------
// Ficheiros do cliente (mesma origem que a API)
// ---------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Caminhos /v2 inexistentes: JSON em vez de HTML.
app.use('/v2', (req, res) => erro(res, 404, 'Recurso não encontrado.'));

// ---------------------------------------------------------------
// Tratamento de erros (final)
// ---------------------------------------------------------------
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err.type === 'entity.parse.failed') {
        return erro(res, 400, 'O corpo do pedido não é JSON válido.');
    }
    if (err.status === 400 || err.statusCode === 400) {
        return erro(res, 400, 'Pedido inválido.');
    }

    console.error(err);
    return erro(res, 500, 'Erro interno do servidor.');
});

app.listen(3000, () => {
    console.log('Servidor a escutar em http://localhost:3000');
});
