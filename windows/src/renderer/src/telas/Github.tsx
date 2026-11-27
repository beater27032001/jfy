// Tela "GitHub" (app/Sources/JFY/Github.swift no app do Mac): os PRs abertos (com merge, aprovar, comentar e fechar) e o
// git de cada repositório dos projetos (fetch, pull, push, commit, histórico, branches e worktrees). Quem fala com o
// GitHub é o jfy, pelo gh e pela conta ativa dele (--github-json, --pr-json, --pr-acao, --repos-json, --repo-acao,
// --github-conta, --github-login).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight, ChevronDown, Circle, CircleArrowDown, CircleArrowUp, CircleCheck, CircleMinus, CircleUserRound, CircleX,
  Clock, CloudUpload, ExternalLink, Eye, Folder, GitBranch, GitPullRequest, History, Lock, MessageSquareText, RefreshCw,
  Sparkles, SquarePen, User
} from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api, fazer, ler } from '../jfy'
import { atendido, irPara, nav } from '../estado'
import {
  AreaTexto, Aviso, Bolinha, Botao, BotaoContexto, Caixa, Campo, Carregando, Linha, MenuBotao, Segmentos, Select, confirmar,
  type ItemMenu
} from '../souv'
import './Github.css'

// ---------- o que o jfy manda (snake_case, como no JSON) ----------
type PR = {
  repo: string; n: number; titulo: string; url: string; atualizado: string; comentarios: number
  autor?: string | null; projeto?: string | null; cor?: string | null; rascunho: boolean
}
type Dados = { conta: string | null; contas: string[]; prs: PR[]; revisar: PR[]; meus: PR[] }
type Repo = {
  pasta: string; nome: string; projeto: string; cor?: string | null; remote?: string | null; branch?: string | null
  upstream?: string | null; frente: number; atras: number; n_mexidos: number
}
type Branch = {
  nome: string; quando: string; assunto: string; upstream?: string | null; atual: boolean; sumiu: boolean; entrou: boolean
  frente: number; atras: number
}
type Worktree = { pasta: string; branch: string; principal: boolean; orfao: boolean; mexidos: number }
type DadosBranches = { atual: string; base?: string | null; task_rodando: boolean; branches: Branch[]; worktrees: Worktree[] }
type Arquivo = { estado: string; arquivo: string }

const refPR = (p: PR) => `${p.repo}#${p.n}`
/** "dono/repo#n" -> { repo, n }, ou null. */
function lerRef(ref: string | null) {
  const i = ref?.lastIndexOf('#') ?? -1
  const n = Number(ref?.slice(i + 1))
  return ref && i > 0 && Number.isInteger(n) && n > 0 ? { repo: ref.slice(0, i), n } : null
}

// as cores do Swift (.green, .red...), legíveis no claro e no escuro
const VERDE = '#2fbf71', VERMELHO = '#e5484d', LARANJA = '#f5a524', AMARELO = '#e3b505', AZUL = '#3b82f6', CINZA = '#8e8e93'

// a pasta de casa vira "~" na lista de worktrees, como no Mac. O git manda C:/Users/…, o Windows C:\Users\…
let casa = ''
api.caminhos().then((c) => (casa = c.casa.replace(/\\/g, '/').toLowerCase()))
const curto = (p: string) => (casa && p.replace(/\\/g, '/').toLowerCase().startsWith(casa) ? '~' + p.slice(casa.length) : p)

const rtf = new Intl.RelativeTimeFormat('pt-BR', { style: 'short' })
/** "há 2 h", "há 3 dias": a maior unidade que cabe, como o RelativeDateTimeFormatter do Mac. */
function relativo(iso: string | null | undefined) {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return ''
  let v = (t - Date.now()) / 1000
  for (const [u, n] of [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.345], ['month', 12]] as const) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), u)
    v /= n
  }
  return rtf.format(Math.round(v), 'year')
}

// ---------- a tela ----------
type Aba = 'alteracoes' | 'historico' | 'prs' | 'branches'
const ABAS: [Aba, string, ReactNode][] = [
  ['alteracoes', 'Alterações', <SquarePen size={13} />],
  ['historico', 'Histórico', <History size={13} />],
  ['prs', 'PRs', <GitPullRequest size={13} />],
  ['branches', 'Branches e worktrees', <GitBranch size={13} />]
]

