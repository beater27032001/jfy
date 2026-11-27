// App do jfy para o Windows. O jfy em Python continua sendo o motor: o app roda `python jfy --algo-json` para os
// dados, lê ~/.jfy direto (notificações) e hospeda as abas (abas.ts) no lugar do tmux.
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, shell, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Abas } from './abas'

const WIN = process.platform === 'win32'
// no pacote, o motor e o Python vão em resources/; em desenvolvimento, o jfy é o do próprio repo
const REPO = app.isPackaged ? join(process.resourcesPath, 'motor') : resolve(__dirname, '../../..')
const MOTOR = join(REPO, 'jfy')
const PYTHON =
  process.env.JFY_PYTHON ??
  (WIN ? (app.isPackaged ? join(process.resourcesPath, 'python', 'python.exe') : 'python') : '/usr/bin/python3')
const JFY_DIR = join(homedir(), '.jfy')
const MARCA = app.isPackaged ? join(process.resourcesPath, 'marca') : join(REPO, 'app', 'Marca')
// o símbolo da Souv; PNG porque a notificação do Windows não lê SVG
const ICONE = app.isPackaged ? join(process.resourcesPath, 'icone.png') : resolve(__dirname, '../../recursos/icone.png')

let janela: BrowserWindow | null = null
let tray: Tray | null = null
let saindo = false
let tela = 'Meu dia' // a tela aberta no app: "a aba do Claude está na frente" só vale com o terminal à vista
let jfyApp = ''

const env = (): NodeJS.ProcessEnv => ({
  ...process.env,
  JFY_APP: jfyApp,
  PYTHONUTF8: '1', // o Python do Windows escreve em cp1252 sem isto: os acentos e os ícones viram "?"
  PYTHONIOENCODING: 'utf-8',
  LANG: process.env.LANG ?? 'pt_BR.UTF-8',
  ...(WIN ? {} : { PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}` })
})

const abas = new Abas(env, {
  dados: (id, d, n) => janela?.webContents.send('abas:dados', id, d, n),
  mudou: () => janela?.webContents.send('abas:mudou'),
  ir: (id) => janela && navegar(`jfy://aba/${id}`), // antes da janela existir (o menu, no começo), não há o que mostrar
  mensagem: (t) => new Notification({ title: 'jfy', body: t }).show(),
  focada: () => !!janela?.isVisible() && janela.isFocused() && tela === 'jfy'
})

/** Roda `jfy <args>` e devolve o código de saída, a saída e o erro. `entrada` vai pelo stdin (um token, por exemplo). */
function jfy(args: string[], entrada?: string): Promise<{ status: number; saida: string; erro: string }> {
  return new Promise((ok) => {
    const e = env()
    delete e.JFY_ABA // comando de fundo, não uma aba: o motor abre a aba quando precisa de uma
    const p = spawn(PYTHON, [MOTOR, ...args], { env: e, windowsHide: true })
    let saida = '',
      erro = ''
    p.stdout.on('data', (d) => (saida += d))
    p.stderr.on('data', (d) => (erro += d))
    p.on('error', (err) => ok({ status: -1, saida: '', erro: `Não consegui rodar o jfy (${PYTHON}): ${err.message}` }))
    p.on('close', (status) => ok({ status: status ?? -1, saida, erro }))
    if (entrada !== undefined) p.stdin.end(entrada + '\n')
    else p.stdin.end()
  })
}

function mostrar() {
  if (!janela) return criarJanela()
  if (janela.isMinimized()) janela.restore()
  janela.show()
  janela.focus()
}

/** jfy://<destino>: o clique nas notificações e os links do motor. A tela decide para onde vai. */
function navegar(url: string) {
  mostrar()
  janela?.webContents.send('navegar', url)
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0A0E2D',
    title: 'jfy',
    icon: ICONE,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  // fechar a janela não fecha o app: as abas e as notificações seguem (como o app do Mac); Sair na bandeja fecha
  janela.on('close', (e) => {
    if (!saindo) {
      e.preventDefault()
      janela?.hide()
    }
  })
  janela.on('closed', () => (janela = null))
  // o corretor do Chromium, em português: sublinha o erro de ortografia nos campos e, no clique direito, as sugestões
  janela.webContents.session.setSpellCheckerLanguages(['pt-BR'])
  janela.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable || !p.misspelledWord) return
    Menu.buildFromTemplate([
      ...p.dictionarySuggestions.slice(0, 5).map((s) => ({ label: s, click: () => janela?.webContents.replaceMisspelling(s) })),
      ...(p.dictionarySuggestions.length ? [{ type: 'separator' as const }] : []),
      { label: 'Adicionar ao dicionário', click: () => janela?.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }
    ]).popup()
  })
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // um link clicado no texto de uma task ou de um email abre no navegador; a janela nunca sai do app
  janela.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file:')) return
    e.preventDefault()
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
  })
  if (process.env.ELECTRON_RENDERER_URL) janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  else janela.loadFile(join(__dirname, '../renderer/index.html'))
}

