// Tela "Uso da IA" (app/Sources/JFY/Uso.swift): quanto o Claude Code gastou neste computador, lido das conversas pelo
// `jfy --uso [dias]`, e a avaliação do Claude sobre o seu jeito de usar (`jfy --uso-avaliar`). Os gráficos do Swift
// Charts viram SVG à mão. A barra dos limites, no topo da janela, fica no App.tsx.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BadgeCheck, ChevronDown, CircleDollarSign, Lightbulb, RefreshCw, Sparkles, SquareArrowUpRight, TriangleAlert } from 'lucide-react'
import { ler } from '../jfy'
import { irPara } from '../estado'
import { Aviso, Botao, Carregando, Segmentos, dataLocal, diaLocal } from '../souv'
import './Uso.css'

// ---------- dados: a saída do `jfy --uso [dias]` (snake_case, como vem do motor) ----------
type Linha = {
  nome?: string | null
  custo: number
  entrada: number
  saida: number
  cache_escrita: number
  cache_leitura: number
  respostas: number
  sessoes: number
  titulo?: string | null
  projeto?: string | null
  url?: string | null
  branch?: string | null
  task?: string | null
  inicio?: string | null
  contexto_max?: number | null
}
type Limite = { used_percentage: number; resets_at?: number | null }
type DiaProjeto = { dia: string; projeto: string; custo: number }
type DadosUso = {
  total: Linha
  economia_cache: number
  sem_preco: string[]
  custo_por_tipo: { entrada: number; saida: number; cache_escrita: number; cache_leitura: number }
  limites: { five_hour?: Limite | null; seven_day?: Limite | null }
  subagentes: { principal: number; subagentes: number }
  por_dia: Linha[]
  por_dia_projeto: DiaProjeto[]
  por_projeto: Linha[]
  por_modelo: Linha[]
  por_task: Linha[]
  sessoes: Linha[]
  ferramentas: { nome: string; chamadas: number; resultado_tokens: number }[]
}
type Avaliacao = {
  resumo?: string | null
  nota?: number | null
  acertos?: string[] | null
  problemas?: { titulo: string; detalhe: string; exemplo?: string | null }[] | null
  recomendacoes?: { titulo: string; como: string; antes?: string | null; depois?: string | null }[] | null
  economia?: string[] | null
  gerado?: number | null
  pedidos?: number | null
}

// ---------- formatos ----------
const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })
const dinheiroRedondo = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 })
const tok = (n: number) => n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const pct = (v: number) => v.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const num = (n: number) => n.toLocaleString('pt-BR')
const tokens = (l: Linha) => l.entrada + l.saida + l.cache_escrita + l.cache_leitura
const sessoesTxt = (n: number) => `${n} ${n === 1 ? 'sessão' : 'sessões'}`
const diaHora: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
function quando(iso?: string | null) {
  const d = iso ? new Date(iso) : null
  return d && !isNaN(+d) ? d.toLocaleString('pt-BR', diaHora) : ''
}
const fracao = (v: number) => Math.min(Math.max(v || 0, 0), 1)

// ---------- cores: paleta categórica de referência, com o passo do modo escuro (Uso.css) ----------
/** Ordem fixa: a cor segue o projeto pela posição no ranking do período, e os 6 primeiros têm cor própria. */
const SERIES = [0, 1, 2, 3, 4, 5].map((i) => `var(--us-s${i})`)
const OUTROS = 'var(--us-outros)'
const UMA = 'var(--primaria)' // ranking de uma série só: o Vivid Blue da Souv

