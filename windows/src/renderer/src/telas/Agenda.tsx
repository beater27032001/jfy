// A agenda (Google Agenda principal) em dia, semana e mês: ver, criar, editar e apagar eventos, e o projeto e o
// contexto de cada reunião para as horas (app/Sources/JFY/Reunioes.swift no app do Mac). Quem fala com o Google é o
// jfy (--agenda-json, --evento-json, --evento-salvar, --evento-apagar, --reuniao-ajuste, --reuniao-preparar).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  ChevronLeft, ChevronRight, Circle, CircleCheck, CircleHelp, CircleX, MapPin, Plus, RotateCw, TriangleAlert, User, Users,
  Video, X
} from 'lucide-react'
import { fazer, ler, api } from '../jfy'
import { atendido, irPara, loja, nav, useACada } from '../estado'
import {
  AreaTexto, Aviso, Bolinha, Botao, Caixa, Campo, CampoData, CampoEmails, Carregando, Modal, Segmentos, Select, diaLocal, fmtHora
} from '../souv'
import { Avatar } from '../avatar'
import './Agenda.css'

type Convidado = { email: string; nome?: string | null; resposta?: string | null; eu: boolean; foto?: string | null }
type Evento = {
  id: string; titulo: string; descricao: string; ini: number; fim: number
  dia_inteiro: boolean; eu_organizo: boolean; pode_editar: boolean; recorrente: boolean; palpite: boolean
  local?: string | null; link?: string | null; url?: string | null; organizador?: string | null; minha_resposta?: string | null
  p?: string | null; projeto?: string | null; cor?: string | null; contexto?: string | null
  convidados: Convidado[]
  pessoa?: string | null // evento da agenda de outra pessoa (o "Reunião com…")
  pessoa_foto?: string | null // a foto dela, no bloco
}
type Projeto = { id: string; nome: string; cor?: string | null }
type Pessoa = { email: string; nome?: string | null; erro?: string | null; eventos: Evento[]; foto?: string | null }
type Dados = { eventos: Evento[]; projetos: Projeto[]; pessoas?: Pessoa[] | null }

/** As cores das pessoas, na ordem em que entram (as mesmas do jfy, CORES_PESSOAS). */
const CORES_PESSOAS = ['#14b8a6', '#f97316', '#ec4899', '#a855f7', '#84cc16', '#eab308', '#06b6d4', '#f43f5e']
const MODOS = ['Dia', 'Semana', 'Mês'] as const
type Modo = (typeof MODOS)[number]
const ALTURA_HORA = 46

const pessoasTxt = loja('', 'agenda.pessoas') // emails de quem aparece junto (vírgula), lembrados

// ---------- datas (a semana começa na segunda) ----------
const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const maisDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
const segunda = (d: Date) => maisDias(inicioDia(d), -((d.getDay() + 6) % 7))
const ehHoje = (d: Date) => diaLocal(d) === diaLocal(new Date())
const data = (s: number) => new Date(s * 1000)
const recusado = (e: Evento) => e.minha_resposta === 'declined'
const corEvento = (e: Evento) => e.cor ?? 'var(--primaria)'
const cobre = (e: Evento, d: Date) => e.ini < maisDias(inicioDia(d), 1).getTime() / 1000 && e.fim > inicioDia(d).getTime() / 1000
const diaLongo = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

function proximaMeiaHora(dia: Date) {
  const base = ehHoje(dia) ? new Date() : new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 9)
  base.setSeconds(0, 0)
  base.setMinutes(base.getMinutes() + ((30 - (base.getMinutes() % 30)) % 30))
  return base
}