// ---------- notificações: o motor grava cada aviso em ~/.jfy/notificacoes.jsonl; o app mostra ----------
const NOTIFICACOES = join(JFY_DIR, 'notificacoes.jsonl')
let lido = existsSync(NOTIFICACOES) ? statSync(NOTIFICACOES).size : 0 // o que já estava lá não vira aviso de novo

function olharNotificacoes() {
  if (!existsSync(NOTIFICACOES)) return
  const tam = statSync(NOTIFICACOES).size
  if (tam < lido) lido = 0 // "Limpar" apagou o arquivo
  if (tam === lido) return
  const fd = openSync(NOTIFICACOES, 'r')
  const buf = Buffer.alloc(tam - lido)
  readSync(fd, buf, 0, buf.length, lido)
  closeSync(fd)
  const texto = buf.toString('utf8')
  const fim = texto.lastIndexOf('\n') + 1 // linha pela metade espera a próxima volta
  lido += Buffer.byteLength(texto.slice(0, fim))
  for (const l of texto.slice(0, fim).split('\n').filter(Boolean)) {
    try {
      avisar(JSON.parse(l))
    } catch {
      /* linha estragada: pula */
    }
  }
  janela?.webContents.send('notificacoes:mudou')
}

function avisar(n: { titulo: string; texto: string; abrir?: string; app?: string }) {
  const alvo = n.abrir ?? (n.app ? `jfy://${n.app}` : undefined)
  const aviso = new Notification({ title: n.titulo, body: n.texto, icon: ICONE })
  aviso.on('click', () => (alvo?.startsWith('jfy://') ? navegar(alvo) : alvo ? shell.openExternal(alvo) : mostrar()))
  aviso.show()
}

/** O sinal de vida que diz ao motor "o app está aberto e notifica" (app_notifica() no jfy). */
function sinalDeVida() {
  const run = join(JFY_DIR, 'rodando')
  mkdirSync(run, { recursive: true })
  const arq = join(run, 'app-notifica')
  if (!existsSync(arq)) writeFileSync(arq, '')
  const agora = new Date()
  utimesSync(arq, agora, agora)
}

// ---------- só no Windows: o que no Mac é o install.sh e o LaunchAgent das 7h ----------
/** A pipeline no ~/.claude, o uso da IA e o aviso do Claude: o motor confere a cada abertura e só mexe no que falta.
 * O que faltar de essencial (Claude Code, Git) vira notificação; o resto fica no log. */
async function instalar() {
  const r = await jfy(['--instalar-windows'])
  mkdirSync(join(JFY_DIR, 'rodando'), { recursive: true })
  writeFileSync(join(JFY_DIR, 'rodando', 'instalar.log'), `${new Date().toISOString()}\n${r.saida}${r.erro}`)
  try {
    const falta = (JSON.parse(r.saida).avisos as string[]).filter((a) => a.startsWith('Falta'))
    if (falta.length) new Notification({ title: 'jfy: falta instalar', body: falta.join('\n'), icon: ICONE }).show()
  } catch {
    /* o log guarda o erro */
  }
}

