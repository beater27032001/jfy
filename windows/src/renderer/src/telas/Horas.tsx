// As horas do dia para o minhas-horas, a mesma tabela do `h` do jfy: o que foi medido (tasks, terminal livre,
// reuniões), com os seus ajustes, e o que você registra à mão (app/Sources/JFY/Horas.swift no app do Mac). Quem lê e
// grava é o jfy (--horas-json, --horas-ajuste, --horas-nova, --horas-mover, --horas-lancar, este direto pelo MCP do
// Journify).
import { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck, Calendar, ChevronLeft, ChevronRight, CircleCheck, CirclePlus, Hand, Info, PencilLine, Trash2, TriangleAlert
} from 'lucide-react'
import { fazer, ler } from '../jfy'
import { Aviso, Botao, Calendario, Campo, CampoData, Carregando, Flutuante, Modal, Select, confirmar, diaLocal } from '../souv'
import './Horas.css'

type Item = {
  kid: string
  pid?: string | null; projeto?: string | null; cor?: string | null
  cat: string; desc: string
  med: number; lanc: number; trabalhado: number
  fixo?: number | null
  fora: boolean; reuniao: boolean; palpite: boolean
  estado?: 'lancada' | 'mudou' | 'nova' | null // com o dia no Journify
}
type Dados = {
  medido: number; pela_regra: number; total: number; corrigidas: number; fator: number
  itens: Item[]
  projetos: { id: string; nome: string; cor?: string | null }[]
  categorias: string[]
  // o dia como está no Journify (lido de lá): quantos lançamentos, quantas horas e quantos não são de linha nenhuma
  lancado?: { lancamentos: number; horas: number; removidas: number } | null
}
type Lancou = {
  novas: number; editadas: number; iguais: number
  sobrando: { projeto?: string | null; atividade?: string | null; horas: number }[] // no Journify sem ser linha da tabela
}