export default function Agenda({ ativa }: { ativa: boolean }) {
  const [modo, setModo] = useState<Modo>('Semana')
  const [ref, setRef] = useState(() => new Date())
  const [agenda, setAgenda] = useState<Dados | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<Evento | null>(null)
  const [formulario, setFormulario] = useState<Form | null>(null)
  const [busca, setBusca] = useState('')
  const [, setAgora] = useState(0)
  const txt = pessoasTxt.use()
  const { abrirEvento } = nav.use()
  const pedido = useRef(0)

  const pessoas = txt.split(',').filter((x) => x.includes('@'))
  const todos = [...(agenda?.eventos ?? []), ...(agenda?.pessoas ?? []).flatMap((p) => p.eventos)]
  const semana = Array.from({ length: 7 }, (_, i) => maisDias(segunda(ref), i))

  // o período carregado (os dois dias inclusive): no mês, a grade inteira, com as pontas das semanas
  const [de, ate] =
    modo === 'Dia' ? [ref, ref]
    : modo === 'Semana' ? [semana[0], semana[6]]
    : [segunda(new Date(ref.getFullYear(), ref.getMonth(), 1)), maisDias(segunda(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)), 6)]

  const titulo =
    modo === 'Dia' ? diaLongo(ref)
    : modo === 'Semana'
      ? `${semana[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${semana[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  async function carregar() {
    const n = ++pedido.current
    setCarregando(true)
    const [a, msg] = await ler<Dados>(['--agenda-json', diaLocal(de), diaLocal(ate), ...(txt ? [txt] : [])])
    if (n !== pedido.current) return // já pediram outro período: esta resposta ficou velha
    setCarregando(false)
    if (a) setAgenda(a)
    setAviso(msg)
  }

  useEffect(() => {
    if (ativa) carregar()
  }, [ativa, diaLocal(de), diaLocal(ate), txt])

  useACada(() => setAgora(Date.now()), 60_000, ativa) // a linha de agora anda

  useEffect(() => {
    // o clique na notificação de evento adicionado ou remarcado
    if (!abrirEvento) return
    atendido('abrirEvento')
    ler<Evento>(['--evento-json', abrirEvento]).then(([e, msg]) => {
      if (e) (setRef(data(e.ini)), setAberto(e))
      else setAviso(msg)
    })
  }, [abrirEvento])

  function mover(n: number) {
    if (modo === 'Dia') return setRef(maisDias(ref, n))
    if (modo === 'Semana') return setRef(maisDias(ref, 7 * n))
    // um mês: o dia 31 vira o último dia do mês seguinte, não transborda
    const ultimo = new Date(ref.getFullYear(), ref.getMonth() + n + 1, 0).getDate()
    setRef(new Date(ref.getFullYear(), ref.getMonth() + n, Math.min(ref.getDate(), ultimo), ref.getHours(), ref.getMinutes()))
  }

  // a sugestão escolhida (ou a vírgula digitada, ou o Enter) fecha o email: vira uma pessoa
  function mudarBusca(t: string) {
    if (!t.includes(',')) return setBusca(t)
    const partes = t.split(',').map((x) => x.trim())
    const novas = partes.slice(0, -1).map((p) => (p.split('<').pop() ?? p).replace('>', '').toLowerCase()).filter((e) => e.includes('@'))
    setBusca(partes[partes.length - 1])
    pessoasTxt.set([...new Set([...pessoas, ...novas])].slice(0, 8).join(','))
  }

  // o evento aberto segue o recarregado (o projeto escolhido aparece no menu)
  const detalhe = aberto && (todos.find((e) => e.id === aberto.id) ?? aberto)
  const novo = (inicio: Date) => setFormulario(formNovo(inicio))

  return (
    <div className="ag">
      <div className="ag-topo">
        <h1 className="titulo-tela">Agenda</h1>
        <span className="ag-subtitulo texto2">{titulo}</span>
        <span className="espaco" />
        {carregando && <Carregando />}
        <div className="linha-h ag-navega">
          <Botao onClick={() => mover(-1)} aria-label="Anterior">
            <ChevronLeft size={14} />
          </Botao>
          <Botao onClick={() => setRef(new Date())}>Hoje</Botao>
          <Botao onClick={() => mover(1)} aria-label="Próximo">
            <ChevronRight size={14} />
          </Botao>
        </div>
        <Segmentos valor={modo} opcoes={MODOS.map((m) => ({ valor: m, rotulo: m }))} mudar={setModo} />
        <Botao tipo="primario" onClick={() => novo(proximaMeiaHora(ref))}>
          <Plus size={14} /> Novo evento
        </Botao>
        <Botao onClick={carregar} title="Atualizar">
          <RotateCw size={14} />
        </Botao>
      </div>
      {aviso && (
        <div className="ag-aviso">
          <Aviso texto={aviso} />
        </div>
      )}
      <div className="ag-com">
        <Users size={15} className="texto2" />
        <CampoEmails rotulo="Reunião com…" texto={busca} mudar={mudarBusca} largura={320} />
        <div className="ag-pessoas">
          {pessoas.map((email, i) => {
            const info = agenda?.pessoas?.find((p) => p.email === email)
            return (
              <span key={email} className="chip" title={email}>
                {/* a foto com o anel na cor da pessoa: a cor é a dos eventos dela na agenda */}
                <Avatar nome={info?.nome} email={email} foto={info?.foto} cor={CORES_PESSOAS[i % CORES_PESSOAS.length]} tamanho={18} />
                {info?.nome ?? email.split('@')[0]}
                {info?.erro && (
                  <span title={info.erro} className="ag-laranja">
                    <TriangleAlert size={12} />
                  </span>
                )}
                <Botao tipo="icone" title="Tirar da agenda" onClick={() => pessoasTxt.set(pessoas.filter((x) => x !== email).join(','))}>
                  <X size={11} strokeWidth={3} />
                </Botao>
              </span>
            )
          })}
        </div>
        {pessoas.length > 1 && (
          <Botao tipo="link" onClick={() => pessoasTxt.set('')}>
            Limpar
          </Botao>
        )}
      </div>
      <div className="ag-corpo">
        {modo === 'Mês' ? (
          <Mes base={ref} eventos={todos} abrir={setAberto} irDia={(d) => (setRef(d), setModo('Dia'))} />
        ) : (
          <GradeHoras key={modo} dias={modo === 'Dia' ? [inicioDia(ref)] : semana} eventos={todos} abrir={setAberto} novo={novo} />
        )}
      </div>
      {detalhe && (
        <Detalhe
          key={detalhe.id}
          evento={detalhe}
          projetos={agenda?.projetos ?? []}
          fechar={() => setAberto(null)}
          editar={() => (setAberto(null), setFormulario(formDe(detalhe)))}
          mudou={carregar}
        />
      )}
      {formulario && <EventoForm inicial={formulario} fechar={() => setFormulario(null)} salvou={() => (setFormulario(null), carregar())} />}
    </div>
  )
}

// ---------- grade de horas (dia e semana) ----------
function GradeHoras(p: { dias: Date[]; eventos: Evento[]; abrir: (e: Evento) => void; novo: (d: Date) => void }) {
  const rolagem = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (rolagem.current) rolagem.current.scrollTop = 7 * ALTURA_HORA // abre nas 7h
  }, [])
  const inteiros = p.dias.map((d) => p.eventos.filter((e) => e.dia_inteiro && cobre(e, d)))
  return (
    <div className="ag-grade">
      <div className="ag-faixa">
        <div className="ag-col-hora" />
        {p.dias.map((d) => (
          <div key={diaLocal(d)} className="ag-dia-cab">
            <span className="texto2 pequeno-texto">{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
            <span className={`ag-num ${ehHoje(d) ? 'hoje' : ''}`}>{d.getDate()}</span>
          </div>
        ))}
      </div>
      {inteiros.some((l) => l.length) && (
        <div className="ag-faixa ag-inteiros">
          <div className="ag-col-hora texto2">dia todo</div>
          {inteiros.map((l, i) => (
            <div key={i} className="ag-inteiros-dia">
              {l.map((e) => (
                <Chip key={e.id} evento={e} abrir={p.abrir} />
              ))}
            </div>
          ))}
        </div>
      )}
      <div ref={rolagem} className="ag-grade-corpo">
        <div className="ag-col-hora">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="ag-hora texto2" style={{ height: ALTURA_HORA }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {p.dias.map((d) => (
          <Coluna key={diaLocal(d)} dia={d} eventos={p.eventos} abrir={p.abrir} novo={p.novo} />
        ))}
      </div>
    </div>
  )
}

function Coluna({ dia, eventos, abrir, novo }: { dia: Date; eventos: Evento[]; abrir: (e: Evento) => void; novo: (d: Date) => void }) {
  const ini = inicioDia(dia).getTime() / 1000
  const doDia = eventos.filter((e) => !e.dia_inteiro && cobre(e, dia)).sort((a, b) => a.ini - b.ini)
  // faixas para os que se sobrepõem: cada evento na primeira faixa livre
  const fins: number[] = []
  const faixa: Record<string, number> = {}
  for (const e of doDia) {
    const i = fins.findIndex((f) => f <= e.ini)
    if (i >= 0) (fins[i] = e.fim, faixa[e.id] = i)
    else (faixa[e.id] = fins.length, fins.push(e.fim))
  }
  const faixas = Math.max(1, fins.length)
  return (
    <div
      className="ag-coluna"
      style={{ height: ALTURA_HORA * 24, backgroundSize: `100% ${ALTURA_HORA}px` }}
      onClick={(ev) => {
        // a meia hora em que clicou
        const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top
        novo(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, Math.floor(((y / ALTURA_HORA) * 60) / 30) * 30))
      }}
    >
      {doDia.map((e) => {
        const topo = Math.max(0, (e.ini - ini) / 3600) * ALTURA_HORA
        const fundo = Math.min(24, (e.fim - ini) / 3600) * ALTURA_HORA
        return (
          <Bloco
            key={e.id}
            evento={e}
            abrir={abrir}
            estilo={{
              top: topo + 1,
              height: Math.max(18, fundo - topo - 2),
              left: `calc(${(faixa[e.id] * 100) / faixas}% + 1px)`,
              width: `max(10px, calc(${100 / faixas}% - 3px))`
            }}
          />
        )
      })}
      {ehHoje(dia) && <div className="ag-agora" style={{ top: ((Date.now() / 1000 - ini) / 3600) * ALTURA_HORA }} />}
    </div>
  )
}

function Bloco({ evento: e, abrir, estilo }: { evento: Evento; abrir: (e: Evento) => void; estilo: CSSProperties }) {
  const outros = e.convidados.filter((c) => !c.eu)
  return (
    <button
      type="button"
      className={`ag-bloco ${recusado(e) ? 'recusado' : ''}`}
      style={{ ...estilo, ['--cor' as string]: corEvento(e) }}
      title={e.titulo}
      onClick={(ev) => (ev.stopPropagation(), abrir(e))}
    >
      <strong className="ag-bloco-titulo">
        {/* evento da agenda de outra pessoa ("Reunião com…"): a foto dela na frente, como no Google */}
        {e.pessoa && <Avatar email={e.pessoa} foto={e.pessoa_foto} tamanho={14} />}
        {e.titulo}
      </strong>
      <span className="texto2">
        {fmtHora(data(e.ini))} – {fmtHora(data(e.fim))}
      </span>
      {/* quem vai junto, nas reuniões de 1 h ou mais (nas curtas não cabe): até 4 fotos e o resto em número */}
      {!e.pessoa && e.fim - e.ini >= 3600 && outros.length > 0 && (
        <span className="ag-bloco-gente">
          {outros.slice(0, 4).map((c) => (
            <Avatar key={c.email} nome={c.nome} email={c.email} foto={c.foto} tamanho={16} />
          ))}
          {outros.length > 4 && <span className="texto2">+{outros.length - 4}</span>}
        </span>
      )}
    </button>
  )
}

function Chip({ evento: e, abrir }: { evento: Evento; abrir: (e: Evento) => void }) {
  return (
    <button
      type="button"
      className={`ag-chip ${e.dia_inteiro ? 'inteiro' : ''} ${recusado(e) ? 'recusado' : ''}`}
      style={{ ['--cor' as string]: corEvento(e) }}
      title={e.titulo}
      onClick={(ev) => (ev.stopPropagation(), abrir(e))}
    >
      {!e.dia_inteiro && (
        <>
          <Bolinha cor={corEvento(e)} tamanho={6} />
          <span className="texto2">{fmtHora(data(e.ini))}</span>
        </>
      )}
      <span className="ag-chip-titulo">{e.titulo}</span>
    </button>
  )
}

// ---------- mês ----------
function Mes({ base, eventos, abrir, irDia }: { base: Date; eventos: Evento[]; abrir: (e: Evento) => void; irDia: (d: Date) => void }) {
  const ini = segunda(new Date(base.getFullYear(), base.getMonth(), 1))
  const dias = Array.from({ length: 42 }, (_, i) => maisDias(ini, i))
  const doMes = (d: Date) => d.getMonth() === base.getMonth() && d.getFullYear() === base.getFullYear()
  const semanas = [0, 1, 2, 3, 4, 5].filter((s) => doMes(dias[s * 7]) || doMes(dias[s * 7 + 6]))
  return (
    <div className="ag-mes">
      <div className="ag-mes-cab">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {semanas.map((s) => (
        <div key={s} className="ag-mes-semana">
          {dias.slice(s * 7, s * 7 + 7).map((d) => {
            const doDia = eventos
              .filter((e) => cobre(e, d))
              .sort((a, b) => Number(!a.dia_inteiro) - Number(!b.dia_inteiro) || a.ini - b.ini)
            return (
              <div key={diaLocal(d)} className={`ag-celula ${doMes(d) ? '' : 'fora'}`}>
                <button type="button" className={`ag-num pequeno ${ehHoje(d) ? 'hoje' : ''}`} title="Abrir o dia" onClick={() => irDia(d)}>
                  {d.getDate()}
                </button>
                {doDia.slice(0, 3).map((e) => (
                  <Chip key={e.id} evento={e} abrir={abrir} />
                ))}
                {doDia.length > 3 && (
                  <button type="button" className="ag-mais texto2" onClick={() => irDia(d)}>
                    +{doDia.length - 3}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---------- um evento ----------
/** A descrição do Google vem às vezes em HTML: vira texto. */
const textoDaDescricao = (s: string) =>
  s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()

function IconeResposta({ r }: { r?: string | null }) {
  if (r === 'accepted') return <CircleCheck size={14} className="ag-verde" />
  if (r === 'declined') return <CircleX size={14} className="ag-vermelho" />
  if (r === 'tentative') return <CircleHelp size={14} className="ag-laranja" />
  return <Circle size={14} className="texto2" />
}

function Detalhe({ evento: e, projetos, fechar, editar, mudou }: {
  evento: Evento; projetos: Projeto[]; fechar: () => void; editar: () => void; mudou: () => void
}) {
  const [contexto, setContexto] = useState(e.contexto ?? '')
  const [aviso, setAviso] = useState<string | null>(null)
  const [pedindo, setPedindo] = useState<'apagar' | 'outro' | null>(null) // um modal por vez: o Esc fecha só ele
  const [avisarApagar, setAvisarApagar] = useState(true)
  const [textoOutro, setTextoOutro] = useState('')
  const semConvidados = !e.convidados.some((c) => !c.eu)
  const ini = data(e.ini)
  const quando = e.dia_inteiro ? `${diaLongo(ini)} · dia todo` : `${diaLongo(ini)} · ${fmtHora(ini)} – ${fmtHora(data(e.fim))}`
  const desc = textoDaDescricao(e.descricao)

  // o projeto e o contexto que vão para as horas (o mesmo registro da aba Horas)
  async function horas(p: string) {
    const erro = await fazer(['--reuniao-ajuste', String(e.ini), e.titulo, p, contexto])
    setAviso(erro)
    if (!erro) mudou()
  }
  async function preparar() {
    const erro = await fazer(['--reuniao-preparar', String(e.ini), e.titulo])
    if (erro) setAviso(erro)
    else (fechar(), irPara('jfy'))
  }
  async function apagar(avisar: boolean) {
    setPedindo(null)
    const erro = await fazer(['--evento-apagar', e.id, ...(avisar && !semConvidados ? ['1'] : [])])
    if (erro) setAviso(erro)
    else (mudou(), fechar())
  }

  if (pedindo === 'apagar')
    return (
      <Modal
        titulo={`Apagar "${e.titulo}"?`}
        fechar={() => setPedindo(null)}
        acoes={
          <>
            <Botao onClick={() => setPedindo(null)}>Cancelar</Botao>
            <Botao tipo="perigo" onClick={() => apagar(avisarApagar)}>
              {'Apagar' + (avisarApagar && !semConvidados ? ' e avisar os convidados' : '')}
            </Botao>
            {!semConvidados && (
              <Botao tipo="perigo" onClick={() => (setAvisarApagar(!avisarApagar), apagar(!avisarApagar))}>
                {avisarApagar ? 'Apagar sem avisar' : 'Apagar e avisar'}
              </Botao>
            )}
          </>
        }
      >
        <p>{e.recorrente ? 'Só esta ocorrência sai da agenda.' : 'O evento sai da agenda.'}</p>
      </Modal>
    )

  if (pedindo === 'outro') {
    const ok = () => (setPedindo(null), textoOutro && horas(textoOutro))
    return (
      <Modal
        titulo="Projeto no Journify"
        fechar={() => setPedindo(null)}
        acoes={
          <>
            <Botao onClick={() => setPedindo(null)}>Cancelar</Botao>
            <Botao tipo="primario" onClick={ok}>OK</Botao>
          </>
        }
      >
        <Campo autoFocus placeholder="ex.: Souv" value={textoOutro} onChange={(ev) => setTextoOutro(ev.target.value)}
          onKeyDown={(ev) => ev.key === 'Enter' && ok()} />
      </Modal>
    )
  }

  return (
    <Modal
      titulo={e.titulo}
      largura={560}
      fechar={fechar}
      acoes={
        <>
          {e.url && (
            <Botao tipo="link" onClick={() => api.abrirLink(e.url!)}>
              Abrir no Google Agenda
            </Botao>
          )}
          <span className="espaco" />
          {e.pode_editar && (
            <>
              <Botao tipo="perigo" onClick={() => setPedindo('apagar')}>Apagar</Botao>
              <Botao onClick={editar}>Editar</Botao>
            </>
          )}
          <Botao onClick={fechar}>Fechar</Botao>
        </>
      }
    >
      <div className="ag-detalhe selecionavel">
        <div className="linha-h">
          <Bolinha cor={corEvento(e)} tamanho={12} />
          <span className="texto2">{quando}</span>
        </div>
        {e.recorrente && <span className="texto2 pequeno-texto">Evento recorrente: editar ou apagar vale só para esta ocorrência.</span>}
        <Aviso texto={aviso} />
        {e.link && (
          <div>
            <Botao tipo="primario" onClick={() => api.abrirLink(e.link!)}>
              <Video size={14} /> Entrar na chamada
            </Botao>
          </div>
        )}
        {e.local && !e.local.startsWith('http') && (
          <span className="linha-h">
            <MapPin size={14} className="texto2" /> {e.local}
          </span>
        )}
        {e.organizador && (
          <span className="linha-h">
            <User size={14} className="texto2" /> Organizado por {e.eu_organizo ? 'você' : e.organizador}
          </span>
        )}
        {e.convidados.length > 0 && (
          <div className="pilha ag-secao">
            <span className="ag-rotulo">CONVIDADOS ({e.convidados.length})</span>
            {e.convidados.map((c) => (
              <span key={c.email} className="linha-h" title={c.email}>
                {/* a resposta no cantinho da foto, como no Google */}
                <span className="ag-convidado-foto">
                  <Avatar nome={c.nome} email={c.email} foto={c.foto} tamanho={22} />
                  <span className="ag-convidado-resposta">
                    <IconeResposta r={c.resposta} />
                  </span>
                </span>
                {(c.nome ?? c.email) + (c.eu ? ' (você)' : '')}
              </span>
            ))}
          </div>
        )}
        {desc && (
          <div className="pilha ag-secao">
            <span className="ag-rotulo">DESCRIÇÃO</span>
            <div className="ag-descricao">{desc}</div>
          </div>
        )}
        {!e.dia_inteiro && !e.pessoa && ( // agenda de outra pessoa: não vai para as suas horas
          <div className="pilha ag-secao">
            <span className="ag-rotulo">PARA AS HORAS</span>
            <div className="linha-h ag-horas">
              <Select
                largura={180}
                opcoes={projetos.map((x) => ({ valor: x.id, rotulo: x.nome, cor: x.cor }))}
                valor={e.p}
                vazio="sem projeto"
                rotuloLivre={e.projeto}
                corLivre={e.cor}
                extra={['Outro nome no Journify…', () => (setTextoOutro(''), setPedindo('outro'))]}
                mudar={horas}
              />
              {e.palpite && <span className="texto2 pequeno-texto ag-fixo">pelo título</span>}
              <Campo
                placeholder="contexto (vira a descrição nas horas)"
                value={contexto}
                disabled={!e.p}
                onChange={(ev) => setContexto(ev.target.value)}
                onKeyDown={(ev) => ev.key === 'Enter' && e.p && horas(e.p)}
              />
              <Botao disabled={!e.p} onClick={preparar} title="Abre numa aba do jfy">
                Preparar com o Claude
              </Botao>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------- novo e editar ----------
type Form = {
  eventoId?: string; titulo: string; diaInteiro: boolean; inicio: Date; fim: Date; local: string; descricao: string
  convidados: string; temChamada: boolean; meet: boolean; avisar: boolean
}
const formNovo = (inicio: Date): Form => ({
  titulo: '', diaInteiro: false, inicio, fim: new Date(inicio.getTime() + 1800_000), local: '', descricao: '', convidados: '',
  temChamada: false, meet: true, avisar: true
})
const formDe = (e: Evento): Form => ({
  eventoId: e.id, titulo: e.titulo, diaInteiro: e.dia_inteiro, inicio: data(e.ini),
  fim: data(e.dia_inteiro ? e.fim - 86400 : e.fim), // no dia inteiro, o Google guarda o dia seguinte
  local: e.local ?? '', descricao: e.descricao, convidados: e.convidados.filter((c) => !c.eu).map((c) => c.email).join(', '),
  temChamada: !!e.link, meet: false, avisar: true
})

function EventoForm({ inicial, fechar, salvou }: { inicial: Form; fechar: () => void; salvou: () => void }) {
  const [form, setForm] = useState(inicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const mudar = (m: Partial<Form>) => setForm((f) => ({ ...f, ...m }))
  const lista = form.convidados.split(/[,;\s]+/).filter((x) => x.includes('@'))
  const pode = !!form.titulo.trim() && !salvando && (form.diaInteiro || form.fim > form.inicio)

  async function salvar() {
    if (!pode) return
    const d: Record<string, unknown> = {
      titulo: form.titulo, dia_inteiro: form.diaInteiro, local: form.local, descricao: form.descricao, convidados: lista,
      meet: form.meet, avisar: form.avisar && lista.length > 0
    }
    if (form.eventoId) d.id = form.eventoId
    if (form.diaInteiro) {
      d.ini = diaLocal(form.inicio)
      d.fim = diaLocal(form.fim > form.inicio ? form.fim : form.inicio)
    } else {
      d.ini = form.inicio.getTime() / 1000
      d.fim = form.fim.getTime() / 1000
    }
    setSalvando(true)
    const [r, msg] = await ler<Evento>(['--evento-salvar', JSON.stringify(d)])
    setSalvando(false)
    if (r) salvou()
    else setAviso(msg)
  }

  // Enter salva (o botão padrão do Mac), menos na descrição, num botão ou quando o campo já usou o Enter
  const enter = (ev: KeyboardEvent) => {
    const alvo = ev.target as HTMLElement
    if (ev.key === 'Enter' && !ev.defaultPrevented && alvo.tagName !== 'TEXTAREA' && alvo.tagName !== 'BUTTON') salvar()
  }

  return (
    <Modal
      titulo={form.eventoId ? 'Editar evento' : 'Novo evento'}
      largura={560}
      fechar={fechar}
      acoes={
        <>
          {salvando && <Carregando />}
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao tipo="primario" disabled={!pode} onClick={salvar}>
            {form.eventoId ? 'Salvar' : 'Criar'}
          </Botao>
        </>
      }
    >
      <div className="pilha ag-form" onKeyDown={enter}>
        <Campo autoFocus className="ag-titulo-campo" placeholder="Título" value={form.titulo} onChange={(ev) => mudar({ titulo: ev.target.value })} />
        <Caixa marcado={form.diaInteiro} mudar={(v) => mudar({ diaInteiro: v })}>Dia inteiro</Caixa>
        <div className="linha-h">
          <span className="texto2 ag-rotulo-data">Início</span>
          {/* mudar o início leva o fim junto: mantém a duração */}
          <CampoData data={form.inicio} comHora={!form.diaInteiro}
            mudar={(d) => setForm((f) => ({ ...f, inicio: d, fim: new Date(f.fim.getTime() + d.getTime() - f.inicio.getTime()) }))} />
        </div>
        <div className="linha-h">
          <span className="texto2 ag-rotulo-data">Fim</span>
          <CampoData data={form.fim} comHora={!form.diaInteiro} mudar={(d) => mudar({ fim: d })} />
        </div>
        <Campo placeholder="Local" value={form.local} onChange={(ev) => mudar({ local: ev.target.value })} />
        <CampoEmails rotulo="Convidados" texto={form.convidados} mudar={(t) => mudar({ convidados: t })} />
        <span className="texto2 pequeno-texto">Descrição</span>
        <AreaTexto style={{ height: 90 }} value={form.descricao} onChange={(ev) => mudar({ descricao: ev.target.value })} />
        {!form.temChamada && (
          <Caixa marcado={form.meet} mudar={(v) => mudar({ meet: v })}>Criar chamada do Google Meet</Caixa>
        )}
        {lista.length > 0 && (
          <Caixa marcado={form.avisar} mudar={(v) => mudar({ avisar: v })}>
            Mandar o convite (ou a atualização) por email aos convidados
          </Caixa>
        )}
        <Aviso texto={aviso} />
      </div>
    </Modal>
  )
}