// ---------- tela ----------
export default function Uso(_: { ativa: boolean }) {
  const [dias, setDias] = useState(30) // 0 = tudo
  const [uso, setUso] = useState<DadosUso | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null)
  const [avaliando, setAvaliando] = useState(false)
  const [erroAvaliacao, setErroAvaliacao] = useState<string | null>(null)
  // a resposta de um período que você já trocou não entra por cima do novo
  const periodo = useRef(dias)
  periodo.current = dias

  const carregar = async (d: number) => {
    setCarregando(true)
    const [u, msg] = await ler<DadosUso>(['--uso', ...(d > 0 ? [String(d)] : [])])
    if (periodo.current !== d) return
    setCarregando(false)
    if (u) (setUso(u), setErro(null))
    else setErro(msg)
  }

  useEffect(() => {
    setAvaliacao(null)
    setErroAvaliacao(null)
    ;(async () => {
      const [a] = await ler<Avaliacao>(['--uso-avaliar', String(dias), 'ver']) // a última, sem gastar
      if (periodo.current !== dias) return
      setAvaliacao(a)
      await carregar(dias)
    })()
  }, [dias])

  /** O Claude avalia o período: o que já funciona, onde está o atrito e como melhorar (com exemplos seus). */
  const avaliar = async () => {
    const d = dias
    setAvaliando(true)
    setErroAvaliacao(null)
    const [a, msg] = await ler<Avaliacao>(['--uso-avaliar', String(d)])
    setAvaliando(false)
    if (periodo.current !== d) return // fica guardada: aparece quando você voltar a esse período
    if (a) setAvaliacao(a)
    else setErroAvaliacao(msg)
  }

  return (
    <div className="us-tela">
      <div className="linha-h us-topo">
        <div className="pilha" style={{ gap: 4 }}>
          <h1 className="titulo-tela">Uso da IA</h1>
          <span className="texto2">Claude Code neste computador. Custo em US$ pelo preço da API: na assinatura é o valor equivalente, não a conta.</span>
        </div>
        <span className="espaco" />
        <Segmentos
          valor={dias}
          opcoes={[{ valor: 1, rotulo: 'Hoje' }, { valor: 7, rotulo: '7 dias' }, { valor: 30, rotulo: '30 dias' }, { valor: 0, rotulo: 'Tudo' }]}
          mudar={setDias}
        />
        <Botao
          tipo="primario"
          disabled={avaliando}
          title="O Claude lê os seus pedidos e os sinais de atrito do período e diz como usar melhor (usa tokens)"
          onClick={avaliar}
        >
          <Sparkles size={14} />
          {avaliacao?.resumo == null ? 'Avaliar este período' : 'Avaliar de novo'}
        </Botao>
        <Botao tipo="icone" title="Atualizar" disabled={carregando} onClick={() => carregar(dias)}>
          <RefreshCw size={15} />
        </Botao>
      </div>
      {avaliando && (
        <div className="us-avaliando">
          <Carregando />
          <span className="texto2">O Claude está lendo os seus pedidos e os sinais de atrito do período. Leva uns 2 minutos.</span>
        </div>
      )}
      <Aviso texto={erroAvaliacao} />
      {avaliacao?.resumo != null && !avaliando && <CartaoAvaliacao a={avaliacao} />}
      <Aviso texto={erro} />
      {uso ? (
        <div style={{ opacity: carregando ? 0.5 : 1 }}>
          <Conteudo uso={uso} dias={dias} />
        </div>
      ) : (
        carregando && (
          <div className="us-lendo texto2">
            <Carregando /> Lendo as conversas do Claude Code…
          </div>
        )
      )}
    </div>
  )
}