// ---------- formatos ----------
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min` : `${m}min`)
const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** "1 nova", "2 novas". */
const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
/** Horas do Journify (decimais) com vírgula: 6,5. */
const num = (h: number) => h.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const sem = (r: Record<string, string>, k: string) => {
  const { [k]: _, ...resto } = r
  return resto
}

export default function Horas({ ativa }: { ativa: boolean }) {
  const [dia, setDia] = useState(() => inicioDia(new Date()))
  const [horas, setHoras] = useState<Dados | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Record<string, string>>({}) // o que está sendo digitado, por "linha|campo"
  const [salvando, setSalvando] = useState<Set<string>>(new Set()) // "linha|campo" gravando agora
  const [movendo, setMovendo] = useState<{ item: Item; ancora: HTMLElement } | null>(null) // o seletor de dia aberto
  const [novoDia, setNovoDia] = useState(() => new Date())
  const [levou, setLevou] = useState<{ texto: string; dia: Date } | null>(null)
  const [outro, setOutro] = useState<{ item: Item | null; campo: 'p' | 'cat' } | null>(null) // nome fora da lista (item null: a linha nova)
  // o registro à mão: projeto, categoria, horas e descrição, como as linhas que o jfy mede sozinho
  const [nova, setNova] = useState<{ p: string; cat: string; min: string; desc: string } | null>(null)
  const [gravandoNova, setGravandoNova] = useState(false)
  const [textoOutro, setTextoOutro] = useState('')
  const [lancando, setLancando] = useState(false)
  const [lancou, setLancou] = useState<{ feito: string; sobrou: string | null } | null>(null) // o que o último lançamento fez

  const hoje = inicioDia(new Date())
  const iso = diaLocal(dia)
  const isoAtual = useRef(iso)
  isoAtual.current = iso
  const pedido = useRef(0)

  async function carregar() {
    const n = ++pedido.current
    const [h, msg] = await ler<Dados>(['--horas-json', isoAtual.current]) // o dia na tela agora, não o de quando pediu
    if (n !== pedido.current) return
    if (h) setHoras(h)
    setAviso(msg) // ex.: agenda fora, as reuniões não entraram
  }

  useEffect(() => {
    if (ativa) carregar()
  }, [ativa, iso])
  useEffect(() => (setLevou(null), setNova(null), setLancou(null)), [iso])

  const mudar = (n: number) => {
    const d = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + n)
    if (d <= hoje) setDia(d)
  }

  async function ajustar(it: Item, campo: string, valor: string) {
    const erro = await fazer(['--horas-ajuste', iso, it.kid, campo, valor])
    await carregar()
    if (erro) setAviso(erro)
  }

  /** Grava o que foi digitado num campo ("linha|campo"), se mudou. O campo segue mostrando o que você digitou até o
   * jfy devolver o dia recarregado; se o jfy recusar, o texto fica para você corrigir, com o aviso. */
  async function salvar(k: string) {
    const v = rascunho[k]
    const i = k.lastIndexOf('|')
    const it = horas?.itens.find((x) => x.kid === k.slice(0, i))
    if (salvando.has(k) || v === undefined || !it) return
    const campo = k.slice(i + 1)
    if (v === (campo === 'min' ? hm(it.trabalhado) : it.desc)) return setRascunho((r) => sem(r, k))
    setSalvando((s) => new Set(s).add(k))
    const erro = await fazer(['--horas-ajuste', iso, it.kid, campo, v])
    await carregar()
    setSalvando((s) => {
      const n = new Set(s)
      n.delete(k)
      return n
    })
    if (!erro) setRascunho((r) => (r[k] === v ? sem(r, k) : r)) // agora o valor vem do jfy
    else setAviso(erro)
  }

  /** Campo editável da tabela. Salva com Enter, ao sair do campo ou no ✓ que aparece enquanto há algo não salvo; Esc
   * desfaz. */
  function campo(it: Item, c: 'min' | 'desc', atual: string, dica: string) {
    const k = `${it.kid}|${c}`
    const pendente = rascunho[k] !== undefined && rascunho[k] !== atual
    return (
      <span className="hr-campo">
        <Campo
          placeholder={dica}
          value={rascunho[k] ?? atual}
          onChange={(ev) => setRascunho((r) => ({ ...r, [k]: ev.target.value }))}
          onBlur={() => salvar(k)} // saiu do campo: salva o que ficou
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') salvar(k)
            if (ev.key === 'Escape') {
              setRascunho((r) => sem(r, k))
              const el = ev.currentTarget
              setTimeout(() => el.blur()) // depois de desfeito: o blur não salva o que foi desfeito
            }
          }}
        />
        {salvando.has(k) ? (
          <span title="Salvando…" className="hr-icone">
            <Carregando />
          </span>
        ) : (
          pendente && (
            <Botao tipo="icone" title="Salvar (Enter). Esc desfaz." onClick={() => salvar(k)}>
              <CircleCheck size={15} className="hr-verde" />
            </Botao>
          )
        )}
      </span>
    )
  }

  /** O seletor de dia de uma linha: o trabalhado vai junto e, se o outro dia já tem a mesma linha, soma. O jfy
   * confere a soma dos dois dias depois de mexer e, se não fechar, volta tudo como estava. */
  async function mover(it: Item, d: Date) {
    setMovendo(null)
    const [r, msg] = await ler<{ trabalhado: number; juntou: boolean }>(['--horas-mover', iso, it.kid, diaLocal(d)])
    await carregar()
    if (r) {
      setAviso(null)
      setLevou({ texto: `Levei ${hm(r.trabalhado)} para ${ddmm(d)}` + (r.juntou ? ', somando com a mesma linha de lá.' : '.'), dia: inicioDia(d) })
    } else setAviso(msg)
  }

  /** Lança o dia pelo MCP (o jfy edita o que já está lá e mudou e cria o resto) e diz o que fez. O que está no
   * Journify sem ser linha da tabela o jfy não apaga: vira o aviso laranja. */
  async function lancar(h: Dados) {
    const ok = await confirmar(
      h.lancado
        ? {
            titulo: 'Este dia já tem lançamentos no Journify. Lançar de novo?',
            mensagem: 'O que já está lá e mudou é editado, e só as linhas novas são criadas, sem duplicar.',
            botao: 'Lançar de novo'
          }
        : {
            titulo: `Lançar ${fmt(h.total)} de ${ddmm(dia)} no Journify?`,
            mensagem: 'Vai direto para o Journify, em segundos: cada linha vira um lançamento no Minhas Horas, ligado à task quando você escolheu isso ao encerrar a task.',
            botao: 'Lançar'
          }
    )
    if (!ok) return
    setLancando(true)
    setLancou(null)
    const [r, msg] = await ler<Lancou>(['--horas-lancar', iso])
    await carregar() // antes do aviso: o carregar troca o aviso
    setLancando(false)
    if (!r) return setAviso(msg)
    const s = r.sobrando
    setLancou({
      feito: `Lançado no Journify: ${qtd(r.novas, 'nova', 'novas')}, ${qtd(r.editadas, 'editada', 'editadas')}` +
        (r.iguais > 0 ? `, ${qtd(r.iguais, 'já estava igual', 'já estavam iguais')}` : '') + '.',
      sobrou: s.length
        ? `No Journify há ${qtd(s.length, 'lançamento', 'lançamentos')} desse dia que não ${s.length === 1 ? 'está' : 'estão'} na tabela: ` +
          s.map((x) => `${x.atividade || 'sem descrição'} (${num(x.horas)} h)`).join('; ') +
          '. O jfy não apaga: tire pelo Minhas Horas se não deviam estar lá.'
        : null
    })
  }

  const okOutro = () => {
    if (outro && textoOutro)
      outro.item ? ajustar(outro.item, outro.campo, textoOutro) : setNova((n) => n && { ...n, [outro.campo]: textoOutro })
    setOutro(null)
  }

  /** A linha nova vai para o mesmo registro do dia que o jfy usa para as tasks: depois dá para editar, levar para outro
   * dia, remover e lançar, como qualquer linha. */
  async function registrar() {
    if (!nova || !nova.p || !nova.cat || !nova.min.trim() || !nova.desc.trim() || gravandoNova) return
    setGravandoNova(true)
    const erro = await fazer(['--horas-nova', iso, nova.p, nova.cat, nova.min, nova.desc])
    setGravandoNova(false)
    if (erro) return setAviso(erro) // hora que o jfy não entendeu: o que foi digitado fica para corrigir
    setNova(null)
    setAviso(null)
    await carregar()
  }

  return (
    <div className="hr">
      <div className="hr-topo">
        <div className="pilha hr-titulo">
          <h1 className="titulo-tela">Horas</h1>
          <span className="texto2">{dia.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <span className="espaco" />
        <Botao onClick={() => mudar(-1)} title="Dia anterior">
          <ChevronLeft size={14} />
        </Botao>
        <CampoData data={dia} ate={hoje} mudar={(d) => setDia(inicioDia(d))} />
        <Botao onClick={() => mudar(1)} title="Próximo dia" disabled={dia >= hoje}>
          <ChevronRight size={14} />
        </Botao>
        <Botao onClick={() => setDia(hoje)} disabled={iso === diaLocal(hoje)}>
          Hoje
        </Botao>
      </div>
      {horas ? conteudo(horas) : (
        <div className="hr-centro">{aviso ? <Aviso texto={aviso} /> : <Carregando tamanho={20} />}</div>
      )}
      {outro && (
        <Modal
          titulo={outro.campo === 'p' ? 'Projeto no Journify' : 'Categoria'}
          fechar={() => setOutro(null)}
          acoes={
            <>
              <Botao onClick={() => setOutro(null)}>Cancelar</Botao>
              <Botao tipo="primario" onClick={okOutro}>OK</Botao>
            </>
          }
        >
          <Campo autoFocus placeholder={outro.campo === 'p' ? 'ex.: Souv' : 'ex.: Pesquisa'} value={textoOutro}
            onChange={(ev) => setTextoOutro(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && okOutro()} />
        </Modal>
      )}
      {movendo && (
        <Flutuante ancora={movendo.ancora} fechar={() => setMovendo(null)}>
          <div className="pilha hr-mover">
            <strong>Levar para outro dia</strong>
            <span className="texto2 hr-duas-linhas">{movendo.item.desc}</span>
            <Calendario data={novoDia} ate={hoje} mudar={setNovoDia} />
            <span className="texto2 pequeno-texto">
              O trabalhado ({hm(movendo.item.trabalhado)}) vai junto. Se lá já existe esta mesma linha, os dois somam.
            </span>
            <div className="linha-h">
              <span className="espaco" />
              <Botao onClick={() => setMovendo(null)}>Cancelar</Botao>
              <Botao tipo="primario" disabled={diaLocal(novoDia) === iso} onClick={() => mover(movendo.item, novoDia)}>
                Levar para {ddmm(novoDia)}
              </Botao>
            </div>
          </div>
        </Flutuante>
      )}
    </div>
  )

  // ---------- a tabela ----------
  function conteudo(h: Dados) {
    const vivos = h.itens.filter((it) => !it.fora)
    const fora = h.itens.filter((it) => it.fora)
    const semProjeto = vivos.filter((it) => !it.pid).length
    return (
      <>
        <div className="hr-resumo">
          <div className="pilha hr-total">
            <span className="texto2">Lançar</span>
            <strong>{fmt(h.total)}</strong>
          </div>
          {h.itens.length > 0 && (
            <span className="texto2">
              {`trabalhado ${fmt(h.medido)}` +
                (h.corrigidas > 0 ? ` (${h.corrigidas} corrigida${h.corrigidas === 1 ? '' : 's'} à mão)` : '') +
                ` · fator ×${h.fator.toLocaleString('pt-BR')} → ${fmt(h.pela_regra)}`}
            </span>
          )}
          <span className="espaco" />
          <Botao tipo="primario" disabled={!vivos.length || lancando} onClick={() => lancar(h)}>
            {lancando ? (
              <>
                <Carregando /> Lançando…
              </>
            ) : h.lancado ? 'Lançar de novo…' : 'Lançar no Journify…'}
          </Botao>
        </div>
        {h.lancado && <AvisoLancado l={h.lancado} />}
        {lancou && (
          <>
            <Aviso tipo="ok" texto={lancou.feito} fechar={() => setLancou(null)} />
            <Aviso tipo="alerta" texto={lancou.sobrou} />
          </>
        )}
        {semProjeto > 0 && (
          <span className="linha-h hr-laranja">
            <TriangleAlert size={14} />
            {semProjeto} linha(s) sem projeto: escolha na coluna Projeto antes de lançar.
          </span>
        )}
        {aviso && (
          <span className="linha-h texto2 selecionavel">
            <Info size={14} className="hr-icone" />
            {aviso}
          </span>
        )}
        {levou && (
          <span className="linha-h">
            <CircleCheck size={14} className="hr-verde" />
            <span className="hr-verde">{levou.texto}</span>
            <Botao tipo="link" onClick={() => (setDia(levou.dia), setLevou(null))}>
              Ver {ddmm(levou.dia)}
            </Botao>
          </span>
        )}
        {h.itens.length === 0 ? (
          <div className="hr-centro texto2">Nada medido nesse dia: nenhuma task ou terminal livre pelo jfy e nenhuma reunião na agenda.</div>
        ) : (
          <>
            <div className="hr-tabela">
              <div className="hr-linha hr-cab">
                <span>Projeto</span>
                <span>Categoria</span>
                <span>Trabalhado</span>
                <span>Lança</span>
                <span>Descrição</span>
                <span />
              </div>
              {vivos.map((it) => (
                <div key={it.kid} className="hr-linha">
                  <span className="linha-h">
                    <Select
                      opcoes={h.projetos.map((p) => ({ valor: p.id, rotulo: p.nome, cor: p.cor }))}
                      valor={it.pid}
                      vazio="sem projeto"
                      rotuloLivre={it.projeto}
                      corLivre={it.cor}
                      extra={['Outro nome no Journify…', () => (setTextoOutro(''), setOutro({ item: it, campo: 'p' }))]}
                      mudar={(v) => ajustar(it, 'p', v)}
                    />
                    {it.palpite && <span className="texto2 pequeno-texto hr-fixo">pelo título</span>}
                  </span>
                  <span className="linha-h">
                    <Select
                      opcoes={[...new Set([...h.categorias, it.cat])].sort().map((c) => ({ valor: c, rotulo: c }))}
                      valor={it.cat}
                      mudar={(v) => ajustar(it, 'cat', v)}
                    />
                  </span>
                  <span
                    className="linha-h hr-min"
                    title={`O tempo trabalhado (medido: ${hm(it.med)}). Corrija se o medido estiver errado: o fator vale em cima. Enter, clicar fora ou o ✓ salva; vazio volta ao medido; Esc desfaz.`}
                  >
                    {campo(it, 'min', hm(it.trabalhado), '1:20')}
                    {it.fixo != null && (
                      <span className="hr-icone texto2" title={`Corrigida à mão (o medido era ${hm(it.med)}). Apague e salve para voltar ao medido.`}>
                        <Hand size={14} />
                      </span>
                    )}
                  </span>
                  <span className="linha-h">
                    <strong className="hr-num" title="O que vai para o Journify: o trabalhado com a regra (fator, múltiplos de 5)">
                      {hm(it.lanc)}
                    </strong>
                    <MarcaLancada estado={it.estado} />
                  </span>
                  {campo(it, 'desc', it.desc, 'descrição')}
                  <span className="linha-h hr-acoes">
                    <Botao
                      tipo="icone"
                      disabled={it.reuniao}
                      title={it.reuniao ? 'Reunião fica no dia em que aconteceu, pela agenda' : 'Levar esta linha para outro dia'}
                      onClick={(ev) => (setNovoDia(dia), setMovendo(movendo?.item.kid === it.kid ? null : { item: it, ancora: ev.currentTarget }))}
                    >
                      <Calendar size={14} />
                    </Botao>
                    <Botao tipo="icone" title="Remover desse dia" onClick={() => ajustar(it, 'fora', '1')}>
                      <Trash2 size={14} />
                    </Botao>
                  </span>
                </div>
              ))}
            </div>
            {fora.length > 0 && (
              <div className="pilha hr-fora">
                <span className="texto2 pequeno-texto">Removidas desse dia</span>
                {fora.map((it) => (
                  <span key={it.kid} className="linha-h">
                    <span className="texto2 hr-uma-linha">{`${it.projeto ?? '?'} · ${it.desc}`}</span>
                    <Botao tipo="link" onClick={() => ajustar(it, 'fora', '')}>
                      Restaurar
                    </Botao>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {linhaNova(h)}
      </>
    )
  }

  // ---------- registrar à mão ----------
  function linhaNova(h: Dados) {
    if (!nova)
      return (
        <Botao
          tipo="link"
          className="hr-registrar"
          title="Um trabalho que o jfy não mediu (uma ligação, um trabalho fora do Claude): entra na tabela como as outras linhas"
          onClick={() => setNova({ p: '', cat: h.categorias.includes('Funcionalidade') ? 'Funcionalidade' : h.categorias[0] ?? '', min: '', desc: '' })}
        >
          <CirclePlus size={14} /> Registrar horas à mão
        </Botao>
      )
    const valida = !!(nova.p && nova.cat && nova.min.trim() && nova.desc.trim())
    const enter = (ev: React.KeyboardEvent) => {
      if (ev.key === 'Enter') registrar()
      if (ev.key === 'Escape') setNova(null)
    }
    const doMenu = h.projetos.find((x) => x.id === nova.p)
    return (
      <div className="hr-tabela hr-nova">
        <div className="hr-linha hr-cab">
          <span>Projeto</span>
          <span>Categoria</span>
          <span>Trabalhado</span>
          <span />
          <span>Descrição</span>
          <span />
        </div>
        <div className="hr-linha">
          <span className="linha-h">
            <Select
              opcoes={h.projetos.map((x) => ({ valor: x.id, rotulo: x.nome, cor: x.cor }))}
              valor={nova.p || null}
              vazio="projeto"
              rotuloLivre={!doMenu && nova.p ? nova.p : null}
              extra={['Outro nome no Journify…', () => (setTextoOutro(''), setOutro({ item: null, campo: 'p' }))]}
              mudar={(v) => setNova({ ...nova, p: v })}
            />
          </span>
          <span className="linha-h">
            <Select
              opcoes={[...new Set([...h.categorias, nova.cat].filter(Boolean))].sort().map((c) => ({ valor: c, rotulo: c }))}
              valor={nova.cat}
              mudar={(v) => setNova({ ...nova, cat: v })}
            />
          </span>
          <span className="hr-campo">
            <Campo autoFocus placeholder="1:20" value={nova.min} onChange={(ev) => setNova({ ...nova, min: ev.target.value })} onKeyDown={enter}
              title="1:20, 1h20, 80 (minutos) ou 1,5 (horas). O fator vale em cima, como nas outras linhas." />
          </span>
          <span />
          <span className="hr-campo">
            <Campo placeholder="o que você fez" value={nova.desc} onChange={(ev) => setNova({ ...nova, desc: ev.target.value })} onKeyDown={enter} />
          </span>
          <span className="linha-h hr-acoes">
            {gravandoNova ? (
              <Carregando />
            ) : (
              <Botao tipo="icone" disabled={!valida} title="Registrar (Enter)" onClick={registrar}>
                <CircleCheck size={16} className={valida ? 'hr-verde' : ''} />
              </Botao>
            )}
            <Botao tipo="icone" title="Cancelar (Esc)" onClick={() => setNova(null)}>
              <Trash2 size={14} />
            </Botao>
          </span>
        </div>
      </div>
    )
  }
}

// ---------- já lançado ----------
/** O dia já tem lançamentos no Journify: avisa antes de alguém lançar de novo (as marcas da coluna Lança dizem o quê). */
function AvisoLancado({ l }: { l: NonNullable<Dados['lancado']> }) {
  return (
    <div className="hr-lancado">
      <BadgeCheck size={16} className="destaque hr-icone" />
      <span>
        {`Este dia já tem ${qtd(l.lancamentos, 'lançamento', 'lançamentos')} no Journify (${num(l.horas)} h). ` +
          '✓ igual, ✎ mudou, + nova: lançar de novo edita o que mudou, sem duplicar.' +
          (l.removidas > 0 ? ` ${qtd(l.removidas, 'lançamento de lá não está', 'lançamentos de lá não estão')} na tabela.` : '')}
      </span>
    </div>
  )
}

function MarcaLancada({ estado }: { estado?: Item['estado'] }) {
  if (estado === 'lancada')
    return (
      <span title="Já está no Journify assim" className="hr-icone hr-verde">
        <CircleCheck size={14} />
      </span>
    )
  if (estado === 'mudou')
    return (
      <span title="No Journify com outras horas ou outra categoria: lançar de novo edita o que está lá" className="hr-icone hr-laranja">
        <PencilLine size={14} />
      </span>
    )
  if (estado === 'nova')
    return (
      <span title="Nova: ainda não está no Journify" className="hr-icone hr-azul">
        <CirclePlus size={14} />
      </span>
    )
  return null
}
