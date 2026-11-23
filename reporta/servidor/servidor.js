const express = require('express');
const path = require('path');
const { distanciaEmMetros } = require('./geo');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

// Servir ficheiros estaticos da PWA
app.use(express.static(path.join(__dirname, 'public')));

function responderNaoImplementado(req, res) {
  return res.status(501).json({
    erro: `Operacao ${req.method} ${req.path} ainda nao implementada.`
  });
}

// As 8 rotas do contrato OpenAPI respondem 501 Not Implemented
app.get('/v1/categorias', responderNaoImplementado);
app.get('/v1/ocorrencias/semelhantes', responderNaoImplementado);
app.get('/v1/ocorrencias/alteracoes', responderNaoImplementado);
app.get('/v1/ocorrencias', responderNaoImplementado);
app.post('/v1/ocorrencias', responderNaoImplementado);
app.post('/v1/ocorrencias/:id/reforcos', responderNaoImplementado);
app.get('/v1/ocorrencias/:id/fotografia', responderNaoImplementado);
app.patch('/v1/admin/ocorrencias/:id', responderNaoImplementado);

// Qualquer outra rota inexistente responde 404
app.use((req, res) => {
  return res.status(404).json({
    erro: 'Recurso nao encontrado.'
  });
});

app.listen(PORT, () => {
  console.log(`Servidor Reporta (esqueleto) a correr em http://localhost:${PORT}`);
});