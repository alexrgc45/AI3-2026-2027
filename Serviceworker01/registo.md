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