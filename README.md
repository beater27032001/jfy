# jfy

O jfy puxa as suas tasks do Journify, organiza por projeto e manda cada uma para o Claude Code fazer: pelo `/pipeline` (código) ou num chat livre (estudo, análise, documento). Ao encerrar, registra o tempo e o status no Journify e atualiza o `handoff.md` do repositório. Em volta disso, o app junta o resto do dia de trabalho na Souv: projetos e tasks, GitHub, horas, agenda, emails e notificações.

Cada task roda numa aba própria, então dá para tocar várias ao mesmo tempo e navegar entre elas. Funciona no **Mac** e no **Windows**, com o mesmo motor (o `jfy`, em Python):

| | Mac | Windows |
|---|---|---|
| **O menu do jfy** | no terminal (`jfy`) e na aba **jfy** do app | na aba **jfy** do app |
| **O app** | `jfy.app` (SwiftUI), montado no seu Mac | `jfy` (Electron), pelo instalador |
| **Abas das tasks** | do tmux: seguem rodando mesmo com o app fechado | do próprio app: rodam enquanto ele estiver aberto (fechar a janela deixa ele na bandeja) |
| **Instalação** | `install.sh` | o instalador `.exe`; o app liga o resto sozinho ao abrir |
| **Atualizar** | `jfy --update` | o instalador da versão nova |

