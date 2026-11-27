// Os primeiros passos depois do login (app/Sources/JFY/PrimeirosPassos.swift no app do Mac): um assistente que liga
// tudo o que o jfy usa, um passo de cada vez. Google (já feito no login), Journify (obrigatório: sem ele o jfy não vê
// as tasks), GitHub, as pastas dos projetos e as notificações (esses dá para pular). Quem já tem tudo ligado passa
// direto. Refazer: Configurações. O que no Mac rodava num terminal dentro de um modal (instalar o gh, o login dele)
// aqui roda numa aba do jfy: o assistente sai da frente e volta sozinho quando a aba fecha.
import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDownCircle, BellRing, Check, CheckCircle2, ExternalLink, Folder, FolderPlus, KeyRound, MinusCircle, X } from 'lucide-react'
import simbolo from '@marca/souv-simbolo.svg'
import { api, fazer, ler } from '../jfy'
import { abas, irPara, loja } from '../estado'
import { Bolinha, Botao, Caixa, Campo, Carregando, Modal, Select } from '../souv'
import './Login.css'

type Contas = {
  google: { conectado: boolean; conta?: string | null }
  github: { ativa?: string | null; contas: string[]; instalado?: boolean | null; brew?: boolean | null }
  journify: { conectado: boolean; erro?: string | null; site?: string | null; tasks?: number | null }
}
type Projeto = { id: string; nome?: string | null; cor?: string | null; exemplo?: string | null; tasks: number }

const PASSOS = ['Conta da Souv', 'Journify', 'GitHub', 'Seus projetos', 'Notificações', 'Tudo pronto'] as const
const [GOOGLE, JOURNIFY, GITHUB, PROJETOS, NOTIFICACOES, PRONTO] = [0, 1, 2, 3, 4, 5]
const obrigatorio = (p: number) => p === GOOGLE || p === JOURNIFY

/** A aba do jfy rodando um comando do assistente (o Portao tira o app do inerte enquanto ela roda). `visto`: já
 * apareceu na lista de abas; quando some, terminou. */
export const comando = loja<{ nome: string; visto: boolean } | null>(null)
// no Mac quem sabe é o sistema (UNUserNotificationCenter); aqui, a pessoa diz se a notificação de teste apareceu
const notificacoesOk = loja(false, 'primeirosPassos.notificacoes')

function feitoCom(p: number, contas: Contas | null, semPasta: Projeto[], notif: boolean) {
  if (p === GOOGLE) return !!contas?.google.conectado
  if (p === JOURNIFY) return !!contas?.journify.conectado && !contas.journify.erro
  if (p === GITHUB) return !!contas?.github.contas.length
  if (p === PROJETOS) return !semPasta.length && !!contas
  if (p === NOTIFICACOES) return notif
  return false
}

