# Registo de trabalho — API02 (JWT)

Nome: _______________  Nº: _______________

## Utilizadores de teste

As palavras-passe constam apenas deste registo, nunca do repositório do código.

| `utilizador` | `nome` | `papel` | Palavra-passe |
|---|---|---|---|
| `12345` | Ana Silva | `aluno` | `AnaTeste2026` |
| `67890` | Bruno Costa | `aluno` | `BrunoTeste2026` |
| `rita.sousa` | Rita Sousa | `servicos` | `RitaTeste2026` |

## 2.2 · Diagnóstico inicial

**(a)** Porque é que um servidor não sabe quem enviou o `numeroAluno` no corpo do pedido?

> Porque o corpo é escrito por quem faz o pedido, por isso qualquer pessoa pode pôr o número de outro aluno. Com o token, a identidade vem assinada pelo servidor e é essa que se usa.

**(b)** O que se pode ler e fazer com um JWT intercetado, sem o segredo?

> Dá para ler o payload, porque só está codificado e não cifrado, e dá para reutilizar o token até expirar. Não dá para o alterar, porque a assinatura deixa de bater certo.

**(c)** Qual é a diferença entre `401` e `403` no comportamento do cliente?

> No 401 o utilizador não está autenticado ou o token expirou, por isso o cliente termina a sessão e pede novo login. No 403 está autenticado mas não tem permissão, por isso a sessão mantém-se e mostra-se um aviso.

**(d)** Porque é que `private` não é facultativo numa resposta a um pedido com `Authorization`?

> Porque a resposta é só daquele utilizador. Se uma cache partilhada a guardasse, podia entregá-la a outra pessoa.

## Antes de avançar — opções passadas a `jwt.verify` (CA5)

| Opção | Valor | O que impede |
|---|---|---|
| `algorithms` | `["HS256"]` | Aceitar tokens com outro algoritmo, como `alg: none` (sem assinatura). |
| `ignoreExpiration` | `false` | Aceitar tokens expirados. |
| `clockTolerance` | `0` | Dar folga depois do `exp`: o token deixa de valer no momento certo. |

## 4.4 · Verificação

### Contrato (passo 27)

Ferramenta: `npx @redocly/cli lint sugestoes.openapi.yaml`.

| Alteração introduzida | Tipo de problema | Ferramenta | Mensagem obtida | O que a mensagem permitiu (ou não) concluir |
|---|---|---|---|---|
| `tokenJWT` no `security` da raiz sem o declarar em `securitySchemes` | OpenAPI inválido | Redocly, `security-defined` (erro) | `There is no tokenJWT security scheme defined.` | Mostra o que falta e onde. Não diz o efeito, que é as operações ficarem sem autenticação definida. |
| `type: bearer` em vez de `type: http` | OpenAPI inválido | Redocly, `struct` (3 erros) | `type can be one of the following only: "apiKey", "http", "oauth2", "openIdConnect".` | Diz o valor errado e os válidos. Os outros dois erros vêm do primeiro. |
| `- tokenJWT: [servicos]` em `registarAcompanhamento` | Válido para o lint | Redocly | Nenhuma | O lint não deteta nada. `servicos` é um papel e não um âmbito, mas isso só se vê a ler. |
| Retirar o `security: []` de `listarCategorias` | Válido para o lint | Redocly | Nenhuma | Fica válido, mas a operação passa a exigir token. Só se nota ao testar sem `Authorization`. |
| `numeroAluno` em `required` de `SugestaoNova` após a remoção da propriedade | Válido para o lint | Redocly | Nenhuma | O lint não protesta, mas o campo obrigatório já não existe. Só se apanha a rever. |
| `tipo: "bearer"` (minúsculas) no exemplo do `Token` | Exemplo inválido | Redocly, `no-invalid-media-type-examples` (aviso) | `Example value must conform to the schema: tipo property must be equal to one of the allowed values "Bearer".` | Diz o campo e o valor certo. Mas é só aviso, por isso o ficheiro passa na mesma. |

### Servidor (passo 28)

| # | Pedido | Código | `Cache-Control` | `WWW-Authenticate` | Corpo | Diverge do contrato? |
|---|---|---|---|---|---|---|
| T1 | POST v2/tokens, credenciais da Ana |	200	| no-store |	ausente	| {"token":"eyJ…","tipo":"Bearer","expiraEm":900} |	Não | | | | | |
| T2 | POST /v2/tokens, palavra-passe errada |	401	| no-store |	ausente	| {"codigo":401,"mensagem":"Utilizador ou palavra-passe incorretos."}	| Não | | | | | |
| T3 | POST /v2/tokens, "utilizador":"99999" |	401 |	no-store |	ausente	| idêntico ao de T2	|Não | | | | | |
| T4 | POST /v2/tokens, "utilizador":12345 |	400 |	no-store |	ausente	| {"codigo":400,"mensagem":"Credenciais em formato inválido.","detalhes":[{"campo":"utilizador","problema":"Campo obrigatório do tipo texto."}]}|	Não | | | | | |
| T5 | POST | 400 | no-store | (ausente) | {"codigo":400,"mensagem":"Corpo JSON mal formado.","detalhes":[{"campo":"body","problema":"JSON inválido."}]} | Não`{utilizador:` | | | | | |
| T6 | GET /v2/sugestoes sem Authorization	| 401	| no-store |	Bearer	| {"codigo":401,"mensagem":"Token em falta ou inválido."} |	Não | | | | | |
|  T7 | GET /v2/sugestoes, token da Ana | 200 | `private, no-cache` | ausente | `ListaSugestoes`, `total: 3`, só as sugestões 1, 2 e 4 (`numeroAluno` 12345) | Não || | | | | |
 T9 | T7 com um carácter do payload alterado | 401 | `no-store` | `Bearer error="invalid_token"` | `{"codigo":401,"mensagem":"Token em falta ou inválido."}` | Não || | | | | |
