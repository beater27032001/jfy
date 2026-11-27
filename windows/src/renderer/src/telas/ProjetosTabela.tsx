// A segunda forma de ver as tasks, como no ClickUp (TabelaTasks em app/Sources/JFY/TabelaTasks.swift): uma tabela
// agrupada (status, prazo, prioridade, etapa ou responsável), com grupos que recolhem, busca e filtros. Status,
// prioridade e vencimento mudam ali mesmo (clique na célula); a bolinha da esquerda marca para mudar em lote; o clique no
// resto da linha abre a task ao lado. As colunas que não cabem somem, das menos importantes para as mais.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Calendar, Check, ChevronDown, Circle, CircleCheck, Flag, ListFilter, Search, User, UserPlus } from 'lucide-react'
import { loja } from '../estado'
import { Bolinha, Botao, Calendario, Flutuante, Select, dataLocal, diaLocal } from '../souv'
import { PEDE_VIDEO, PRIORIDADES, PedirVideo, StatusChip, corPrioridade, corStatus, fmtPontos, rotulo, rotuloPrioridade, type Resumo } from './ProjetosTask'

const GRUPOS = ['Status', 'Prazo', 'Prioridade', 'Etapa', 'Responsável', 'Sem grupo'] as const
type Grupo = (typeof GRUPOS)[number]
const grupoLembrado = loja<Grupo>('Status', 'tabela.grupo') // a mesma chave do @AppStorage do app do Mac

type Coluna = 'status' | 'vencimento' | 'projeto' | 'prioridade' | 'resp' | 'pontos' | 'etapa'
// na ordem de importância: quando falta espaço, a última some primeiro
const COLUNAS: Coluna[] = ['status', 'vencimento', 'projeto', 'prioridade', 'resp', 'pontos', 'etapa']
const LARGURA: Record<Coluna, number> = { status: 150, vencimento: 112, projeto: 130, prioridade: 92, resp: 56, pontos: 56, etapa: 120 }
const TITULO: Record<Coluna, string> = {
  status: 'STATUS', vencimento: 'VENCIMENTO', projeto: 'PROJETO', prioridade: 'PRIOR.', resp: 'RESP.', pontos: 'PTS', etapa: 'ETAPA'
}
const EDITAVEIS = new Set<Coluna>(['status', 'prioridade', 'vencimento'])
const FAIXAS_PRAZO = ['Atrasadas', 'Hoje', 'Próximos 7 dias', 'Depois', 'Sem prazo', 'Encerradas']
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function faixaPrazo(t: Resumo) {
  if (PEDE_VIDEO.has(t.status)) return 'Encerradas'
  if (t.dias == null) return 'Sem prazo'
  return t.dias < 0 ? 'Atrasadas' : t.dias === 0 ? 'Hoje' : t.dias <= 7 ? 'Próximos 7 dias' : 'Depois'
}

type G = { chave: string; titulo: string; cor: string | null; itens: Resumo[] }

/** As etapas na ordem da tela do projeto (o menor etapa_n de cada uma). */
function ordemEtapas(ts: Resumo[]) {
  const n = new Map<string, number>()
  for (const t of ts) n.set(t.etapa, Math.min(n.get(t.etapa) ?? Infinity, t.etapa_n))
  return [...n].sort((x, y) => x[1] - y[1]).map(([e]) => e)
}

/** Uma cópia do conjunto com o valor trocado: tira se está, põe se não está. */
function alternar(s: Set<string>, v: string) {
  const n = new Set(s)
  if (n.has(v)) n.delete(v)
  else n.add(v)
  return n
}