function Conteudo({ uso, dias }: { uso: DadosUso; dias: number }) {
  const t = uso.total
  /** Os 6 projetos de maior custo têm cor; o resto vira "outros" (o jfy --uso já agrupa assim por dia). */
  const top = uso.por_projeto.slice(0, 6).map((l) => l.nome ?? '')
  const dominio = [...top, ...(uso.por_dia_projeto.some((p) => p.projeto === 'outros') ? ['outros'] : [])]
  const cor = (projeto?: string | null) => {
    const i = projeto == null ? -1 : top.indexOf(projeto)
    return i < 0 ? OUTROS : SERIES[i]
  }
  const entradas = t.entrada + t.cache_escrita + t.cache_leitura

  const ranking = (linhas: Linha[], corDe: (l: Linha) => string) => {
    const maior = linhas[0]?.custo ?? 1
    return (
      <div className="us-barras">
        {linhas.slice(0, 10).map((l) => (
          <Barra
            key={l.nome ?? 'total'}
            nome={l.nome ?? ''}
            valor={dinheiro(l.custo)}
            detalhe={`${tok(tokens(l))} tokens · ${sessoesTxt(l.sessoes)}`}
            fracao={maior > 0 ? l.custo / maior : 0}
            cor={corDe(l)}
          />
        ))}
      </div>
    )
  }

  const p = uso.custo_por_tipo
  const tipos: [string, number, string][] = [
    ['Leitura de cache', p.cache_leitura, 'o contexto relido a cada resposta'],
    ['Escrita de cache', p.cache_escrita, 'contexto novo: arquivos lidos, resultados de comandos'],
    ['Saída', p.saida, 'o que o Claude escreveu, com o raciocínio'],
    ['Entrada sem cache', p.entrada, '']
  ]
  const somaTipos = Math.max(tipos.reduce((s, x) => s + x[1], 0), 0.000001)
  const maiorTipo = Math.max(...tipos.map((x) => x[1])) || 1
  const maiorTask = uso.por_task[0]?.custo ?? 1
  const maiorFerramenta = uso.ferramentas[0]?.chamadas ?? 1
  const s = uso.subagentes
  const somaSub = Math.max(s.principal + s.subagentes, 0.000001)

  return (
    <div className="us-conteudo">
      <div className="us-kpis">
        <Kpi titulo="Custo equivalente" valor={dinheiro(t.custo)} detalhe={`o cache poupou ${dinheiro(uso.economia_cache)}`} />
        <Kpi
          titulo="Tokens"
          valor={tok(tokens(t))}
          detalhe={`${tok(t.saida)} de saída · ${pct(entradas > 0 ? t.cache_leitura / entradas : 0)} da entrada veio do cache`}
        />
        <Kpi
          titulo="Sessões"
          valor={String(t.sessoes)}
          detalhe={`${num(t.respostas)} respostas · ${dinheiro(t.sessoes > 0 ? t.custo / t.sessoes : 0)} por sessão`}
        />
        <KpiLimite titulo="Limite de 5 h" l={uso.limites.five_hour} fmt={{ hour: '2-digit', minute: '2-digit' }} />
        <KpiLimite titulo="Limite semanal" l={uso.limites.seven_day} fmt={{ weekday: 'short', hour: '2-digit', minute: '2-digit' }} />
      </div>

      <Cartao titulo="Custo por dia, por projeto">
        <Grafico itens={uso.por_dia_projeto} dias={dias} dominio={dominio} cor={(x) => cor(x === 'outros' ? null : x)} />
      </Cartao>

      <div className="us-grade">
        <Cartao titulo="Para onde foi o custo">
          <div className="us-barras">
            {tipos.map(([nome, v, det]) => (
              <Barra key={nome} nome={nome} valor={`${dinheiro(v)} · ${pct(v / somaTipos)}`} detalhe={det || null} fracao={v / maiorTipo} cor={UMA} />
            ))}
          </div>
        </Cartao>
        <Cartao titulo="Por projeto">{ranking(uso.por_projeto, (l) => cor(l.nome))}</Cartao>
        <Cartao titulo="Tasks do Journify">
          <div className="us-barras">
            {!uso.por_task.length && <span className="texto2">Nenhuma task aberta pelo jfy neste período.</span>}
            {uso.por_task.slice(0, 10).map((l) => {
              // o motor manda o link da task no Journify (…/projects/<pid>?task=<tid>): o pid sai dele
              const pid = l.url?.match(/\/projects\/([^/?]+)\?task=/)?.[1]
              return (
                <Barra
                  key={l.nome ?? ''}
                  nome={l.titulo ?? l.nome ?? ''}
                  valor={dinheiro(l.custo)}
                  detalhe={[l.projeto, sessoesTxt(l.sessoes)].filter(Boolean).join(' · ')}
                  fracao={maiorTask > 0 ? l.custo / maiorTask : 0}
                  cor={cor(l.projeto)}
                  abrir={pid && l.nome ? () => irPara('Projetos', { abrirTask: { pid, tid: l.nome! } }) : undefined}
                />
              )
            })}
          </div>
        </Cartao>
        <Cartao titulo="Por modelo">{ranking(uso.por_modelo, () => UMA)}</Cartao>
        <Cartao titulo="Ferramentas mais usadas">
          <div className="us-barras">
            {uso.ferramentas.slice(0, 10).map((f) => (
              <Barra
                key={f.nome}
                nome={f.nome}
                valor={`${num(f.chamadas)} chamadas`}
                detalhe={`trouxe ≈ ${tok(f.resultado_tokens)} tokens para o contexto`}
                fracao={f.chamadas / maiorFerramenta}
                cor={UMA}
              />
            ))}
          </div>
        </Cartao>
        <Cartao titulo="Principal × subagentes">
          <div className="us-barras">
            <Barra nome="Conversa principal" valor={`${dinheiro(s.principal)} · ${pct(s.principal / somaSub)}`} fracao={s.principal / somaSub} cor={UMA} />
            <Barra
              nome="Subagentes (pipeline, buscas)"
              valor={`${dinheiro(s.subagentes)} · ${pct(s.subagentes / somaSub)}`}
              fracao={s.subagentes / somaSub}
              cor={UMA}
            />
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Sessões mais caras">
        <div>
          {uso.sessoes.slice(0, 15).map((l) => (
            <div key={l.nome ?? ''} className="us-sessao">
              <span className="us-ponto" style={{ background: cor(l.projeto) }} />
              <div className="pilha us-sessao-texto">
                <span className="us-uma-linha">{l.titulo ?? '(sem título)'}</span>
                <span className="texto2 pequeno-texto us-uma-linha">
                  {[l.projeto, l.branch, quando(l.inicio), `${l.respostas} respostas`, l.contexto_max != null ? `contexto máx. ${tok(l.contexto_max)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <span className="us-num">{dinheiro(l.custo)}</span>
            </div>
          ))}
        </div>
      </Cartao>
      {uso.sem_preco.length > 0 && (
        <span className="texto2 pequeno-texto">Modelos sem preço na tabela do jfy (contam US$ 0): {uso.sem_preco.join(', ')}.</span>
      )}
    </div>
  )
}

// ---------- gráfico: barras empilhadas por dia, com o detalhe do dia ao passar o mouse ----------
/** A largura do elemento, acompanhando a janela: o SVG é desenhado em pixels de verdade (texto sem esticar). */
function useLargura() {
  const ref = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setLargura(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, largura] as const
}

/** O passo do eixo de custo: 1, 2 ou 5 vezes uma potência de 10, para uns 4 degraus. Nunca menos de US$ 1 (o rótulo não
 * tem centavos, como no app do Mac). */
function passoBonito(max: number) {
  const bruto = max / 4
  const p = 10 ** Math.floor(Math.log10(bruto))
  const m = bruto / p
  return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p)
}

const ALTURA = 230
const MARGEM = { topo: 8, direita: 58, baixo: 22 }

function Grafico({ itens, dias, dominio, cor }: { itens: DiaProjeto[]; dias: number; dominio: string[]; cor: (p: string) => string }) {
  const [caixa, largura] = useLargura()
  const [foco, setFoco] = useState<number | null>(null)

  // todos os dias do primeiro ao último com uso, inclusive os vazios (eixo de datas, como o Swift Charts)
  const porDia = new Map<string, DiaProjeto[]>()
  for (const p of itens) porDia.set(p.dia, [...(porDia.get(p.dia) ?? []), p])
  const chaves = [...porDia.keys()].sort()
  const diasEixo: string[] = []
  if (chaves.length) {
    for (const d = dataLocal(chaves[0])!; diaLocal(d) <= chaves[chaves.length - 1]; d.setDate(d.getDate() + 1)) diasEixo.push(diaLocal(d))
  }
  const n = diasEixo.length
  const larguraPlot = largura - MARGEM.direita
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.baixo
  const slot = n ? larguraPlot / n : 0
  const barra = Math.max(1, slot * 0.7)
  const totais = diasEixo.map((d) => (porDia.get(d) ?? []).reduce((s, p) => s + p.custo, 0))
  const passo = passoBonito(Math.max(...totais, 0.01))
  const teto = Math.max(passo, Math.ceil(Math.max(...totais, 0) / passo) * passo)
  const y = (v: number) => MARGEM.topo + alturaPlot - (v / teto) * alturaPlot
  const degraus = Array.from({ length: Math.round(teto / passo) + 1 }, (_, i) => i * passo)
  // um rótulo a cada 7 dias em períodos longos, a cada dia nos curtos; mais espaçado se não couber
  const base = dias === 0 || dias > 14 ? 7 : 1
  const cadaRotulo = base * Math.max(1, Math.ceil(44 / Math.max(slot * base, 1)))

  const mover = (e: React.MouseEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = Math.floor(x / slot)
    setFoco(x <= larguraPlot && i >= 0 && i < n ? i : null)
  }

  const itensFoco = foco != null ? [...(porDia.get(diasEixo[foco]) ?? [])].sort((a, b) => b.custo - a.custo) : []
  const xFoco = foco != null ? (foco + 0.5) * slot : 0

  return (
    <div className="us-grafico">
      <div className="us-legenda">
        {dominio.map((p) => (
          <span key={p}>
            <span className="us-ponto" style={{ background: cor(p) }} />
            {p}
          </span>
        ))}
      </div>
      <div ref={caixa} className="us-plot">
        {largura > 0 && n > 0 && (
          <svg width={largura} height={ALTURA} onMouseMove={mover} onMouseLeave={() => setFoco(null)}>
            {degraus.map((v) => (
              <g key={v}>
                <line x1={0} x2={larguraPlot} y1={y(v)} y2={y(v)} className="us-grade-linha" />
                <text x={larguraPlot + 6} y={y(v) + 4} className="us-eixo">{dinheiroRedondo(v)}</text>
              </g>
            ))}
            {foco != null && <rect x={xFoco - 7} y={MARGEM.topo} width={14} height={alturaPlot} className="us-foco" />}
            {diasEixo.map((d, i) => {
              let acumulado = 0
              const doDia = porDia.get(d) ?? []
              return (
                <g key={d}>
                  {dominio.map((proj) => {
                    const v = doDia.find((p) => p.projeto === proj)?.custo ?? 0
                    if (v <= 0) return null
                    const topo = y(acumulado + v)
                    const altura = y(acumulado) - topo
                    acumulado += v
                    return <rect key={proj} x={(i + 0.5) * slot - barra / 2} y={topo} width={barra} height={altura} rx={Math.min(2, barra / 2)} style={{ fill: cor(proj) }} />
                  })}
                  {i % cadaRotulo === 0 && (
                    <text x={(i + 0.5) * slot} y={ALTURA - 6} textAnchor="middle" className="us-eixo">
                      {dataLocal(d)!.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {foco != null && itensFoco.length > 0 && (
          <div className="us-dica" style={{ left: Math.max(0, Math.min(xFoco - 110, largura - 220)) }}>
            <strong>{dataLocal(diasEixo[foco])!.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
            {itensFoco.map((p) => (
              <div key={p.projeto} className="linha-h">
                <span className="us-quadrado" style={{ background: cor(p.projeto) }} />
                <span className="us-uma-linha">{p.projeto}</span>
                <span className="espaco" />
                <span className="us-num">{dinheiro(p.custo)}</span>
              </div>
            ))}
            <hr />
            <div className="linha-h">
              <strong>Total</strong>
              <span className="espaco" />
              <strong className="us-num">{dinheiro(itensFoco.reduce((s, p) => s + p.custo, 0))}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- peças ----------
function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="cartao us-cartao">
      <h4>{titulo}</h4>
      {children}
    </section>
  )
}

function Kpi({ titulo, valor, detalhe, fracao: f }: { titulo: string; valor: string; detalhe: string; fracao?: number }) {
  return (
    <div className="cartao us-kpi">
      <span className="texto2">{titulo}</span>
      <strong className="us-kpi-valor">{valor}</strong>
      {f != null && (
        <span className="us-trilho">
          <span style={{ width: `max(3px, ${fracao(f) * 100}%)` }} />
        </span>
      )}
      <span className="texto2 pequeno-texto us-duas-linhas">{detalhe}</span>
    </div>
  )
}

function KpiLimite({ titulo, l, fmt }: { titulo: string; l?: Limite | null; fmt: Intl.DateTimeFormatOptions }) {
  if (!l) return <Kpi titulo={titulo} valor="—" detalhe="sem leitura: abra uma sessão do Claude pelo jfy" />
  const renova = l.resets_at ? `renova ${new Date(l.resets_at * 1000).toLocaleString('pt-BR', fmt)}` : ''
  return <Kpi titulo={titulo} valor={pct(l.used_percentage / 100)} detalhe={renova} fracao={l.used_percentage / 100} />
}

function Barra(p: { nome: string; valor: string; detalhe?: string | null; fracao: number; cor: string; abrir?: () => void }) {
  return (
    <div className={`us-barra ${p.abrir ? 'clicavel' : ''}`} onClick={p.abrir} title={p.abrir ? 'Abrir a task em Projetos' : undefined}>
      <div className="linha-h">
        <span className="us-uma-linha">{p.nome}</span>
        {p.abrir && <SquareArrowUpRight size={12} className="texto2" style={{ flex: 'none' }} />}
        <span className="espaco" />
        <span className="us-num">{p.valor}</span>
      </div>
      {p.detalhe && <span className="texto2 pequeno-texto us-uma-linha">{p.detalhe}</span>}
      <span className="us-capsula" style={{ width: `max(3px, ${fracao(p.fracao) * 100}%)`, background: p.cor }} />
    </div>
  )
}

// ---------- a avaliação do Claude ----------
/** O resultado da avaliação: nota e diagnóstico, o que já funciona, onde está o atrito (com um pedido seu de exemplo),
 * como melhorar (com o antes e o depois) e onde dá para gastar menos. Recolhe pela setinha. */
function CartaoAvaliacao({ a }: { a: Avaliacao }) {
  const [aberto, setAberto] = useState(true)
  const rodape = [
    a.gerado ? `avaliado em ${new Date(a.gerado * 1000).toLocaleString('pt-BR', diaHora)}` : null,
    a.pedidos != null ? `${a.pedidos} pedidos lidos` : null,
    'usa tokens'
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="us-avaliacao selecionavel">
      <button type="button" className="us-avaliacao-cabeca" onClick={() => setAberto(!aberto)}>
        <Nota n={a.nota ?? 0} />
        <span className="pilha" style={{ gap: 3, flex: 1 }}>
          <h3>Avaliação do Claude</h3>
          <span className="texto2 pequeno-texto">{rodape}</span>
        </span>
        <ChevronDown size={16} className="texto2" style={{ transform: aberto ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
      </button>
      {a.resumo && <p className="us-resumo">{a.resumo}</p>}
      {aberto && (
        <>
          {!!a.acertos?.length && (
            <Secao titulo="O que já funciona" icone={<BadgeCheck size={13} />} cor="var(--us-verde)">
              {a.acertos.map((x, i) => <Item key={i} texto={x} />)}
            </Secao>
          )}
          {!!a.problemas?.length && (
            <Secao titulo="Onde está o atrito" icone={<TriangleAlert size={13} />} cor="var(--us-laranja)">
              {a.problemas.map((p, i) => (
                <div key={i} className="pilha" style={{ gap: 5 }}>
                  <strong>{p.titulo}</strong>
                  <span className="texto2">{p.detalhe}</span>
                  {p.exemplo && <Citacao texto={p.exemplo} cor="var(--us-laranja)" />}
                </div>
              ))}
            </Secao>
          )}
          {!!a.recomendacoes?.length && (
            <Secao titulo="Como melhorar" icone={<Lightbulb size={13} />} cor="var(--destaque)">
              {a.recomendacoes.map((r, i) => (
                <div key={i} className="pilha" style={{ gap: 6 }}>
                  <strong>{r.titulo}</strong>
                  <span className="texto2">{r.como}</span>
                  {r.antes && <Citacao texto={r.antes} cor="var(--us-vermelho)" rotulo="Antes" />}
                  {r.depois && <Citacao texto={r.depois} cor="var(--us-verde)" rotulo="Depois" />}
                </div>
              ))}
            </Secao>
          )}
          {!!a.economia?.length && (
            <Secao titulo="Para gastar menos" icone={<CircleDollarSign size={13} />} cor="var(--primaria)">
              {a.economia.map((x, i) => <Item key={i} texto={x} />)}
            </Secao>
          )}
        </>
      )}
    </section>
  )
}

function Nota({ n }: { n: number }) {
  const cor = n >= 8 ? 'var(--us-verde)' : n >= 5 ? 'var(--us-laranja)' : 'var(--us-vermelho)'
  const r = 23.5
  const volta = 2 * Math.PI * r
  return (
    <span className="us-nota" title="Nota de 0 a 10 para a eficiência do uso no período">
      <svg width={52} height={52}>
        <circle cx={26} cy={26} r={r} fill="none" strokeWidth={5} style={{ stroke: cor, opacity: 0.2 }} />
        {n > 0 && (
          <circle
            cx={26} cy={26} r={r} fill="none" strokeWidth={5} strokeLinecap="round" transform="rotate(-90 26 26)"
            strokeDasharray={volta} strokeDashoffset={volta * (1 - fracao(n / 10))} style={{ stroke: cor }}
          />
        )}
      </svg>
      <span>{n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span>
    </span>
  )
}

function Secao({ titulo, icone, cor, children }: { titulo: string; icone: ReactNode; cor: string; children: ReactNode }) {
  return (
    <div className="pilha" style={{ gap: 10 }}>
      <span className="us-secao" style={{ color: cor }}>
        {icone}
        {titulo}
      </span>
      {children}
    </div>
  )
}

function Item({ texto }: { texto: string }) {
  return (
    <div className="us-item">
      <span className="us-marcador" />
      <span>{texto}</span>
    </div>
  )
}

/** Um pedido seu (o exemplo, o antes ou o depois), com a barrinha da cor. */
function Citacao({ texto, cor, rotulo }: { texto: string; cor: string; rotulo?: string }) {
  return (
    <div className="us-citacao" style={{ borderLeftColor: cor, background: `color-mix(in srgb, ${cor} 7%, transparent)` }}>
      {rotulo && <span className="us-citacao-rotulo" style={{ color: cor }}>{rotulo}</span>}
      <span className="mono">{texto}</span>
    </div>
  )
}