| T10 | T7 com token expirado (`JWT_VALIDADE=10`) | 401 | `no-store` | `Bearer error="invalid_token"` | igual a T9 (antes de expirar, o mesmo token dá 200) | Não || | | | | |
| T11 | T7 com `{"alg":"none","typ":"JWT"}` e assinatura vazia | 401 | `no-store` | `Bearer error="invalid_token"` | igual a T9 | Não || | | | | |
| T12 | T7 após «Terminar sessão», com o token copiado | 200 | `private, no-cache` | ausente | `ListaSugestoes` com `total: 3` (as sugestões da Ana) | Ver explicação || | | | | |

**T12 — explicação:** O token continuou a funcionar. «Terminar sessão» só apaga o token no cliente e o servidor não guarda tokens revogados, por isso aceita-o até ao `exp`.

### Cliente (passo 29)
- (a) POST /v2/tokens e a resposta: no separador Rede, o pedido `tokens` é um POST com o corpo `{"utilizador":"12345","palavraPasse":"AnaTeste2026"}`. A resposta é `200`, com `Cache-Control: no-store` e o corpo `{"token":"eyJ…","tipo":"Bearer","expiraEm":900}`.
- (b) Cabeçalho `Authorization` no pedido das sugestões: o pedido `sugestoes` leva `Authorization: Bearer eyJ…` nos cabeçalhos do pedido, e a resposta é `200` com `Cache-Control: private, no-cache`.
- (c) Termo automático de sessão com `JWT_VALIDADE=30`: o tempo remanescente conta de 30 até 0 e, ao chegar a zero, o cliente volta ao formulário de entrada com a mensagem «Sessão expirada. É necessária nova autenticação.», sem nenhum pedido novo no separador Rede.
- (d) Recarregamento da página com sessão ativa: o token só existe numa variável, por isso perde-se e volta o formulário de entrada.
- (e) `localStorage` e `sessionStorage`: vazios, porque o token nunca é guardado lá.

### Construções (passo 30)

| Construção | Onde foi utilizada | O que passou a ser exigido | O que continua a ser permitido |
|---|---|---|---|
| `securitySchemes` http/bearer | `components.securitySchemes.tokenJWT` | Enviar `Authorization: Bearer <JWT>` | O formato interno do JWT |
| `security` na raiz | Raiz do contrato | Autenticação em todas as operações | Operações públicas com `security: []` |
| `security: []` | Estatísticas, categorias e `criarToken` | Nada | Chamada sem token |
| `readOnly` em `numeroAluno` | `Sugestao.numeroAluno` | O cliente não o envia | Recebê-lo nas respostas |
| resposta 401 + `WWW-Authenticate` | `NaoAutenticado` e `listarSugestoes` | Indicar `Bearer` no cabeçalho | O mesmo corpo `Erro` |
| resposta 403 | `Proibido` | Verificar o papel | O `404` para sugestões de outros |
| `exigirToken` + `jwt.verify` | `autenticacao.js`, em `GET /v2/sugestoes` | Token HS256 válido e não expirado | Qualquer utilizador com token válido até ao `exp` |
| `Cache-Control: no-store` em `criarToken` | `POST /tokens` | O token não fica em cache | Cache pública nas estatísticas e categorias |

## 4.5 · Reflexão crítica (passo 31)

1. **Termo de sessão.** Só apaga o token no cliente. No servidor o token continua válido até expirar.
2. **15 segundos e 15 dias.** Com 15 segundos há pouco risco mas é preciso renovar sempre. Com 15 dias é cómodo, mas um token roubado vale muito tempo.
3. **`localStorage` e cookies `HttpOnly`.** O `localStorage` pode ser lido por um script injetado (XSS). O cookie `HttpOnly` não, mas fica exposto a CSRF.
4. **Alternativas ao papel no token.** Ir buscar o papel a cada pedido, ou usar sessões no servidor. Assim as mudanças valem logo.
5. **Partilha do segredo.** Quem tem o segredo consegue criar tokens de qualquer utilizador. Com chaves pública e privada, só o emissor assina.
6. **Limite de tentativas.** O login permite tentativas ilimitadas. Devia haver um limite por utilizador e por IP, com resposta 429.
7. **Sem HTTPS em `localhost`.** Em `localhost` não faz mal, porque o tráfego não sai da máquina. Em produção, a palavra-passe e o token iam em claro.
8. **O que garantem contrato, servidor e testes.** O contrato descreve a forma, o servidor aplica as regras e os testes cobrem só os casos que corremos. Nenhum garante tudo, e o lint não vê erros de significado.