// Tela "Configurações" (app/Sources/JFY/Configuracoes.swift): as contas ligadas ao jfy (Google, GitHub, Journify), o
// modelo do Claude de cada atividade e de cada agente da pipeline, e a sessão. Quem lê e mexe é o jfy (--contas-json,
// --login, --google-sair, --github-conta, --github-sair, --github-login, --journify-token, --journify-sair,
// --modelos-json, --modelo, --agentes-json, --agente-modelo); vale também para o jfy no terminal.
import { useEffect, useState, type ReactNode } from 'react'
import { CircleUser, Cpu, GitBranch, ListChecks, Mail, Plus, Users } from 'lucide-react'
import { api, fazer, ler } from '../jfy'
import { irPara, passos, sessaoMudou } from '../estado'
import { Aviso, Botao, Campo, Carregando, FotoConta, Select, confirmar } from '../souv'
import './Configuracoes.css'

type Contas = {
  google: { conectado: boolean; cliente: boolean; conta?: string | null; erro?: string | null; drive?: boolean | null; fotos?: boolean | null }
  github: { ativa?: string | null; contas: string[]; instalado?: boolean; brew?: boolean }
  journify: { conectado: boolean; fim?: string | null; erro?: string | null; site?: string | null; tasks?: number | null }
}
type Modelos = {
  opcoes: string[]
  atividades: { id: string; nome: string; descricao: string; modelo: string; padrao_jfy: string; opcoes?: string[] | null }[]
}
type Agentes = { opcoes: string[]; agentes: { id: string; papel: string; modelo: string; atual?: string | null; oficial?: string | null }[] }

const NOMES_MODELO: Record<string, string> = {
  conversa: 'O mesmo da conversa', padrao: 'Padrão do Claude Code', fable: 'Fable', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku'
}
const nomeModelo = (v: string) => NOMES_MODELO[v] ?? v
function rotuloAgente(v: string, oficial?: string | null) {
  if (v === 'oficial') return 'Padrão da pipeline' + (oficial ? ` (${nomeModelo(oficial)})` : '')
  if (v === 'inherit') return 'O mesmo da sessão'
  return nomeModelo(v)
}

/** O que tira acesso pede confirmação antes. */
type Pedido = { titulo: string; mensagem: string; botao: string; qual: string; args: string[]; ok: string }
const PEDIDOS = {
  googleSair: {
    titulo: 'Desconectar o Google?', botao: 'Desconectar', qual: 'google', args: ['--google-sair'], ok: 'Google desconectado.',
    mensagem: 'A Agenda, os Emails e os avisos deles param até você conectar de novo. O acesso do jfy é revogado no Google.'
  },
  githubSairTodas: {
    titulo: 'Tirar todas as contas do GitHub deste computador?', botao: 'Sair de todas', qual: 'github', args: ['--github-sair'],
    ok: 'Todas as contas do GitHub saíram deste computador.',
    mensagem: 'O gh e o git deste computador ficam sem conta até você adicionar de novo, e a aba GitHub para.'
  },
  journifySair: {
    titulo: 'Desconectar o Journify?', botao: 'Desconectar', qual: 'journify', args: ['--journify-sair'], ok: 'Journify desconectado.',
    mensagem: 'O jfy e o Claude deixam de ver e mexer nas suas tasks até você colar um token de novo.'
  },
  sair: {
    titulo: 'Sair do jfy?', botao: 'Sair', qual: 'google', args: ['--google-sair'], ok: 'Você saiu do jfy.',
    mensagem:
      'Você volta para a tela de login e o acesso do jfy à sua conta Google é revogado: a Agenda, os Emails e os avisos deles param até você entrar de novo. As tasks e as abas do terminal continuam como estão.'
  }
} satisfies Record<string, Pedido>
const githubSair = (u: string): Pedido => ({
  titulo: `Tirar ${u} deste computador?`, botao: 'Sair', qual: 'github', args: ['--github-sair', u], ok: `${u} saiu deste computador.`,
  mensagem: 'O gh e o git deste computador deixam de usar essa conta. Se ela estiver em uso, o gh passa para outra que sobrar.'
})

function Estado({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="linha-h">
      <span className={`cf-estado ${ok ? 'ok' : ''}`} />
      <span>{children}</span>
    </div>
  )
}