export default function PrimeirosPassos({ automatico, concluir }: { automatico: boolean; concluir: () => void }) {
  const [passo, setPasso] = useState(GOOGLE)
  const [contas, setContas] = useState<Contas | null>(null)
  const [semPasta, setSemPasta] = useState<Projeto[]>([])
  const [configurados, setConfigurados] = useState(0)
  const [token, setToken] = useState('')
  const [salvandoToken, setSalvandoToken] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [configurando, setConfigurando] = useState<string | null>(null) // o pid do projeto no formulário
  const [teste, setTeste] = useState<'' | 'enviada' | 'falhou'>('')
  const [sis, setSis] = useState({ win: false, casa: '' })
  const notif = notificacoesOk.use()
  const rodando = comando.use()
  const { abas: lista } = abas.use()
  const feito = (p: number) => feitoCom(p, contas, semPasta, notif)

  async function carregar(primeira = false) {
    const [c, msg] = await ler<Contas>(['--contas-json'])
    if (c) setContas(c)
    else setAviso(msg)
    let sp = semPasta
    const [p] = await ler<{ projetos: Projeto[] }>(['--projetos-json'])
    if (p) {
      sp = p.projetos.filter((x) => x.nome == null)
      setSemPasta(sp)
      setConfigurados(p.projetos.length - sp.length)
    }
    // quem já tem tudo ligado não precisa do assistente
    const cs = c ?? contas
    if (primeira && automatico && [JOURNIFY, GITHUB, PROJETOS].every((x) => feitoCom(x, cs, sp, notif))) concluir()
  }

  useEffect(() => {
    api.caminhos().then(setSis)
    carregar(true)
  }, [])

  // a aba do comando apareceu e depois sumiu: terminou, o assistente volta e confere de novo
  useEffect(() => {
    if (!rodando) return
    const existe = lista.some((a) => a.nome === rodando.nome)
    if (existe && !rodando.visto) comando.set({ ...rodando, visto: true })
    else if (!existe && rodando.visto) voltar()
  }, [lista, rodando])

  // Enter continua, como o botão padrão do Mac (menos num campo ou com o foco noutro botão)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== 'Enter' || rodando || configurando || ['INPUT', 'TEXTAREA', 'BUTTON'].includes(t.tagName)) return
      if (passo === PRONTO) concluir()
      else if (!(obrigatorio(passo) && !feito(passo))) mover(1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  function mover(n: number) {
    setAviso(null)
    setPasso((p) => Math.max(GOOGLE, Math.min(PRONTO, p + n)))
  }

  function rodar(nome: string, args: string[]) {
    api.abas.abrirJfy(nome, args)
    comando.set({ nome, visto: false })
    irPara('jfy')
  }

  function voltar() {
    comando.set(null)
    carregar()
  }

  async function salvarToken() {
    const t = token.trim()
    if (!t || salvandoToken) return
    setSalvandoToken(true)
    const erro = await fazer(['--journify-token'], t)
    setAviso(erro)
    setSalvandoToken(false)
    if (!erro) setToken('')
    await carregar()
  }

  async function testarNotificacao() {
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission === 'denied') return setTeste('falhou')
    new Notification('jfy', { body: 'Notificação de teste: se você está vendo isto, o jfy consegue te avisar.' })
    setTeste('enviada')
  }

  // o comando roda numa aba do jfy: o assistente sai da frente e fica só esta barra
  if (rodando)
    return (
      <div className="lg-barra-comando">
        <span>
          <strong>{rodando.nome}</strong>: siga o que aparece no terminal. Ao terminar, os primeiros passos voltam sozinhos.
        </span>
        <Botao tipo="primario" onClick={voltar}>
          Voltar aos primeiros passos
        </Botao>
      </div>
    )

  const g = contas?.github
  const conteudo: ReactNode[] = [
    <>
      <Explicacao>O login do jfy é a sua conta Google da Souv. Ela também liga a Agenda e o Gmail.</Explicacao>
      {contas?.google.conta && <Ok>Conectado como {contas.google.conta}</Ok>}
    </>,
    <>
      <Explicacao>
        É pelo Journify que o jfy e o Claude veem e mexem nas suas tasks. No Journify, em Configurações › Conectar meu Claude, clique em
        Gerar token e cole aqui.
      </Explicacao>
      {feito(JOURNIFY) && contas?.journify.tasks != null ? (
        <Ok>
          Conectado: o jfy enxerga {contas.journify.tasks} task{contas.journify.tasks === 1 ? '' : 's'} suas.
        </Ok>
      ) : (
        <>
          <div>
            <Botao onClick={() => api.abrirLink((contas?.journify.site ?? 'https://journify.souv.tech') + '/settings')}>
              <ExternalLink size={13} /> Abrir as Configurações do Journify
            </Botao>
          </div>
          <div className="linha-h">
            <Campo type="password" placeholder="Cole o token aqui" value={token} onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && salvarToken()} />
            <Botao tipo="primario" disabled={!token.trim() || salvandoToken} onClick={salvarToken}>
              {salvandoToken ? 'Conferindo…' : 'Conferir e salvar'}
            </Botao>
          </div>
          <span className="lg-legenda texto2">O jfy testa o token no Journify antes de salvar. Ele fica no Claude Code (o MCP journify).</span>
        </>
      )}
    </>,
    <>
      <Explicacao>A aba GitHub (PRs, revisão, commits) usa o GitHub CLI, o gh, com a conta que você usa nos repositórios da Souv.</Explicacao>
      {g &&
        (g.contas.length ? (
          <>
            <Ok>{'Conectado: ' + g.contas.join(', ') + (g.ativa ? ` · em uso: ${g.ativa}` : '')}</Ok>
            <div>
              <Botao onClick={() => rodar('GitHub: login', ['--github-login'])}>Adicionar outra conta</Botao>
            </div>
          </>
        ) : g.instalado === false ? (
          // no Windows o jfy instala pelo winget, que já vem no sistema; no Mac, pelo Homebrew
          sis.win || g.brew ? (
            <div>
              <Botao tipo="primario" onClick={() => rodar('GitHub: instalar', ['--gh-instalar'])}>
                <ArrowDownCircle size={14} /> Instalar o GitHub CLI
              </Botao>
            </div>
          ) : (
            <>
              <span className="lg-laranja">Falta o Homebrew para instalar o gh. Instale em brew.sh e volte aqui.</span>
              <div>
                <Botao tipo="link" onClick={() => api.abrirLink('https://brew.sh')}>Abrir brew.sh</Botao>
              </div>
            </>
          )
        ) : (
          <>
            <div>
              <Botao tipo="primario" onClick={() => rodar('GitHub: login', ['--github-login'])}>
                <KeyRound size={14} /> Conectar o GitHub
              </Botao>
            </div>
            <span className="lg-legenda texto2">
              Abre o login do gh numa aba do jfy: copie o código que ele mostrar, aperte Enter e confirme no navegador.
            </span>
          </>
        ))}
    </>,
    <>
      <Explicacao>
        Cada projeto do Journify em que você tem task precisa da pasta do código neste computador. É ela que liga as tasks, o GitHub, as
        portas e as horas ao projeto.
      </Explicacao>
      {!semPasta.length ? (
        <Ok>{configurados > 0 ? 'Todos os seus projetos já têm pasta.' : 'Nenhum projeto seu sem pasta agora.'}</Ok>
      ) : (
        semPasta.map((p) => (
          <div key={p.id} className="linha-h lg-projeto">
            <Bolinha cor={p.cor} tamanho={9} />
            <div className="pilha" style={{ flex: 1, gap: 1 }}>
              <span className="lg-uma">{p.exemplo ? `ex.: ${p.exemplo}` : p.id}</span>
              <span className="lg-legenda texto2">
                {p.tasks} task{p.tasks === 1 ? '' : 's'} sua{p.tasks === 1 ? '' : 's'}
              </span>
            </div>
            <Botao onClick={() => setConfigurando(p.id)}>Escolher a pasta…</Botao>
          </div>
        ))
      )}
    </>,
    <>
      <Explicacao>
        O jfy avisa quando o Claude precisa de você, quando chega email, um PR pede a sua revisão ou uma reunião vai começar. O clique leva
        direto para a aba certa.
      </Explicacao>
      {notif ? (
        <Ok>Notificações ligadas.</Ok>
      ) : teste === 'enviada' ? (
        <>
          <span>Mandamos uma notificação de teste. Ela apareceu?</span>
          <div className="linha-h">
            <Botao tipo="primario" onClick={() => notificacoesOk.set(true)}>Apareceu</Botao>
            <Botao onClick={() => setTeste('falhou')}>Não apareceu</Botao>
          </div>
        </>
      ) : teste === 'falhou' ? (
        <>
          <span className="lg-laranja">As notificações do jfy estão desligadas no {sis.win ? 'Windows' : 'macOS'}.</span>
          {sis.win && (
            <span className="lg-legenda texto2">Ligue as notificações e o jfy na lista de apps, e confira se o Não incomodar está desligado.</span>
          )}
          <div className="linha-h">
            <Botao onClick={() => api.abrirLink(sis.win ? 'ms-settings:notifications' : 'x-apple.systempreferences:com.apple.Notifications-Settings.extension')}>
              {sis.win ? 'Abrir Configurações › Sistema › Notificações' : 'Abrir Ajustes › Notificações'}
            </Botao>
            <Botao onClick={testarNotificacao}>Testar de novo</Botao>
          </div>
        </>
      ) : (
        <div>
          <Botao tipo="primario" onClick={testarNotificacao}>
            <BellRing size={14} /> Mandar uma notificação de teste
          </Botao>
        </div>
      )}
    </>,
    <>
      <Explicacao>
        O jfy está pronto. Dá para mudar tudo isso depois em Configurações (contas, modelos do Claude e a sessão) e, nos projetos, pela aba
        Projetos.
      </Explicacao>
      <div className="pilha">
        {PASSOS.slice(0, PRONTO).map((t, p) => (
          <span key={t} className="linha-h" style={{ color: feito(p) ? 'var(--lg-verde)' : 'var(--texto2)' }}>
            {feito(p) ? <CheckCircle2 size={15} /> : <MinusCircle size={15} />} {t}
          </span>
        ))}
      </div>
    </>
  ]

  return (
    <div className="lg-passos">
      <aside className="lg-trilha">
        <div className="linha-h" style={{ gap: 10, marginBottom: 26 }}>
          <span className="lg-simbolo" style={{ width: 30, height: 30, ['--svg' as string]: `url("${simbolo}")` }} />
          <h2 style={{ fontSize: 20 }}>Primeiros passos</h2>
        </div>
        {PASSOS.map((t, p) => (
          <div key={t} className="linha-h lg-etapa">
            <span className={`lg-numero ${feito(p) ? 'feito' : p === passo ? 'atual' : ''}`}>
              {feito(p) ? <Check size={13} strokeWidth={3.5} /> : p + 1}
            </span>
            <div className="pilha" style={{ gap: 1 }}>
              <span style={p === passo ? { fontWeight: 600 } : { color: 'var(--texto2)' }}>{t}</span>
              {!obrigatorio(p) && p !== PRONTO && <span className="lg-opcional texto2">opcional</span>}
            </div>
          </div>
        ))}
      </aside>
      <main className="lg-passo">
        <h1 style={{ fontSize: 30 }}>{PASSOS[passo]}</h1>
        {conteudo[passo]}
        {aviso && (
          <span className="lg-alerta selecionavel" style={{ justifyContent: 'flex-start' }}>
            <AlertTriangle size={14} /> {aviso}
          </span>
        )}
        <span className="espaco" />
        <div className="linha-h">
          {passo !== GOOGLE && <Botao onClick={() => mover(-1)}>Voltar</Botao>}
          <span className="espaco" />
          {!obrigatorio(passo) && passo !== PRONTO && !feito(passo) && <Botao onClick={() => mover(1)}>Pular por agora</Botao>}
          {passo === PRONTO ? (
            <Botao tipo="primario" onClick={concluir}>Começar a usar o jfy</Botao>
          ) : (
            <Botao tipo="primario" disabled={obrigatorio(passo) && !feito(passo)} onClick={() => mover(1)}>
              Continuar
            </Botao>
          )}
        </div>
      </main>
      {configurando && (
        <ConfigurarProjeto pid={configurando} casa={sis.casa} fechar={() => setConfigurando(null)}
          salvou={() => (setConfigurando(null), carregar())} />
      )}
    </div>
  )
}

