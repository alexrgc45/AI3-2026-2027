### 4.1.2 · Estrategia de cache e sincronizacao

| Pedido | Cache-Control | Quem o faz (pagina / SW) | Funciona sem rede? | Pode ser repetido sem efeitos adicionais? |
| :--- | :--- | :--- | :--- | :--- |
| `GET /v1/categorias` | `public, max-age=3600` | Pagina | Sim (usa a copia guardada em IndexedDB `meta`) | Sim |
| `GET /v1/ocorrencias/semelhantes` | `no-store` | Pagina | Nao (se falhar ou exceder 3 s, grava sem verificar candidatas) | Sim |
| `GET /v1/ocorrencias?bbox=` | `no-store` | Pagina | Parcialmente (mostra o que ja esta em IndexedDB, sem carregar novas areas) | Sim |
| `POST /v1/ocorrencias` sem `Idempotency-Key` | `no-store` | (nao usado pela PWA) | Nao | Nao (pode criar ocorrencias duplicadas se a resposta se perder) |
| `POST /v1/ocorrencias` com `Idempotency-Key` | `no-store` | Service Worker (`executarSincronizacao`) | Sim (fica na fila `pendentes` e e enviado quando ha rede) | Sim (a `Idempotency-Key` devolve a resposta original sem duplicar) |
| `POST /v1/ocorrencias/{id}/reforcos` com `Idempotency-Key` | `no-store` | Service Worker (`executarSincronizacao`) | Sim (fica na fila `pendentes` e e enviado quando ha rede) | Sim (a `Idempotency-Key` e o ID do cidadao impedem duplicacao) |
| `GET /v1/ocorrencias/alteracoes` | `no-store` | Service Worker (`executarSincronizacao`) | Nao (corre apos esvaziar a fila quando ha rede) | Sim |

### Antes de avancar (4.1)

- **Que identifica o cidadao em cada pedido protegido, com e sem OAuth?**
  Sem OAuth, o cidadao e identificado pelo cabecalho `X-Cidadao`, que transporta um UUID gerado pelo dispositivo na primeira utilizacao e guardado no IndexedDB. Com OAuth, apos o servidor trocar o codigo de autorizacao durante o login, passa a ser identificado pelo cookie de sessao `HttpOnly`.

- **Pode uma resposta de `GET /v1/ocorrencias/semelhantes` ser servida da Cache API? Porque?**
  Nao. Servir uma resposta em cache mostraria dados desatualizados, impedindo a detecao de ocorrencias recentes ou mostrando problemas ja resolvidos.

### Antes de avancar (4.2)

- **A Ana e o Bruno enviam ao mesmo tempo o mesmo buraco. Sequencia de operacoes no servidor e por que so nasce uma ocorrencia:**

  Como o Node.js executa o JavaScript numa unica thread (event loop) e nao existe nenhum `await` entre `procurarSemelhantes()` e a escrita em memoria, os dois pedidos sao processados sequencialmente de forma atomica:

  ```text
  Pedido da Ana (t = 0 ms)                  Pedido do Bruno (t = 0 ms, em fila no event loop)
  -----------------------------------------
  -----------------------------------------
  1. procurarSemelhantes() -> [] (vazio)    (aguarda na fila do event loop)
  2. Cria ocorrencia #1 (comunicacoes = 1)
  3. Responde 201 Created
  4. Event loop inicia o pedido do Bruno
  5. procurarSemelhantes() -> encontra #1
  6. Reforca #1 (comunicacoes = 2)
  7. Responde 200 OK (resultado: "reforcada")

  ### 4.7.3 · Tabela de comportamento por gatilho e browser

| Gatilho | Chrome | Firefox | Quem sincroniza | Resultado no servidor |
| :--- | :--- | :--- | :--- | :--- |
| comunicacao com rede, sem semelhantes | Consulta `/semelhantes` (vazio), grava em `pendentes` e regista `sync` | Consulta `/semelhantes` (vazio), grava em `pendentes` e envia `postMessage` | Service Worker (`executarSincronizacao`) | Cria nova ocorrencia (`201 Created`, `comunicacoes = 1`) |
| comunicacao com rede, «E esta» | Mostra candidatas, grava `reforco` em `pendentes` e regista `sync` | Mostra candidatas, grava `reforco` em `pendentes` e envia `postMessage` | Service Worker (`executarSincronizacao`) | Reforca ocorrencia existente (`201 Created`, `comunicacoes` + 1) |
| comunicacao sem rede, com semelhante no servidor | Ignora `/semelhantes`, grava `ocorrencia` em `pendentes`; ao voltar rede dispara `sync` | Ignora `/semelhantes`, grava `ocorrencia` em `pendentes`; no evento `online` envia `postMessage` | Service Worker (`executarSincronizacao`) | Servidor deteta semelhante dentro do raio e funde (`200 OK`, `resultado: "reforcada"`) |
| a rede volta com a aplicacao fechada | Dispara evento `sync` (`sincronizar-reporta`) em segundo plano e conclui envio | Nao suporta Background Sync; envia apenas quando o utilizador voltar a abrir a pagina | Service Worker (Chrome) / Pagina + SW ao reabrir (Firefox) | Ocorrencia criada ou reforcada no servidor sem precisar de separador aberto (Chrome) |
| 503 do servidor | Mantem pendente na fila; browser reagenda evento `sync` com backoff proprio | Mantem pendente na fila; pagina agenda nova tentativa com `tempoDeEspera(falhas)` e `postMessage` | Service Worker (disparado pelo browser no Chrome ou pela pagina no Firefox) | Sem efeitos nos pedidos 503; processa com sucesso assim que o servidor recupera |
| 410 num reforco | Marca pendente com erro `[410]`, continua fila e mostra botoes para criar nova ou descartar | Marca pendente com erro `[410]`, continua fila e mostra botoes para criar nova ou descartar | Service Worker (`marcarErro`) + Pagina (decisao do cidadao) | Ocorrencia mantem-se `resolvida` e contador nao e alterado |

### 4.6.2 · Justificacao da regra de identidade das pendentes

As comunicacoes guardadas na fila `pendentes` mantem o identificador (`cidadao`) com que foram criadas no momento do registo local por tres razoes:

1. **Consistencia e idempotencia:** cada pendente tem uma `Idempotency-Key` associada a um `cidadao` especifico. Se uma primeira tentativa chegou ao servidor antes do login e a resposta se perdeu, a repeticao apos o login tem de enviar exatamente o mesmo `cidadao` e a mesma chave para que o servidor reconheca o pedido repetido em vez de o tratar como um novo utilizador.
2. **Fidelidade ao contexto em que foi comunicada:** se um cidadao comunicou um problema de forma anonima antes de iniciar sessao, a autoria original dessa pendente corresponde ao identificador do dispositivo desse momento, evitando alterar retroativamente dados ja preparados para envio.
3. **Detecao segura de sessao expirada:** se uma pendente foi criada ja com conta autenticada (`github:...` ou `google:...`), manter essa identidade obriga o servidor a validar a respetiva sessao na altura do envio; caso a sessao tenha expirado entretanto, o servidor devolve `401` e o Service Worker para a sincronizacao sem perder a pendente ate o utilizador voltar a entrar.