export function TabelaTasks(p: {
  tasks: Resumo[]
  statusOrdem: string[]
  comProjeto: boolean // no Foco, as tasks são de vários projetos
  pontos: Record<string, number>
  marcadas: Set<string>
  setMarcadas: (s: Set<string>) => void
  aberta: string | null
  abrir: (tid: string) => void
  /** (task, campo, valor, extra): campo status, prioridade ou prazo; extra = link do vídeo do teste (ou o motivo) */
  mudar: (tid: string, campo: string, valor: string, extra: string) => void
}) {
  const grupo = grupoLembrado.use()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<Set<string>>(new Set())
  const [filtroPrioridade, setFiltroPrioridade] = useState<Set<string>>(new Set())
  const [filtroPrazo, setFiltroPrazo] = useState<Set<string>>(new Set())
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
  const [pedidoVideo, setPedidoVideo] = useState<{ tid: string; status: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const largura = useLargura(ref)

  // as colunas que cabem: o nome fica com pelo menos 220; o resto entra na ordem de importância
  let sobra = largura - 24 - 18 - 12 - 220
  const cabem: Coluna[] = []
  for (const c of COLUNAS) {
    if ((c !== 'projeto' || p.comProjeto) && sobra >= LARGURA[c] + 12) (cabem.push(c), (sobra -= LARGURA[c] + 12))
  }
  const cols = (['projeto', 'status', 'prioridade', 'resp', 'pontos', 'vencimento', 'etapa'] as Coluna[]).filter((c) => cabem.includes(c)) // a ordem na tela

  const b = semAcento(busca)
  const filtradas = p.tasks.filter(
    (t) =>
      (!b || semAcento(t.titulo).includes(b)) &&
      (!filtroStatus.size || filtroStatus.has(t.status)) &&
      (!filtroPrioridade.size || filtroPrioridade.has(t.prioridade ?? '')) &&
      (!filtroPrazo.size || filtroPrazo.has(faixaPrazo(t)))
  )

  function juntar(ordem: string[], chave: (t: Resumo) => string, titulo: (k: string) => string, cor: (k: string) => string | null): G[] {
    const por = new Map<string, Resumo[]>()
    for (const t of filtradas) por.set(chave(t), [...(por.get(chave(t)) ?? []), t])
    const chaves = [...ordem.filter((k) => por.has(k)), ...[...por.keys()].filter((k) => !ordem.includes(k)).sort()]
    return chaves.map((k) => ({ chave: k, titulo: titulo(k), cor: cor(k), itens: por.get(k)! }))
  }
  const grupos: G[] =
    grupo === 'Status' ? juntar(p.statusOrdem, (t) => t.status, rotulo, corStatus)
    : grupo === 'Prazo' ? juntar(FAIXAS_PRAZO, faixaPrazo, (k) => k, (k) => (k === 'Atrasadas' ? '#ff3b30' : k === 'Hoje' ? '#ff9500' : null))
    : grupo === 'Prioridade' ? juntar([...PRIORIDADES, ''], (t) => t.prioridade ?? '', (k) => (k ? rotuloPrioridade(k) : 'Sem prioridade'), corPrioridade)
    : grupo === 'Etapa'
      ? juntar(ordemEtapas(filtradas), (t) => t.etapa, (k) => k, () => null)
    : grupo === 'Responsável'
      ? juntar(['Você', 'Outras pessoas', 'Sem responsável'],
          (t) => (t.eu ? 'Você' : (t.resp ?? 0) > 0 ? 'Outras pessoas' : 'Sem responsável'), (k) => k, () => null)
    : filtradas.length ? [{ chave: 'todas', titulo: 'Todas', cor: null, itens: filtradas }] : []

  const algumFiltro = filtroStatus.size || filtroPrioridade.size || filtroPrazo.size || busca

  function celula(c: Coluna, t: Resumo): ReactNode {
    switch (c) {
      case 'status':
        return (
          <CelulaMenu
            title="Mudar o status"
            opcoes={p.statusOrdem.map((s) => [s, rotulo(s), corStatus(s)])}
            atual={t.status}
            escolher={(s) => (PEDE_VIDEO.has(s) ? setPedidoVideo({ tid: t.id, status: s }) : p.mudar(t.id, 'status', s, ''))}
          >
            <StatusChip status={t.status} dias={t.dias} />
          </CelulaMenu>
        )
      case 'prioridade':
        return (
          <CelulaMenu
            title="Mudar a prioridade"
            opcoes={PRIORIDADES.map((x) => [x, rotuloPrioridade(x), corPrioridade(x)])}
            atual={t.prioridade}
            escolher={(x) => p.mudar(t.id, 'prioridade', x, '')}
          >
            <span className="linha-h pj-gap4">
              <Flag size={12} fill="currentColor" style={{ color: corPrioridade(t.prioridade ?? '') ?? 'color-mix(in srgb, var(--texto2) 40%, transparent)' }} />
              <span className="texto2 pequeno-texto">{t.prioridade ? rotuloPrioridade(t.prioridade) : '—'}</span>
            </span>
          </CelulaMenu>
        )
      case 'vencimento':
        return <CelulaPrazo prazo={t.prazo} atrasada={(t.dias ?? 0) < 0 && faixaPrazo(t) !== 'Encerradas'} mudar={(d) => p.mudar(t.id, 'prazo', d, '')} />
      case 'projeto':
        return (
          <span className="linha-h pj-gap4">
            <Bolinha cor={t.cor} tamanho={7} />
            <span className="pj-corta">{t.projeto ?? '—'}</span>
          </span>
        )
      case 'resp':
        return t.eu ? (
          <span className="pj-voce">você</span>
        ) : (t.resp ?? 0) > 0 ? (
          <span className="linha-h pj-gap4 texto2 pequeno-texto">
            <User size={12} fill="currentColor" /> {t.resp}
          </span>
        ) : (
          <span title="Sem responsável" className="pj-apagado">
            <UserPlus size={14} />
          </span>
        )
      case 'pontos': {
        const pts = p.pontos[t.id]
        return (
          <span className={`pequeno-texto ${pts == null ? 'pj-apagado' : ''}`} title="Os pontos mudam no Journify: o MCP não grava a estimativa">
            {pts != null ? `${fmtPontos(pts)} pts` : '—'}
          </span>
        )
      }
      case 'etapa':
        return (
          <span className="texto2 pequeno-texto pj-corta" title="A etapa segue o status: mude o status para a task mudar de etapa">
            {t.etapa}
          </span>
        )
    }
  }

  return (
    <div ref={ref} className="pj-tabela">
      <div className="linha-h pj-filtros">
        <label className="pj-busca">
          <Search size={13} className="texto2" />
          <input placeholder="Buscar task" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <FiltroMulti
          titulo="Status"
          opcoes={p.statusOrdem.filter((s) => p.tasks.some((t) => t.status === s)).map((s) => [s, rotulo(s), corStatus(s)])}
          marcados={filtroStatus}
          mudar={setFiltroStatus}
        />
        <FiltroMulti titulo="Prioridade" opcoes={PRIORIDADES.map((x) => [x, rotuloPrioridade(x), corPrioridade(x)])} marcados={filtroPrioridade} mudar={setFiltroPrioridade} />
        <FiltroMulti titulo="Prazo" opcoes={FAIXAS_PRAZO.map((x) => [x, x, null])} marcados={filtroPrazo} mudar={setFiltroPrazo} />
        {!!algumFiltro && (
          <Botao tipo="link" onClick={() => (setFiltroStatus(new Set()), setFiltroPrioridade(new Set()), setFiltroPrazo(new Set()), setBusca(''))}>
            Limpar
          </Botao>
        )}
        <span className="espaco" />
        <Select
          largura={130}
          title="Agrupar por"
          opcoes={GRUPOS.map((g) => ({ valor: g, rotulo: g }))}
          valor={grupo}
          mudar={(g) => (grupoLembrado.set(g), setRecolhidos(new Set()))}
        />
      </div>
      <div className="pj-tab-linha pj-tab-cabecalho">
        <span style={{ width: 18 }} />
        <span className="pj-tab-nome">NOME</span>
        {cols.map((c) => (
          <span key={c} style={{ width: LARGURA[c] }}>{TITULO[c]}</span>
        ))}
      </div>
      <div className="rolavel pj-tab-corpo">
        {grupos.map((g) => {
          const fechado = recolhidos.has(g.chave)
          const ids = g.itens.map((t) => t.id)
          const todos = ids.every((id) => p.marcadas.has(id))
          return (
            <div key={g.chave}>
              <div className="linha-h pj-grupo">
                <button
                  type="button"
                  className="pj-marca"
                  title="Marcar o grupo todo"
                  onClick={() => {
                    const n = new Set(p.marcadas)
                    ids.forEach((id) => (todos ? n.delete(id) : n.add(id)))
                    p.setMarcadas(n)
                  }}
                >
                  {todos ? <CircleCheck size={16} className="destaque" /> : <Circle size={16} className="texto2" />}
                </button>
                <button type="button" className="linha-h pj-grupo-titulo" onClick={() => setRecolhidos(alternar(recolhidos, g.chave))}>
                  <ChevronDown size={11} strokeWidth={3} className="texto2" style={{ transform: fechado ? 'rotate(-90deg)' : undefined }} />
                  <span className="pj-capsula" style={{ background: `color-mix(in srgb, ${g.cor ?? 'var(--texto2)'} 16%, transparent)` }}>
                    {g.cor && <Bolinha cor={g.cor} tamanho={7} />}
                    {g.titulo.toUpperCase()}
                  </span>
                  <span className="texto2 pequeno-texto">{g.itens.length}</span>
                </button>
              </div>
              {!fechado &&
                g.itens.map((t) => {
                  const marcada = p.marcadas.has(t.id)
                  return (
                    <div
                      key={t.id}
                      className={`pj-tab-linha pj-tab-task ${p.aberta === t.id ? 'aberta' : marcada ? 'marcada' : ''}`}
                      onClick={() => p.abrir(t.id)}
                    >
                      <button type="button" className="pj-marca" onClick={(e) => (e.stopPropagation(), p.setMarcadas(alternar(p.marcadas, t.id)))}>
                        {marcada ? <CircleCheck size={16} className="destaque" /> : <Circle size={16} className="texto2" />}
                      </button>
                      <span className="pj-tab-nome pj-corta" title={t.titulo}>{t.titulo}</span>
                      {cols.map((c) => (
                        // as células que editam não abrem a task (nem o clique na lista que flutua delas, que sobe pelo React)
                        <span key={c} style={{ width: LARGURA[c] }} onClick={(e) => EDITAVEIS.has(c) && e.stopPropagation()}>
                          {celula(c, t)}
                        </span>
                      ))}
                    </div>
                  )
                })}
            </div>
          )
        })}
        {!grupos.length && <div className="texto2 pj-sem-filtro">Nenhuma task com esses filtros.</div>}
      </div>
      {pedidoVideo && (
        <PedirVideo
          status={pedidoVideo.status}
          botao="Mover"
          fechar={() => setPedidoVideo(null)}
          mover={(v) => p.mudar(pedidoVideo.tid, 'status', pedidoVideo.status, v)}
        />
      )}
    </div>
  )
}

/** A largura do elemento, que muda com a janela. */
function useLargura(ref: React.RefObject<HTMLElement | null>) {
  const [l, setL] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const o = new ResizeObserver(([e]) => setL(e.contentRect.width))
    o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return l
}

type OpcaoLista = [valor: string, rotulo: string, cor: string | null]

/** Uma linha das listas que flutuam (célula e filtro): a bolinha, o rótulo e a marca no escolhido. */
function LinhaSelect({ o, marcado, apagado, acao }: { o: OpcaoLista; marcado: boolean; apagado?: boolean; acao: () => void }) {
  return (
    <button type="button" onClick={acao} className={apagado ? 'texto2' : ''}>
      {o[2] && <Bolinha cor={o[2]} />}
      <span className="rotulo">{o[1]}</span>
      {marcado && <Check size={13} strokeWidth={3} className="destaque" />}
    </button>
  )
}

/** Uma célula que edita no lugar: mostra o valor; o mouse por cima mostra que dá para mudar; o clique abre a lista. */
function CelulaMenu(p: { opcoes: OpcaoLista[]; atual?: string | null; escolher: (v: string) => void; title: string; children: ReactNode }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  return (
    <>
      <button type="button" className={`pj-celula ${ancora ? 'aberta' : ''}`} title={p.title} onClick={(e) => setAncora(ancora ? null : e.currentTarget)}>
        {p.children}
        <ChevronDown size={10} strokeWidth={3} className="texto2 pj-celula-seta" />
      </button>
      {ancora && (
        <Flutuante ancora={ancora} fechar={() => setAncora(null)} largura={200}>
          <div className="lista-menu">
            {p.opcoes.map((o) => (
              <LinhaSelect key={o[0]} o={o} marcado={o[0] === p.atual} acao={() => (setAncora(null), o[0] !== p.atual && p.escolher(o[0]))} />
            ))}
          </div>
        </Flutuante>
      )}
    </>
  )
}

/** O vencimento que muda no lugar: o clique abre o calendário. */
function CelulaPrazo({ prazo, atrasada, mudar }: { prazo?: string | null; atrasada: boolean; mudar: (dia: string) => void }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const [data, setData] = useState(new Date())
  const d = dataLocal(prazo)
  return (
    <>
      <button
        type="button"
        className={`pj-celula pequeno-texto ${ancora ? 'aberta' : ''}`}
        title="Mudar o vencimento"
        onClick={(e) => (setData(d ?? new Date()), setAncora(ancora ? null : e.currentTarget))}
      >
        {d ? (
          <span className={`linha-h pj-gap4 pj-numeros ${atrasada ? 'perigo-texto' : ''}`}>
            <Calendar size={12} /> {d.toLocaleDateString('pt-BR')}
          </span>
        ) : (
          <span className="linha-h pj-gap4 pj-apagado">
            <Calendar size={12} /> Venc.
          </span>
        )}
      </button>
      {ancora && (
        <Flutuante ancora={ancora} fechar={() => setAncora(null)}>
          <div className="pj-calendario">
            <Calendario data={data} mudar={setData} />
            <Botao tipo="primario" onClick={() => (setAncora(null), diaLocal(data) !== prazo && mudar(diaLocal(data)))}>
              Usar este dia
            </Botao>
          </div>
        </Flutuante>
      )}
    </>
  )
}

/** Um filtro de várias escolhas no estilo do select da Souv: o botão diz quantas estão ligadas; a lista marca e desmarca. */
export function FiltroMulti(p: { titulo: string; opcoes: OpcaoLista[]; marcados: Set<string>; mudar: (s: Set<string>) => void }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const n = p.marcados.size
  return (
    <>
      <button
        type="button"
        className={`pj-filtro ${n ? 'ligado' : ''} ${ancora ? 'aberto' : ''}`}
        onClick={(e) => setAncora(ancora ? null : e.currentTarget)}
      >
        <ListFilter size={12} /> {n ? `${p.titulo} · ${n}` : p.titulo}
      </button>
      {ancora && (
        <Flutuante ancora={ancora} fechar={() => setAncora(null)} largura={200}>
          <div className="lista-menu">
            {p.opcoes.map((o) => (
              <LinhaSelect
                key={o[0]}
                o={o}
                marcado={p.marcados.has(o[0])}
                acao={() => p.mudar(alternar(p.marcados, o[0]))}
              />
            ))}
            {n > 0 && (
              <>
                <hr />
                <LinhaSelect o={['', 'Limpar', null]} marcado={false} apagado acao={() => p.mudar(new Set())} />
              </>
            )}
          </div>
        </Flutuante>
      )}
    </>
  )
}
