// As abas do jfy (o menu e uma por task, revisão, PR…) no lugar do tmux: cada uma é um node-pty (ConPTY no Windows).
// O motor pede abrir/ir/escrever/listar por HTTP em 127.0.0.1 (app_abas() no jfy), com o token que vai em JFY_APP.
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import * as pty from 'node-pty'

export type Aba = { id: string; nome: string; chave: string; cor?: string; cwd: string; viva: boolean }
type Interna = Aba & { pty: pty.IPty; saida: string; n: number } // n: pedaços de saída até agora

const MAX_SAIDA = 512 * 1024 // ponytail: guarda só o fim da saída de cada aba, para redesenhar quando a tela recarrega

export class Abas {
  private lista: Interna[] = []
  private seq = 1 // @0 é o menu
  private tam = { cols: 120, rows: 36 }
  ativa = '@0'
  readonly token = randomBytes(24).toString('hex')
  url = ''

  constructor(
    private env: () => NodeJS.ProcessEnv,
    private avisos: {
      dados: (id: string, d: string, n: number) => void
      mudou: () => void
      ir: (id: string) => void
      mensagem: (t: string) => void
      focada: () => boolean
    }
  ) {}

  /** Sobe o servidor do motor. Devolve "url|token", o JFY_APP de cada aba e comando. */
  async servir(): Promise<string> {
    const srv = createServer((req, res) => {
      const responder = (status: number, corpo: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(corpo))
      }
      if (req.headers.authorization !== `Bearer ${this.token}`) return responder(401, { erro: 'token' })
      let corpo = ''
      req.on('data', (c) => (corpo += c))
      req.on('end', () => {
        try {
          const acao = (req.url ?? '').replace(/^\/abas\//, '')
          responder(200, this.pedido(acao, corpo ? JSON.parse(corpo) : {}))
        } catch (e) {
          responder(400, { erro: String(e) })
        }
      })
    })
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok))
    const porta = (srv.address() as { port: number }).port
    this.url = `http://127.0.0.1:${porta}`
    return `${this.url}|${this.token}`
  }

  private pedido(acao: string, d: Record<string, any>) {
    switch (acao) {
      case 'listar':
        return { abas: this.listar().map((a) => ({ ...a, ativa: a.id === this.ativa, focada: this.avisos.focada() })) }
      case 'abrir':
        return { id: this.abrir(d.nome, d.argv, { chave: d.chave, cor: d.cor, cwd: d.cwd }) }
      case 'ir':
        this.ir(d.id)
        return {}
      case 'escrever':
        this.escrever(d.id, d.texto)
        return {}
      case 'mensagem':
        this.avisos.mensagem(d.texto)
        return {}
    }
    throw new Error(`ação desconhecida: ${acao}`)
  }

  listar(): Aba[] {
    return this.lista.map(({ id, nome, chave, cor, cwd, viva }) => ({ id, nome, chave, cor, cwd, viva }))
  }

  /** O fim da saída da aba e até que pedaço ela vai: a tela ignora os pedaços que já vieram aqui. */
  saida(id: string) {
    const a = this.lista.find((x) => x.id === id)
    return { texto: a?.saida ?? '', n: a?.n ?? 0 }
  }

  abrir(nome: string, argv: string[], o: { chave?: string; cor?: string; cwd?: string; id?: string } = {}): string {
    const id = o.id ?? `@${this.seq++}`
    const cwd = o.cwd ?? homedir() // ponytail: a pasta em que a aba abriu, não a que o Claude dela usa (o tmux sabia)
    const p = pty.spawn(argv[0], argv.slice(1), {
      name: 'xterm-256color',
      ...this.tam,
      cwd,
      env: { ...this.env(), JFY_ABA: id, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>
    })
    const aba: Interna = { id, nome, chave: o.chave ?? '', cor: o.cor, cwd, viva: true, pty: p, saida: '', n: 0 }
    p.onData((d) => {
      aba.saida = (aba.saida + d).slice(-MAX_SAIDA)
      this.avisos.dados(id, d, ++aba.n)
    })
    p.onExit(() => {
      aba.viva = false
      // o menu fica na lista (a tela oferece abrir de novo); as outras abas somem, como a janela do tmux
      if (id !== '@0') this.lista = this.lista.filter((a) => a !== aba)
      if (this.ativa === id) this.ativa = '@0'
      this.avisos.mudou()
    })
    this.lista.push(aba)
    this.ir(id)
    return id
  }

  /** O menu (aba @0): abre no começo e de novo depois que o jfy saiu. */
  abrirMenu(argv: string[]) {
    if (this.lista.find((a) => a.id === '@0')?.viva) return this.ir('@0')
    this.lista = this.lista.filter((a) => a.id !== '@0')
    this.abrir('menu', argv, { id: '@0' })
    this.lista.unshift(this.lista.pop()!) // o menu é sempre a primeira aba
  }

  ir(id: string) {
    if (!this.lista.some((a) => a.id === id)) return
    this.ativa = id
    this.avisos.ir(id)
    this.avisos.mudou()
  }

  escrever(id: string, texto: string) {
    this.lista.find((a) => a.id === id)?.pty.write(texto)
  }

  redimensionar(cols: number, rows: number) {
    if (cols < 2 || rows < 2) return
    this.tam = { cols, rows }
    for (const a of this.lista) if (a.viva) a.pty.resize(cols, rows)
  }

  renomear(id: string, nome: string) {
    const a = this.lista.find((x) => x.id === id)
    if (a && id !== '@0') a.nome = nome
    this.avisos.mudou()
  }

  fechar(id: string) {
    if (id !== '@0') this.lista.find((a) => a.id === id)?.pty.kill()
  }

  /** Abas rodando além do menu: sair do app encerra todas (no Windows não há tmux segurando). */
  rodando() {
    return this.lista.filter((a) => a.viva && a.id !== '@0').length
  }

  encerrarTodas() {
    for (const a of this.lista) if (a.viva) a.pty.kill()
  }
}
