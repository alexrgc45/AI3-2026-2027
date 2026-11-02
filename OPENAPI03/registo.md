# Registo de Laboratório

## 16. Servidor (Testes cURL)

| # | Pedido | Resultado Obtido |
|---|---|---|
| **T1** | `POST /v2/sessao` (credenciais válidas) | `200 OK` (com cookie `sessao`) |
| **T2** | `POST /v2/sessao` (palavra-passe errada) | `401 Unauthorized` |
| **T3** | `GET /v2/sessao` (com cookie) | `200 OK` (dados do utilizador) |
| **T4** | `GET /v2/sugestoes` (com cookie) | `200 OK` (lista de sugestões) |
| **T5** | `GET /v2/sugestoes` (sem cookie) | `401 Unauthorized` |
| **T6** | `POST /v2/sugestoes` (com cookie) | `201 Created` |
| **T7** | `DELETE /v2/sessao` | `204 No Content` (remove o cookie) |
| **T8** | `GET /v2/sugestoes` (com cookie antigo após T7) | `401 Unauthorized` (sessão revogada) |

## 17. Browser

* **(a)** O cookie `sessao` aparece na lista de cookies com a indicação `HttpOnly` ativa.
* **(b)** Escrever `document.cookie` na consola devolve uma string vazia (`""`).
* **(c)** A sessão mantém-se ativa depois de recarregar a página (`F5`).
* **(d)** As configurações guardadas no `localStorage` mantêm-se após fechar e reabrir o browser.
* **(e)** Ao alterar manualmente o valor de `configuracoes` para `{"tema":"roxo"}` e recarregar, o tema é aplicado.
* **(f)** O rascunho no `sessionStorage` mantém-se ao recarregar a página atual, mas fica vazio num novo separador.