| Pedido | `Cache-Control` no contrato | Depende do cookie? | Estratégia no service worker | Guardado em IndexedDB? |
|---|---|---|---|---|
| ficheiros da interface (`/`, `/app.js`, …) | — | Não | Cache First | Não |
| `GET /v2/categorias` | `public, max-age=86400` | Não | Cache First | Não |
| `POST /v2/sessao` | `no-store` | Não | Network Only | Não |
| `GET /v2/sessao` | `no-store` | Sim | Network Only | Não |
| `DELETE /v2/sessao` | `no-store` | Sim | Network Only | Não |
| `GET /v2/sugestoes` | `private` | Sim | Network Only | Sim |
| `POST /v2/sugestoes` | `no-store` | Sim | Network Only | Sim* |

\* O POST não é guardado na Cache API. Quando não existe ligação,
a sugestão é guardada como pendente na IndexedDB para ser enviada
posteriormente.

# Registo de pedidos

| Pedido | Cache-Control | Depende do cookie? | Quem o faz (página / SW) | Quando | Pode ser repetido sem efeitos adicionais? |
|---|---|---|---|---|---|
| GET /v2/sessao | `no-store` | Sim (identifica a sessão pelo cookie `sessao`) | Página | No arranque da aplicação, para saber se há sessão ativa | Sim (leitura) |
| POST /v2/sessao | `no-store` | Não (não exige sessão; é este pedido que cria o cookie via `Set-Cookie`) | Página | Quando o utilizador submete o formulário de login | Não (cada chamada cria uma nova sessão) |
| GET /v2/categorias | `public, max-age=86400` | Não (`security: []`) | Página | Ao abrir o formulário de submissão e os filtros da lista | Sim (leitura) |
| GET /v2/sugestoes | `private, no-cache` | Sim | Página | Ao abrir ou filtrar a lista de sugestões | Sim (leitura) |
| POST /v2/sugestoes sem Idempotency-Key | `no-store` (resposta) | Sim | Página | Quando o aluno submete a sugestão, com ligação | Não (uma repetição cria uma sugestão duplicada) |
| POST /v2/sugestoes com Idempotency-Key | `no-store` (resposta) | Sim | SW (reenvio da fila de pedidos pendentes); a página só na primeira tentativa | Ao recuperar a ligação, depois de uma submissão feita offline | Sim (mesma chave e mesmo corpo devolvem `201` com `Idempotent-Replayed: true`; mesma chave com corpo diferente dá `409`) |
| GET /v2/sugestoes/alteracoes | `private, no-store` | Sim (`cookieSessao`) | SW | Em sincronização, ao recuperar a ligação ou periodicamente, com `desde` igual ao último `cursor` | Sim (leitura) |

## Notas

- O contrato declara `tokenJWT` em `GET /sessao`, mas o pedido só faz sentido com o cookie. Convém alinhar a segurança desta operação com `cookieSessao`.
- O cookie `sessao` é `HttpOnly`, por isso nem a página nem o SW o leem. É o browser que o anexa.

## Perguntas

1. **Os `fetch()` feitos pelo service worker passam pelo seu próprio evento `fetch`?**
   Não. O evento `fetch` só dispara para pedidos de navegação e para pedidos das páginas controladas pelo SW. Os pedidos que o próprio SW faz vão diretamente para a rede.

2. **Levam o cookie?**
   Sim, mas só se as condições se verificarem. A API está num domínio diferente (`api.estgv.exemplo`), por isso o `fetch()` precisa de `credentials: "include"` e o servidor de CORS com credenciais (`Access-Control-Allow-Credentials: true` e origem explícita). Com `SameSite=Strict`, a aplicação e a API têm de ser do mesmo site (mesmo domínio registável, por exemplo `app.estgv.exemplo` e `api.estgv.exemplo`). Se não forem, o cookie não é enviado.

3. **Alguma resposta de `GET /v2/sugestoes/alteracoes` pode entrar na Cache API?**
   Não deve. A resposta traz `private, no-store`, que proíbe o armazenamento, e contém dados pessoais ligados à sessão. A Cache API não respeita `Cache-Control`, por isso `cache.put()` aceitaria a resposta. O SW tem de excluir explicitamente este pedido, sob pena de os dados ficarem no dispositivo depois de terminar a sessão.

   