/** No Mac, o relógio da barra do tmux (`jfy --relogio`) é quem avisa de email novo, da reunião em 5 min e da jornada
 * de 8h, e quem chama o --vigiar (PRs e agenda) a cada 2 min. No Windows não há tmux: o app mantém o relógio rodando,
 * e a saída dele (uma linha por segundo, para a barra) ninguém lê. Ele sai quando o jfy muda; sobe de novo. */
let relogioProc: ReturnType<typeof spawn> | null = null
function relogio() {
  const e = env()
  delete e.JFY_ABA
  relogioProc = spawn(PYTHON, [MOTOR, '--relogio'], { env: e, windowsHide: true, stdio: 'ignore' })
  relogioProc.on('exit', () => !saindo && setTimeout(relogio, 5_000))
}

/** A notificação das 7h (seg a sex), com as reuniões e o foco do dia. O app fica na bandeja, então ele mesmo dispara;
 * com o computador desligado às 7h, sai quando ele ligar, até o meio-dia. */
function notificacaoDoDia() {
  const agora = new Date()
  if ([0, 6].includes(agora.getDay()) || agora.getHours() < 7 || agora.getHours() >= 12) return
  const marca = join(JFY_DIR, 'rodando', 'dia-avisado')
  const hoje = agora.toDateString()
  if (existsSync(marca) && readFileSync(marca, 'utf8') === hoje) return
  writeFileSync(marca, hoje)
  void jfy(['--notificar'])
}

// ---------- IPC com a tela ----------
ipcMain.handle('jfy', (_e, args: string[], entrada?: string) => jfy(args, entrada))
ipcMain.handle('abas:listar', () => ({ abas: abas.listar(), ativa: abas.ativa }))
ipcMain.handle('abas:saida', (_e, id: string) => abas.saida(id))
ipcMain.on('abas:ir', (_e, id: string) => abas.ir(id))
ipcMain.on('abas:escrever', (_e, id: string, d: string) => abas.escrever(id, d))
ipcMain.on('abas:redimensionar', (_e, cols: number, rows: number) => abas.redimensionar(cols, rows))
ipcMain.on('abas:renomear', (_e, id: string, nome: string) => abas.renomear(id, nome))
ipcMain.on('abas:fechar', (_e, id: string) => abas.fechar(id))
ipcMain.on('abas:menu', () => abas.abrirMenu([PYTHON, MOTOR]))
// uma aba nova rodando um comando do jfy (o que o motor faria com abrir_aba) ou um terminal livre numa pasta
ipcMain.on('abas:jfy', (_e, nome: string, args: string[]) => abas.abrir(nome, [PYTHON, MOTOR, ...args]))
ipcMain.on('abas:terminal', (_e, pasta: string, nome?: string) =>
  abas.abrir(nome ?? pasta.split(/[\\/]/).pop() ?? 'terminal', WIN ? ['powershell.exe', '-NoLogo'] : [process.env.SHELL ?? '/bin/zsh', '-l'], { cwd: pasta })
)
ipcMain.on('tela', (_e, nome: string) => (tela = nome))
// link (https:, mailto:, ms-settings:) ou caminho; duas letras antes do ":" no mínimo, para C:\\... ser caminho
ipcMain.on('abrir-link', (_e, alvo: string) => (/^[a-z][a-z0-9+.-]+:/i.test(alvo) ? shell.openExternal(alvo) : shell.openPath(alvo)))
ipcMain.handle('caminhos', () => ({ jfy: JFY_DIR, marca: MARCA, casa: homedir(), win: WIN }))