export default function Github({ ativa }: { ativa: boolean }) {
  const { abrirPR } = nav.use()
  const [lado, setLado] = useState('meus') // à esquerda: 'revisar', 'meus' ou a pasta de um repositório
  const [pr, setPr] = useState<string | null>(null) // "dono/repo#n"
  const [aba, setAba] = useState<Aba>('alteracoes')
  const [dados, setDados] = useState<Dados | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function carregar() {
    setCarregando(true)
    try {
      const [[d, m1], [lista, m2]] = await Promise.all([ler<Dados>(['--github-json']), ler<Repo[]>(['--repos-json'])])
      if (d) setDados(d)
      if (lista) setRepos(lista)
      setAviso(m1 ?? m2)
    } finally {
      setCarregando(false)
    }
  }
  useEffect(() => void (ativa && carregar()), [ativa])

  // veio de uma task na aba Projetos ou de uma notificação: abre o PR no repositório dele, se for de um projeto
  useEffect(() => {
    if (!abrirPR) return
    setPr(abrirPR)
    const i = abrirPR.lastIndexOf('#')
    const r = repos.find((x) => x.remote === (i < 0 ? abrirPR : abrirPR.slice(0, i)))
    if (r) (setLado(r.pasta), setAba('prs'))
    else setLado('meus')
    atendido('abrirPR')
  }, [abrirPR])

  async function trocarConta(c: string) {
    const e = await fazer(['--github-conta', c])
    await carregar()
    if (e) setAviso(e) // o carregar não apaga o erro da troca
  }
  async function conectar() {
    const e = await fazer(['--github-login']) // o motor abre o gh auth login numa aba do jfy
    e ? setAviso(e) : irPara('jfy')
  }

  const prsDo = (r: Repo) => (dados?.prs ?? []).filter((p) => p.repo === r.remote)
  const repo = repos.find((r) => r.pasta === lado)
  const lista = lado === 'revisar' ? dados?.revisar ?? [] : dados?.meus ?? []

  return (
    <div className="gh">
      <header className="cabecalho">
        <span className="titulo-tela">GitHub</span>
        {dados?.conta && (
          <Select
            opcoes={dados.contas.map((c) => ({ valor: c, rotulo: c }))}
            valor={dados.conta}
            mudar={trocarConta}
            extra={['Conectar outra conta…', conectar]}
            largura={230}
            title="A conta ativa do gh: vale para o gh e o git deste computador"
          />
        )}
        <span className="espaco" />
        {carregando && <Carregando />}
        <Botao title="Atualizar" disabled={carregando} onClick={carregar}>
          <RefreshCw size={13} />
        </Botao>
      </header>
      {aviso && (
        <div className="gh-aviso">
          <Aviso texto={aviso} />
        </div>
      )}
      {dados && !dados.conta ? (
        <div className="gh-nada gh-sem-conta">
          <CircleUserRound size={40} strokeWidth={1.2} className="texto2" />
          <h2>Conecte sua conta do GitHub</h2>
          <span className="texto2">O login abre numa aba do jfy e pede para confirmar no navegador.</span>
          <Botao tipo="primario" onClick={conectar}>Conectar GitHub</Botao>
        </div>
      ) : (
        <div className="colunas gh-corpo">
          <div className="coluna gh-col-repos">
            <Linha marcada={lado === 'revisar'} onClick={() => setLado('revisar')}>
              <span className="icone"><Eye size={15} /></span>
              <span className="rotulo">Pedem sua revisão</span>
              {!!dados?.revisar.length && <span className="texto2">{dados.revisar.length}</span>}
            </Linha>
            <Linha marcada={lado === 'meus'} onClick={() => setLado('meus')}>
              <span className="icone"><User size={15} /></span>
              <span className="rotulo">Seus PRs</span>
              {!!dados?.meus.length && <span className="texto2">{dados.meus.length}</span>}
            </Linha>
            <div className="secao-titulo">Repositórios</div>
            {repos.map((r) => {
              const n = prsDo(r).length
              return (
                <Linha key={r.pasta} marcada={lado === r.pasta} className="gh-linha" onClick={() => setLado(r.pasta)}>
                  <div className="gh-pilha">
                    <div className="linha-h gh-junto">
                      <Bolinha cor={r.cor} />
                      <span className="gh-cortar gh-medio">{r.projeto}</span>
                      <span className="espaco" />
                      {n > 0 && <span className="gh-capsula">{n} PR</span>}
                    </div>
                    <div className="linha-h gh-junto gh-legenda">
                      <span className="gh-cortar">{r.branch ?? r.nome}</span>
                      {r.frente > 0 && <span style={{ color: AZUL }}>↑{r.frente}</span>}
                      {r.atras > 0 && <span style={{ color: LARANJA }}>↓{r.atras}</span>}
                      {r.n_mexidos > 0 && <span title="arquivos mexidos sem commit">●{r.n_mexidos}</span>}
                    </div>
                  </div>
                </Linha>
              )
            })}
          </div>
          {lado === 'revisar' || lado === 'meus' ? (
            <>
              <div className="coluna gh-col-prs">
                <div className="secao-titulo">{`${lado === 'revisar' ? 'Pedem sua revisão' : 'Seus PRs'} (${lista.length})`}</div>
                {!lista.length && <div className="texto2 gh-pad">nenhum</div>}
                {lista.map((p) => (
                  <Linha key={refPR(p)} marcada={pr === refPR(p)} className="gh-linha" onClick={() => setPr(refPR(p))}>
                    <LinhaPR p={p} comRepo />
                  </Linha>
                ))}
              </div>
              <div className="painel">{detalhe(pr, carregar)}</div>
            </>
          ) : (
            repo && (
              <RepoPainel key={repo.pasta} repo={repo} prs={prsDo(repo)} aba={aba} setAba={setAba} pr={pr} setPr={setPr} mudou={carregar} />
            )
          )}
        </div>
      )}
    </div>
  )
}

function detalhe(pr: string | null, mudou: () => void) {
  const alvo = lerRef(pr)
  return alvo ? <PRDetalhe key={pr} repo={alvo.repo} n={alvo.n} mudou={mudou} /> : <div className="gh-nada texto2">Escolha um PR</div>
}

function LinhaPR({ p, comRepo }: { p: PR; comRepo: boolean }) {
  return (
    <div className="gh-pilha">
      <div className="linha-h gh-base">
        <span className="gh-duas">{p.titulo}</span>
        {p.rascunho && <span className="chip">rascunho</span>}
      </div>
      <div className="linha-h gh-junto gh-legenda">
        {comRepo && p.projeto && <Bolinha cor={p.cor} tamanho={6} />}
        <span className="gh-cortar">
          {(comRepo ? `${p.projeto ?? p.repo} ` : '') + `#${p.n} · ${p.autor ?? '?'} · ${relativo(p.atualizado)}`}
        </span>
        {p.comentarios > 0 && (
          <span className="linha-h gh-junto">
            <MessageSquareText size={11} />
            {p.comentarios}
          </span>
        )}
      </div>
    </div>
  )
}