function Cartao({ titulo, icone, subtitulo, children }: { titulo: string; icone: ReactNode; subtitulo: string; children: ReactNode }) {
  return (
    <section className="cartao cf-cartao">
      <div className="linha-h cf-cabeca">
        <span className="cf-icone">{icone}</span>
        <div className="pilha" style={{ gap: 1 }}>
          <h3>{titulo}</h3>
          <span className="texto2 pequeno-texto">{subtitulo}</span>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function Configuracoes({ ativa }: { ativa: boolean }) {
  const [contas, setContas] = useState<Contas | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null) // "google", "github" ou "journify" enquanto o jfy trabalha
  const [colandoToken, setColandoToken] = useState(false)
  const [token, setToken] = useState('')
  const [modelos, setModelos] = useState<Modelos | null>(null)
  const [agentes, setAgentes] = useState<Agentes | null>(null)

  const lerModelos = async () => {
    const [m] = await ler<Modelos>(['--modelos-json'])
    if (m) setModelos(m)
  }
  const lerAgentes = async () => {
    const [ag] = await ler<Agentes>(['--agentes-json'])
    if (ag) setAgentes(ag)
  }
  /** Devolve as contas lidas: quem acabou de entrar no Google confere a conta nova sem esperar o estado redesenhar. */
  const carregar = async () => {
    const [c, msg] = await ler<Contas>(['--contas-json'])
    if (c) setContas(c)
    else setAviso(msg)
    await Promise.all([lerModelos(), lerAgentes()])
    return c
  }
  useEffect(() => {
    if (ativa) carregar()
  }, [ativa])

  const agir = async (qual: string, args: string[], ok: string) => {
    setOcupado(qual)
    setAviso(null)
    setFeito(null)
    const e = await fazer(args)
    if (e) setAviso(e)
    else setFeito(ok)
    setOcupado(null)
    await carregar()
    if (qual === 'google') sessaoMudou() // sem Google, volta ao login
  }

  const pedir = async (p: Pedido) => {
    if (await confirmar({ titulo: p.titulo, mensagem: p.mensagem, botao: p.botao, perigo: true })) agir(p.qual, p.args, p.ok)
  }

  /** Trocar = desconectar e entrar de novo (a conta antiga não deixa contatos, não lidos e agenda para a nova). */
  const entrarGoogle = async (trocando: boolean) => {
    setOcupado('google')
    setAviso(null)
    setFeito(null)
    const e = (trocando && (await fazer(['--google-sair']))) || (await fazer(['--login']))
    if (e) setAviso(e)
    setOcupado(null)
    const c = await carregar()
    sessaoMudou() // a conta nova precisa ser da Souv
    if (e) return
    if (c?.google.conectado && c.google.conta) setFeito(`Google conectado como ${c.google.conta}.`)
    else setAviso('O login do Google não terminou. Tente de novo.')
  }

  // o gh auth login roda numa aba do jfy: o motor pede a aba ao app
  const conectarGithub = async () => {
    const e = await fazer(['--github-login'])
    if (e) setAviso(e)
    else irPara('jfy')
  }

  const salvarToken = async () => {
    const t = token.trim()
    if (!t) return
    setToken('')
    setOcupado('journify')
    setAviso(null)
    setFeito(null)
    const e = await fazer(['--journify-token'], t) // pelo stdin: o token não aparece na lista de processos
    if (e) setAviso(e)
    else (setColandoToken(false), setFeito('Journify conectado.'))
    setOcupado(null)
    await carregar()
  }

  const mudarModelo = async (a: Modelos['atividades'][number], novo: string) => {
    const e = await fazer(['--modelo', a.id, novo])
    if (e) setAviso(e)
    else setFeito(`${a.nome}: ${nomeModelo(novo)}.`)
    await lerModelos()
  }

  const mudarAgente = async (a: Agentes['agentes'][number], novo: string) => {
    const e = await fazer(['--agente-modelo', a.id, novo])
    if (e) setAviso(e)
    else setFeito(`${a.id}: ${rotuloAgente(novo, a.oficial)}.`)
    await lerAgentes()
  }

  const g = contas?.google
  const gh = contas?.github
  const j = contas?.journify

  return (
    <div className="cf-tela">
      <div className="pilha" style={{ gap: 4 }}>
        <h1 className="titulo-tela">Configurações</h1>
        <span className="texto2">As contas ligadas ao jfy. Valem também para o jfy no terminal.</span>
      </div>
      <Aviso texto={aviso} />
      <Aviso texto={feito} tipo="ok" />
      {g && gh && j ? (
        // enquanto o jfy trabalha numa conta, nada mais muda (o fieldset desliga todos os botões de uma vez)
        <fieldset className="cf-cartoes" disabled={!!ocupado}>
          <Cartao titulo="Sessão" icone={<CircleUser size={20} />} subtitulo="A sua entrada no jfy, pela conta Google da Souv">
            <Estado ok={g.conectado}>{g.conta ? `Entrou como ${g.conta}` : 'Sem sessão'}</Estado>
            <div className="linha-h">
              <Botao tipo="perigo" onClick={() => pedir(PEDIDOS.sair)}>Sair do jfy</Botao>
              <Botao title="Abre de novo o assistente que liga Journify, GitHub, projetos e notificações" onClick={() => passos.set('refazer')}>
                Refazer os primeiros passos
              </Botao>
            </div>
          </Cartao>

          <Cartao titulo="Google" icone={<Mail size={20} />} subtitulo="Agenda, Gmail e leitura do Drive">
            {g.conectado ? (
              <>
                <Estado ok={!g.erro}>{g.conta ? `Conectado como ${g.conta}` : 'Conectado'}</Estado>
                {/* permissão que o login antigo não tem: o Drive (a cesta de contexto) e o diretório (as fotos das pessoas) */}
                {(g.drive === false || g.fotos === false) && (
                  <>
                    <span className="cf-alerta">
                      {'O login ainda não tem ' +
                        [g.drive === false && 'o Drive (a cesta de contexto manda Docs e Planilhas só como link)',
                          g.fotos === false && 'as fotos das pessoas (a Agenda e as sugestões de email mostram só as iniciais)']
                          .filter(Boolean)
                          .join(' nem ') +
                        '. Entre de novo para ligar.'}
                    </span>
                    <div>
                      <Botao onClick={() => entrarGoogle(false)}>Entrar de novo</Botao>
                    </div>
                  </>
                )}
                {g.erro && <span className="cf-alerta pequeno-texto selecionavel">{g.erro}</span>}
              </>
            ) : (
              <Estado ok={false}>Desconectado: a Agenda, os Emails e os avisos deles ficam parados.</Estado>
            )}
            {ocupado === 'google' ? (
              <div className="linha-h texto2">
                <Carregando /> Esperando você entrar no Google, no navegador (até 5 min)…
              </div>
            ) : !g.cliente ? (
              <span className="texto2">Primeiro acesso: rode jfy --login no terminal (ele pede o arquivo do app jfy da Souv).</span>
            ) : (
              <div className="linha-h">
                {g.conectado ? (
                  <>
                    <Botao onClick={() => entrarGoogle(true)}>Trocar de conta</Botao>
                    <Botao tipo="perigo" onClick={() => pedir(PEDIDOS.googleSair)}>Desconectar</Botao>
                  </>
                ) : (
                  <Botao tipo="primario" onClick={() => entrarGoogle(false)}>Conectar</Botao>
                )}
              </div>
            )}
          </Cartao>

          <Cartao titulo="GitHub" icone={<GitBranch size={20} />} subtitulo="As contas do gh: valem para o gh e o git deste computador">
            {!gh.contas.length && <Estado ok={false}>Nenhuma conta conectada.</Estado>}
            {gh.contas.map((u) => (
              <div key={u} className="linha-h cf-conta">
                <FotoConta url={`https://github.com/${u}.png?size=48`} tamanho={24} />
                <span style={{ fontWeight: u === gh.ativa ? 600 : 400 }}>{u}</span>
                {u === gh.ativa && <span className="cf-em-uso">em uso</span>}
                <span className="espaco" />
                {u !== gh.ativa && <Botao onClick={() => agir('github', ['--github-conta', u], `Agora o gh usa ${u}.`)}>Usar</Botao>}
                <Botao onClick={() => pedir(githubSair(u))}>Sair</Botao>
              </div>
            ))}
            <div className="linha-h">
              <Botao onClick={conectarGithub}>
                <Plus size={14} /> Adicionar conta
              </Botao>
              {gh.contas.length > 1 && <Botao tipo="perigo" onClick={() => pedir(PEDIDOS.githubSairTodas)}>Sair de todas</Botao>}
            </div>
            <span className="texto2 pequeno-texto">
              Sair tira a conta deste computador; o token continua valendo no GitHub até você revogar em github.com/settings/applications.
            </span>
          </Cartao>

          <Cartao titulo="Journify" icone={<ListChecks size={20} />} subtitulo="O MCP do Journify: é por ele que o jfy e o Claude leem e mexem nas suas tasks">
            {!j.conectado ? (
              <Estado ok={false}>Desconectado: sem o Journify, o jfy não vê as suas tasks.</Estado>
            ) : j.erro ? (
              <>
                <Estado ok={false}>O Journify recusou o token</Estado>
                <span className="cf-alerta pequeno-texto selecionavel">{j.erro}</span>
              </>
            ) : (
              <Estado ok>{`Conectado · enxerga ${j.tasks ?? 0} task(s) suas · token …${j.fim ?? ''}`}</Estado>
            )}
            {colandoToken ? (
              <>
                <div className="linha-h">
                  <Campo
                    type="password"
                    autoFocus
                    placeholder="Cole o token gerado no Journify"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && salvarToken()}
                  />
                  <Botao tipo="primario" disabled={!token} onClick={salvarToken}>Salvar</Botao>
                  <Botao onClick={() => (setColandoToken(false), setToken(''))}>Cancelar</Botao>
                </div>
                <span className="texto2 pequeno-texto">
                  No Journify, em Configurações › Conectar meu Claude, clique em Gerar token e cole aqui. O jfy testa o token antes de trocar.
                </span>
                {ocupado === 'journify' && <Carregando />}
              </>
            ) : (
              <div className="linha-h">
                <Botao onClick={() => (setColandoToken(true), api.abrirLink((j.site ?? 'https://journify.souv.tech') + '/settings'))}>
                  {j.conectado ? 'Trocar token' : 'Conectar'}
                </Botao>
                {j.conectado && <Botao tipo="perigo" onClick={() => pedir(PEDIDOS.journifySair)}>Desconectar</Botao>}
              </div>
            )}
          </Cartao>

          {modelos && (
            <Cartao titulo="Modelos do Claude" icone={<Cpu size={20} />} subtitulo="Qual modelo o Claude usa em cada atividade do jfy">
              <span className="texto2 pequeno-texto">
                Os mais leves (Sonnet, Haiku) custam menos e bastam para tarefas simples. O padrão do Claude Code é o modelo que você usa no
                terminal (/model). A troca vale na hora, também para o jfy do terminal.
              </span>
              <div className="cf-itens">
                {modelos.atividades.map((a) => (
                  <div key={a.id} className="linha-h cf-item">
                    <div className="pilha cf-item-texto">
                      <strong>{a.nome}</strong>
                      <span className="texto2 pequeno-texto">
                        {a.descricao + (a.padrao_jfy === 'padrao' || a.padrao_jfy === 'conversa' ? '' : ` · padrão do jfy: ${nomeModelo(a.padrao_jfy)}`)}
                      </span>
                    </div>
                    <Select
                      largura={210}
                      opcoes={(a.opcoes ?? modelos.opcoes).map((v) => ({ valor: v, rotulo: nomeModelo(v) }))}
                      valor={a.modelo}
                      mudar={(v) => mudarModelo(a, v)}
                    />
                  </div>
                ))}
              </div>
            </Cartao>
          )}

          {agentes && agentes.agentes.length > 0 && (
            <Cartao titulo="Agentes da pipeline" icone={<Users size={20} />} subtitulo="O modelo de cada agente do /pipeline">
              <span className="texto2 pequeno-texto">
                O /pipeline roda no modelo de "Tasks pelo /pipeline"; cada agente que ele chama pode ter o seu. A escolha fica no jfy e volta
                sozinha depois de atualizar a pipeline do time (o app atualiza ao abrir).
              </span>
              <div className="cf-itens">
                {agentes.agentes.map((a) => (
                  <div key={a.id} className="linha-h cf-item">
                    <div className="pilha cf-item-texto">
                      <strong>{a.id}</strong>
                      <span className="texto2 pequeno-texto">{a.papel}</span>
                    </div>
                    <Select
                      largura={230}
                      opcoes={agentes.opcoes.map((v) => ({ valor: v, rotulo: rotuloAgente(v, a.oficial) }))}
                      valor={a.modelo}
                      mudar={(v) => mudarAgente(a, v)}
                    />
                  </div>
                ))}
              </div>
            </Cartao>
          )}
        </fieldset>
      ) : (
        !aviso && (
          <div className="cf-carregando">
            <Carregando tamanho={18} />
          </div>
        )
      )}
    </div>
  )
}
