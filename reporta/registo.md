# Registo do Projeto — Reporta

## Seccao 2 · Diagnostico inicial

- **(a) A Ana e o Bruno comunicam, sem rede e com dez minutos de diferenca, o mesmo buraco. A Ana sincroniza primeiro. O que deve acontecer quando o Bruno sincronizar? E se for a Ana a comunica-lo duas vezes?**
  Quando o Bruno sincronizar, o servidor verifica que ja existe uma ocorrencia ativa (criada pela Ana) da mesma categoria (`buraco`) dentro do raio definido e funde automaticamente a comunicacao do Bruno nessa ocorrencia (`200 OK`, `resultado: "reforcada"`), incrementando o contador de `comunicacoes` para `2` e registando o Bruno nos participantes. Se for a propria Ana a comunica-lo duas vezes, o servidor deteta que o seu identificador (`X-Cidadao`) ja faz parte dos participantes daquela ocorrencia, pelo que nao cria uma nova nem sobe o contador (mantem `comunicacoes = 1`), respondendo `200 OK` com `resultado: "ja-comunicada"`.

- **(b) O GPS do telemovel indica uma precisao de 60 m e o raio da categoria buraco e 15 m. O que pode correr mal na detecao de duplicados, nos dois sentidos? Como deve a interface reagir?**
  Como o erro estimado do GPS (60 m) e quatro vezes maior do que o raio da categoria (15 m), a detecao pode falhar nos dois sentidos:
  - *Falso negativo (duplicado nao detetado):* dois cidadaos reportam o mesmo buraco, mas o desvio de 60 m coloca as coordenadas a mais de 15 m entre si, levando o sistema a criar duas ocorrencias distintas para o mesmo problema.
  - *Falso positivo (fusao indevida):* dois buracos diferentes na mesma rua (separados por 50 m) ficam a menos de 15 m um do outro devido ao erro do GPS, fazendo o sistema fundir problemas distintos numa unica ocorrencia.
  - *Reacao da interface:* a pagina deve alertar o cidadao de que a precisao atual do GPS e pior do que o raio da categoria e pedir-lhe para ajustar o ponto exato clicando no mapa antes de submeter (ou, sem ligacao ao mapa, sugerir aproximar-se mais do local ou aguardar melhor sinal).

- **(c) O Rui comunica um semaforo sem rede. Quando a comunicacao chega ao servidor, e fundida na ocorrencia 87. O que tem o dispositivo do Rui de fazer ao registo local, que nunca teve um id do servidor?**
  Numa unica transacao atomica no IndexedDB, o dispositivo do Rui tem de: (1) remover a comunicacao da fila de saida `pendentes`; (2) gravar a confirmacao na loja `minhas` ligando o identificador local (`idLocal`) ao identificador oficial do servidor (`ocorrenciaId: 87`, com `resultado: "reforcada"`); e (3) guardar ou atualizar o objeto da ocorrencia `87` na loja `ocorrencias` para que a vista «As minhas comunicacoes» passe a exibir o numero oficial e o estado atual sem recarregar a pagina.

- **(d) Porque nao basta o cliente perguntar `GET /v1/ocorrencias/semelhantes` antes de criar? De dois exemplos em que essa verificacao nao evita o duplicado.**
  Porque o cliente nunca tem garantia de conhecer o estado global atualizado do servidor no instante em que o pedido de criacao e processado. Dois exemplos:
  1. *Comunicacao offline:* sem ligacao a rede, a consulta `/semelhantes` falha ou e saltada e a comunicacao fica guardada localmente; quando a rede volta e a fila sincroniza, outro cidadao ja pode ter comunicado o mesmo problema.
  2. *Pedidos simultaneos ou timeout:* dois cidadaos submetem o mesmo buraco quase ao mesmo tempo (ou o pedido `/semelhantes` excede o tempo limite de 3 segundos); ambos recebem uma lista vazia antes de qualquer um gravar, e sem a verificacao autoritativa no servidor seriam criadas duas ocorrencias duplicadas.

---

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