/** O MenuBotao da Souv, que desliga: desligado, é só o botão apagado (o da base não tem disabled). */
function Menu({ desativado, ...p }: Parameters<typeof MenuBotao>[0] & { desativado?: boolean }) {
  return desativado ? (
    <Botao tipo={p.tipo} pequeno={p.pequeno} title={p.title} disabled>
      {p.rotulo} <ChevronDown size={11} strokeWidth={3} className="texto2" />
    </Botao>
  ) : (
    <MenuBotao {...p} />
  )
}

// ---------- um repositório: o git no topo e as abas do fluxo ----------
function RepoPainel(p: {
  repo: Repo; prs: PR[]; aba: Aba; setAba: (a: Aba) => void; pr: string | null; setPr: (r: string) => void; mudou: () => void
}) {
  const { repo, prs, aba, setAba, mudou } = p
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    ler<DadosBranches>(['--repo-branches', repo.pasta]).then(([d]) => setBranches(d?.branches ?? []))
  }, [repo.branch])

  // o botão principal muda com o estado, como no GitHub Desktop: baixar, subir, publicar ou só buscar
  const sinc = repo.atras > 0 ? { titulo: `Pull ↓${repo.atras}`, icone: <CircleArrowDown size={14} />, acao: 'pull' }
    : !repo.upstream ? { titulo: 'Publicar branch', icone: <CloudUpload size={14} />, acao: 'push' }
    : repo.frente > 0 ? { titulo: `Push ↑${repo.frente}`, icone: <CircleArrowUp size={14} />, acao: 'push' }
    : { titulo: 'Fetch', icone: <RefreshCw size={14} />, acao: 'fetch' }

  async function rodar(args: string[]) {
    setOcupado(true)
    setAviso(await fazer(args))
    setOcupado(false)
    mudou()
  }
  const git = (acao: string) => rodar(['--repo-acao', repo.pasta, acao])
  const push = async () =>
    (await confirmar({
      titulo: !repo.upstream ? `Publicar ${repo.branch ?? ''} no origin?` : `Dar push de ${repo.branch ?? ''}?`,
      mensagem: 'Sobe os commits da branch atual para o origin (cria o upstream se faltar). Usa a conta ativa do gh.',
      botao: !repo.upstream ? 'Publicar' : 'Push'
    })) && git('push')
  async function abrirPR() {
    const e = await fazer(['--pr-abrir', repo.pasta]) // o motor abre a aba do Claude no app
    e ? setAviso(e) : irPara('jfy')
  }

  const menuBranch: ItemMenu[] = [
    { rotulo: 'TROCAR PARA', acao: () => {}, desativado: true },
    ...branches.filter((b) => !b.atual).slice(0, 12).map((b) => ({ rotulo: b.nome, acao: () => rodar(['--repo-branch', repo.pasta, 'trocar', b.nome]) })),
    '-',
    { rotulo: 'Nova branch…', acao: () => setAba('branches') },
    { rotulo: 'Todas as branches e worktrees', acao: () => setAba('branches') }
  ]

  return (
    <div className="painel gh-repo">
      <div className="linha-h gh-repo-topo">
        <Bolinha cor={repo.cor} tamanho={10} />
        <div className="gh-pilha gh-encolhe">
          <strong>{repo.projeto}</strong>
          <span className="gh-legenda gh-cortar">{repo.remote ?? repo.nome}</span>
        </div>
        <span className="gh-divisor" />
        <MenuBotao
          rotulo={<><GitBranch size={13} /><span className="mono">{repo.branch ?? '?'}</span></>}
          itens={menuBranch}
          title="Branch atual: clique para trocar ou criar outra"
        />
        <span className="espaco" />
        {ocupado && <Carregando />}
        <span className="gh-dividido">
          <Botao disabled={ocupado} onClick={() => (sinc.acao === 'push' ? push() : git(sinc.acao))}>
            {sinc.icone}
            {sinc.titulo}
          </Botao>
          <Menu
            rotulo=""
            desativado={ocupado}
            title="Fetch, pull ou push"
            itens={[
              { rotulo: 'Fetch', acao: () => git('fetch') },
              { rotulo: 'Pull (só fast-forward)', acao: () => git('pull'), desativado: repo.atras === 0 },
              { rotulo: 'Push', acao: push, desativado: repo.frente === 0 && !!repo.upstream }
            ]}
          />
        </span>
        <Botao tipo="primario" onClick={abrirPR}
          title="O Claude abre o PR desta branch pelas regras do pr-creator, numa aba do jfy, com a sua aprovação">
          <GitPullRequest size={14} />
          Abrir PR
        </Botao>
      </div>
      {aviso && (
        <div className="gh-aviso-repo">
          <Aviso texto={aviso} />
        </div>
      )}
      <div className="gh-abas">
        <Segmentos
          cheio
          valor={aba}
          mudar={setAba}
          opcoes={ABAS.map(([a, rotulo, icone]) => ({
            valor: a,
            icone,
            rotulo: a === 'alteracoes' && repo.n_mexidos > 0 ? `Alterações (${repo.n_mexidos})` : a === 'prs' && prs.length ? `PRs (${prs.length})` : rotulo
          }))}
        />
      </div>
      <div className="gh-conteudo">
        {aba === 'alteracoes' && <CommitPainel pasta={repo.pasta} branch={repo.branch ?? '?'} mudou={mudou} />}
        {aba === 'historico' && <HistoricoPainel pasta={repo.pasta} />}
        {aba === 'prs' && (
          <div className="colunas">
            <div className="coluna gh-col-lista">
              {!prs.length && <div className="texto2 gh-pad">Nenhum PR aberto neste repositório.</div>}
              {prs.map((x) => (
                <Linha key={refPR(x)} marcada={p.pr === refPR(x)} className="gh-linha" onClick={() => p.setPr(refPR(x))}>
                  <LinhaPR p={x} comRepo={false} />
                </Linha>
              ))}
            </div>
            <div className="painel">{detalhe(p.pr, mudou)}</div>
          </div>
        )}
        {aba === 'branches' && <BranchesPainel pasta={repo.pasta} mudou={mudou} />}
      </div>
    </div>
  )
}