const Explicacao = ({ children }: { children: ReactNode }) => <p className="lg-explicacao">{children}</p>
const Ok = ({ children }: { children: ReactNode }) => (
  <span className="linha-h lg-ok">
    <CheckCircle2 size={16} /> {children}
  </span>
)

type Conferido = { id: string; tasks: number; exemplo?: string | null; nome?: string | null; journify?: string | null; github?: string | null; contas_github: string[] }

/** Ligar um projeto do Journify a uma pasta deste computador (o NovoProjeto do Mac, no caso "Configurar": o projeto
 * já vem escolhido). A pasta do código (escolher ou criar; mais de uma para front e back) ou "sem repositório", o
 * nome curto no jfy e, com mais de uma conta no gh, a conta do GitHub. */
// ponytail: cópia do formulário da tela Projetos só para o caso dos primeiros passos; troque pelo dela quando for exportado
function ConfigurarProjeto({ pid, casa, fechar, salvou }: { pid: string; casa: string; fechar: () => void; salvou: () => void }) {
  const [conferido, setConferido] = useState<Conferido | null>(null)
  const [pastas, setPastas] = useState<string[]>([])
  const [semRepo, setSemRepo] = useState(false)
  const [nome, setNome] = useState('')
  const [conta, setConta] = useState('') // "" = a ativa do gh
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const pronto = !!conferido && !!nome.trim() && (semRepo || pastas.length > 0) && !salvando

  useEffect(() => {
    ler<Conferido>(['--projeto-validar', pid]).then(([c, msg]) => {
      if (!c) return setAviso(msg)
      setConferido(c)
      setNome((n) => n || c.nome || '')
      setConta((g) => g || c.github || '')
    })
  }, [pid])

  async function escolherPasta() {
    const p = await api.escolher({ pasta: true, criar: true, titulo: 'Escolha a pasta do código do projeto, ou crie uma nova.' })
    if (!p) return
    setPastas((l) => (l.includes(p) ? l : [...l, p]))
    if (!nome) setNome((p.split(/[\\/]/).pop() ?? '').toLowerCase())
  }

  async function salvar() {
    if (!conferido || !pronto) return
    setSalvando(true)
    setAviso(null)
    const d = { id: conferido.id, nome: nome.trim(), pastas: semRepo ? [] : pastas, github: semRepo ? '' : conta }
    const [r, msg] = await ler<{ id: string }>(['--projeto-salvar', JSON.stringify(d)])
    setSalvando(false)
    if (r) salvou()
    else setAviso(msg)
  }

  const secao = (n: number, titulo: string, corpo: ReactNode) => (
    <div className="pilha">
      <span className="linha-h">
        <span className="lg-numero atual" style={{ width: 20, height: 20 }}>{n}</span>
        <strong>{titulo}</strong>
      </span>
      {corpo}
    </div>
  )

  return (
    <Modal
      titulo="Configurar projeto"
      largura={600}
      fechar={fechar}
      acoes={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao tipo="primario" disabled={!pronto} onClick={salvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </>
      }
    >
      {secao(1, 'Projeto no Journify', conferido ? (
        <>
          <span className="linha-h">
            <CheckCircle2 size={15} className="lg-verde" />
            <strong>{conferido.journify ?? conferido.nome ?? conferido.id}</strong>
            <span className="texto2">· {conferido.tasks} task{conferido.tasks === 1 ? '' : 's'}</span>
          </span>
          {conferido.exemplo && <span className="lg-legenda texto2 lg-uma">ex.: {conferido.exemplo}</span>}
        </>
      ) : !aviso && <Carregando />)}
      {secao(2, 'Pasta do código', (
        <>
          <Caixa marcado={semRepo} mudar={setSemRepo}>Sem repositório (estudo, documentos): o Claude abre numa pasta só deste projeto</Caixa>
          {!semRepo && (
            <>
              {pastas.map((p) => (
                <span key={p} className="linha-h">
                  <Folder size={14} className="destaque" />
                  <span className="lg-uma" style={{ flex: 1 }} title={p}>{casa && p.startsWith(casa) ? '~' + p.slice(casa.length) : p}</span>
                  <Botao tipo="icone" title="Tirar esta pasta" onClick={() => setPastas((l) => l.filter((x) => x !== p))}>
                    <X size={13} />
                  </Botao>
                </span>
              ))}
              <div>
                <Botao onClick={escolherPasta}>
                  <FolderPlus size={14} /> {pastas.length ? 'Outra pasta (front e back, por exemplo)…' : 'Escolher ou criar a pasta…'}
                </Botao>
              </div>
            </>
          )}
        </>
      ))}
      {secao(3, 'Nome no jfy', (
        <Campo placeholder="curto, como aparece no menu e na barra (ex.: portal)" value={nome} onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && salvar()} />
      ))}
      {!semRepo && !!conferido?.contas_github.length && secao(4, 'Conta do GitHub', (
        <>
          <Select
            largura={320}
            valor={conta}
            mudar={setConta}
            opcoes={[{ valor: '', rotulo: 'A ativa do gh (sem conta fixa)' },
              ...conferido.contas_github.map((c) => ({ valor: c, rotulo: c, foto: `https://github.com/${c}.png?size=48` }))]}
          />
          <span className="lg-legenda texto2">
            Os commits destas pastas saem com o nome e o email dessa conta, e o push e o gh do Claude usam ela, seja qual for a conta ativa.
          </span>
        </>
      ))}
      {aviso && (
        <span className="lg-alerta selecionavel" style={{ justifyContent: 'flex-start' }}>
          <AlertTriangle size={14} /> {aviso}
        </span>
      )}
    </Modal>
  )
}
