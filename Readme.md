# Guia do Estudante

Este repositório contém os exercícios e tarefas da disciplina. Segue este guia para configurar a tua área de trabalho local, resolver as tarefas e submetê-las para avaliação.

> **Modelo de trabalho:** *fork* + *branch* por tarefa + *Pull Request*. Cada estudante trabalha na sua cópia pessoal do repositório e submete o trabalho através de um Pull Request para o repositório do docente.

## Índice

- [0. Pré-requisitos](#0-pré-requisitos)
- [1. Configuração inicial (setup)](#1-configuração-inicial-setup)
- [2. Fluxo de trabalho passo a passo](#2-fluxo-de-trabalho-passo-a-passo)
- [3. Avaliação e integração de novas tarefas](#3-avaliação-e-integração-de-novas-tarefas)
- [4. Exemplo prático completo (Tarefa 2)](#4-exemplo-prático-completo-tarefa-2)
- [5. Referência rápida de comandos](#5-referência-rápida-de-comandos)
- [6. Problemas frequentes](#6-problemas-frequentes)
- [7. Regras de ouro](#7-regras-de-ouro)

---

## 0. Pré-requisitos

- **Conta no GitHub** ([criar aqui](https://github.com/signup)).

Se NÃO for utilizado o IntelliJ podem ser seguidos os passos seguintes para configurar o repositório Git em linha de comando:
- **Identidade configurada** (só é preciso fazer uma vez por computador):
- **Git instalado** ([download](https://git-scm.com/downloads)). Verifica com `git --version`.

  ```bash
  git config --global user.name "O Teu Nome"
  git config --global user.email "o_teu_email@exemplo.pt"
  ```

- **Autenticação configurada.** O GitHub já não aceita palavra-passe na linha de comandos. Usa uma das opções:
   - [GitHub CLI](https://cli.github.com/): `gh auth login` (mais simples);
   - ou uma [chave SSH](https://docs.github.com/pt/authentication/connecting-to-github-with-ssh).

---

## 1. Configuração inicial (*setup*)

Esta secção faz-se **uma única vez**, no início do semestre.

### 1.1. Fazer *fork* do repositório

Na página do repositório do docente ([`cunhaestgv/AI3-2026-2027`](https://github.com/cunhaestgv/AI3-2026-2027)), clica em **Fork** (canto superior direito) para criar uma cópia pessoal na tua conta:

```text
cunhaestgv/AI3-2026-2027   →   O-TEU-UTILIZADOR/AI3-2026-2027
```

### 1.2. Clonar o *teu fork* para a máquina local

> ⚠️ Atenção: o clone é feito a partir do **teu fork**, não do repositório do docente. Substitui `O-TEU-UTILIZADOR` pelo teu nome de utilizador do GitHub.

```bash
git clone https://github.com/O-TEU-UTILIZADOR/AI3-2026-2027.git
cd AI3-2026-2027
```

### 1.3. Adicionar o repositório do docente como `upstream`

O `upstream` é a ligação ao repositório original, que permite receber as novas tarefas publicadas pelo docente:

```bash
git remote add upstream https://github.com/cunhaestgv/AI3-2026-2027.git
```

### 1.4. Confirmar que está tudo correto

```bash
git remote -v
```

O resultado esperado é:

```text
origin    https://github.com/O-TEU-UTILIZADOR/AI3-2026-2027.git (fetch)
origin    https://github.com/O-TEU-UTILIZADOR/AI3-2026-2027.git (push)
upstream  https://github.com/cunhaestgv/AI3-2026-2027.git (fetch)
upstream  https://github.com/cunhaestgv/AI3-2026-2027.git (push)
```

| *Remote* | Aponta para | Serve para |
| --- | --- | --- |
| `origin` | O **teu** fork | Enviar (*push*) o teu trabalho |
| `upstream` | Repositório do **docente** | Receber (*fetch*) novas tarefas |

---

## 2. Fluxo de trabalho para uma nova tarefa

Repete esta sequência **sempre que iniciares uma nova tarefa**.

<img width="1472" height="1312" alt="image" src="https://github.com/user-attachments/assets/6f4712f2-400a-49ff-ba28-c9f93e3dfeff" />

### Passo A — Atualizar a branch principal (`master`)

Antes de começar, garante que tens a versão mais recente publicada pelo docente:

```bash
git checkout master
git fetch upstream
git merge upstream/master
git push origin master
```

### Passo B — Criar uma branch para a tarefa

Nunca trabalhes diretamente na `master`. Cria uma branch nova por cada exercício:

```bash
git checkout -b tarefa-1
```

**Convenção de nomes:** letras minúsculas, sem acentos nem espaços — `tarefa-1`, `tarefa-2`, `tarefa-3-extra`.

### Passo C — Trabalhar, fazer *commit* e *push*

Resolve o exercício, guarda o progresso com *commits* e envia a branch para o teu fork:

```bash
git status                 # ver o que foi alterado
git add .                  # preparar as alterações
git commit -m "Resolução da Tarefa 1"
git push origin tarefa-1
```

**Boas práticas de *commit*:**

- Escreve mensagens no commit que descrevam **o que** foi feito: `"Implementação da Tarefa UDP001"` em vez de `"update"` ou `"cenas"`.
- Não envies ficheiros gerados pela compilação nem pastas do IDE (`bin/`, `target/`, `.idea/`, `node_modules/`) — usa um ficheiro `.gitignore`.

### Passo D — Criar o *Pull Request* (PR) para avaliação

1. Acede à página do **teu fork** no GitHub.
2. Clica no botão **Compare & pull request** que aparece relativo à branch enviada (`tarefa-1`).
3. Confirma a direção do PR:
   - **base repository:** `cunhaestgv/AI3-2026-2027` · **base:** `master`
   - **head repository:** `O-TEU-UTILIZADOR/AI3-2026-2027` · **compare:** `tarefa-1`
4. Dá um título claro ao PR (ex.: `Tarefa UDP001`) e descreve brevemente o que foi feito.
5. Clica em **Create pull request** e aguarda a revisão do docente.

> 💡 Podes continuar a fazer *commits* e *push* para a branch `tarefa-1` depois de abrires o PR — o Pull Request atualiza-se automaticamente. É assim que se aplicam as correções pedidas na revisão.

---

## 3. Avaliação e integração de novas tarefas

1. **Revisão:** o docente avalia o Pull Request na aula, durante a apresentação.
2. **Merge:** quando o trabalho é aprovado, o docente aceita (*merge*) as alterações e/ou publica novas tarefas no repositório central (`upstream`).
3. **Sincronização:** depois do *merge*, volta à `master`, sincroniza com as novidades e elimina a branch já concluída:

```bash
# Voltar à branch master
git checkout master

# Obter e aplicar as novas tarefas/atualizações do docente
git fetch upstream
git merge upstream/master

# Atualizar o teu fork no GitHub
git push origin master

# (Opcional) Eliminar a branch da tarefa já concluída
git branch -d tarefa-1              # local
git push origin --delete tarefa-1   # no teu fork do GitHub
```

---

## 4. Exemplo prático completo (Tarefa 2)

```bash
# 1. Garantir que a master está atualizada
git checkout master
git fetch upstream
git merge upstream/master
git push origin master

# 2. Criar a branch da Tarefa 2
git checkout -b tarefa-2

# 3. Trabalhar nos ficheiros, adicionar e fazer commit
git add .
git commit -m "Resolução da Tarefa 2: sincronização entre threads"

# 4. Enviar a branch para o teu fork
git push origin tarefa-2

# 5. Abrir o Pull Request no GitHub para o docente avaliar
```

---

## 5. Referência rápida de comandos

| Objetivo                                        | Comando |
|-------------------------------------------------| --- |
| Ver o estado do repositório                     | `git status` |
| Ver em que branch estou                         | `git branch` |
| Ver o histórico resumido                        | `git log --oneline --graph --all` |
| Mudar de branch                                 | `git checkout nome-da-branch` |
| Criar e mudar para uma branch                   | `git checkout -b nome-da-branch` |
| Ver alterações ainda não preparadas             | `git diff` |
| Descartar alterações num ficheiro               | `git restore ficheiro.txt` |
| Obter novos ficheiros do respositório do docente | `git fetch upstream && git merge upstream/master` |

---

## 6. Problemas frequentes

<details>
<summary><strong>Fiz commits na branch <code>master</code> por engano</strong></summary>

Move o trabalho para uma branch nova (ainda não foi feito *push*):

```bash
git checkout -b tarefa-1     # leva os commits para a nova branch
git checkout master
git reset --hard upstream/master   # limpa a master (perde alterações não commitadas!)
```
</details>

<details>
<summary><strong>Aparecem conflitos no <code>git merge upstream/master</code></strong></summary>

O Git indica os ficheiros em conflito. Abre cada um, procura os marcadores `<<<<<<<`, `=======` e `>>>>>>>`, escolhe a versão correta, apaga os marcadores e depois:

```bash
git add ficheiro-resolvido
git commit
```

Em caso de dúvida, `git merge --abort` cancela o merge e devolve tudo ao estado anterior.
</details>

<details>
<summary><strong><code>git branch -d</code> recusa apagar a branch</strong></summary>

Acontece quando o Git ainda não vê a branch como integrada localmente (o *merge* foi feito no GitHub). Depois de confirmares que o PR foi aceite, força a eliminação:

```bash
git branch -D tarefa-1
```
</details>

<details>
<summary><strong>O botão "Compare & pull request" não aparece</strong></summary>

Vai ao separador **Pull requests** do repositório do docente → **New pull request** → **compare across forks** e seleciona manualmente a tua branch.
</details>

<details>
<summary><strong>Enviei o PR para o sítio errado</strong></summary>

Fecha o Pull Request e abre um novo, confirmando que **base repository** é `cunhaestgv/AI3-2026-2027` e **base** é `master`.
</details>

<details>
<summary><strong>O meu fork está muito desatualizado</strong></summary>

Na página do teu fork no GitHub, clica em **Sync fork** → **Update branch**. Depois, localmente: `git checkout master && git pull origin master`.
</details>

---

## 7. Regras de ouro

1. ✅ Uma **branch por tarefa** — nunca trabalhar diretamente na `master`.
2. ✅ **Atualizar a `master`** (`fetch` + `merge upstream/master`) antes de criar cada branch nova.
3. ✅ **Commits** com mensagens descritivas.
4. ✅ Fazer **push antes da aula** — o PR tem de estar aberto no momento da apresentação.
5. ❌ Nunca fazer `git push --force` para a `master`.
6. ❌ Não submeter binários, executáveis nem pastas de configuração do IDE.

SERVICEWORKER02

# Registo — Ficha API02 (autenticação com JWT)

## Utilizadores de teste

| utilizador | nome | papel | palavra-passe |
|---|---|---|---|
| `12345` | Ana Silva | aluno | `SenhaAna2026` |
| `67890` | Bruno Costa | aluno | `SenhaBruno2026` |
| `rita.sousa` | Rita Sousa | servicos | `SenhaRita2026` |

Arranque: `npm install`, criar `.env` a partir de `.env.exemplo` (com `JWT_SEGREDO` de pelo menos 32 caracteres aleatórios, por exemplo `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) e `node --env-file=.env servidor.js`. Cliente em http://localhost:3000.

---

## «Antes de avançar»

### 4.1 — Que cliente da v1 deixa de funcionar?

Deixa de funcionar qualquer cliente da v1 que envie `numeroAluno` no corpo e chame operações sem token: passa a obter 401 em todas as operações protegidas, e o URL base mudou de `/v1` para `/v2`. Foi uma alteração incompatível (daí 2.0.0, e não 1.1.0): acrescentar `security` torna obrigatório algo que antes não existia, e retirar `numeroAluno`/`responsavel` dos corpos muda o significado do pedido. Isto responde à questão final da reflexão da API01: o servidor passa a saber quem pede porque a identidade vem do token assinado, e não de um campo que o cliente escolhe.

### 4.1 — O contrato aceita ou rejeita `numeroAluno` no corpo de POST /sugestoes?

Aceita. O contrato exclui `additionalProperties`, e por omissão o OpenAPI/JSON Schema admite propriedades não declaradas; um corpo com `numeroAluno` continua conforme com `SugestaoNova`. O servidor tem de **ignorar** esse valor e usar sempre o `sub` do token (a identidade nunca vem do corpo). Rejeitar com 400 seria também defensável, mas exigiria uma regra que o contrato não consegue exprimir. (Em `servidor.js`, a sugestão guarda `numeroAluno` do token, nunca do corpo.)

### 4.1 — Cache: a resposta depende da identidade do requerente?

| Resposta | Depende da identidade? | Política |
|---|---|---|
| GET /sugestoes 200 | sim | `private, no-cache` |
| POST /sugestoes 201 | sim | `no-store` |
| GET /sugestoes/{id} 200 e 304 | sim | `private, no-cache` |
| PUT /sugestoes/{id} 200 | sim | `no-store` |
| DELETE /sugestoes/{id} 204 | sim | `no-store` |
| GET /sugestoes/{id}/acompanhamentos 200 | sim | `private, no-cache` |
| POST …/acompanhamentos 201 | sim | `no-store` |
| GET /estatisticas/* 200 | não | `public, max-age=3600` |
| GET /categorias 200 | não | `public, max-age=86400` |
| POST /tokens 200 | contém o token | `no-store` |
| todas as 401 e 403 | — | `no-store` |

### 4.2 — Opções passadas a `jwt.verify`

`{ algorithms: ['HS256'] }`.

- `algorithms: ['HS256']` impede que o servidor aceite o algoritmo que o token indicar: bloqueia `alg: none` (token sem assinatura, T11) e ataques de confusão de algoritmo. Sem esta opção, o comportamento dependeria de valores por omissão da biblioteca e do tipo de chave, o que é uma superfície de ataque desnecessária.
- `ignoreExpiration` fica no valor por omissão (`false`): `exp` é verificado (T10).
- O segredo vem de `JWT_SEGREDO` e não do código.

---

## 4.4 — Contrato: seis alterações deliberadas

Linter: `npx @redocly/cli lint` (Redocly CLI). O ficheiro correto passa sem erros nem avisos.

| Alteração introduzida | Tipo de problema | Ferramenta | Mensagem obtida | O que a mensagem permitiu (ou não) concluir |
|---|---|---|---|---|
| Referir um esquema no `security` da raiz sem o declarar em `securitySchemes` (usei `tokenXPTO`) | OpenAPI inválido (referência inexistente) | Redocly lint | `error security-defined: There is no 'tokenXPTO' security scheme defined.` | Aponta a linha e o nome em falta; deteta o erro de referência, não o erro de intenção. |
| `type: bearer` em vez de `type: http` | OpenAPI inválido | Redocly lint | `type can be one of the following only: "apiKey", "http", "oauth2", "openIdConnect"`; e `scheme`/`bearerFormat` `is not allowed here` | O `bearer` é o valor de `scheme`, não de `type`. Os dois erros seguintes são consequência do primeiro. |
| `- tokenJWT: [servicos]` em `registarAcompanhamento` | Sintaxe válida; semanticamente fora da regra | Redocly lint | **Nenhuma** (`valid`) | O linter **não** rejeitou. A especificação 3.0.3 diz que, em esquemas que não são oauth2, a lista deve ser vazia, mas esta ferramenta não o verifica; e `servicos` não é um scope, é um papel. O contrato fica enganador: parece exprimir o papel e não o exprime nem o impõe. O papel tem de ficar na `description` e ser verificado no servidor. |
| Retirar `security: []` de `listarCategorias` | Válido, mas muda o contrato | Redocly lint (`diff` ao ficheiro) | **Nenhuma** (`valid`) | A operação passa a herdar o `security` da raiz, ou seja, torna-se protegida. Nenhum erro, porque é um contrato coerente; só uma revisão ou testes o apanham. Um cliente deixa de poder ler as categorias sem token (e `public, max-age` deixaria de fazer sentido). |
| `numeroAluno` mantido em `required` de `SugestaoNova` sem a propriedade | Válido (semântica errada) | Redocly lint | **Nenhuma** (`valid`) | O OpenAPI admite `required` com nome não declarado em `properties`; mas torna impossível cumprir o contrato (o cliente seria obrigado a enviar um campo que o servidor deve ignorar). |
| `tipo: "bearer"` (minúsculas) no exemplo de `Token` | Exemplo inválido | Redocly lint | `warning no-invalid-media-type-examples: Example value must conform to the schema: tipo property must be equal to one of the allowed values "Bearer".` | É um **aviso**, não um erro: o documento continua válido, mas o exemplo contradiz o `enum`. Convém tratar avisos como erros. |

Conclusão: o linter valida a estrutura do documento, não a intenção. Três das seis alterações passaram sem qualquer mensagem.

## 4.4 — Servidor: testes com curl

Servidor com `JWT_VALIDADE=900` (T10 com `JWT_VALIDADE=10`). Corpos encurtados onde indicado.

| # | Pedido | Código | Cache-Control | WWW-Authenticate | Corpo | Conforme? |
|---|---|---|---|---|---|---|
| T1 | `POST /v2/tokens` (Ana) | 200 | `no-store` | — | `{"token":"<jwt>","tipo":"Bearer","expiraEm":900}` | sim |
| T2 | `POST /v2/tokens`, palavra-passe errada | 401 | `no-store` | **ausente** | `{"codigo":401,"mensagem":"Credenciais inválidas."}` | sim |
| T3 | `POST /v2/tokens`, `"utilizador":"99999"` | 401 | `no-store` | ausente | idêntico a T2 (comparado com `cmp`: byte a byte iguais) | sim |
| T4 | `POST /v2/tokens`, `"utilizador":12345` (número) | 400 | `no-store` | — | `{"codigo":400,"mensagem":"O corpo do pedido não cumpre o esquema Credenciais.","detalhes":[{"campo":"utilizador","problema":"…"}]}` | sim |
| T5 | `POST /v2/tokens`, corpo `{utilizador:` | 400 | `no-store` | — | `{"codigo":400,"mensagem":"O corpo do pedido não é JSON válido."}` (JSON, não HTML) | sim |
| T6 | `GET /v2/sugestoes` sem Authorization | 401 | `no-store` | `Bearer` | `{"codigo":401,"mensagem":"Token em falta."}` | sim |
| T7 | `GET /v2/sugestoes` (token da Ana) | 200 | `private, no-cache` | — | `total: 2`, ids 1 e 2, ambos `numeroAluno: "12345"` | sim |
| T8 | `GET /v2/sugestoes` (token da Rita) | 200 | `private, no-cache` | — | `total: 4`, todas as sugestões | sim |
| T9 | T7 com `papel` alterado no payload (para `servicos`) | 401 | `no-store` | `Bearer error="invalid_token"` | `Token inválido ou expirado.` | sim |
| T10 | T7 com token expirado (`JWT_VALIDADE=10`, esperados 11 s) | 401 | `no-store` | `Bearer error="invalid_token"` | `Token inválido ou expirado.`; antes de expirar, o mesmo token deu 200 | sim |
| T11 | T7 com `{"alg":"none"}`, payload da Ana, assinatura vazia | 401 | `no-store` | `Bearer error="invalid_token"` | `Token inválido ou expirado.` | sim |
| T12 | T7 com o token usado depois de «Terminar sessão» no cliente | **200** | `private, no-cache` | — | lista da Ana | ver abaixo |

**T12.** O token continuou a ser aceite. «Terminar sessão» apenas apaga a variável `token` do cliente e para o temporizador; o servidor não guarda nada que possa invalidar um token (é autossuficiente), por isso aceita-o enquanto a assinatura for válida e `exp` não passar. Quem tiver uma cópia (por exemplo, copiada do separador Rede) pode usá-lo até aos 15 minutos.

Verificações adicionais: sem `JWT_SEGREDO`, o servidor não arranca (`Erro de configuração: JWT_SEGREDO não está definido…`); com 5 caracteres, também não (`…tem 5 caracteres; são necessários pelo menos 32`). `GET /v2/openapi.yaml` devolve 200. Um `Authorization: Basic …` dá 401 com `WWW-Authenticate: Bearer`. Um caminho `/v2` inexistente dá 404 JSON.

## 4.4 — Cliente (a confirmar no browser)

> Os pontos abaixo exigem as ferramentas de programador de um browser real. **Não os consegui executar neste ambiente**; descrevo o comportamento esperado a partir do código, para confirmares e registares com captura do separador Rede.

- **(a)** `POST /v2/tokens` com corpo `{"utilizador":…,"palavraPasse":…}`; resposta 200 com `Cache-Control: no-store` e o token no corpo.
- **(b)** O pedido `GET /v2/sugestoes` leva `Authorization: Bearer eyJ…`.
- **(c)** Com `JWT_VALIDADE=30`, o tempo remanescente conta até 0 e a interface regressa ao formulário com «Sessão expirada. É necessária nova autenticação.», sem pedido ao servidor (a verificação é feita no temporizador de 1 s).
- **(d)** Recarregar a página com sessão ativa regressa ao formulário de entrada: o token está numa variável do módulo e perde-se. É a consequência esperada da escolha.
- **(e)** `localStorage` e `sessionStorage` ficam vazios (o código não os usa).
- **Nome acentuado:** `descodificarPayload` foi testado em Node com `João Antunes Ração` e devolve o texto correto (UTF-8 via `TextDecoder`).

## 4.4 — Construções

| Construção | Onde foi utilizada | O que passou a ser exigido | O que continua a ser permitido |
|---|---|---|---|
| `securitySchemes` http/bearer | `components.securitySchemes.tokenJWT` | `Authorization: Bearer <JWT>` nas operações protegidas | Qualquer formato de JWT: `bearerFormat` é só informativo |
| `security` na raiz | Raiz do documento | Todas as operações exigem `tokenJWT` por omissão (esquecer uma isenção protege, não expõe) | Isentar operações individuais |
| `security: []` | `listarCategorias`, estatísticas e `criarToken` | Nada: declara explicitamente que são públicas | Pedir sem token |
| `readOnly` em `numeroAluno` | `Sugestao.numeroAluno` | O cliente não o envia; o servidor atribui-o a partir do `sub` | O cliente lê-o na resposta |
| Resposta 401 + `WWW-Authenticate` | `components.responses.NaoAutenticado` (e `listarSugestoes`) | Informar o esquema (`Bearer`) e o erro (`invalid_token`); `no-store` | Repetir o pedido depois de autenticar de novo |
| Resposta 403 | `components.responses.Proibido` (criar, editar, retirar, acompanhar) | Papel adequado (aluno ou servicos) | Outros papéis usarem as outras operações |
| `exigirToken` + `jwt.verify` | `autenticacao.js` | Cabeçalho `Bearer`, assinatura HS256 válida e `exp` não ultrapassado | Qualquer utilizador autenticado, até a verificação de papel |
| `Cache-Control: no-store` em `criarToken` | 200 de `POST /tokens` (e 401/403) | Nenhuma cache, privada ou partilhada, guarda o token | O cliente guarda-o em memória |

---

## 4.5 — Reflexão crítica

**1. T12.** O termo de sessão apenas descarta o token no cliente e repõe o formulário; o servidor continua a aceitá-lo até `exp`. Para o invalidar no servidor seria preciso um registo (lista de tokens revogados ou um identificador `jti` consultado em cada pedido). Isso devolve o estado ao servidor e anula a vantagem do token autossuficiente (verificar sem consultar nada). Esse mecanismo (revogação) está fora do âmbito desta ficha; a solução de base não resolve o problema e fica remetido para fase posterior.

**2. 15 s vs 15 min vs 15 dias.** 15 s: um token roubado vale pouco, mas o utilizador teria de se autenticar constantemente, e sem renovação a aplicação é inutilizável. 15 dias: conveniência máxima, mas um token interceptado equivale à palavra-passe durante duas semanas, e uma mudança de papel demora esse tempo a refletir-se. 15 min é um compromisso: janela de abuso curta, com a incomodidade de reautenticar.

**3. Variável vs localStorage; cookie HttpOnly.** O `localStorage` é legível por qualquer script da página: um XSS lê o token e envia-o para fora, e persiste após fechar o browser. A variável do módulo reduz a exposição (um XSS ainda pode usar o token enquanto a página está aberta, mas não o encontra em armazenamento e perde-se ao recarregar). Um cookie `HttpOnly` impede a leitura por JavaScript, mas introduz outro problema: o browser anexa-o automaticamente, o que abre a porta a CSRF (mitigável com `SameSite`, o que exige mecanismos de cookies, excluídos desta ficha).

**4. Papel no token vs consulta ao servidor.** Alternativa: o token leva só o `sub` e o servidor consulta o papel numa base de dados em cada pedido. Papel no token: verificação sem consulta, mas uma alteração de papel só se reflete quando o token expira (até 15 min; ver CA6: se o papel muda às 10h00, o token antigo `papel: aluno` pode ser aceite até 10h15 no pior caso). Consulta: reflete a alteração de imediato, à custa de um acesso por pedido (e perde a autossuficiência).

**5. Estatísticas noutro serviço com HS256.** Verificar a assinatura exige o mesmo segredo; o outro serviço teria de o conhecer, e quem o conhece também pode **emitir** tokens válidos. Quantos mais serviços partilharem o segredo, maior a superfície de fuga. Seria o caso de usar um algoritmo assimétrico (chave pública só verifica), mas está fora do âmbito (HS256 apenas).

**6. Tentativas sucessivas de palavra-passe.** O contrato não consegue exprimir um limite de tentativas. Teria de ser imposto no servidor (ou num proxy/gateway à frente dele), por IP e/ou utilizador, respondendo `429 Too Many Requests` (com `Retry-After`). Não está implementado nesta ficha.

**7. HTTP em localhost.** Nenhuma. O token Bearer viaja em claro e qualquer observador da rede o lê e reutiliza; a assinatura garante integridade, não confidencialidade. Em produção, HTTPS é obrigatório; em localhost o risco é aceitável por o tráfego não sair da máquina.

**8. Garantias: contrato, servidor, testes.** O contrato **declara** (security, 401/403/404, papel em texto), mas não impõe nada, e o papel nem sequer é exprimível de forma estruturada (a lista de `tokenJWT` é vazia). O servidor **garante** a regra «apenas o autor edita» apenas se o código a verificar: nesta ficha só `POST /tokens` e `GET /sugestoes` estão implementados, portanto a regra de propriedade para PUT/DELETE **não** está garantida por nenhum dos três. Os testes só provam os casos testados (T1–T12), não a ausência de outros caminhos.

---

## Notas para a avaliação oral (CA6)

- **Segredo divulgado:** um atacante pode assinar tokens com qualquer `sub`/`papel` (por exemplo, `servicos`) e personificar qualquer utilizador. É preciso mudar o segredo e reiniciar; todos os tokens existentes (assinados com o segredo antigo) deixam de ser válidos.
- **O que o linter não apanhou:** ver a tabela das seis alterações (três ficaram sem qualquer mensagem).
- **`Cache-Control: no-store` em POST /tokens:** demonstrado em T1 (`curl -i`).

Página 1
Perguntas e respostas · CA1 a CA4 (resumo)
CA1 · Fila de saída e idempotência
1. Porque é a chave gerada na criação da pendente e não no envio?
A chave identifica a intenção, não a tentativa. Se fosse gerada no envio, numa resposta perdida a nova
tentativa traria outra chave e o servidor criaria um duplicado.
2. Porque guarda o servidor as chaves por utilizador?
A chave vem do cliente, logo não é de confiança. Globalmente haveria colisões entre utilizadores e fuga de
respostas de outra pessoa.
3. Porque 409 quando a mesma chave chega com outro corpo?
É um erro de uso. Criar nova sugestão abriria a porta a duplicados; devolver a resposta antiga faria o cliente
pensar que o novo texto foi gravado.
4. Durante quanto tempo guardar as chaves?
Mais do que o tempo máximo que uma pendente pode esperar (de 24 h a alguns dias). Depois do prazo, um
reenvio é tratado como pedido novo e pode duplicar.
5. Porque 2.2.0 e não 3.0.0? A API04 continua a funcionar?
A chave é aditiva e opcional, logo é uma alteração minor. Sim: sem chave, o servidor aceita o pedido como
antes (só sem idempotência).
CA2 · Sincronização no service worker
1. Porque passa a sincronização para o service worker?
Corre fora da página e o browser pode acordá-lo com o separador fechado (evento sync). A página não pode.
2. Porque é preciso waitUntil()?
Mantém o service worker vivo até a promessa acabar. Sem ele, pode ser terminado a meio do envio e, no
sync, o browser nunca sabe se falhou.
3. E se pedirSync() for chamado 3 vezes, ou sync e mensagem chegarem juntos?
A mesma etiqueta é fundida num só registo. A variável emCurso reutiliza a promessa ativa, evitando duas
sincronizações em paralelo.
4. Porque é emCurso aceitável como variável global?
É só uma guarda efémera; se for perdida, a execução também acabou. Não podem ficar globais a fila, o cursor
ou tokens: têm de estar no IndexedDB.
5. Como a página sabe que terminou? E sem páginas abertas?
O service worker usa clients.matchAll() e postMessage; a página escuta message. Sem páginas, nada
se perde: ao abrir, a página lê o IndexedDB.
6. Que pendentes envia e de que utilizador?
As do IndexedDB por enviar, por ordem. O fetch da mesma origem leva o cookie sozinho e o servidor
identifica o utilizador pela sessão.
CA3 · Falhas e novas tentativas
1. Porque pára em rede/5xx mas continua num 400?
Rede/5xx é falha geral: as restantes falhariam também. O 400 é específico daquela pendente: marca-se como
rejeitada e segue-se, para não bloquear a fila.
2. Para que serve o jitter no backoff?
Espalha as tentativas. Sem ele, todos os clientes voltam no mesmo instante e sobrecarregam o servidor que
acabou de recuperar.
Página 2
3. Quem decide quando o sync volta a disparar: Chrome e Firefox?
Chrome: o próprio browser, com backoff e limite de tentativas, se a promessa rejeitar. Firefox: não há
Background Sync, decide a página (ao abrir, evento online, temporizador).
4. Sessão expirada com o separador fechado?
O 401 faz parar, manter as pendentes e resolver a promessa. Rejeitar faria o browser repetir em vão e gastar
as tentativas; só o login resolve.
5. O que acontece com lastChance a true e falha?
O browser desiste. As pendentes ficam no IndexedDB, sem apagar, e são tentadas quando a página abrir,
houver online ou novo pedirSync().
CA4 · Sincronização nos dois sentidos
1. Porque push antes do pull?
Para o servidor ter primeiro o que é local e o pull trazer o estado já consolidado, sem trabalhar com dados
desatualizados.
2. Porque o cursor vem do servidor e não de Date.now()?
Relógios de clientes não são fiáveis: adiantado perde alterações, atrasado repete-as. O servidor dá uma ordem
única a todos os dispositivos.
3. Porque alterações e cursor na mesma transação?
Atomicidade. Cursor gravado sem as alterações = alterações perdidas para sempre. Alterações sem cursor =
apenas repetidas (se forem idempotentes).
4. Porque apagar obrigaria a mudar GET /v2/sugestoes/alteracoes?
Uma sugestão apagada deixa de existir e nunca aparece como alterada. Teria de devolver lápides ({ id,
apagada: true }), conservadas enquanto um dispositivo possa estar sem sincronizar.
5. Página com BD v1 e service worker com v2?
A v2 fica bloqueada enquanto houver ligações v1 abertas (e uma página antiga recebe VersionError).
Resolve-se com db.onversionchange a fechar a ligação, onblocked tratado e o mesmo módulo e versão
em ambos.