// ---------- histórico ----------
type Commit = { sha: string; assunto: string; autor: string; quando: string; refs: string }
type DetalheCommit = { mensagem: string; diff: string; arquivos: Arquivo[] }

function HistoricoPainel({ pasta }: { pasta: string }) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<DetalheCommit | null>(null)

  useEffect(() => {
    ler<Commit[]>(['--repo-historico', pasta]).then(([c]) => {
      setCommits(c ?? [])
      setSel((s) => s ?? c?.[0]?.sha ?? null)
    })
  }, [])
  useEffect(() => {
    if (!sel) return
    let vivo = true // a resposta de um commit que já não está escolhido não entra
    ler<DetalheCommit>(['--repo-commit', pasta, sel]).then(([d]) => vivo && setDetalhe(d))
    return () => void (vivo = false)
  }, [sel])

  return (
    <div className="colunas">
      <div className="coluna gh-col-lista">
        {commits.map((c) => (
          <Linha key={c.sha} marcada={sel === c.sha} className="gh-linha" onClick={() => setSel(c.sha)}>
            <div className="gh-pilha">
              <span className="gh-duas">{c.assunto}</span>
              <div className="linha-h gh-legenda">
                <span className="mono">{c.sha}</span>
                <span className="gh-cortar">{`${c.autor} · ${relativo(c.quando)}`}</span>
              </div>
              {c.refs && <span className="mono gh-cortar gh-miudo" style={{ color: AZUL }}>{c.refs}</span>}
            </div>
          </Linha>
        ))}
      </div>
      {detalhe ? (
        <div className="painel">
          <div className="gh-mensagem selecionavel">{detalhe.mensagem}</div>
          {detalhe.arquivos.length > 0 && (
            <div className="gh-arquivos">
              {detalhe.arquivos.map((a, i) => <ArquivoLinha key={i} estado={a.estado} caminho={a.arquivo} />)}
            </div>
          )}
          <DiffRolavel texto={detalhe.diff} />
        </div>
      ) : (
        <div className="gh-nada texto2">Escolha um commit</div>
      )}
    </div>
  )
}