/** Um arquivo dentro de ~/.jfy (o app do Mac lê alguns direto, sem rodar o jfy). Fora dele, nada. */
function dentroDoJfy(nome: string) {
  const p = resolve(JFY_DIR, nome)
  const r = relative(JFY_DIR, p)
  if (!r || r.startsWith('..') || isAbsolute(r)) throw new Error(`fora de ~/.jfy: ${nome}`)
  return p
}
ipcMain.handle('jfy:ler', (_e, nome: string) => {
  const p = dentroDoJfy(nome)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
})
ipcMain.handle('jfy:escrever', (_e, nome: string, texto: string | null) => {
  const p = dentroDoJfy(nome)
  if (texto === null) return rmSync(p, { force: true })
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, texto)
})
ipcMain.handle('escolher', async (_e, o: { pasta?: boolean; titulo?: string; criar?: boolean; filtros?: Electron.FileFilter[]; inicio?: string }) => {
  const r = await dialog.showOpenDialog(janela!, {
    title: o.titulo,
    defaultPath: o.inicio === 'downloads' ? app.getPath('downloads') : o.inicio,
    properties: [o.pasta ? 'openDirectory' : 'openFile', ...(o.criar ? (['createDirectory', 'promptToCreate'] as const) : [])],
    filters: o.filtros
  })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.on('copiar', (_e, texto: string) => clipboard.writeText(texto))
ipcMain.on('mostrar-pasta', (_e, p: string) => shell.openPath(p))
// o número de notificações novas: no ícone da barra de tarefas (Windows) ou do Dock (Mac, em desenvolvimento)
ipcMain.on('selo', (_e, n: number, imagem?: string) => {
  if (!WIN) return void app.setBadgeCount(n)
  janela?.setOverlayIcon(n && imagem ? nativeImage.createFromDataURL(imagem) : null, n ? `${n} notificações novas` : '')
})

// ---------- ciclo do app ----------
// jfyarq://x/<caminho dentro de ~/.jfy>: a tela mostra um arquivo do jfy (a foto de um anexo de email) sem ler o disco
protocol.registerSchemesAsPrivileged([{ scheme: 'jfyarq', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
if (!app.requestSingleInstanceLock()) app.quit()
else {
  // no Windows, o jfy:// chega como argumento da segunda instância (o clique num link ou numa notificação antiga)
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith('jfy://'))
    url ? navegar(url) : mostrar()
  })
  // ponytail: só no Windows; no Mac o jfy:// é do app Swift, e este aqui roda só para desenvolver
  if (WIN) app.setAsDefaultProtocolClient('jfy')
  if (WIN) app.setAppUserModelId('dev.jfy.windows') // sem isto as notificações do Windows saem sem nome nem clique

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    protocol.handle('jfyarq', (req) => {
      try {
        return net.fetch(pathToFileURL(dentroDoJfy(decodeURIComponent(new URL(req.url).pathname.slice(1)))).toString())
      } catch {
        return new Response('fora de ~/.jfy', { status: 403 })
      }
    })
    jfyApp = await abas.servir()
    abas.abrirMenu([PYTHON, MOTOR])
    criarJanela()

    tray = new Tray(nativeImage.createFromPath(ICONE).resize({ width: 16, height: 16 }))
    tray.setToolTip('jfy')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir o jfy', click: mostrar },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() }
      ])
    )
    tray.on('click', mostrar)

    sinalDeVida()
    setInterval(sinalDeVida, 10_000)
    setInterval(olharNotificacoes, 2_000)
    // PRs pedindo revisão e mudanças na agenda: no Mac quem chama é o relógio da barra do tmux, de 2 em 2 min
    if (WIN) {
      instalar()
      relogio()
      setInterval(notificacaoDoDia, 60_000)
    } else {
      // no Mac (só para desenvolver) o relógio é o da barra do tmux; aqui só o vigia, como ele faria
      const vigiar = () => void jfy(['--vigiar'])
      setTimeout(vigiar, 15_000)
      setInterval(vigiar, 120_000)
    }
  })

  app.on('before-quit', (e) => {
    if (saindo) return
    const n = abas.rodando()
    if (n) {
      // no Windows não há tmux segurando as tasks: sair do app encerra as abas
      const r = dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['Cancelar', 'Sair e encerrar'],
        defaultId: 0,
        cancelId: 0,
        message: `${n} aba(s) ainda rodando`,
        detail: 'Sair do jfy encerra o que roda nelas. Para deixar rodando, feche só a janela: o jfy continua na bandeja.'
      })
      if (r === 0) return e.preventDefault()
    }
    saindo = true
    abas.encerrarTodas()
    relogioProc?.kill() // no Windows, o filho não morre sozinho quando o app sai
  })
  app.on('window-all-closed', () => {
    /* fica na bandeja */
  })
  app.on('activate', mostrar)
}
