import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exigirToken, exigirPapel } from './autenticacao.js';

const app = express();
app.use(express.json());

// 1. Definir __dirname para módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Testar se a pasta public existe e servir ficheiros estáticos
console.log("A pasta public existe?", fs.existsSync(path.join(__dirname, 'public')));
console.log("Caminho absoluto procurado:", path.join(__dirname, 'public'));

app.use(express.static(path.join(__dirname, 'public')));

// Utilizador simulado
const utilizadores = [
    { utilizador: "12345", palavraPasse: "senha123", nome: "Ana Silva", papel: "aluno" }
];

const sugestoes = [];

const JWT_SEGREDO = process.env.JWT_SEGREDO || 'este-segredo-tem-de-ter-no-minimo-32-caracteres';
const JWT_VALIDADE = parseInt(process.env.JWT_VALIDADE || '900'); 

// --- ROTAS ---

app.post('/v2/sessao', (req, res) => {
    const { utilizador, palavraPasse } = req.body;
    const user = utilizadores.find(u => u.utilizador === utilizador && u.palavraPasse === palavraPasse);
    
    if (!user) {
        return res.status(401).set('Cache-Control', 'no-store').json({
            codigo: 401,
            mensagem: "Credenciais inválidas."
        });
    }

    const token = jwt.sign(
        { sub: user.utilizador, nome: user.nome, papel: user.papel },
        JWT_SEGREDO,
        { expiresIn: JWT_VALIDADE, algorithm: 'HS256' }
    );

    const maxAgeMs = JWT_VALIDADE * 1000;

    res.cookie('sessao', token, { 
        httpOnly: true, 
        sameSite: 'strict', 
        path: '/v2', 
        maxAge: maxAgeMs 
    });

    const expiracaoISO = new Date(Date.now() + maxAgeMs).toISOString();
    
    return res.status(200).set('Cache-Control', 'no-store').json({
        utilizador: user.utilizador,
        nome: user.nome,
        papel: user.papel,
        expiracao: expiracaoISO
    });
});

app.get('/v2/sessao', exigirToken, (req, res) => {
    const expiracaoISO = new Date(req.utilizador.exp * 1000).toISOString();

    return res.status(200).set('Cache-Control', 'no-store').json({
        utilizador: req.utilizador.sub,
        nome: req.utilizador.nome,
        papel: req.utilizador.papel,
        expiracao: expiracaoISO
    });
});

app.delete('/v2/sessao', (req, res) => {
    res.clearCookie('sessao', { path: '/v2' });
    return res.status(204).set('Cache-Control', 'no-store').send();
});

app.post('/v2/sugestoes', exigirToken, exigirPapel('aluno'), (req, res) => {
    const { titulo, descricao, categoria } = req.body;

    const novaSugestao = {
        id: sugestoes.length > 0 ? Math.max(...sugestoes.map(s => s.id)) + 1 : 1,
        titulo,
        descricao,
        categoria,
        numeroAluno: req.utilizador.sub,
        estado: 'submetida',
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString(),
        dataResolucao: null
    };

    sugestoes.push(novaSugestao);

    return res.status(201)
        .set('Location', `/v2/sugestoes/${novaSugestao.id}`)
        .set('Cache-Control', 'no-store')
        .json(novaSugestao);
});

// Obter sugestões (filtradas por aluno ou todas dependendo do papel)
app.get('/v2/sugestoes', exigirToken, (req, res) => {
    let resultados = sugestoes;
    
    // Se for aluno, retorna apenas as sugestões submetidas por ele
    if (req.utilizador.papel === 'aluno') {
        resultados = sugestoes.filter(s => s.numeroAluno === req.utilizador.sub);
    }

    return res.status(200)
        .set('Cache-Control', 'no-store')
        .json(resultados);
});
// --- LISITING DO SERVIDOR (Deve ser SEMPRE a última linha) ---
app.listen(3000, () => {
    console.log('Servidor a escutar na porta 3000...');
});