// ---------- branches e worktrees ----------
function BranchesPainel({ pasta, mudou }: { pasta: string; mudou: () => void }) {
  const [d, setD] = useState<DadosBranches | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tipo, setTipo] = useState('feature')
  const [titulo, setTitulo] = useState('')

  async function carregar() {
    const [r, msg] = await ler<DadosBranches>(['--repo-branches', pasta])
    if (r) setD(r)
    setAviso(msg)
  }
  useEffect(() => void carregar(), [])

  async function criar() {
    const t = titulo.trim()
    if (!t) return
    const e = await fazer(['--repo-branch', pasta, 'criar', tipo, t])
    setAviso(e)
    if (!e) setTitulo('')
    await carregar()
    mudou()
  }
  async function branch(acao: string, nome: string) {
    setAviso(await fazer(['--repo-branch', pasta, acao, nome]))
    await carregar()
    mudou()
  }
  async function worktree(acao: string, w?: string) {
    setAviso(await fazer(['--worktree', pasta, acao, ...(w ? [w] : [])]))
    await carregar()
  }
  const remover = async (w: string) =>
    (await confirmar({
      titulo: 'Remover o worktree?',
      mensagem: 'Apaga a pasta do worktree. A branch continua no repositório.',
      botao: 'Remover',
      perigo: true
    })) && worktree('remover', w)
  // no Mac o motor abre o "jfy --livre" numa aba; aqui a aba é o terminal do sistema, aberto na pasta do worktree
  const terminalLivre = (w: string) => (api.abas.abrirTerminal(w, w.split(/[\\/]/).pop()!.slice(0, 20) + ': livre'), irPara('jfy'))

  const base = d?.base?.replace('origin/', '')
  return (
    <div className="painel">
      <div className="gh-branches">
        {aviso && <Aviso texto={aviso} />}
        {d?.task_rodando && (
          <div className="linha-h texto2">
            <Lock size={13} />
            Tem uma task do jfy rodando neste repositório: trocar ou criar branch fica bloqueado até ela acabar.
          </div>
        )}
        <div className="pilha">
          <div className="gh-rotulo">Nova branch</div>
          <div className="linha-h">
            <Select semBusca opcoes={['feature', 'bugfix', 'hotfix', 'release'].map((t) => ({ valor: t, rotulo: t }))} valor={tipo} mudar={setTipo} />
            <span className="texto2">/</span>
            <Campo placeholder="o que ela faz (vira o nome)" value={titulo} onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && criar()} />
            <Botao disabled={!titulo.trim()} onClick={criar}>Criar e trocar</Botao>
          </div>
          <span className="gh-legenda">
            {tipo === 'hotfix' || tipo === 'release' ? 'Sai da main atualizada.' : `Sai da ${base ?? 'develop'} atualizada.`}
          </span>
        </div>
        <div className="pilha gh-apertada">
          <div className="gh-rotulo">Branches</div>
          {d?.branches.map((b) => (
            <div key={b.nome} className="linha-h gh-item">
              {b.atual ? <CircleCheck size={15} className="destaque" /> : <Circle size={15} className="texto2" />}
              <div className="gh-pilha gh-encolhe">
                <span className="mono gh-cortar">{b.nome}</span>
                <span className="gh-legenda gh-cortar">
                  {[
                    !b.upstream ? 'só local' : b.sumiu ? 'apagada no origin' : null,
                    b.frente > 0 ? `↑${b.frente}` : null,
                    b.atras > 0 ? `↓${b.atras}` : null,
                    b.entrou ? `já entrou na ${base ?? 'base'}` : null,
                    relativo(b.quando)
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
              <span className="espaco" />
              {!b.atual && <Botao disabled={d?.task_rodando} onClick={() => branch('trocar', b.nome)}>Trocar</Botao>}
              {b.entrou && !b.atual && (
                <Botao title="Só a local, e só porque já entrou: git branch -d" onClick={() => branch('excluir', b.nome)}>Excluir</Botao>
              )}
            </div>
          ))}
        </div>
        <div className="pilha gh-apertada">
          <div className="linha-h">
            <div className="gh-rotulo">Worktrees</div>
            <span className="espaco" />
            <Botao disabled={!d?.worktrees.some((w) => w.orfao)} onClick={() => worktree('limpar')}>Limpar órfãos</Botao>
          </div>
          <span className="gh-legenda">O jfy cria um worktree quando uma task pega um repositório que outra já está usando.</span>
          {d?.worktrees.map((w) => (
            <div key={w.pasta} className="linha-h gh-item">
              <Folder size={15} className="texto2" fill={w.principal ? 'currentColor' : 'none'} />
              <div className="gh-pilha gh-encolhe">
                <span className="mono gh-cortar">{w.branch}</span>
                <span className="gh-legenda gh-cortar" title={w.pasta}>
                  {(w.principal ? 'principal · ' : '') + (w.orfao ? 'órfão (a pasta sumiu) · ' : '')
                    + (w.mexidos > 0 ? `${w.mexidos} mexido(s) · ` : '') + curto(w.pasta)}
                </span>
              </div>
              <span className="espaco" />
              <Botao disabled={w.orfao} title="Abrir no Explorador de Arquivos" onClick={() => api.mostrarPasta(w.pasta)}>
                Explorador de Arquivos
              </Botao>
              {!w.principal && (
                <>
                  <Botao disabled={w.orfao} onClick={() => terminalLivre(w.pasta)}>Terminal livre</Botao>
                  <Botao disabled={w.mexidos > 0} onClick={() => remover(w.pasta)}
                    title={w.mexidos > 0 ? 'Tem arquivos mexidos: commite ou descarte antes' : 'git worktree remove'}>
                    Remover
                  </Botao>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- o diff ----------
/** O diff colorido (+ verde, − vermelho, @@ azul) numa área que rola nos dois sentidos: código não quebra linha. */
function DiffRolavel({ texto }: { texto: string }) {
  return (
    <div className="gh-diff selecionavel mono">
      <div className="gh-diff-dentro">
        {texto.split('\n').map((l, i) => (
          <div key={i} className={
            l.startsWith('+') && !l.startsWith('+++') ? 'gh-mais' : l.startsWith('-') && !l.startsWith('---') ? 'gh-menos' : l.startsWith('@@') ? 'gh-trecho' : ''
          }>
            {l || ' '}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- um PR ----------
type DetalhePR = {
  titulo: string; corpo: string; url: string; de: string; para: string
  autor?: string | null; mergeavel?: string | null; situacao?: string | null; revisao?: string | null; criado?: string | null
  rascunho: boolean; mais: number; menos: number; arquivos: number
  checks: { nome: string; estado: string }[]
  commits: { sha: string; msg: string; autor?: string | null; quando?: string | null }[]
  revisoes: Nota[]; comentarios: Nota[]
  metodos: string[]
  tasks: { id: string; titulo: string; status: string; pid: string; projeto?: string | null; cor?: string | null }[]
}
type Nota = { autor?: string | null; estado?: string | null; quando?: string | null; texto: string }

const NOME_METODO: Record<string, string> = { squash: 'Squash e merge', merge: 'Merge commit', rebase: 'Rebase e merge' }
const TEXTO_REVISAO: Record<string, [string, string]> = {
  APPROVED: ['aprovado', VERDE], CHANGES_REQUESTED: ['pediram mudanças', LARANJA], REVIEW_REQUIRED: ['precisa de revisão', AMARELO],
  COMMENTED: ['comentou', CINZA], DISMISSED: ['descartada', CINZA]
}
const TEXTO_SITUACAO: Record<string, [string, string]> = {
  CLEAN: ['pronto para merge', VERDE], UNSTABLE: ['checks falhando', VERMELHO], BLOCKED: ['bloqueado pela regra da branch', LARANJA],
  DIRTY: ['conflito com a base', VERMELHO], BEHIND: ['atrás da base', LARANJA], HAS_HOOKS: ['pronto para merge', VERDE],
  UNKNOWN: ['calculando…', CINZA]
}
function iconeCheck(e: string) {
  if (e === 'success') return <CircleCheck size={14} color={VERDE} />
  if (['failure', 'error', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(e)) return <CircleX size={14} color={VERMELHO} />
  if (['skipped', 'neutral', 'stale'].includes(e)) return <CircleMinus size={14} color={CINZA} />
  return <Clock size={14} color={AMARELO} /> // pending, in_progress, queued, expected
}

const SeloPR = ({ s }: { s?: [string, string] }) => s ? <span className="chip"><Bolinha cor={s[1]} tamanho={7} />{s[0]}</span> : null
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="pilha">
      <div className="gh-rotulo">{titulo}</div>
      {children}
    </div>
  )
}
/** Markdown do GitHub. Não é o TextoRico: corpo de PR traz HTML no meio (<img>, <br>), e lá isso desligava o markdown. */
const Markdown = ({ texto }: { texto: string }) => (
  <div className="texto-rico" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(texto, { async: false, breaks: true }) as string) }} />
)

// o status da task do Journify (StatusChip de Projetos.swift): vazada enquanto em aberto
const CORES_STATUS: Record<string, string> = {
  em_aberto: CINZA, criando_escopo: '#30b0c7', priorizado: '#004dff', em_progresso: VERDE, em_revisao: AMARELO, em_teste: '#af52de',
  pendente_validacao: '#ff7ac7', bloqueado: LARANJA, finalizado_validacao: '#a2845e', fechado: 'var(--texto2)'
}
const ROTULO_STATUS: Record<string, string> = { em_revisao: 'em revisão', pendente_validacao: 'pendente validação', finalizado_validacao: 'finalizado validação' }
function StatusChip({ status }: { status: string }) {
  return (
    <span className="linha-h gh-junto">
      {status === 'em_aberto' ? <span className="gh-vazada" /> : <Bolinha cor={CORES_STATUS[status] ?? CINZA} />}
      {ROTULO_STATUS[status] ?? status.replace(/_/g, ' ')}
    </span>
  )
}

function PRDetalhe({ repo, n, mudou }: { repo: string; n: number; mudou: () => void }) {
  const [d, setD] = useState<DetalhePR | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [comentario, setComentario] = useState('')

  async function carregar() {
    const [r, msg] = await ler<DetalhePR>(['--pr-json', repo, String(n)])
    if (r) setD(r)
    setAviso(msg)
  }
  useEffect(() => void carregar(), [])

  async function agir(acao: string, valor = '') {
    setOcupado(true)
    const erro = await fazer(['--pr-acao', repo, String(n), acao, ...(valor ? [valor] : [])])
    await carregar()
    setOcupado(false)
    setAviso(erro)
    if (!erro) mudou()
  }
  async function revisar() {
    const ok = await confirmar({
      titulo: `Revisar #${n} com o Claude?`,
      mensagem: 'Abre uma aba do jfy com o Claude rodando o /code-review deste PR (usa tokens). Ele só mostra o que achou: não comenta nem aprova no GitHub sem você pedir.',
      botao: 'Revisar'
    })
    if (!ok) return
    const e = await fazer(['--pr-revisar', repo, String(n)]) // o motor abre a aba do Claude no app
    e ? setAviso(e) : irPara('jfy')
  }

  if (!d) return aviso ? <div className="texto2 gh-pad selecionavel">{aviso}</div> : <div className="gh-nada"><Carregando /></div>

  const merge = async (m: string) =>
    (await confirmar({
      titulo: `Merge (${m}) de #${n} em ${d.para}?`,
      mensagem: d.situacao === 'UNSTABLE' ? 'Atenção: há checks falhando.' : `O PR entra em ${d.para} e fecha. Não tem volta pelo app.`,
      botao: 'Fazer merge'
    })) && agir('merge', m)
  const fechar = async () => (await confirmar({ titulo: `Fechar #${n} sem merge?`, botao: 'Fechar sem merge', perigo: true })) && agir('fechar')
  const notas = [...d.revisoes, ...d.comentarios].sort((a, b) => (a.quando ?? '').localeCompare(b.quando ?? ''))

  return (
    <div className="gh-pr" style={{ opacity: ocupado ? 0.6 : 1 }}>
      <div className="linha-h">
        <span className="texto2">{`${repo} #${n}`}</span>
        <span className="espaco" />
        <BotaoContexto item={{ tipo: 'pr', ref: `${repo}#${n}`, titulo: d.titulo, origem: repo }} />
        <Botao tipo="link" onClick={() => api.abrirLink(d.url)}>
          <ExternalLink size={13} />
          Abrir no GitHub
        </Botao>
      </div>
      <h2 className="gh-titulo-pr selecionavel">{d.titulo}</h2>
      <div className="linha-h gh-junto">
        <span className="mono">{d.de}</span>
        <ArrowRight size={13} />
        <span className="mono">{d.para}</span>
        <span className="texto2 gh-cortar">{`· ${d.autor ?? '?'} · +${d.mais} −${d.menos} em ${d.arquivos} arquivo(s)`}</span>
      </div>
      {(d.rascunho || TEXTO_REVISAO[d.revisao ?? ''] || TEXTO_SITUACAO[d.situacao ?? '']) && (
        <div className="linha-h">
          {d.rascunho && <SeloPR s={['rascunho', CINZA]} />}
          <SeloPR s={TEXTO_REVISAO[d.revisao ?? '']} />
          <SeloPR s={TEXTO_SITUACAO[d.situacao ?? '']} />
        </div>
      )}
      {aviso && <Aviso texto={aviso} />}
      <div className="linha-h">
        <Menu rotulo="Merge" desativado={ocupado || d.rascunho || !d.metodos.length}
          itens={d.metodos.map((m) => ({ rotulo: NOME_METODO[m] ?? m, acao: () => merge(m) }))} />
        <Botao tipo="primario" disabled={ocupado} onClick={revisar}>
          <Sparkles size={13} />
          Revisar com o Claude
        </Botao>
        <Botao disabled={ocupado} onClick={() => agir('aprovar')}>Aprovar</Botao>
        <Botao disabled={ocupado} onClick={fechar}>Fechar sem merge</Botao>
      </div>
      {d.tasks.length > 0 && (
        <Grupo titulo="Tasks do Journify">
          {d.tasks.map((t) => (
            <button key={t.id} type="button" className="linha-h gh-task" title="Abrir a task na aba Projetos"
              onClick={() => irPara('Projetos', { abrirTask: { pid: t.pid, tid: t.id } })}>
              <StatusChip status={t.status} />
              <span className="gh-cortar">{t.titulo}</span>
              {t.projeto && <span className="texto2">· {t.projeto}</span>}
            </button>
          ))}
        </Grupo>
      )}
      {d.checks.length > 0 && (
        <Grupo titulo="Checks">
          {d.checks.map((c, i) => (
            <div key={i} className="linha-h">
              {iconeCheck(c.estado)}
              {c.nome}
            </div>
          ))}
        </Grupo>
      )}
      <Grupo titulo="Descrição">
        {d.corpo.trim() ? <Markdown texto={d.corpo} /> : <span className="texto2">(sem descrição)</span>}
      </Grupo>
      <Grupo titulo={`Commits (${d.commits.length})`}>
        {d.commits.map((c, i) => (
          <div key={i} className="linha-h gh-base">
            <span className="mono gh-legenda">{c.sha}</span>
            <span className="gh-duas">{c.msg}</span>
            <span className="espaco" />
            <span className="gh-legenda gh-fixo">{`${c.autor ?? ''} · ${relativo(c.quando)}`}</span>
          </div>
        ))}
      </Grupo>
      <Grupo titulo="Revisões e comentários">
        {notas.map((c, i) => (
          <div key={i} className="pilha gh-nota">
            <div className="linha-h">
              <strong>{c.autor ?? '?'}</strong>
              <SeloPR s={TEXTO_REVISAO[c.estado ?? '']} />
              <span className="gh-legenda">{relativo(c.quando)}</span>
            </div>
            {c.texto && <Markdown texto={c.texto} />}
          </div>
        ))}
        <div className="linha-h gh-comentar">
          <AreaTexto rows={1} placeholder="Comentar no PR" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          <Botao disabled={!comentario.trim() || ocupado} onClick={() => (agir('comentar', comentario), setComentario(''))}>Enviar</Botao>
        </div>
      </Grupo>
    </div>
  )
}

// ---------- commit pelos arquivos marcados (como o GitHub Desktop) ----------
/** O que o committer deixa de fora (segredo e ruído): já vem desmarcado. */
const RUIDO = /(^|\/)(\.env(?!\.example)[^/]*|\.DS_Store|[^/]*\.(pem|key)|node_modules\/.*|(dist|\.next|build|coverage)\/.*)$/
const LIMITE_TITULO = 72 // o assunto inteiro do committer cabe em 72 caracteres

/** À esquerda, os arquivos mexidos com caixa de marcar e, embaixo deles, a mensagem (título e descrição) e o commit; à
 * direita, o diff do arquivo escolhido. O commit é do jfy, com as travas do committer (--repo-mudancas, --repo-diff,
 * --commit-mensagem, --commit-autor, --commit-fazer). */
function CommitPainel({ pasta, branch, mudou }: { pasta: string; branch: string; mudou: () => void }) {
  const [dados, setDados] = useState<{ branch: string; gitflow: boolean; arquivos: Arquivo[] } | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [atual, setAtual] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [gerando, setGerando] = useState(false)
  const [commitando, setCommitando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pedirNome, setPedirNome] = useState(false)
  const [nome, setNome] = useState('')
  const primeira = useRef(true)

  async function carregar() {
    const [d, msg] = await ler<{ branch: string; gitflow: boolean; arquivos: Arquivo[] }>(['--repo-mudancas', pasta])
    if (d) {
      const todos = new Set(d.arquivos.map((a) => a.arquivo))
      // na primeira vez marca tudo menos o ruído; depois mantém o que você marcou e ainda existe
      const p = primeira.current
      primeira.current = false
      setMarcados((m) => new Set([...(p ? todos : m)].filter((a) => todos.has(a) && !(p && RUIDO.test(a)))))
      setDados(d)
      setAtual((a) => (a && todos.has(a) ? a : d.arquivos[0]?.arquivo ?? null))
    }
    setAviso(msg)
  }
  useEffect(() => void carregar(), [])
  useEffect(() => {
    if (!atual) return setDiff('')
    let vivo = true
    ler<{ diff: string }>(['--repo-diff', pasta, atual]).then(([r]) => vivo && setDiff(r?.diff ?? ''))
    return () => void (vivo = false)
  }, [atual])

  async function gerar() {
    setGerando(true)
    setFeito(null)
    const [r, msg] = await ler<{ mensagem: string }>(['--commit-mensagem', pasta, ...[...marcados].sort()])
    setGerando(false)
    if (r) {
      const [t, ...resto] = r.mensagem.split('\n')
      setTitulo(t ?? '')
      setDescricao(resto.join('\n').trim())
      setAviso(null)
    } else if (msg?.startsWith('NOME:')) {
      setPedirNome(true) // conta compartilhada sem o nome do prefixo [Nome]
      setAviso(msg.slice(5).trim())
    } else setAviso(msg)
  }
  async function salvarNome() {
    const e = await fazer(['--commit-autor', nome])
    if (e) return setAviso(e)
    setPedirNome(false)
    gerar()
  }
  async function commitar() {
    setCommitando(true)
    const msg = titulo + (descricao ? '\n\n' + descricao : '')
    const [r, erro] = await ler<{ sha: string; assunto: string }>(['--commit-fazer', pasta, msg, ...[...marcados].sort()])
    setCommitando(false)
    setAviso(r ? null : erro)
    if (r) {
      setFeito(`Commit ${r.sha}: ${r.assunto}`)
      setTitulo('')
      setDescricao('')
      await carregar()
      mudou()
    }
  }

  const escolhido = dados?.arquivos.find((a) => a.arquivo === atual)
  return (
    <div className="colunas">
      <div className="coluna gh-col-commit">
        {dados ? (
          !dados.arquivos.length ? (
            <div className="gh-nada gh-tudo-certo">
              <CircleCheck size={36} color={VERDE} />
              <strong>Nada para commitar</strong>
              <span className="texto2">{`Os arquivos que você mexer em ${dados.branch} aparecem aqui.`}</span>
            </div>
          ) : (
            <>
              <div className="linha-h gh-cabeca-arquivos">
                <Caixa marcado={marcados.size === dados.arquivos.length}
                  mudar={(v) => setMarcados(new Set(v ? dados.arquivos.map((a) => a.arquivo) : []))}>
                  <span className="gh-medio">{`${dados.arquivos.length} arquivo(s) alterado(s)`}</span>
                </Caixa>
                <span className="espaco" />
                <Botao tipo="icone" title="Atualizar" onClick={carregar}><RefreshCw size={13} /></Botao>
              </div>
              <div className="lista">
                {dados.arquivos.map((a) => (
                  <Linha key={a.arquivo} marcada={atual === a.arquivo} onClick={() => setAtual(a.arquivo)}>
                    <Caixa marcado={marcados.has(a.arquivo)}
                      mudar={(v) => setMarcados((m) => { const s = new Set(m); v ? s.add(a.arquivo) : s.delete(a.arquivo); return s })} />
                    <ArquivoLinha estado={a.estado} caminho={a.arquivo} />
                  </Linha>
                ))}
              </div>
            </>
          )
        ) : aviso ? (
          <div className="texto2 gh-pad gh-cresce selecionavel">{aviso}</div>
        ) : (
          <div className="gh-nada"><Carregando /></div>
        )}
        <div className="gh-caixa-commit">
          {dados && !dados.gitflow && (
            <Aviso texto={`O committer não commita em ${dados.branch}. Crie uma branch feature/, bugfix/, hotfix/ ou release/ (menu da branch, no topo).`} />
          )}
          {dados && aviso && <Aviso texto={aviso} />}
          <Aviso texto={feito} tipo="ok" />
          {pedirNome && (
            <div className="linha-h">
              <Campo placeholder="Seu nome para o [Nome] dos commits" value={nome} onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && nome.trim() && salvarNome()} />
              <Botao disabled={!nome.trim()} onClick={salvarNome}>Salvar</Botao>
            </div>
          )}
          <div className="linha-h">
            <Campo placeholder="Título (obrigatório)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <span className="gh-legenda gh-fixo" style={titulo.length > LIMITE_TITULO ? { color: LARANJA } : undefined}
              title={`O committer limita o título a ${LIMITE_TITULO} caracteres`}>
              {titulo.length}
            </span>
          </div>
          <AreaTexto className="gh-descricao" placeholder="Descrição (opcional): o porquê, em 1 a 3 linhas" value={descricao}
            onChange={(e) => setDescricao(e.target.value)} />
          <Botao className="gh-largo" disabled={!marcados.size || gerando} onClick={gerar}
            title="Pelas regras do agente committer: formato, [Nome] na conta compartilhada, linha Journify. Usa tokens.">
            {gerando ? <Carregando /> : <Sparkles size={13} />}
            {gerando ? 'O committer está escrevendo…' : 'Gerar título e descrição com o committer'}
          </Botao>
          <Botao tipo="primario" className="gh-largo gh-grande" onClick={commitar}
            disabled={!dados?.gitflow || !marcados.size || !titulo.trim() || commitando}>
            {commitando && <Carregando />}
            <span className="gh-cortar">{!marcados.size ? 'Marque os arquivos' : `Commit de ${marcados.size} arquivo(s) em ${branch}`}</span>
          </Botao>
        </div>
      </div>
      <div className="painel">
        {atual && escolhido ? (
          <>
            <div className="linha-h gh-cabeca-diff">
              <ArquivoLinha estado={escolhido.estado} caminho={escolhido.arquivo} />
              <span className="espaco" />
              <span className="gh-legenda gh-fixo">{marcados.has(atual) ? 'vai no commit' : 'fora do commit'}</span>
            </div>
            <DiffRolavel texto={diff} />
          </>
        ) : (
          <div className="gh-nada texto2">{dados?.arquivos.length ? 'Escolha um arquivo para ver o diff' : ''}</div>
        )}
      </div>
    </div>
  )
}

/** Um arquivo mexido: o que aconteceu com ele (+ novo, M mudou, − apagado, R renomeado), o nome em destaque e a pasta
 * mais clara, como no GitHub Desktop. */
function ArquivoLinha({ estado, caminho }: { estado: string; caminho: string }) {
  const [sinal, cor] = estado === '??' || estado.includes('A') ? ['+', VERDE] : estado.includes('D') ? ['−', VERMELHO]
    : estado.includes('R') ? ['R', AZUL] : ['M', LARANJA]
  const i = caminho.lastIndexOf('/')
  return (
    <span className="linha-h gh-arquivo" title={caminho}>
      <span className="gh-estado mono" style={{ background: cor }}>{sinal}</span>
      <span className="gh-fixo">{caminho.slice(i + 1)}</span>
      {/* o nome inteiro; quem encolhe é a pasta, cortada no começo (as marcas LRM seguram as barras no lugar) */}
      {i > 0 && <span className="gh-pasta-arq texto2">{`‎${caminho.slice(0, i)}‎`}</span>}
    </span>
  )
}