**Neste guia:** [Instalação no Mac](#instalação-no-mac) · [Instalação no Windows](#instalação-no-windows) · [Ajustes de uma vez só](#ajustes-de-uma-vez-só) · [Como usar](#como-usar) · [O app](#o-app-mac-e-windows) · [Horas](#horas) · [Onde ficam as coisas](#onde-ficam-as-coisas) · [Atualizar](#atualizar) · [Problemas comuns](#problemas-comuns) · [Desinstalar](#desinstalar) · [Desenvolver](#desenvolver) · [Créditos](#créditos)

## Instalação no Mac

### O que você precisa

- **macOS** (o app pede o macOS 15 ou mais novo).
- **[Claude Code](https://docs.claude.com/claude-code)** instalado e logado.
- **[Homebrew](https://brew.sh)**: o `install.sh` usa ele para instalar o `tmux`, o `terminal-notifier` (notificações) e o SwiftBar (ícone na barra de cima).
- **Xcode** (App Store), só para o app: é com o Swift dele que o app é montado no seu Mac. Abra o Xcode uma vez depois de instalar, para ele terminar a instalação.
- **GitHub CLI** (`gh`), para a aba GitHub do app: `brew install gh` e depois `gh auth login` (ou, no app, Configurações › GitHub › Adicionar conta).
- A **conta Google da Souv** (Agenda e Gmail) e acesso ao [JSON do app jfy](https://drive.google.com/file/d/12zl0qgv3LfCi5dNgVzhNtyvpgUzZOS8a/view?usp=sharing) no Drive da empresa.
- Um **token do Journify**: no Journify, Configurações › Conectar meu Claude › Gerar token (o jfy pede no primeiro uso).

### 1. Clonar e instalar

```bash
git clone https://github.com/beater27032001/jfy.git ~/jfy
~/jfy/install.sh
```

O `install.sh`:
- instala o `tmux` pelo Homebrew, se faltar;
- coloca o comando `jfy` no PATH;
- baixa a pipeline oficial do time ([pipeline-Claude](https://github.com/Carloscavalcante97/pipeline-Claude)) em `~/.jfy/pipeline-Claude` e liga o `/pipeline`, os agentes (planner, builder, verifier, e2e-tester, committer, pr-creator) e os hooks no seu `~/.claude`. Se você já tem um arquivo com o mesmo nome e conteúdo diferente, ele mantém o seu e avisa;
- confere se o MCP do Journify está configurado e roda um autoteste;
- instala a fonte **JFY Mono** (a Maple Mono com os ícones em pixel art dos temas) e oferece já deixar ela como fonte do terminal: no Terminal do macOS vale na hora; no Warp, feche e abra ele (⌘Q). Em outro terminal, escolha "JFY Mono" nas preferências. `jfy --fonte` faz isso de novo;
- pergunta, um por um, se você quer os extras. Responda `n` em todos para ficar só com o menu de tasks. O que você já ligou antes não é perguntado de novo:
  - **uso da IA na barra**: muda o `statusLine` do `~/.claude/settings.json`;
  - **aviso do Claude no macOS**: dois hooks no `~/.claude/settings.json` (valem para todo Claude Code) e o `terminal-notifier`;
  - **ícone do jfy na barra de cima do Mac**: instala o [SwiftBar](https://swiftbar.app) (Homebrew) e um plugin dele;
  - **notificação das 7h**: um LaunchAgent;
  - **app do jfy para o Mac**: monta o `jfy.app` em `/Applications` (precisa do Xcode). Veja [O app](#o-app-mac-e-windows).

Para atualizar depois: **`jfy --update`**. Ele traz a versão nova do GitHub (`git pull` do branch em que o seu clone está), mostra o que chegou e roda o `install.sh` sem as perguntas dos extras (o que você já ligou é atualizado, o resto fica como está): religa o comando, atualiza a pipeline e remonta o app, se ele estiver instalado. Com o app aberto, ele fecha e abre de novo na versão nova (as tasks continuam no tmux). Já na versão mais nova, não faz nada.

### 2. Rodar

```bash
jfy
```

Na primeira vez, antes do menu, o jfy te guia por **primeiros passos**, um de cada vez. Ele confere cada um de verdade e só pergunta o que falta:

1. **Journify**: abre as Configurações do Journify; em *Conectar meu Claude*, clique em *Gerar token* e cole o token no jfy (ele não aparece na tela). O jfy configura o MCP `journify` no seu Claude Code.
2. **Notificações**: manda uma notificação de teste. Se o macOS bloquear, abre Ajustes do Sistema > Notificações para você ligar o **terminal-notifier** e testa de novo.
3. **Agenda e Gmail**: login do Google, que libera ler, criar e editar eventos e ler, marcar como lido e responder emails (nada é apagado, e nada é enviado sem você apertar Enviar). O jfy abre o JSON do app no Drive da empresa: baixe e arraste o arquivo para o terminal. Detalhes em [Google: agenda e Gmail](#google-agenda-gmail-e-drive).
4. **Seus projetos**: para cada projeto com task sua, escolha a pasta do repositório.
5. **Fonte**: o jfy instala a fonte JFY Mono, se faltar, e põe ela no terminal (os ícones do jfy precisam dela). O tema se escolhe no [app](#o-app-mac-e-windows).

`Enter` faz o passo, `p` pula e `0` deixa para depois. Para voltar a eles quando quiser: `jfy --comecar`.

### 3. Usar pelo app do Mac

O jfy também é um app (`jfy.app`): o mesmo jfy do terminal, mais as abas de projetos, GitHub, horas, agenda, emails e o resto, na identidade da Souv. As tasks continuam no tmux, então dá para usar o app e o terminal ao mesmo tempo.

1. **Instale.** Precisa do macOS 15 ou mais novo e do Xcode (o app é montado no seu Mac, em ~1 min). Rode `~/jfy/install.sh` e responda **s** em "App do jfy para o Mac", ou monte direto com `~/jfy/app/build.sh`. Ele vai para `/Applications/jfy.app`.
2. **Abra** pelo Spotlight (⌘ Espaço, "jfy") ou pela pasta Aplicativos. Se o macOS pedir permissão (notificações, controlar outro app), permita: o app é assinado com um certificado local, então a permissão vale também para as próximas versões.
3. **Entre com a conta da Souv** e siga os [primeiros passos do app](#primeiros-passos-do-app-mac-e-windows).
4. **Configure os projetos** na aba **jfy** (o terminal embutido, com o menu de sempre): escolha a pasta do repositório de cada projeto. É ela que liga tasks, GitHub, portas e horas ao projeto.
5. **Use as abas** da barra lateral (⌘1 a ⌘9 para as nove primeiras). Cada uma está em [O app](#o-app-mac-e-windows).
6. **Feche sem medo.** Fechar a janela deixa o app em segundo plano (clique no ícone do Dock para voltar), e as notificações levam direto para a aba certa. ⌘Q encerra o app, mas as tasks continuam rodando no tmux.
7. **Atualize** com `jfy --update`: traz a versão nova, reinstala e reabre o app.

Se o app abrir sem janela, clique no ícone dele no Dock. Se ele pedir permissões de novo a cada versão, rode `~/jfy/app/build.sh` para recriar a assinatura local.

## Instalação no Windows

No Windows o jfy é um app (em Electron, na pasta `windows/`) com as mesmas telas do app do Mac e o menu do jfy dentro dele, na aba **jfy**. O motor é o mesmo `jfy` em Python, que vai dentro do instalador junto com o próprio Python: ninguém precisa instalar Python. A diferença de fundo é que o Windows não tem tmux: **as abas das tasks são do próprio app** (veja [Diferenças do Mac](#diferenças-do-mac)).

### O que você precisa

- **Windows 10 ou 11**, 64 bits.
- **[Git para Windows](https://git-scm.com)**. A pipeline e a aba GitHub usam o git, e o Claude Code roda os hooks e o `statusLine` pelo **Git Bash**, que vem junto. Na instalação, deixe as opções padrão.
- **[Claude Code](https://docs.claude.com/claude-code)** pelo **instalador nativo** (o `claude.exe`), logado: abra o PowerShell, rode `claude` uma vez e faça o login. Confira com `claude --version`. **Pelo npm não serve**: o jfy passa os pedidos ao Claude como argumentos, e o `claude.cmd` do npm estraga os que têm `%`, `&` ou aspas.
- A **conta Google da Souv** e acesso ao [JSON do app jfy](https://drive.google.com/file/d/12zl0qgv3LfCi5dNgVzhNtyvpgUzZOS8a/view?usp=sharing) no Drive da empresa (baixe e guarde: o app pede no primeiro acesso).
- Um **token do Journify**: no Journify, Configurações › Conectar meu Claude › Gerar token (os primeiros passos do app pedem).
- **GitHub CLI** (`gh`): não precisa instalar antes. Os primeiros passos instalam pelo **winget** (o Instalador de Aplicativos, que já vem no Windows 10 e 11; se faltar, instale "Instalador de Aplicativos" na Microsoft Store).
- **[Node.js](https://nodejs.org) 24**: só se você for montar o instalador.

### 1. Pegar o instalador

- **Pronto:** nos artefatos da última execução do workflow **Windows**, na aba **Actions** do repositório no GitHub (o arquivo `jfy-windows`, que traz o `jfy Setup <versão>.exe`).
- **Montando você mesmo** (no Windows ou no Mac, com o Node.js 24):

  ```powershell
  git clone https://github.com/beater27032001/jfy.git
  cd jfy\windows
  npm install
  npm run dist          # baixa o Python embutível e gera windows\dist\jfy Setup <versão>.exe
  ```

### 2. Instalar e abrir

1. **Abra o `jfy Setup <versão>.exe`.** Ele instala só para o seu usuário (não pede administrador) em `%LOCALAPPDATA%\Programs\jfy` e cria o atalho no menu Iniciar e na área de trabalho. O instalador não é assinado: se aparecer "O Windows protegeu o computador", clique em **Mais informações › Executar assim mesmo**.
2. **Na primeira abertura, o app liga sozinho o que no Mac é o `install.sh`:** baixa a pipeline do time em `~/.jfy/pipeline-Claude` e copia o `/pipeline`, os agentes e os hooks para o `~/.claude` (cópia, porque link no Windows pede o modo de desenvolvedor; arquivo seu diferente fica como está), e põe o uso da IA no `statusLine` e o aviso do Claude nos hooks do `~/.claude/settings.json`. Ele confere isso a cada abertura e só mexe no que falta. O que faltar de essencial (Claude Code, Git) vira notificação; o resto fica em `~/.jfy/rodando/instalar.log`.
3. **Entre com a conta da Souv** e siga os [primeiros passos do app](#primeiros-passos-do-app-mac-e-windows).
4. **Configure os projetos** na aba **jfy** (o menu do jfy, dentro do app): escolha a pasta do repositório de cada projeto. É ela que liga tasks, GitHub, portas e horas ao projeto. Ou use **Projetos › Novo projeto**.
5. **Use as abas** da barra lateral (**Ctrl+1** a **Ctrl+9** para as nove primeiras). Cada uma está em [O app](#o-app-mac-e-windows).

### 3. No dia a dia

- **Fechar a janela** deixa o jfy rodando na **bandeja** (perto do relógio do Windows), com as abas e as notificações: clique no ícone para voltar. **Sair** (botão direito no ícone da bandeja › Sair) encerra as abas e, com alguma rodando, pergunta antes.
- **O terminal do app** (aba jfy): **Ctrl+C** com texto selecionado copia (sem seleção, interrompe, como sempre); **arrastar um arquivo** do Explorador para a aba cola o caminho; **colar um print** manda o Alt+V, o atalho do Claude no Windows para colar imagem.
- **As notificações** saem pelo app, com o ícone da Souv: email novo, reunião em 5 min, Claude que respondeu ou pede você, PR pedindo revisão, jornada de 8h e o resumo das 7h. O clique leva à aba certa.
- **Atualizar:** baixe e abra o instalador da versão nova. Suas configurações (`~/.jfy`) ficam.

### Diferenças do Mac

- **Sem tmux:** as abas são do app. Sair do app encerra o que roda nelas (o Claude de cada task retoma com `--resume`). Os atalhos `Ctrl-b` e a barra de baixo do tmux não existem: o uso da IA fica no topo do app, a jornada e as reuniões na **Meu dia**, os emails no número da aba **Emails**.
- **Atalhos:** onde o Mac usa ⌘, o Windows usa **Ctrl**.
- **Portas:** o Windows não informa a pasta em que outro programa roda; o projeto de cada porta sai do caminho na linha de comando (o `node C:\repo\node_modules\...` de um servidor), e "Claude aberto neste repo" não aparece.
- **Segredos** (o acesso ao Google): cifrados pela DPAPI do Windows em `~/.jfy/segredos`, no lugar do Chaves do macOS.
- **Sem o ícone na barra de cima:** o jfy fica na bandeja do Windows.
- **Notificação das 7h e avisos do relógio:** quem dispara é o próprio app (no Mac, um LaunchAgent e a barra do tmux).

## Primeiros passos do app (Mac e Windows)

O app abre na tela de login: **Entrar com Google**, só com conta **@souv.tech** (o Google mostra só as contas da Souv, e o jfy confere o email; conta de fora é recusada e perde o acesso na hora). É o mesmo login que liga a Agenda e o Gmail. No primeiro acesso do computador, a tela pede o arquivo do app jfy da Souv (o JSON do Drive): **Abrir no Drive** e **Escolher o arquivo…**.

Depois do login, os **primeiros passos** guiam o resto, um de cada vez:

1. **Journify** (obrigatório): abre as Configurações dele para você gerar o token, que é conferido antes de salvar.
2. **GitHub**: instala o `gh` se faltar (Homebrew no Mac, winget no Windows) e roda o `gh auth login`, numa aba do jfy.
3. **Seus projetos**: a pasta de cada projeto com task sua.
4. **Notificações**: manda uma de teste. No Mac, se não aparecer, libere o jfy em Ajustes do Sistema › Notificações; no Windows, em Configurações › Sistema › Notificações (o app abre a tela).

Quem já tem tudo ligado passa direto. Em **Configurações › Sessão**: **Sair do jfy** (volta para o login e revoga o acesso do jfy ao Google) e **Refazer os primeiros passos**. A sessão é conferida de novo no Google a cada 20 minutos e quando o app volta para a frente: conta desligada ou suspensa na Souv volta para o login. Sem internet, ninguém é derrubado.

## Ajustes de uma vez só

Coisas que o jfy não consegue fazer por você, mas que você só faz uma vez (no Mac e no Windows):

1. **Assinatura do email.** Os emails que saem pelo app levam a assinatura que estiver como **padrão** no Gmail: a API do Gmail só enxerga essa (as outras assinaturas com nome ficam invisíveis). No Gmail: engrenagem › **Ver todas as configurações** › **Geral** › **Assinatura**. Crie a sua (ex.: "Souv") se ainda não tiver e, em **Padrões de assinatura**, escolha ela em **"Para uso em novos e-mails"** e em **"Para respostas/encaminhamentos"**. Clique em **Salvar alterações**, no fim da página. Vale na hora, sem reinstalar. Enquanto não houver padrão, o app avisa antes de enviar e tem um link para essa tela.
2. **GitHub.** `gh auth login` (ou Configurações › GitHub › Adicionar conta no app), com a conta que você usa nos repositórios da Souv. Mais de uma conta? Adicione todas; o app troca a que está em uso.
3. **Notificações.**
   - **Mac:** deixe ligadas as notificações do **jfy** (é ele que mostra os avisos com o app aberto, com o ícone da Souv) e do **terminal-notifier** (com o app fechado), em Ajustes do Sistema › Notificações. Se o macOS perguntar se o jfy pode controlar outro app, permita.
   - **Windows:** em Configurações › Sistema › Notificações, deixe as notificações ligadas e o **jfy** ligado na lista de apps. Com o **Não perturbe** (ou o Assistente de Foco) ligado, elas não aparecem na tela, só na central de notificações.
4. **Agenda das outras pessoas** ("Reunião com…" na Agenda): aparece a agenda de quem compartilha com você. Na Souv, as agendas já vêm compartilhadas dentro do domínio; se a de alguém não aparecer, a etiqueta da pessoa mostra o motivo.

## Como usar

O menu do jfy é o mesmo em todo lugar: no terminal do Mac (`jfy`) e na aba **jfy** do app, no Mac e no Windows. Nos menus, a tecla certa já basta, sem Enter: o número abre o item (com 10 ou mais opções, o `1` espera um instante pelo segundo dígito), e letras (`l`, `o`, `j`, `s`, `p`, `w`...) e o `0` (volta) valem na hora, sem Enter. No menu principal e na tela do projeto, Enter atualiza as tasks (as duas guardam a lista por 1 min, para voltar de uma task sem esperar o Journify). Toda tela termina com a mesma linha de ações: a tecla em destaque e o que ela faz, e o `0` no fim.

**Menu principal**: três seções. **Foco**: tasks de todos os projetos com prazo vencido ou nos próximos 7 dias e as de prioridade crítica, da mais urgente para a menos; o número abre a task direto. **Projetos**: os que têm tasks suas, com a contagem. **Sem task**: os configurados sem task aberta (manutenção: terminal livre ou sessão quando surgir algo). O repositório de cada projeto aparece no `c` da tela do projeto.
- `j` abre o Journify no navegador.
- `jfy --hoje` imprime as reuniões de hoje e o foco, sem abrir o menu.
- Na primeira vez em cada projeto, o jfy pede a pasta do repositório (navegador de pastas: número entra, `..` sobe, `s` escolhe, ou cole o caminho) e um nome. Projeto com mais de um repositório (front e back, por exemplo): responda `s` em "Mais um repositório" e escolha o próximo. Na hora da task, o jfy pergunta quais ela usa (número = só esse, Enter = todos); o Claude abre no primeiro e enxerga os outros, e a branch da task é criada em cada um. Projeto sem repositório (só estudo ou teste): `n` no navegador de pastas e dê um nome, que aparece no lugar do id; o Claude abre numa pasta só dele, `~/.jfy/sem-repo/<id>`, onde fica o `handoff.md`.
- `l` abre um **terminal livre**: Claude com `--dangerously-skip-permissions` numa pasta que você escolhe, sem task.
- Reuniões, horas e tema ficam no [app](#o-app-mac-e-windows) (abas Agenda, Horas e Temas). O menu fica com as tasks, as sessões do Claude e as portas.

**Tela do projeto**: suas tasks em seções, na ordem do que pede ação sua primeiro: **Urgente** (prazo vencido, nos próximos 7 dias ou crítica; mostra o status no fim da linha), **Em andamento**, **A fazer**, **Esperando alguém** (revisão, teste ou validação) e **Bloqueadas**. Seção vazia não aparece.
- Número abre a task. A tela cabe no terminal, nesta ordem: projeto e título; status, prioridade, pontos e prazo (avisa se passar de 8 pontos, o teto de um PR); **O que fazer** (o começo da descrição, já limpa: sem markdown cru, e cada imagem vira `▣ imagem a3`, o número do anexo); anexos (imagens agrupadas, documentos pelo nome); o último comentário; e as ações:
  - `1` **implementar (/pipeline)**: para task de código (testes, implementação, revisão, commit e PR com a sua aprovação). Se você não estiver numa branch gitflow, o jfy cria `feature/`, `bugfix/` (a partir da `develop` atualizada) ou `hotfix/` (a partir da `main`) com o título da task. Se você já estiver numa, o jfy soma os pontos da task com os das tasks já commitadas nela: passando de 8, o teto de um PR, ele oferece abrir uma branch nova para a task.
  - `2` **conversar com o Claude**: para estudo, análise, documento, preparação de reunião. Nada vai para o Journify sem você aprovar.
  - `d` **descrição inteira**: a task toda, com todos os comentários, para ler com espaço e setas (`q` volta).
  - `a` + número abre o anexo no navegador pelo link (ex.: `a3`). Nada é baixado para o disco.
  - `p` **prazo**: grava o prazo no Journify. Aceita `25/11`, `25/11/2026` ou `+3` (daqui a 3 dias).
  - `w` abre a task no Journify (navegador).
  - Depois de escolher, o jfy pergunta **"Algo a mais para o Claude?"**. Digite ou cole instruções extras e arraste arquivos (prints, PDFs, planilhas) para o terminal. Eles vão junto com a descrição da task. Linha vazia continua; Enter direto pula.
- `s` **sessão**: um chat só para várias tasks, uma atrás da outra. O Claude lista as tasks, você escolhe, ele faz e no fim pergunta se segue com outra. No `/exit`, o jfy registra o tempo das tasks que ficaram abertas e garante o `handoff.md` de todas as tasks trabalhadas.
- `l` **terminal livre** direto no repositório do projeto.
- `c` troca os repositórios do projeto.
- `w` abre o projeto no Journify.

### Abas

Cada task abre numa aba nova, com a cor do projeto. Abrir de novo algo que já tem aba (a mesma task, reunião, pasta ou as horas) só leva você até ela.

**No app (Mac e Windows)** as abas aparecem na barra lateral, embaixo de **jfy**: o clique vai até ela, a bolinha vermelha marca a aba em que o Claude pediu atenção, e o botão direito renomeia ou fecha. **No terminal do Mac** elas ficam na barra de baixo do tmux:

| Para | Faça |
|---|---|
| voltar ao menu | clique em `0 menu` ou `Ctrl-b` e depois `0` |
| ir para outra aba | clique nela, ou `Ctrl-b` e o número |
| ver todas com prévia | `Ctrl-b` e depois `w` |
| encerrar a task | `/exit` no Claude |
| sair do jfy com tasks rodando | `0` no menu principal; `jfy` volta para elas |

### Barra de baixo, à direita (Mac)

A barra do tmux, no terminal do Mac. No Windows ela não existe: o uso da IA fica no topo do app, a jornada e a próxima reunião na **Meu dia**, os emails não lidos no número da aba **Emails**, e os avisos (email novo, reunião em 5 min, jornada de 8h) saem como notificação do Windows.

| O quê | Como funciona |
|---|---|
| 📅 reunião | contagem regressiva quando falta 1h ou menos para a próxima reunião do Google Agenda; vermelho a 5 min. **Clique** para entrar na chamada |
| ✉ 3 | emails não lidos (no Gmail, só a aba Principal). Quando chega um novo, a barra destaca remetente e assunto por 5 min e o macOS notifica. **Clique no ✉** para ler num popup: abre direto o que acabou de chegar, ou a lista com hora, remetente e assunto (número lê, `o` + número abre no Gmail, `t` marca todos como lidos, `q` volta da leitura, `0` fecha) |
| IA ▰▰▱▱ 23% | quanto você já usou do limite de 5h do Claude (e até que horas), e da semana; laranja a 50%, vermelho a 80% |
| ⏱ 3h 12min / 8h | cronômetro da jornada: liga sozinho na primeira vez que você usa o jfy no dia, fica verde e notifica ao chegar a 8h |
| 14:32 | relógio |

| Atalho | Faz |
|---|---|
| `Ctrl-b` `c` | mostra todos os comandos do jfy (menus, atalhos e linha de comando). Substitui o "nova janela" do tmux |
| `Ctrl-b` `m` | entra na chamada (Meet, Zoom, Teams) da reunião que está rolando ou da próxima. 5 min antes de cada reunião chega uma notificação |
| `Ctrl-b` `p` | pausa / retoma a jornada (almoço, intervalo). Substitui o "aba anterior" do tmux |
| `Ctrl-b` `r` | zera a jornada e começa de novo agora (pede confirmação) |

O uso da IA vem do statusline do Claude Code (o `install.sh` faz ele gravar uma cópia em `~/.jfy/claude-status.json`) e atualiza enquanto algum Claude estiver aberto.

### Temas

A aba Temas do [app](#o-app-mac-e-windows) escolhe o tema: **Padrão**, **Dracula**, **Monokai**, **Cyberpunk**, **Élfico** (dourado e prata sobre verde-floresta), **Anão** (ouro e forja sobre bronze), **Mordor** (fogo e cinzas sobre preto), **GTA** (neon de fim de tarde e verde-dinheiro sobre roxo) ou **Aço** (azul-metálico e prata sobre azul-marinho). Muda as cores do menu e da barra na hora, sem reiniciar, e cada tema tem seus ícones em pixel art e seu desenho na barra de uso da IA. Quase todos têm também alguém andando e empurrando a barra: vampiro (Dracula), corredor com rastro de velocidade (Cyberpunk), elfo arqueiro (Élfico), anão de machado (Anão), viatura com giroflex (GTA), lorde de armadura (Mordor) e robô de quatro patas (Aço). Para isso a barra da direita é um `jfy --relogio` que fica rodando e manda uma linha por segundo; quando o `jfy` muda, ele sai e o tmux sobe o novo em até 15s. Cada pessoa tem o seu, salvo em `~/.jfy/config.json`.

| Tema | Reunião | Email | Jornada | 8h fechadas | Pausa | Barra da IA |
|---|---|---|---|---|---|---|
| Padrão | 📅 | ✉ | ⏱ | ✓ | ⏸ | `▰▱` |
| Dracula | morcego | carta | lua | taça | caixão | corações |
| Monokai | λ | @ | café | check | pausa | blocos |
| Cyberpunk | raio | sinal | bateria | disquete | pausa | scanlines |
| Élfico | folha | pergaminho | ramo | estrela | lua | brilhos |
| Anão | martelo | corvo | machado | caneca | zz | gemas |
| GTA | mira | celular | nota de dinheiro | saco de dinheiro | palmeira | estrelas de procurado |
| Mordor | vulcão | lobo | chama | o Anel | caveira | o Olho |

Os ícones em pixel art só aparecem com a fonte **JFY Mono** no terminal (o `install.sh` instala). O terminal do app, no Mac e no Windows, já vem com ela. O Padrão usa caracteres comuns e funciona com qualquer fonte. Para mudar ou criar um ícone, edite o desenho em `fonte/icones.txt` e gere a fonte de novo (o comando está no topo de `fonte/patch.py`).

### Google: agenda, Gmail e Drive

No app (Mac e Windows), é o próprio login da tela de entrada (veja [Primeiros passos do app](#primeiros-passos-do-app-mac-e-windows)). No terminal do Mac, rode `jfy --login`. Na primeira vez ele abre no navegador o [JSON do app jfy da Souv](https://drive.google.com/file/d/12zl0qgv3LfCi5dNgVzhNtyvpgUzZOS8a/view?usp=sharing), no Drive da empresa: baixe e arraste o arquivo para o terminal. O JSON só identifica o app; cada pessoa autoriza a própria conta e o acesso fica no Chaves do Mac dela (no Windows, cifrado pela DPAPI em `~/.jfy/segredos`). Depois abre o login do Google no navegador. Você entra com a conta da empresa e autoriza:
- **agenda**: lê, cria e edita eventos (`calendar.events`), pela aba Agenda do app. Reuniões recusadas, eventos de dia inteiro e ausências ficam de fora;
- **Drive (só leitura)**: `drive.readonly`: a cesta de contexto lê os Docs, as Planilhas (todas as abas), as Apresentações e os arquivos do Drive citados nas tasks e manda o texto ao Claude. Não grava nada no Drive. Quem entrou antes disso vê o aviso em **Configurações › Google** e clica em **Entrar de novo (com o Drive)**; sem isso, a cesta manda esses arquivos só como link;
- **Gmail**: `gmail.modify`: o jfy lê os emails para o popup do ✉ e marca como lidos quando você aperta `t` (todos os não lidos da Principal); não apaga, e só envia quando você aperta Enviar na aba Emails do app. Quem fez login antes dessa mudança precisa rodar `jfy --login` uma vez para o `t` funcionar (ler continua funcionando sem isso).
- **diretório (só leitura)**: `directory.readonly`: o nome e a foto das pessoas da Souv, para a Agenda e as sugestões de email mostrarem cada pessoa com a foto, como no Google Agenda (quem não pôs foto aparece com as iniciais). Quem entrou antes disso vê o aviso em **Configurações › Google** e clica em **Entrar de novo**; até lá, só as iniciais.

No projeto do Google Cloud do app jfy (quem administra, uma vez só): em **APIs e serviços › Biblioteca**, ative a **Google Drive API**, a **Google Sheets API** e a **People API** (as fotos das pessoas), além das de Agenda e Gmail que já estão ligadas. Com a tela de consentimento do tipo **Interno** (só contas da Souv), o `drive.readonly` e o `directory.readonly` não precisam de verificação do Google; incluí-los em **Acesso a dados › Escopos** é opcional e só deixa documentado. Para as fotos aparecerem, o compartilhamento de contatos do diretório tem que estar ligado no Admin do Workspace (Diretório › Configurações do diretório › Compartilhamento: vem ligado por padrão).

O acesso fica no Chaves do macOS (no Windows, na DPAPI). O jfy olha a agenda a cada 30 s (e o ícone da barra de cima, toda vez que você abre o menu) e o Gmail a cada 30 s (um email novo aparece na barra em até ~45 s). Se a barra mostrar `✉ erro`, rode `jfy --login` de novo.

### Portas abertas (`o`)

No menu principal, `o` lista (no app, a aba **Portas** mostra o mesmo, com o número de portas abertas na barra lateral) as portas abertas por programas de desenvolvimento, uma linha por processo (ou por container do Docker): o que é (Next, Vite, Node, Expo, Firebase, Python, Java, Docker, Postgres, MySQL, Redis, Mongo, Ruby), cada um com seu ícone, de que projeto é, se tem Claude aberto naquele repositório (e em que aba do jfy) e se foi o Claude que subiu o servidor. O número encerra (pede para sair e, se em 3 s não saiu, força; container é parado com `docker stop`). Fica de fora o que não é de desenvolvimento (Figma, CleanMyMac, o próprio macOS). `jfy --portas` abre direto. Banco instalado pelo Homebrew (`brew services`) volta sozinho depois de encerrado: pare com `brew services stop <nome>`. No Windows, a lista vem do PowerShell e o encerrar é pelo `taskkill` (a árvore toda: o `npm` e o `node` que ele abriu); banco instalado como serviço do Windows também volta sozinho: pare em **Serviços** (`services.msc`). Lá o projeto de cada porta sai do caminho na linha de comando, já que o Windows não informa a pasta em que outro programa roda.

### Ícone na barra de cima do Mac (no Windows, a bandeja)

No Windows, o jfy fica na **bandeja**, perto do relógio: o clique abre o app, e o botão direito tem **Abrir o jfy** e **Sair**. O resto desta seção é do Mac.

Com o extra do SwiftBar, o jfy ganha um ícone (a chama) ao lado do relógio do Mac, que abre junto com o Mac. A até 1h de uma reunião, a chama vira o ícone de reunião do tema, que esquenta (laranja a 15 min, vermelho a 5): o nome e a contagem ficam na primeira linha do menu, com "Entrar na chamada". A 5 min chega a notificação, mesmo com o jfy fechado; clicar nela entra na chamada. O ícone nunca leva texto: em Mac com notch, o que fica largo some atrás dele. O menu tem: o uso do Claude (5 h e semana, com quando renova), abrir o jfy (traz o terminal dele, ou abre um com o jfy), abrir o Journify, pausar/retomar a jornada, as próximas reuniões (clique entra na chamada), as tasks no foco (clique abre no Journify), as portas abertas com "Encerrar" em cada uma e os emails não lidos. Atualiza a cada minuto e quando você abre o menu.

### O app (Mac e Windows)

O app é o jfy numa janela própria, igual no Mac (o `jfy.app`, com ícone no Dock e no Spotlight) e no Windows (o `jfy` do instalador, no menu Iniciar e na bandeja), na **identidade visual da Souv** (manual de identidade v1, 2024): no escuro, fundo Midnight Blue e destaque Eletric Cyan; no claro, fundo Cloud White e destaque Vivid Blue; Lexend nos títulos e Roboto no texto (as fontes, licença OFL, e o símbolo ficam em `app/Marca/` e vão dentro do app); o ícone é o símbolo da Souv; a barra superior traz o símbolo, o nome da Souv e JFY; os selects (projeto, categoria, status, prioridade, conta) são o select da Souv; e a barra lateral e as listas das abas (projetos, tasks, repositórios, PRs, commits, arquivos, emails, conversas) marcam o escolhido em Vivid Blue com a barrinha de destaque, em vez da cor de destaque do macOS. As interações também são da Souv, não do macOS (que pinta tudo com a cor de destaque do sistema): botões (primário em Vivid Blue, secundário, vermelho no que apaga, links e ícones), campos de texto com a borda de destaque no foco, caixas de marcar, seletores segmentados, calendário e campo de data, os menus (botão e clique direito) e as confirmações, que abrem num modal da Souv (Esc cancela, Enter confirma; o que apaga não vai no Enter). Ficam do macOS só o painel de escolher pasta, as dicas ao parar o mouse e a cor da seleção de texto. Fechar a janela não fecha o app: o jfy segue rodando em segundo plano (o número de notificações novas aparece no ícone do Dock, ou no da barra de tarefas no Windows) e volta igual clicando no ícone, em Janela > jfy no Mac ou no ícone da bandeja no Windows. ⌘Q (no Windows, **Sair** na bandeja) sai de verdade. No topo da janela, em qualquer aba, fica o uso dos limites do Claude (5 h e semana, com quando renova): o mesmo da barra do jfy no terminal e do ícone na barra de cima, para não precisar estar numa sessão do Claude para ver. No Mac, em tela cheia, a barra lateral mostra a imagem da mesa desfocada, como fora dela. Na barra lateral (⌘1 a ⌘9 no Mac, Ctrl+1 a Ctrl+9 no Windows, para as nove primeiras). Onde o texto abaixo diz ⌘, no Windows é Ctrl. O jfy no terminal continua igual; o app é a interface de gestão em cima dele:

- **Meu dia**: a tela em que o app abre, com o símbolo da Souv na barra lateral. O que pede você hoje, de todas as abas num lugar só, em cartões: os **Claudes esperando você** (as abas com o sino; o clique leva ao terminal nela), as **reuniões de hoje** que ainda não acabaram (o horário, quanto falta e **Entrar** na chamada), o **Foco** (prazo perto, crítica ou marcada por você), os **PRs esperando sua revisão**, os **importantes não lidos** e a **jornada** (o cronômetro da barra do tmux contra as 8 h). O clique num item abre a aba certa, já nele, e o link no canto de cada cartão leva à aba inteira. Cada cartão carrega sozinho, com os mesmos dados das abas, quando você volta para a tela ou no ↻.
- **jfy**: o menu de sempre, num terminal embutido. Embaixo de "jfy", na barra lateral, aparecem as abas abertas (o menu, cada task, revisão de PR…); o clique leva o terminal até ela, e a bolinha vermelha marca a aba em que o Claude pediu atenção. O botão direito numa aba **renomeia** ou **fecha** (fechar encerra o que roda nela e pede confirmação; o "menu" não muda), e **arrastar** reordena as abas no tmux, mantendo a aba em que você está. A setinha ao lado de "jfy" recolhe essa lista (recolhida, a bolinha vermelha aparece na própria linha do jfy); a de Projetos recolhe os favoritos. O app lembra o que ficou recolhido. O terminal já vem com a JFY Mono (não precisa configurar fonte). As tasks continuam no tmux: fechar o app não encerra nenhuma, e abrir de novo volta para o mesmo lugar. Dá para usar o app e um terminal ao mesmo tempo. Com o app aberto, "Abrir o jfy" na barra de cima e o clique nas notificações trazem o app.
- **Projetos**: duas formas de ver as tasks, **lista** ou **tabela** (o botão no topo; a escolha fica lembrada). A tabela é como a do ClickUp: grupos por status, prazo, prioridade, etapa ou responsável, que recolhem, com busca e filtros de status, prioridade e prazo; **status, prioridade e vencimento mudam na própria célula** (clique nela; status que pede o vídeo do teste pergunta o link). Os pontos aparecem (carregam logo depois da lista), mas só mudam no Journify, porque o MCP não grava estimativa; a etapa segue o status. O clique no resto da linha abre a task ao lado, num painel com **×** (ou Esc) para fechar. Os pontos vêm junto com a lista. As colunas que não cabem somem, das menos importantes para as mais. Para mudar **em lote**: na lista, botão direito numa task › **Selecionar** (aparecem as bolinhas); na tabela, as bolinhas já estão lá (a do grupo marca o grupo todo). Marcadas as tasks, aparece embaixo o painel do lote, como no ClickUp: **Definir** [status, prioridade ou prazo] **para** [o valor] e **Aplicar**. O segundo seletor segue o primeiro: todos os status, as prioridades ou o calendário do prazo. Fechar e finalizar validação pedem o link do vídeo do teste (ou o motivo), que vale para todas. Vai para o Journify, 4 por vez, e as que falharem ficam marcadas com o motivo. **Limpar** (ou Esc) desmarca. **Novo projeto** (embaixo da lista de projetos) liga um projeto do Journify a uma pasta deste computador sem passar pelo terminal: escolha um dos seus projetos que ainda não têm pasta ou cole o link do projeto no Journify (o jfy confere pelo MCP se você tem acesso), escolha a pasta do código ou crie uma nova pelo próprio painel do sistema (mais de uma para front e back, ou "sem repositório" para estudo e documentos) e dê o nome curto com que ele aparece no jfy. Com mais de uma conta no `gh`, escolha também a **conta do GitHub** do projeto: o jfy grava na config de cada repositório (vale para as worktrees) o nome e o email dela nos commits e um helper de credencial que entrega o token dela no push, e as abas do Claude naquela pasta recebem o `GH_TOKEN` dela (o `gh pr create` da pipeline). Assim o commit e o push saem pela conta certa, seja qual for a ativa do `gh`. Pasta que ainda não era repositório: salve o projeto de novo depois do clone. Os projetos com task sua e sem pasta ganham o botão **Configurar**, e o botão direito num projeto o **edita**. Fica no mesmo `~/.jfy/config.json` que o terminal usa. A estrela favorita até 4 projetos, que aparecem na barra lateral embaixo de Projetos (o clique abre o projeto). Os projetos (e o Foco: prazo perto, crítica ou marcada por você; **Marcar como foco**, no detalhe da task, põe a task no topo do Foco e da Meu dia mesmo sem prazo, com "foco" no lugar do prazo; a marca é só sua, fica no `~/.jfy/config.json` e não muda nada no Journify), as tasks nas mesmas seções da tela do projeto (só as suas, ou todas do projeto com as 30 encerradas mais recentes) e a task inteira: a descrição formatada com as imagens, os anexos (clique abre pelo link; nada é baixado), os **links** citados na descrição e nos comentários (Figma, Google Docs, Planilhas, Drive, Replit…, com o rótulo que vem antes do link e de onde ele veio; o botão direito copia), os comentários e um campo para comentar. Status, prioridade e prazo mudam por clique; mover para `fechado` ou `finalizado validação` pede o link do vídeo do teste ou o motivo, como o Journify exige. **Anexar arquivo** manda um arquivo do computador para a task (o print, o vídeo do teste: até 20 MB, vídeo até 100 MB). "Implementar (/pipeline)" e "Conversar com o Claude" abrem a mesma aba do `1` e do `2` e levam você ao terminal.
  Escolhido um projeto, o topo traz as seções dele, como as abas do projeto no Journify:
  - **Tasks**: a lista ou a tabela de cima.
  - **Documentos**: os documentos do projeto, com busca, e o texto formatado (markdown ou HTML). Documento com título de credencial (Env prod, .env, senha, token, credenciais…) aparece com cadeado e o conteúdo fica escondido até você clicar em **Mostrar o conteúdo**; segredo não deveria morar em documento do projeto.
  - **Reuniões**: as reuniões registradas no Journify, com a data, os participantes e o resumo.
  - **Arquivos**: numa lista só, como a aba Arquivos do Journify: o **Drive do projeto**, os anexos das tasks e os documentos que são arquivo, filtrados (Documentos, Planilhas, Imagens, Reuniões, Outros) e com busca. O clique abre o arquivo pelo link (nada é baixado; o link de documento-arquivo vale 60 min, e o do Drive pede acesso à pasta no Google); o botão direito abre a task ou copia o link. **Enviar arquivos** manda um arquivo do computador para o Drive do projeto. O **↻** lê de novo.
  - **Formulários**: os formulários do projeto (para gestor+ ou membro do projeto), com os campos e as respostas, as mais novas primeiro; o link dos anexos de uma resposta vale 60 min.
  - **Novo documento** cria um documento no projeto (título e o texto em Markdown), e **Editar**, num documento aberto, troca o conteúdo ou **acrescenta ao fim** (bom para decision log e regras de negócio depois de cada reunião). Documento do GitHub ou de arquivo é só leitura.
- **GitHub**: pelo `gh` e a conta ativa dele (um menu troca a conta ou conecta outra). À esquerda: "Pedem sua revisão", "Seus PRs" e cada repositório dos projetos, com a branch, o número de PRs abertos e o que falta subir (↑), baixar (↓) ou commitar (●). Escolhido um repositório, o topo traz a branch (o clique troca ou cria outra), um botão de sincronizar que muda com o estado, como no GitHub Desktop (**Pull ↓** quando tem o que baixar, **Push ↑** quando tem o que subir, **Publicar branch** quando ela ainda não está no origin, **Fetch** quando está em dia; as outras no menu ao lado), e **Abrir PR**: o Claude abre o PR numa aba do jfy pelas regras do agente pr-creator (template, tasks pelas linhas `Journify:` dos commits, plano de testes, link do PR nas tasks), pedindo a sua aprovação antes de criar e de comentar. Embaixo, as abas:
  - **Alterações**, como no GitHub Desktop: marque os arquivos (já vem desmarcado o que o committer deixa de fora: `.env`, `.DS_Store`, chaves, `node_modules`, saída de build), veja o diff de cada um à direita e, embaixo da lista, escreva o **título** (com o contador do limite de 72 do committer) e a descrição à mão, ou use **Gerar título e descrição com o committer** (as regras do agente committer, lidas do `committer.md` na hora, no modelo dele: formato, prefixo `[Nome]` na conta compartilhada, linha `Journify:` das tasks da branch). O commit é do jfy, com as travas do committer: nada em `main`, `master` ou `develop` nem fora do gitflow, nada no meio de merge ou rebase, varredura de segredos antes do `git add`, só os arquivos marcados e nunca `Co-Authored-By`.
  - **Histórico**: os commits da branch; o clique mostra a mensagem inteira e o diff.
  - **PRs**: os abertos do repositório, com descrição, checks, commits, revisões e comentários; merge (pelos métodos que o repo aceita), aprovar, comentar e fechar sem merge, com confirmação. **Revisar com o Claude** abre uma aba com o `/code-review` do PR (ele não comenta no GitHub sem você pedir). O PR mostra as tasks do Journify ligadas a ele, e o clique abre a task na aba Projetos; a task mostra os PRs citados nela, e o clique abre o PR aqui.
  - **Branches e worktrees**: nova branch no padrão gitflow (feature e bugfix saem da `develop` atualizada, ou da `developer` onde ela tem esse nome; hotfix e release da `main`), trocar, excluir só a que já entrou na base (`git branch -d`). Os worktrees que o jfy criou para tasks em paralelo: abrir no Finder (no Windows, no Explorador de Arquivos) ou num terminal livre (no Windows, uma aba do app com o PowerShell), remover (só sem arquivo mexido) e limpar os órfãos. Com uma task do jfy rodando no repositório, trocar e criar branch ficam bloqueados.
- **Horas**: a tabela do que vai para o [minhas-horas](https://journify.souv.tech/minhas-horas) (veja [Horas](#horas)): projeto e categoria por menu (ou um nome livre), **iguais aos do Journify**: os projetos e as categorias do Minhas Horas, com os nomes de lá, lidos do próprio Journify (guardados por 6 h em `~/.jfy/projetos_journify.json`; o mesmo menu aparece no "para as horas" da Agenda). Lista longa ganha busca no select. **Dia já lançado** ganha um aviso no topo, lido do próprio Journify (o que foi lançado por qualquer caminho conta), e cada linha uma marca: ✓ já está no Journify assim, ✎ mudou, + nova; lançar de novo edita o que mudou, sem duplicar. Horas e descrição editáveis (salva com Enter, ao clicar fora ou no ✓; Esc desfaz; horas como 1:20, 1h20, 80 ou 1,5; vazio volta para a regra), remover e restaurar, e a troca de dia. **"Lançar no Journify…"** lança o dia direto no Journify, em segundos, sem Claude, sem Chrome e sem gastar tokens (veja [Horas](#horas)). **Registrar horas à mão** (embaixo da tabela) cria uma linha nova com projeto, categoria, horas e descrição, para o trabalho que o jfy não mediu (uma ligação, um trabalho fora do Claude): ela entra no mesmo registro do dia e vira uma linha como as outras (editar, levar para outro dia, remover e lançar).
- **Contexto**: a cesta do que o Claude precisa ler. Marque com o botão **Contexto** (ou o botão direito) uma task, um documento, uma reunião, um anexo, um link de dentro da task, um email ou um PR; o número na barra lateral mostra quantos itens há. Na aba, os itens aparecem por tipo, cada um com uma **nota** opcional para o Claude ("olhe só as rotas"), e à direita o **pedido** (o que você quer que ele faça) e o destino:
  - **Conversa nova**: uma aba nova com o Claude na pasta do projeto escolhido;
  - **Aba aberta**: o pedido é escrito na aba do jfy que você escolher, como se você digitasse;
  - **Pipeline**: abre o `/pipeline` de uma task da cesta com o contexto nas notas (se a aba da task já existe, escreve nela).

  **Montar o contexto** faz o jfy juntar tudo numa pasta em `~/.jfy/contexto/` (um `CONTEXTO.md` com o pedido, as notas e o texto de cada item, e os arquivos baixados) e mostra o tamanho de cada item em tokens, com um aviso se passar de ~150 mil. Docs e Planilhas do Google viram texto (precisa do Drive no login); o Figma vai como link, com a instrução de ler pelo MCP do Figma; documento com cadeado (credenciais) nunca vai; o que não der para ler vai como link, com o motivo. **Enviar** manda, esvazia a cesta e leva ao terminal. As 30 últimas montagens ficam guardadas, e as 5 mais novas aparecem em **Enviados**, com **Mandar de novo**. Todo Claude aberto pelo jfy enxerga a pasta do contexto sem pedir permissão (as abas abertas antes desta versão pedem uma vez).
- **Agenda**: a sua agenda do Google em **dia, semana e mês** (◀ Hoje ▶), com a linha de agora. Cada pessoa aparece com a **foto** (do diretório do Google; sem foto, as iniciais), como no Google Agenda: nas sugestões do "Reunião com…" e dos convidados, nas etiquetas das pessoas escolhidas, nos convidados de um evento (com a resposta no cantinho da foto), no bloco das reuniões de 1 h ou mais (quem vai junto) e no bloco dos eventos de outra pessoa. **Reunião com…**, como no Google: pesquise uma pessoa da empresa (as sugestões são os seus contatos; Enter ou o clique escolhe) e a agenda dela aparece junto, com o nome no título e uma cor para cada (até 8; o × tira, e a escolha fica lembrada). Os eventos que você também tem não se repetem, o privado aparece como "Ocupado", e a agenda que não está compartilhada com você avisa na etiqueta da pessoa. O evento de outra pessoa abre só para ver (sem editar e sem ir para as suas horas). Clicar num horário vazio cria um evento ali; **Novo evento** também. O evento abre com horário, local, **Entrar na chamada**, convidados (com a resposta de cada um) e descrição; **Editar** e **Apagar** aparecem quando você pode editar (em recorrente, vale só para aquela ocorrência). Ao criar ou editar: título, dia inteiro, início e fim, local, descrição, convidados, a chamada do Google Meet e se manda o convite (ou a atualização) por email. Cada reunião tem também o **para as horas**: o projeto (menu, ou um nome livre) e o contexto que vão para a aba Horas, e **Preparar com o Claude**. Criar e editar pedem o escopo `calendar.events` no app do Google: quem fez login antes precisa rodar `jfy --login` uma vez.
- **Emails**: **Escrever** abre um email do zero (Para, Cc, assunto e texto, com as sugestões de contato e a sua assinatura do Gmail): escreva, ou peça ao Claude para gerar a partir de um contexto, corrigir ou melhorar; salve como rascunho ou envie (pede confirmação). Duas caixas: **Não lidos** (da Principal) e **Importantes** (como a pasta Importantes do Gmail, sem os que você enviou; os não lidos ficam em negrito com a bolinha). Dá para **buscar** por remetente ou assunto, filtrar os importantes por lidos e não lidos e **agrupar** por data (Hoje, Ontem, Esta semana, Este mês, Mais antigos), por remetente ou sem grupo; a caixa e o agrupamento ficam lembrados. Os não lidos da caixa Principal, com o total no selo da barra lateral (o mesmo número do ✉ da barra do tmux, que sobe quando chega um). A aba e o email abrem **na hora**, com o que o jfy guardou (a caixa ele atualiza por trás de 2 em 2 min); a busca no Gmail roda em segundo plano e a tela só muda quando chegou algo novo. O email abre com a **conversa inteira** (as mensagens antigas recolhidas; o clique abre). Cada mensagem mostra os **anexos**: as fotos (inclusive as coladas no corpo) aparecem na própria mensagem, e o clique abre no Pré-Visualização (no Windows, no visualizador padrão); os outros arquivos abrem no app padrão. O jfy baixa para `~/.jfy/anexos` e, da segunda vez, já está lá. Os **links** do texto são clicáveis (sublinhados, com a mãozinha em cima); o link que vinha escondido atrás de um texto aparece como **↗ domínio**. Ler não marca como lido; dá para marcar como lido ou não lido, marcar todos e abrir no Gmail na sua conta. **Responder**, **Responder a todos** (com cópia para os outros de Para e Cc, menos você) ou **Encaminhar** (com os anexos), sempre na mesma conversa e com a **assinatura padrão do seu Gmail**: escreva, ou peça para **gerar** (do email e de um contexto seu, opcional), **corrigir** ou **melhorar** o seu texto (gerar e melhorar com o Claude; corrigir com o [corretor de português](#corretor-de-português-o-claude-nos-bastidores), o Haiku nos bastidores, em 1 a 2 s); depois salve como rascunho no Gmail ou envie (pede confirmação). Os campos de email (Para, Cc e os convidados da Agenda) **sugerem contatos** enquanto você digita, como o Gmail: quem você escreve, quem te escreve e quem esteve nos seus eventos, lidos do próprio Gmail e da agenda (`~/.jfy/contatos.json`, atualizado a cada 6 h; quem você usa pelo app entra na hora). A assinatura é a que estiver como **padrão** no Gmail (Configurações › Geral › Assinatura › Padrões de assinatura, em "Para uso em novos e-mails" e "Para respostas/encaminhamentos"): a API do Gmail só enxerga essa, e não as outras assinaturas com nome. Sem padrão, o app avisa antes de enviar e leva para essa configuração.
- **Portas**: o que está rodando (as portas de desenvolvimento do `o`), com o projeto, se foi o Claude que subiu, "Abrir" no navegador, "Encerrar" e "Encerrar todas" (pede para sair; se em 3 s não saiu, força; container do Docker com `docker stop`). Atualiza sozinha e o número de portas abertas fica no selo.
- **Uso da IA**: **Avaliar este período** pede ao Claude um diagnóstico do seu jeito de usar no período escolhido: ele lê os números, uma amostra dos seus pedidos e os sinais de atrito (interrupções, ferramentas recusadas, erros de ferramenta, compactações, correções logo em seguida, pedidos curtos demais) e devolve uma nota, o que já funciona, onde está o atrito (com um pedido seu de exemplo), como melhorar (com o pedido reescrito, antes e depois) e onde dá para gastar menos. Leva uns 2 minutos e usa tokens; a última avaliação de cada período fica guardada e reaparece sem custo. Também mostra quanto o Claude Code gastou neste computador, lido das conversas em `~/.claude/projects` (hoje, 7 dias, 30 dias ou tudo). Mostra o custo em US$ pelo preço da API (na assinatura é o valor equivalente, não a conta), os tokens, as sessões e os limites de 5 h e semanal; o custo por dia de cada projeto (passe o mouse num dia para ver o detalhe); para onde foi o custo (leitura e escrita de cache, saída); e os rankings por projeto, task do Journify (clique abre a task), modelo, ferramenta e sessão, com o maior contexto de cada uma. `jfy --uso [dias]` dá o mesmo em JSON.
- **Chat**: o chat do time do Journify, pelo MCP do Journify:
  - **Diretas** e **Grupos** separados (o seletor no topo da lista, com as não lidas de cada lado; a escolha fica lembrada);
  - **fixadas no topo**: até **3 diretas e 3 de grupo** (a estrela ao passar o mouse, ou o botão direito › Fixar no topo);
  - **@ com sugestão das pessoas**: digite @ e escolha; a pessoa é marcada de verdade, e o Journify avisa ela como no app (por enquanto a sugestão traz quem já escreveu na conversa, porque o MCP ainda não lista os membros);
  - a **correção do português nos bastidores**: quando você para de digitar, o [corretor](#corretor-de-português-o-claude-nos-bastidores) sugere as trocas numa faixa acima do campo, e **Tab** aplica; o botão **Corrigir** corrige na hora, e **Melhorar** (com o Claude) deixa a mensagem mais clara, os dois com **Desfazer**;
  - **programar o envio** (o relógio ao lado do Enviar: daqui a 1 hora, amanhã às 9:00 ou a data e a hora que você escolher). O Journify não programa mensagem: o jfy guarda (`~/.jfy/chat-programadas.json`) e manda na hora pelo relógio dele (no Mac, o da barra do tmux; no Windows, o que o app mantém rodando), e avisa quando enviou. As programadas aparecem acima do campo, com **Editar** e **Cancelar**. Com o computador desligado ou dormindo na hora, ela vai quando ele volta, se o atraso for de até 30 min; mais que isso, não vai sozinha (a mensagem pode não fazer mais sentido): ela fica com o aviso, e você escolhe **Enviar agora** ou **Cancelar**. A que falhou fica igual, e nunca é mandada duas vezes;
  - **Responder** (botão direito numa mensagem: cita a mensagem no começo da sua) e **emojis** no texto. Resposta em thread, reação com emoji, anexo e editar ainda não existem no MCP do Journify; quando existirem, entram aqui;
  - o **número de conversas não lidas** na barra lateral (só as de que você participa), atualizado a cada 2 min e quando você abre a conversa;
  - a lista e cada conversa **abrem na hora**, com o que o jfy guardou da última vez (`~/.jfy/chat-guardado/`, que o vigia mantém em dia sem nenhuma busca a mais); a busca de verdade vem logo atrás e só muda a tela se chegou algo novo;
  - a tela busca mensagens novas a cada 5 s enquanto está aberta, e a cada 2 min o vigia avisa por notificação quando chega mensagem numa conversa (o clique abre a conversa). Abrir a conversa marca como lida, como no app do Journify; a de que você não participa fica só para leitura. `jfy --chat [conversa [texto [ids marcados]]]` dá o mesmo em JSON.

- **Notificações**: o histórico do que o jfy avisou, por dia, com o número de novas na barra lateral e no ícone do Dock (no Windows, no ícone da barra de tarefas). Com o app aberto, **é ele que mostra as notificações do sistema, com o ícone do jfy (o símbolo da Souv)**, mesmo com você em outro app. No Mac, na primeira vez o macOS pergunta se o jfy pode enviar notificações: escolha Permitir (ou ligue em Ajustes do Sistema › Notificações › jfy); com o app fechado, quem mostra é o terminal-notifier, como antes. No Windows, o app fica na bandeja e mostra sempre; com ele fechado de vez (Sair), os avisos ficam só no histórico. Com o app instalado, **o clique na notificação abre o app já na aba certa**: email novo (o email, em Emails), PR pedindo a sua revisão (o PR, em GitHub), evento adicionado, remarcado ou cancelado por outra pessoa (o evento, em Agenda), mensagem nova no chat (a conversa, em Chat), Claude que precisa de você ou respondeu (a aba dele, no terminal), horas registradas no Journify ou erro ao registrar, fim do lançamento de horas, jornada fechada e o resumo das 7h. Reunião em 5 min continua entrando direto na chamada. PRs, agenda e chat são olhados a cada 2 min, em segundo plano (`jfy --vigiar`, que o relógio da barra dispara); na primeira vez só guarda o que já existia, sem avisar. O clique numa linha da aba faz o mesmo. Fica em `~/.jfy/notificacoes.jsonl`; "Limpar" apaga.
- **Temas**: as cores e os ícones de cada tema (veja [Temas](#temas)); um clique troca.
- **Configurações**: as contas ligadas ao jfy, que valem também no terminal, e o **modelo do Claude de cada atividade** (veja [Modelos do Claude](#modelos-do-claude)). **Google** (Agenda e Gmail): a conta conectada, **Trocar de conta** (o Google deixa escolher outra) e **Desconectar** (revoga o acesso do jfy no Google e zera o que era da conta antiga: não lidos, contatos e eventos vistos). **GitHub**: as contas do `gh`, com a que está em uso; **Usar** troca, **Sair** tira uma conta deste Mac, **Sair de todas** tira todas, e **Adicionar conta** abre o `gh auth login` numa aba (sair não revoga o token no GitHub: isso é em github.com/settings/applications). **Journify**: o MCP conectado (quantas tasks suas ele enxerga e o fim do token, porque o MCP não diz de quem é o token), **Trocar token** (abre as Configurações do Journify; o jfy testa o token novo antes de trocar, então um token recusado não derruba o que funcionava) e **Desconectar**. O que tira acesso pede confirmação.
- **Créditos**: quem fez o jfy. José Carlos (Pagode) Paiva criou o jfy no terminal; Antonio Cavalcante trouxe a versão app, para o Mac e para o Windows, e as melhorias, para deixar o dia a dia de trabalho na Souv mais leve. Com a foto dos dois, a música (com botão para pausar), o mural **Quem também esteve aqui** (quem melhorou o jfy depois, com a foto e o que trouxe; veja [Créditos](#créditos)) e o "WE WERE HERE." no fim.

A janela tem um tamanho mínimo, e as colunas laterais (projetos, tasks, repositórios, PRs, emails, conversas) encolhem com ela, para nenhuma tela ficar espremida. No Mac, precisa do macOS 15 ou mais novo. Para atualizar: `jfy --update` (traz a versão nova e remonta o app). Para só remontar o app: `./app/build.sh`. A assinatura é local, vale para este Mac. No Windows, atualize com o instalador da versão nova.

### Notificação das 7h

De segunda a sexta, às 7h, chega uma notificação com as reuniões do dia e as tasks no foco.

- **Mac:** um LaunchAgent (extra do `install.sh`). Se o Mac estiver dormindo, ela chega quando ele acordar. Se a notificação não aparecer, libere as notificações do **Editor de Scripts** em Ajustes do Sistema > Notificações.
- **Windows:** o próprio app dispara (ele fica na bandeja). Com o computador desligado às 7h, ela sai quando ele ligar, até o meio-dia.

### Aviso do Claude

Quando um Claude responde ou pede permissão, chega uma notificação do macOS com o nome da aba (ou da pasta). **Clicar nela traz o terminal já na aba daquele Claude.** O clique também funciona na notificação de email (abre o leitor) e na de reunião (abre a chamada). Isso usa o `terminal-notifier`, que o `install.sh` (se você aceitar o aviso) ou o passo **Notificações** dos primeiros passos instala; libere **terminal-notifier** em Ajustes do Sistema > Notificações. Sem ele, ou sem a permissão, a notificação sai pelo Editor de Scripts e o clique abre o Editor de Scripts em vez do terminal. Vale para todo Claude Code, dentro e fora do jfy. Ela não aparece se você já está olhando: terminal na frente e, dentro do jfy, a aba daquele Claude aberta. O `install.sh` liga isso com dois hooks (`Stop` e `Notification`) no `~/.claude/settings.json`.

Para a aba também ficar vermelha, no Claude rode `/config` e ponha **Notifications** em **Terminal Bell**.

**No Windows**, o app liga esses dois hooks sozinho ao abrir, apontando para o Python e o jfy dele (o Claude Code roda os hooks pelo Git Bash, por isso o Git para Windows). A notificação sai pelo app, e o clique leva até a aba daquele Claude. Ela não aparece se a aba dele estiver na frente, com a janela do app em foco. A bolinha vermelha da aba, como no Mac, precisa do **Terminal Bell** no `/config` do Claude.

### Horas

O jfy anota cada trabalho do dia em `~/.jfy/horas/AAAA-MM-DD.jsonl`: tasks (no `/exit` ou no `--fim` da sessão), terminal livre e preparação de reunião. As reuniões vêm da agenda, com o projeto e o contexto que você deu na aba Reuniões ou Horas do app (sem isso, o projeto sai do apelido no título, marcado "projeto pelo título"). Sessões do Claude abertas fora do jfy não entram.

A aba Horas do app (Mac e Windows) mostra só o que vai para o Journify: uma linha por lançamento, com projeto, categoria, horas e descrição, e o total no topo; o medido e a regra ficam ao lado. Cada mudança vale só para aquele dia; numa reunião, projeto e descrição vão para o mesmo registro da aba Agenda.

**Registrar horas à mão.** Para o trabalho que o jfy não mediu (uma ligação, uma reunião fora da agenda, algo feito fora do Claude), **Registrar horas à mão**, embaixo da tabela, abre uma linha nova: projeto (o menu do Journify, ou um nome livre em "Outro nome no Journify…"), categoria, as horas trabalhadas (`1:20`, `1h20`, `80` ou `1,5`) e a descrição. Enter (ou o ✓) registra; Esc cancela. A linha entra no mesmo registro do dia em que o jfy grava as tasks (`~/.jfy/horas/AAAA-MM-DD.jsonl`), então vira uma linha como as outras: dá para corrigir, levar para outro dia, remover e lançar. As horas são o **trabalhado**: o fator, se houver, vale em cima, como nas outras linhas. Só para hoje ou um dia que já passou. Pelo terminal: `jfy --horas-nova <AAAA-MM-DD> <projeto> <categoria> <horas> "<descrição>"`.

A coluna **Trabalhado** é o tempo da linha: o medido, ou a sua correção quando o medido está errado (uma sessão esquecida aberta, por exemplo). A correção entra no lugar do medido e a regra vale em cima dela, como nas outras linhas; a coluna **Lança** mostra o resultado. A linha corrigida fica marcada com a mão e, apagando o valor e salvando, volta ao medido. O botão de calendário da linha a **leva para outro dia** (hoje ou antes): o trabalhado vai junto e, se lá já existe a mesma linha, os dois somam. O jfy guarda os arquivos dos dois dias antes e confere a soma do trabalhado depois; se não fechar, volta tudo como estava. Reunião fica no dia em que aconteceu. **Lançar no Journify** vai direto pelo MCP do Journify, em segundos (sem Claude e sem Chrome), e deixa o dia igual à tabela: o lançamento que já está lá (mesmo projeto e descrição) e mudou é **editado**, não duplicado; as linhas novas entram todas de uma vez (tudo ou nada: com uma linha errada, nenhuma entra), ligada à task de onde veio só quando você escolheu isso ao encerrar a task (o jfy pergunta no `/exit`; o padrão é não ligar) e, quando dá para saber, à etapa do projeto (a única que ele tem, ou a de Design ou de Desenvolvimento pelo tipo da categoria). Lançamento do dia que não é de linha nenhuma fica como está, porque o MCP não apaga: o app mostra, para você tirar pelo Minhas Horas se não devia estar lá. Hora extra continua só pelo Minhas Horas, com a aprovação do gestor.

As categorias são as do Journify. As linhas que o jfy mede entram como **Funcionalidade** (tasks), **Pesquisa** (terminal livre) e **Reunião**; troque na coluna Categoria quando outra servir melhor (Bug, Testes, Documentação, Revisão…).

Por padrão o jfy lança o medido, arredondado para múltiplos de 5 min. Se o seu gestor combinou um fator para cobrir o que o cronômetro não vê (entender a task, ler, conversar), ponha em `~/.jfy/config.json`:

```json
"horas": {"fator": 1.2}
```

O fator multiplica só as linhas de trabalho; reunião fica com a duração da agenda. Ele aparece no topo da tabela, junto do medido. Sessões do Claude abertas fora do jfy não entram no log.

### Corretor de português (o Claude, nos bastidores)

O **Corrigir** do chat e dos emails é o **Claude Haiku**, pelo **plano de cada pessoa** (o login do Claude Code; nada de chave de API). Ele corrige ortografia, acentos, crase ("vou à reunião às 14h"), concordância ("a gente vai"), vírgula e palavras confundidas ("mas"/"mais", "e"/"é", "a"/"há"), sem reescrever a frase (isso é o **Melhorar**). Enquanto você digita, o próprio sistema também sublinha o erro de ortografia: no Mac, o corretor do macOS; no Windows, o do app, com as sugestões no clique direito.

**Como funciona, por baixo:** um Claude Code fica aberto em segundo plano, só para isso, e cada correção é uma mensagem nova para ele: leva de 1 a 2,5 s, e o mesmo texto não vai duas vezes. Ele roda leve de propósito: sem ferramentas, sem MCP, sem os seus settings (nenhum hook roda), com um prompt curto só de correção e **sem salvar sessão nenhuma** (as correções não ficam no histórico do Claude Code nem na aba Uso da IA, e o texto nunca vai para disco). Ele recomeça a cada 15 correções e fecha sozinho depois de 10 min parado. Cada correção custa algo entre US$ 0,0001 e 0,0003 (na assinatura, quase nada do limite de uso).

**Travas:** a resposta do Claude passa por uma conferência antes de virar sugestão. Se ela mexeu em @menção, link, número, código ou quebra de linha, ou trocou palavras demais (cara de reescrita, não de correção), é descartada. Texto com menos de 3 palavras nem vai. Sem internet ou com o limite do plano batido, o corretor simplesmente não sugere nada.

No chat, a correção chega sozinha quando você para de digitar: as trocas aparecem numa faixa acima do campo, **Tab** aplica e fica só o **Desfazer**. O modelo se troca em **Configurações › Modelos do Claude › Corrigir o português**. `printf 'texto' | jfy --corrigir` dá o mesmo em JSON.

### Ao encerrar uma task (`/exit`)

Ao abrir, a task já tinha ido para `em_progresso`. No `/exit`, o jfy pergunta:
1. pronta, vai para **em teste**;
2. pronta, vai para **em revisão**;
3. pronta, vai para **fechado**: pede o link do vídeo do teste ou, sem vídeo, o motivo (o Journify exige um dos dois para fechar);
4. não pronta: só comenta o tempo (Enter);
5. não registrar nada.

De 1 a 3, comenta o tempo gasto e muda o status. Na sessão de várias tasks, o Claude pergunta o mesmo e roda `jfy --fim <id> --status em_teste|em_revisao|fechado`.

O tempo vem do relógio (da abertura até o `/exit`, sem as reuniões da agenda que caíram no meio) e você pode corrigir (`80`, `1h20`, `1:20`). Ele vai como comentário na task e para o log de [horas](#horas); no `/exit` o jfy também pergunta se, ao lançar o dia, esse tempo vai **ligado à task** no Minhas Horas (o padrão é não ligar).

Depois o Claude atualiza o `handoff.md` na raiz do repositório (ou cria do zero, se não existir) e a memória do projeto, em segundo plano: a aba já pode ser fechada. O `handoff.md` fica como alteração não commitada: commite junto com a task. Se a task rodou num worktree, ele fica em `~/.jfy/worktrees/` com o `handoff.md`: depois do merge, apague com `git worktree remove <pasta>`.

### Modelos do Claude

O modelo de cada atividade se escolhe no app, em **Configurações › Modelos do Claude**: tasks pelo /pipeline, tasks em conversa, terminal livre, revisar PR, preparar reunião, avaliar o uso, fechar a task, emails, mensagem de commit e abrir PR. As opções: o padrão do Claude Code (o modelo do `/model` do terminal), Fable, Opus, Sonnet ou Haiku. A troca vale na hora, também para o jfy do terminal, e fica em `"modelos"` no `~/.jfy/config.json`.

Logo abaixo, **Agentes da pipeline** escolhe o modelo de cada agente que o /pipeline chama (planner, builder, verifier, e2e-tester, committer, pr-creator): o padrão da pipeline do time, o mesmo da sessão, Fable, Opus, Sonnet ou Haiku. O jfy troca só a linha `model:` do agente no clone da pipeline (`~/.jfy/pipeline-Claude`) e guarda a escolha em `"modelos_agentes"` no config; ao atualizar a pipeline, o `install.sh` (no Windows, o app ao abrir) volta essa linha ao oficial antes do `git pull` e reaplica a sua escolha depois, sem mexer em mais nada dos arquivos.

Sem escolha, as tarefas simples (emails, commit e abrir PR) rodam no **Sonnet**, e o resto no padrão do Claude Code. O fechamento da task segue, por padrão, **o mesmo modelo da conversa** que ele retoma (o jfy lê na transcrição qual foi): assim aproveita o cache dela, e trocar de modelo ali faria reler tudo a preço cheio.

## Onde ficam as coisas

O que é do jfy fica em `~/.jfy` nas duas plataformas (no Windows, `C:\Users\<você>\.jfy`).

| O quê | Onde |
|---|---|
| projetos e repositórios configurados | `~/.jfy/config.json` |
| domínio do Journify que você usa (padrão `https://journify.souv.tech`) | `"journify"` no `~/.jfy/config.json` |
| memória de cada projeto (máx. 40 linhas, o Claude lê antes de tudo) | `~/.jfy/memoria/<projectId>.md` |
| worktrees de tasks paralelas | `~/.jfy/worktrees/` |
| cronômetro da jornada de hoje | `~/.jfy/dia.json` |
| horas medidas por dia (e as registradas à mão) e a regra do lançamento | `~/.jfy/horas/` e `"horas"` no `~/.jfy/config.json` |
| client OAuth do Google e reuniões de hoje | `~/.jfy/config.json` e `~/.jfy/agenda.json` |
| projeto e contexto de cada reunião (base das horas) | `~/.jfy/reunioes.json` |
| ajustes que você fez na tabela de horas de um dia | `~/.jfy/horas/AAAA-MM-DD.ajustes.json` |
| histórico de notificações | `~/.jfy/notificacoes.jsonl` (a aba Notificações do app) |
| sugestões de contatos (emails e convidados) | `~/.jfy/contatos.json` |
| fotos das pessoas da Souv (lidas do diretório do Google uma vez por dia) | `~/.jfy/fotos.json` |
| corretor de português (o servidor dos bastidores: porta e token; nenhum texto) | `~/.jfy/rodando/corretor.json` |
| emails guardados para a aba Emails abrir na hora (as duas caixas, remetente e assunto dos 1000 mais novos e os 100 últimos emails abertos; o vigia atualiza de 2 em 2 min e o `jfy --login` apaga) | `~/.jfy/emails-*.json`, `~/.jfy/emails-abertos/` |
| projetos, etapas e categorias do Minhas Horas (o menu da aba Horas), lidos do Journify | `~/.jfy/projetos_journify.json` (guardados por 6 h) |
| a pipeline do time (agentes, `/pipeline`, hooks) | clone em `~/.jfy/pipeline-Claude`, ligada no `~/.claude` (no Mac por link; no Windows por cópia, registrada em `~/.jfy/pipeline-copias.json`) |
| o mural dos créditos | `mural/mural.json` e `mural/fotos/`, no repositório |
| **Mac:** app | `/Applications/jfy.app`, montado por `app/build.sh` a partir de `app/` |
| **Mac:** notificação das 7h | `~/Library/LaunchAgents/jfy.dia.plist` |
| **Mac:** ícone na barra de cima | plugin em `~/.jfy/swiftbar/jfy.1m.sh` (ou na pasta de plugins do seu SwiftBar); abre com o Mac por `~/Library/LaunchAgents/jfy.swiftbar.plist` |
| **Mac:** acesso ao Google | Chaves do macOS, item `jfy-google` |
| **Windows:** app (com o motor e o Python dentro) | `%LOCALAPPDATA%\Programs\jfy` |
| **Windows:** acesso ao Google | `~/.jfy/segredos/`, cifrado pela DPAPI (só o seu usuário, neste computador, abre) |
| **Windows:** o que o app ligou ao abrir | `~/.jfy/rodando/instalar.log` |

**Duas tasks no mesmo repositório ao mesmo tempo**: a segunda roda num `git worktree` separado, com branch própria, para os pipelines não mexerem nos mesmos arquivos. O worktree recebe uma cópia dos `.env`, mas não as dependências (`node_modules`, venv); o Claude instala se precisar.

## Atualizar

**Mac:** `jfy --update`. Ou à mão:

```bash
cd ~/jfy && git pull
~/jfy/install.sh     # atualiza a pipeline, religa o comando e remonta o app, se ele estiver instalado
```

**Windows:** baixe e abra o instalador da versão nova (veja [Pegar o instalador](#1-pegar-o-instalador)). Ele troca o app (com o motor e o Python) e mantém o `~/.jfy`. A pipeline do time se atualiza sozinha a cada vez que o app abre.

## Problemas comuns

- **O email saiu sem assinatura**: não há assinatura **padrão** no Gmail. Veja o passo 1 de [Ajustes de uma vez só](#ajustes-de-uma-vez-só).
- **A aba GitHub diz "Instale o GitHub CLI"** ou fica vazia: no Mac, `brew install gh` e `gh auth login`; no Windows, refaça o passo GitHub dos primeiros passos (Configurações › Sessão › Refazer os primeiros passos) ou rode `winget install --id GitHub.cli` e depois `gh auth login`.
- **"Lançar no Journify" recusa o dia**: a mensagem é a do próprio Journify. As mais comuns: linha sem projeto do Journify (escolha na coluna Projeto), categoria que ele não tem (troque na coluna Categoria) ou o dia passando de 24 h. O lançamento é tudo ou nada: com uma linha errada, nenhuma entra.
- **A Agenda ou os Emails dizem "não conectados"** ou pedem permissão: use Configurações › Google no app (no terminal do Mac, `jfy --login`).
- **"MCP 'journify' não configurado"** ou token recusado: Configurações › Journify › Trocar token no app (no terminal do Mac, `jfy --comecar`) e cole um token novo.
- **O `/pipeline` para dizendo que a branch está errada**: ele só roda em `feature/`, `bugfix/`, `hotfix/` ou `release/`. Escolha o tipo quando o jfy oferecer criar a branch.
- **O `/pipeline` diz que a task não é de código**: use a opção `2` (conversar com o Claude).
- **Um projeto não aparece no menu**: o menu mostra os projetos configurados e os que têm tasks abertas atribuídas a você. Um projeto novo, sem task sua, só aparece depois de configurado (ou quando chegar uma task).
- **Ícones do tema não aparecem (espaço vazio ou quadradinho) no terminal do Mac**: o terminal não está com a fonte JFY Mono, ou não foi reiniciado depois de instalá-la. Escolha "JFY Mono" e feche o terminal com ⌘Q. Depois de um `git pull` que trouxe ícones novos, rode o `./install.sh` (ele copia a fonte nova) e reinicie o terminal. No app, a fonte já vem dentro.
- **O ícone da barra de cima não aparece (Mac)**: abra o jfy (ele reabre o SwiftBar) ou rode `open /Applications/SwiftBar.app`. Em Mac com notch, o macOS esconde atrás do notch os ícones que não cabem (o mais novo é o primeiro a sumir): segure ⌘ e arraste a chama para perto do relógio, ou tire da barra um ícone que você não usa.
- **Windows: "O Windows protegeu o computador" ao instalar**: o instalador não é assinado. Clique em **Mais informações › Executar assim mesmo**.
- **Windows: as notificações não aparecem**: veja o passo 3 de [Ajustes de uma vez só](#ajustes-de-uma-vez-só) (notificações do jfy ligadas e o Não perturbe desligado). O jfy precisa estar aberto (na bandeja).
- **Windows: "Falta o Claude Code" ou "Falta o Git"** na abertura: instale o que falta (o Claude Code pelo instalador nativo) e abra o app de novo; ele liga o resto sozinho. Programa instalado com o app aberto às vezes só aparece para ele depois de **Sair** e abrir de novo.
- **Windows: o Claude erra pedidos com `%`, `&` ou aspas**: o Claude Code foi instalado pelo npm (`claude.cmd`). Instale pelo instalador nativo.
- **Windows: o uso da IA no topo do app não aparece**: o `statusLine` do seu `~/.claude/settings.json` é outro (o app não troca o seu). Veja o aviso em `~/.jfy/rodando/instalar.log`.

## Desinstalar

**Mac:**

```bash
rm "$(command -v jfy)"
find ~/.claude/commands ~/.claude/agents ~/.claude/hooks -type l -lname "*pipeline-Claude/*" -delete
launchctl bootout gui/$(id -u)/jfy.dia; rm ~/Library/LaunchAgents/jfy.dia.plist
launchctl bootout gui/$(id -u)/jfy.swiftbar; rm ~/Library/LaunchAgents/jfy.swiftbar.plist
brew uninstall --cask swiftbar  # se você só usava ele para o jfy
rm -rf /Applications/jfy.app
security delete-generic-password -s jfy-google
rm -rf ~/.jfy ~/jfy
# e tire o "tee ~/.jfy/claude-status.json | " do statusLine e os hooks "jfy --avisar" em ~/.claude/settings.json
```

**Windows:**

1. Saia do jfy (bandeja › Sair) e desinstale em **Configurações › Aplicativos › Aplicativos instalados › jfy › Desinstalar**.
2. Se quiser tirar também a pipeline do `~/.claude`: os arquivos que o app copiou estão listados em `~/.jfy/pipeline-copias.json` (apague os que ainda forem iguais aos da pipeline).
3. No `~/.claude/settings.json`, tire o `statusLine` com `jfy --statusline` e os hooks com `jfy --avisar`.
4. Apague a pasta `~/.jfy` (`C:\Users\<você>\.jfy`), que tem as suas configurações, as horas e o acesso ao Google.

## Desenvolver

- **O motor** é o arquivo `jfy` (Python, só biblioteca padrão), o mesmo no Mac e no Windows. `jfy --selftest` roda o autoteste. O que é só de uma plataforma fica atrás de `WIN` (Windows) ou de `APP` (rodando dentro do app do Windows, que hospeda as abas no lugar do tmux).
- **O app do Mac** fica em `app/` (SwiftUI). `app/build.sh` monta e instala em `/Applications`; `cd app && swift build` só compila.
- **O app do Windows** fica em `windows/` (Electron, React e TypeScript). `cd windows && npm install && npm run dev` abre com recarga ao vivo, também no Mac: lá ele usa o `/usr/bin/python3` e o `jfy` do repo, com as abas no app. No Windows, o `npm run dev` usa o `python` do PATH (ou o que estiver em `JFY_PYTHON`). `npm run dist` gera o instalador.
- **Os dois apps andam juntos:** uma tela ou função nova vai para o Mac e para o Windows (as regras do repositório estão em [`AGENTS.md`](AGENTS.md)).
- **CI:** o workflow **Windows** (`.github/workflows/windows.yml`) roda o autoteste do motor num Windows de verdade e gera o instalador a cada push no branch da versão Windows e nas tags `v*`.

## Créditos

O jfy foi criado por **José Carlos (Pagode) Paiva** e **Antonio Cavalcante**.

- **José (Pagode) Paiva** criou e idealizou o jfy. Levou a ideia para o terminal: abrir a task do Journify, deixar o Claude trabalhar nela e registrar o tempo, tudo sem sair dali.
- **Antonio Cavalcante** levou a mesma ideia para fora do terminal. Trouxe a versão app, com a cara da Souv, para o Mac e para o Windows, e foi juntando o que ainda ficava espalhado: projetos e tasks, GitHub, horas, agenda, emails e notificações.

Os dois ficam nos créditos para sempre: é regra do repositório ([`AGENTS.md`](AGENTS.md)) que nenhuma IA remove, esconde ou diminui os criadores, mesmo que alguém peça.

### O mural: quem também esteve aqui

Melhorou o jfy? Entre no mural da tela Créditos (Mac e Windows), no **mesmo PR da sua melhoria**:

1. Ponha a sua foto em `mural/fotos/` (quadrada, de até uns 400 px; JPG ou PNG).
2. Acrescente você no fim da lista em `mural/mural.json`:

   ```json
   {"nome": "Seu Nome", "foto": "seu-nome.jpg", "melhoria": "O que você trouxe, numa frase", "quando": "2026-12"}
   ```

   `foto` é o nome do arquivo em `mural/fotos/` (sem foto, o cartão mostra as suas iniciais) e `quando` é o ano e o mês da melhoria. O mural mostra os mais recentes primeiro.

No Mac, o mural aparece depois do `git pull`; no Windows, na próxima versão do instalador.
