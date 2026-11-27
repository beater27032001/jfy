// Tela "Projetos" (ProjetosTela em app/Sources/JFY/Projetos.swift): projetos, as tasks em seções (a mesma ordem da
// tela do projeto no jfy) ou na tabela, e a task inteira, com status, prioridade e prazo por clique, anexos e
// comentários. Quem fala com o Journify é o jfy (--projetos-json, --tasks-json, --task-json, --task-mudar...).
import { useEffect, useRef, useState } from 'react'
import { Calendar, Check, ChevronDown, Circle, CircleCheck, Flame, Folder, FolderPlus, Info, ListChecks, List, Pencil, Plus, RefreshCw, Star, Table, X } from 'lucide-react'
import { api, fazer, ler } from '../jfy'
import { MAX_FAVORITOS, alternarFavorito, atendido, favoritos, loja, nav } from '../estado'
import { Aviso, Bolinha, Botao, Calendario, Caixa, Campo, Carregando, Flutuante, Linha, Modal, Segmentos, Select, dataLocal, diaLocal, menuContexto } from '../souv'
import { PEDE_VIDEO, PRIORIDADES, PedirVideo, StatusChip, TaskDetalhe, corPrioridade, corStatus, fmtPontos, rotulo, rotuloPrioridade, type Resumo } from './ProjetosTask'
import { TabelaTasks } from './ProjetosTabela'
import { ProjetoConteudo, SECOES } from './ProjetosConteudo'
import './Projetos.css'

type Projeto = { id: string; nome?: string | null; cor?: string | null; exemplo?: string | null; tasks: number; pastas?: string[] | null }
type Dados = { foco: Resumo[]; projetos: Projeto[]; status_lote: string[] }
type Lote = { ok: number; erros: { id: string; erro: string }[] }
/** O pedido do formulário de projeto: novo (sem pid) ou um que já existe (configurar ou editar). */
type PedidoProjeto = { pid?: string; nome?: string | null; pastas: string[] }

const FOCO = 'foco' // o item "Foco" da lista de projetos
const modoTabelaLembrado = loja(false, 'projetos.tabela') // a tabela agrupada, como no ClickUp; a mesma chave do app do Mac
// com o foco num campo ou botão, o Enter é dele
const focoEmControle = () => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(document.activeElement?.tagName ?? '')

export default function Projetos({ ativa }: { ativa: boolean }) {
  const n = nav.use()
  const favs = favoritos.use()
  const modoTabela = modoTabelaLembrado.use()
  const [dados, setDados] = useState<Dados | null>(null)
  const [projeto, setProjeto] = useState<string | null>(null)
  const [todas, setTodas] = useState(false)
  const [tasks, setTasks] = useState<Resumo[]>([])
  const [task, setTask] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [avisoFav, setAvisoFav] = useState<string | null>(null)
  // seleção (botão direito › Selecionar): bolinhas em todas as tasks para mudar status ou prazo de várias de uma vez
  const [selecionando, setSelecionando] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [resultadoLote, setResultadoLote] = useState<string | null>(null)
  const [pontos, setPontos] = useState<Record<string, number>>({}) // carregam depois da lista (as tasks que vieram sem pontos)
  const [configurando, setConfigurando] = useState<PedidoProjeto | null>(null)
  const [secao, setSecao] = useState('Tasks')
  const [versao, setVersao] = useState(0) // salvar um projeto relê as tasks mesmo sem trocar de projeto
  const deFora = useRef(false) // a task veio de outra tela (um PR): trocar de projeto não a fecha
  const atual = useRef({ projeto, todas, pontos })
  atual.current = { projeto, todas, pontos }

  /** O projeto escolhido de verdade (não o Foco): só ele tem as outras seções. */
  const projetoReal = projeto === FOCO ? null : projeto
  const naTask = secao === 'Tasks' || !projetoReal
  const statusOrdem = [...(dados?.status_lote ?? []), 'finalizado_validacao', 'fechado']
  const loteVisivel = naTask && (selecionando || (modoTabela && marcadas.size > 0))

  const sairDaSelecao = () => (setSelecionando(false), setMarcadas(new Set()))

  async function carregarProjetos() {
    const [d, msg] = await ler<Dados>(['--projetos-json'])
    if (d) {
      setDados(d)
      // favorito renomeado no jfy: a barra lateral acompanha o nome e a cor
      const antes = favoritos.get()
      const novos = antes.map((f) => {
        const p = d.projetos.find((x) => x.id === f.id)
        return p ? { id: f.id, nome: p.nome ?? f.nome, cor: p.cor } : f
      })
      if (JSON.stringify(novos) !== JSON.stringify(antes)) favoritos.set(novos)
    }
    setAviso(msg)
    const pedido = nav.get().abrirProjeto
    if (pedido) {
      // veio de um favorito da barra lateral
      setProjeto(pedido)
      atendido('abrirProjeto')
    } else if (atual.current.projeto == null) {
      setProjeto(d?.foco.length ? FOCO : (d?.projetos[0]?.id ?? null))
    }
  }

  async function carregarTasks() {
    const { projeto: p, todas: t } = atual.current
    if (!p) return
    const chave = `${p}|${t}`
    setCarregando(true)
    const [lista, msg] =
      p === FOCO
        ? await ler<Dados>(['--projetos-json']).then(([d, m]): [Resumo[] | null, string | null] => [d?.foco ?? null, m])
        : await ler<Resumo[]>(['--tasks-json', p, ...(t ? ['todas'] : [])])
    if (chave !== `${atual.current.projeto}|${atual.current.todas}`) return // trocou de projeto antes de chegar
    setCarregando(false)
    setTasks(lista ?? [])
    setAviso(msg)
    const faltam = (lista ?? []).map((x) => x.id).filter((id) => atual.current.pontos[id] == null)
    if (faltam.length) {
      // depois da lista, sem segurar a tela (o jfy guarda por 15 min)
      ler<Record<string, number>>(['--tasks-pontos', ...faltam]).then(([pts]) => pts && setPontos((a) => ({ ...a, ...pts })))
    }
  }

  useEffect(() => {
    if (ativa && !dados) carregarProjetos()
  }, [ativa])
  useEffect(() => void carregarTasks(), [projeto, todas, versao])
  useEffect(() => {
    if (!deFora.current) setTask(null)
    deFora.current = false
    sairDaSelecao()
  }, [projeto])
  useEffect(sairDaSelecao, [modoTabela, secao])

  // os pedidos das outras telas: o favorito da barra lateral abre o projeto; o PR (ou a Meu dia) abre a task
  useEffect(() => {
    if (!n.abrirProjeto || !dados) return // sem dados ainda: o carregarProjetos abre
    setProjeto(n.abrirProjeto)
    atendido('abrirProjeto')
  }, [n.abrirProjeto, dados])
  useEffect(() => {
    const ref = n.abrirTask
    if (!ref) return
    deFora.current = atual.current.projeto !== ref.pid
    setProjeto(ref.pid)
    setSecao('Tasks')
    setTask(ref.tid)
    atendido('abrirTask')
  }, [n.abrirTask])

  // Esc: limpa o lote, ou fecha a task aberta (o × do detalhe). Com menu ou modal aberto, quem fecha é ele
  useEffect(() => {
    if (!ativa || !(loteVisivel || task)) return
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.flutuante, .veu')) return
      if (loteVisivel) sairDaSelecao()
      else setTask(null)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [ativa, loteVisivel, task])

  /** Mudança feita na tabela (status, prioridade, vencimento): vai para o Journify e a lista relê. */
  async function mudarTask(tid: string, campo: string, valor: string, extra: string) {
    setCarregando(true)
    const e = await fazer(['--task-mudar', tid, campo, valor, ...(extra ? [extra] : [])])
    if (e) setResultadoLote(e)
    await carregarTasks()
  }

  async function aplicarLote(campo: string, valor: string, extra: string) {
    const ids = tasks.map((t) => t.id).filter((id) => marcadas.has(id)) // na ordem da lista
    if (!ids.length) return
    setCarregando(true)
    const [r, msg] = await ler<Lote>(['--tasks-mudar', campo, valor, ...(extra ? ['--extra=' + extra] : []), ...ids])
    if (r) {
      const titulo = (id: string) => tasks.find((t) => t.id === id)?.titulo ?? id
      setResultadoLote(
        `${r.ok} de ${ids.length} mudada${r.ok === 1 ? '' : 's'} no Journify.` +
          (r.erros.length ? ' Não mudaram: ' + r.erros.map((e) => `${titulo(e.id)} (${e.erro})`).join('; ') : '')
      )
      if (!r.erros.length) sairDaSelecao()
      else setMarcadas(new Set(r.erros.map((e) => e.id))) // ficam marcadas as que falharam
    } else setResultadoLote(msg)
    await carregarTasks()
  }

  function alternarEstrela(p: Projeto) {
    if (!alternarFavorito({ id: p.id, nome: p.nome ?? 'sem nome', cor: p.cor })) setAvisoFav(`Até ${MAX_FAVORITOS} favoritos: tire a estrela de um antes.`)
    else setAvisoFav(null)
  }

  const marcar = (id: string) => {
    const s = new Set(marcadas)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setMarcadas(s)
  }

  const tituloProjeto = projeto === FOCO ? 'Foco: prazo perto ou crítica' : (dados?.projetos.find((p) => p.id === projeto)?.nome ?? '')

  // ---------- projetos ----------
  const linhaProjeto = (p: Projeto) => {
    const fav = favs.some((f) => f.id === p.id)
    return (
      <Linha
        key={p.id}
        marcada={projeto === p.id}
        onClick={() => setProjeto(p.id)}
        onContextMenu={menuContexto(() => [
          {
            rotulo: p.nome ? 'Editar projeto…' : 'Configurar projeto…',
            icone: <Pencil size={13} />,
            acao: () => setConfigurando({ pid: p.id, nome: p.nome, pastas: p.pastas ?? [] })
          }
        ])}
      >
        <Bolinha cor={p.cor} />
        <span className="pilha pj-gap2 pj-min0 espaco">
          <span className={`pj-corta ${p.nome ? '' : 'texto2'}`}>{p.nome ?? 'sem nome'}</span>
          {p.exemplo && <span className="texto2 pj-legenda pj-corta">ex.: {p.exemplo}</span>}
        </span>
        {!p.nome && (
          <Botao
            pequeno
            title="Escolher a pasta e o nome deste projeto no jfy"
            onClick={(e) => (e.stopPropagation(), setConfigurando({ pid: p.id, nome: null, pastas: [] }))}
          >
            Configurar
          </Botao>
        )}
        {p.tasks > 0 && <span className="texto2 pequeno-texto pj-numeros">{p.tasks}</span>}
        <Botao
          tipo="icone"
          title={fav ? 'Tirar dos favoritos da barra lateral' : `Favoritar: aparece na barra lateral (até ${MAX_FAVORITOS})`}
          onClick={(e) => (e.stopPropagation(), alternarEstrela(p))}
        >
          <Star size={14} className={fav ? 'pj-estrela' : ''} fill={fav ? 'currentColor' : 'none'} />
        </Botao>
      </Linha>
    )
  }

  const listaProjetos = (
    <div className="coluna pj-projetos">
      <Aviso texto={avisoFav} tipo="info" fechar={() => setAvisoFav(null)} />
      <div className="lista">
        {dados ? (
          <>
            {dados.foco.length > 0 && (
              <Linha marcada={projeto === FOCO} onClick={() => setProjeto(FOCO)}>
                <span className="icone"><Flame size={15} /></span>
                <span className="rotulo">Foco ({dados.foco.length})</span>
              </Linha>
            )}
            {dados.projetos.some((p) => p.tasks > 0) && <div className="secao-titulo">Projetos</div>}
            {dados.projetos.filter((p) => p.tasks > 0).map(linhaProjeto)}
            {dados.projetos.some((p) => p.tasks === 0) && <div className="secao-titulo">Sem task sua</div>}
            {dados.projetos.filter((p) => p.tasks === 0).map(linhaProjeto)}
          </>
        ) : aviso ? (
          <div className="texto2 pj-pad8 selecionavel">{aviso}</div>
        ) : (
          <div className="pj-centro"><Carregando /></div>
        )}
      </div>
      <div className="linha-h pj-pad8">
        <Botao tipo="icone" title="Ligar um projeto do Journify a uma pasta deste computador" onClick={() => setConfigurando({ pastas: [] })}>
          <Plus size={14} /> Novo projeto
        </Botao>
        <span className="espaco" />
        <Botao tipo="icone" title="Atualizar" onClick={carregarProjetos}>
          <RefreshCw size={14} />
        </Botao>
      </div>
      {configurando && (
        <NovoProjeto
          pedido={configurando}
          semPasta={(dados?.projetos ?? []).filter((p) => !p.nome)}
          fechar={() => setConfigurando(null)}
          salvou={async (pid) => {
            setConfigurando(null)
            await carregarProjetos()
            setProjeto(pid)
            setVersao((v) => v + 1)
          }}
        />
      )}
    </div>
  )

  // ---------- tasks ----------
  /** O topo das tasks (nas duas formas): o projeto, Minhas/Todas e Lista/Tabela. */
  const cabecalhoTasks = (
    <>
      <div className="linha-h pj-pad12">
        <strong className="pj-corta pj-titulo-tasks">{tituloProjeto}</strong>
        <span className="espaco" />
        {projeto !== FOCO && projeto && (
          <Segmentos
            valor={todas ? 'todas' : 'minhas'}
            opcoes={[{ valor: 'minhas', rotulo: 'Minhas' }, { valor: 'todas', rotulo: 'Todas' }]}
            mudar={(v) => setTodas(v === 'todas')}
          />
        )}
        <Segmentos
          valor={modoTabela ? 'tabela' : 'lista'}
          opcoes={[
            { valor: 'lista', icone: <List size={14} />, ajuda: 'Lista' },
            { valor: 'tabela', icone: <Table size={14} />, ajuda: 'Tabela: agrupada, com filtros' }
          ]}
          mudar={(v) => modoTabelaLembrado.set(v === 'tabela')}
        />
      </div>
      {resultadoLote && (
        <div className="linha-h texto2 pequeno-texto selecionavel pj-resultado">
          <Info size={13} /> <span className="espaco">{resultadoLote}</span>
        </div>
      )}
    </>
  )

  const linhaTask = (t: Resumo) => (
    <Linha
      key={t.id}
      className="pj-linha-task"
      marcada={selecionando ? marcadas.has(t.id) : task === t.id}
      onClick={() => (selecionando ? marcar(t.id) : setTask(t.id))}
      onContextMenu={menuContexto(() =>
        selecionando
          ? [
              { rotulo: marcadas.has(t.id) ? 'Desmarcar' : 'Marcar', acao: () => marcar(t.id) },
              { rotulo: 'Sair da seleção', acao: sairDaSelecao }
            ]
          : [{ rotulo: 'Selecionar', acao: () => (setSelecionando(true), setMarcadas(new Set([t.id])), setResultadoLote(null)) }]
      )}
    >
      {selecionando && (marcadas.has(t.id) ? <CircleCheck size={16} className="destaque" /> : <Circle size={16} className="texto2" />)}
      <span className="pilha pj-gap3 pj-min0">
        <span className="pj-duas-linhas">{t.titulo}</span>
        <span className="linha-h texto2 pequeno-texto pj-quebra">
          {projeto === FOCO && (
            <span className="linha-h pj-gap4">
              <Bolinha cor={t.cor} tamanho={6} /> {t.projeto ?? ''}
            </span>
          )}
          <StatusChip status={t.status} dias={t.dias} />
          {t.prazo_txt && <span className={(t.dias ?? 99) <= 0 ? 'perigo-texto' : ''}>{t.prazo_txt}</span>}
          {(pontos[t.id] ?? t.pontos) != null && <span>{fmtPontos(pontos[t.id] ?? t.pontos!)} pts</span>}
        </span>
      </span>
    </Linha>
  )

  // as tasks nas seções da tela do projeto (etapas seguidas viram uma seção)
  const secoes: [string, Resumo[]][] = []
  for (const t of tasks) {
    const ultima = secoes[secoes.length - 1]
    if (ultima?.[0] === t.etapa) ultima[1].push(t)
    else secoes.push([t.etapa, [t]])
  }

  const detalhe = (tid: string) => <TaskDetalhe key={tid} tid={tid} mudou={carregarTasks} fechar={() => setTask(null)} />

  const listaTasks = (
    <div className="coluna pj-tasks pj-fundo">
      {cabecalhoTasks}
      <div className="pj-borda-baixo" />
      {carregando && !tasks.length ? (
        <div className="pj-centro"><Carregando /></div>
      ) : !tasks.length ? (
        <div className="pj-centro texto2 selecionavel">{projeto ? (aviso ?? 'Nenhuma task aqui.') : ''}</div>
      ) : (
        <div className="lista" style={{ opacity: carregando ? 0.5 : 1 }}>
          {secoes.map(([nome, itens], i) => (
            <div key={`${nome}${i}`}>
              <div className="secao-titulo">{nome}</div>
              {itens.map(linhaTask)}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const areaTabela = (
    <div className="pj-area pj-fundo">
      {cabecalhoTasks}
      {carregando && !tasks.length ? (
        <div className="pj-centro"><Carregando /></div>
      ) : !tasks.length ? (
        <div className="pj-centro texto2 selecionavel">{!projeto ? 'Escolha um projeto' : (aviso ?? 'Nenhuma task aqui.')}</div>
      ) : (
        <div className="pj-area" style={{ opacity: carregando ? 0.5 : 1 }}>
          <TabelaTasks
            tasks={tasks}
            statusOrdem={statusOrdem}
            comProjeto={projeto === FOCO}
            pontos={pontos}
            marcadas={marcadas}
            setMarcadas={setMarcadas}
            aberta={task}
            abrir={setTask}
            mudar={mudarTask}
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="pj">
      {listaProjetos}
      <div className="pj-area">
        {projetoReal && (
          // as seções do projeto, como as abas do projeto no Journify
          <div className="linha-h pj-secoes">
            {SECOES.map((s) => (
              <button type="button" key={s.nome} className={secao === s.nome ? 'marcada' : ''} onClick={() => setSecao(s.nome)}>
                <s.icone size={14} /> {s.nome}
              </button>
            ))}
          </div>
        )}
        {secao !== 'Tasks' && projetoReal ? (
          <ProjetoConteudo key={`${projetoReal}|${secao}`} secao={secao} pid={projetoReal} abrirTask={(tid) => (setSecao('Tasks'), setTask(tid))} />
        ) : modoTabela ? (
          areaTabela
        ) : (
          <div className="colunas">
            {listaTasks}
            <div className="painel pj-fundo">
              {task ? detalhe(task) : <div className="pj-centro texto2">{projeto ? 'Escolha uma task' : 'Escolha um projeto'}</div>}
            </div>
          </div>
        )}
      </div>
      {/* na tabela, a task abre ao lado, num painel que fecha */}
      {modoTabela && task && naTask && <div className="pj-inspetor">{detalhe(task)}</div>}
      {loteVisivel && (
        <BarraLote
          quantas={marcadas.size}
          total={tasks.length}
          statusOrdem={statusOrdem}
          ocupado={carregando}
          aplicar={aplicarLote}
          todas={() => setMarcadas(new Set(tasks.map((t) => t.id)))}
          limpar={sairDaSelecao}
        />
      )}
    </div>
  )
}

// ---------- o lote ----------
/** O painel das tasks marcadas, como no ClickUp: "Definir [status, prioridade ou prazo] para [o valor]" e Aplicar;
 * Limpar desmarca. Os status que pedem o vídeo do teste perguntam o link, que vale para todas. */
function BarraLote(p: {
  quantas: number
  total: number
  statusOrdem: string[]
  ocupado: boolean
  aplicar: (campo: string, valor: string, extra: string) => void // campo, valor, link do vídeo (ou motivo)
  todas: () => void
  limpar: () => void
}) {
  const [campo, setCampo] = useState('status')
  const [valor, setValor] = useState<string | null>(null)
  const [data, setData] = useState(new Date())
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const [pedindoVideo, setPedindoVideo] = useState(false)
  const pode = !!valor && p.quantas > 0 && !p.ocupado

  const aplicarAgora = () => {
    if (!pode) return
    if (campo === 'status' && PEDE_VIDEO.has(valor!)) setPedindoVideo(true)
    else (p.aplicar(campo, valor!, ''), setValor(null))
  }
  // Enter aplica (o botão padrão do app do Mac)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Enter' && !focoEmControle() && !document.querySelector('.flutuante, .veu') && aplicarAgora()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const d = dataLocal(valor)
  return (
    <div className="pj-lote">
      <div className="linha-h pj-lote-linha">
        <strong className="pj-numeros">{p.quantas} selecionada{p.quantas === 1 ? '' : 's'}</strong>
        <span className="texto2">Definir</span>
        <Select
          largura={150}
          semBusca
          opcoes={[{ valor: 'status', rotulo: 'Status' }, { valor: 'prioridade', rotulo: 'Prioridade' }, { valor: 'prazo', rotulo: 'Prazo' }]}
          valor={campo}
          mudar={(c) => (setCampo(c), setValor(null))}
        />
        <span className="texto2">para</span>
        {/* o segundo seletor segue o primeiro: status, prioridade ou o calendário do prazo */}
        {campo === 'status' ? (
          <Select largura={200} vazio="Selecione…" opcoes={p.statusOrdem.map((s) => ({ valor: s, rotulo: rotulo(s), cor: corStatus(s) }))} valor={valor} mudar={setValor} />
        ) : campo === 'prioridade' ? (
          <Select largura={200} vazio="Selecione…" opcoes={PRIORIDADES.map((x) => ({ valor: x, rotulo: rotuloPrioridade(x), cor: corPrioridade(x) }))} valor={valor} mudar={setValor} />
        ) : (
          <>
            <button
              type="button"
              className={`select ${ancora ? 'aberto' : ''}`}
              style={{ width: 200 }}
              onClick={(e) => (setData(d ?? new Date()), setAncora(ancora ? null : e.currentTarget))}
            >
              <Calendar size={13} className="texto2" />
              <span className={`rotulo ${d ? '' : 'texto2'}`}>{d ? d.toLocaleDateString('pt-BR') : 'Selecione…'}</span>
              <ChevronDown size={11} strokeWidth={3} className="texto2" />
            </button>
            {ancora && (
              <Flutuante ancora={ancora} fechar={() => setAncora(null)}>
                <div className="pj-calendario">
                  <Calendario data={data} mudar={setData} />
                  <Botao tipo="primario" onClick={() => (setValor(diaLocal(data)), setAncora(null))}>
                    Usar este dia
                  </Botao>
                </div>
              </Flutuante>
            )}
          </>
        )}
        <Botao tipo="primario" disabled={!pode} onClick={aplicarAgora}>
          <Check size={14} strokeWidth={3} /> Aplicar
        </Botao>
      </div>
      <div className="linha-h pj-lote-acoes texto2">
        {p.quantas < p.total && (
          <button type="button" onClick={p.todas}>
            <ListChecks size={14} /> Selecionar todas ({p.total})
          </button>
        )}
        <button type="button" onClick={p.limpar}>
          <X size={14} /> Limpar
        </button>
      </div>
      {pedindoVideo && valor && (
        <PedirVideo
          status={valor}
          quantas={p.quantas}
          botao="Aplicar"
          fechar={() => setPedindoVideo(false)}
          mover={(v) => (p.aplicar(campo, valor, v), setValor(null))}
        />
      )}
    </div>
  )
}

// ---------- novo projeto ----------
type Conferido = {
  id: string
  tasks: number
  exemplo?: string | null
  nome?: string | null
  journify?: string | null
  github?: string | null
  pastas: string[]
  contas_github: string[]
}
const SEM_REPO = /[\\/]\.jfy[\\/]sem-repo[\\/]/ // a pasta que o jfy cria para o projeto sem repositório

/** Ligar um projeto do Journify a uma pasta deste computador, como o terminal faz: o projeto (um dos seus sem pasta,
 * ou o link dele no Journify, conferido pelo MCP), a pasta do código (escolher ou criar; mais de uma para front e
 * back) ou "sem repositório", e o nome curto com que ele aparece no jfy. */
function NovoProjeto({ pedido, semPasta, fechar, salvou }: { pedido: PedidoProjeto; semPasta: Projeto[]; fechar: () => void; salvou: (pid: string) => void }) {
  const [link, setLink] = useState('')
  const [conferido, setConferido] = useState<Conferido | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [pastas, setPastas] = useState<string[]>([])
  const [semRepo, setSemRepo] = useState(false)
  const [nome, setNome] = useState('')
  const [conta, setConta] = useState('') // conta do GitHub do projeto; "" = a ativa do gh
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [casa, setCasa] = useState('')

  const pronto = !!conferido && !!nome.trim() && (semRepo || pastas.length > 0) && !salvando

  useEffect(() => {
    api.caminhos().then((c) => setCasa(c.casa))
    const sr = SEM_REPO.test(pedido.pastas[0] ?? '')
    setSemRepo(sr)
    setPastas(sr ? [] : pedido.pastas)
    setNome(pedido.nome ?? '')
    if (pedido.pid) conferir(pedido.pid)
  }, [])

  async function conferir(ref: string) {
    setConferindo(true)
    setAviso(null)
    const [c, msg] = await ler<Conferido>(['--projeto-validar', ref])
    setConferindo(false)
    if (!c) return setAviso(msg)
    setConferido(c)
    setNome((n) => n || c.nome || '')
    setConta((x) => x || c.github || '')
    if (!pedido.pid) setPastas((ps) => (ps.length ? ps : c.pastas.filter((x) => !SEM_REPO.test(x))))
  }

  async function escolherPasta() {
    const url = await api.escolher({ pasta: true, criar: true, titulo: 'Escolha a pasta do código do projeto, ou crie uma nova' })
    if (!url) return
    setPastas((ps) => (ps.includes(url) ? ps : [...ps, url]))
    setNome((n) => n || (url.split(/[\\/]/).filter(Boolean).pop() ?? '').toLowerCase())
  }

  async function salvar() {
    if (!conferido || !pronto) return
    setSalvando(true)
    setAviso(null)
    const d = { id: conferido.id, nome: nome.trim(), pastas: semRepo ? [] : pastas, github: semRepo ? '' : conta }
    const [r, msg] = await ler<{ id: string }>(['--projeto-salvar', JSON.stringify(d)])
    setSalvando(false)
    if (r) salvou(r.id)
    else setAviso(msg)
  }

  const secao = (n: string, titulo: string, corpo: React.ReactNode) => (
    <div className="pilha">
      <div className="linha-h">
        <span className="pj-numero-secao">{n}</span>
        <strong>{titulo}</strong>
      </div>
      {corpo}
    </div>
  )

  return (
    <Modal
      titulo={!pedido.pid ? 'Novo projeto' : !pedido.nome ? 'Configurar projeto' : 'Editar projeto'}
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
      {secao(
        '1',
        'Projeto no Journify',
        conferido ? (
          <>
            <div className="linha-h">
              <CircleCheck size={16} className="pj-verde" />
              <strong>{conferido.journify ?? conferido.nome ?? conferido.id}</strong>
              <span className="texto2">· {conferido.tasks} task{conferido.tasks === 1 ? '' : 's'}</span>
              <span className="espaco" />
              {!pedido.pid && (
                <Botao tipo="link" onClick={() => (setConferido(null), setLink(''))}>
                  Trocar
                </Botao>
              )}
            </div>
            {conferido.exemplo && <span className="texto2 pequeno-texto pj-corta">ex.: {conferido.exemplo}</span>}
          </>
        ) : pedido.pid ? (
          <Carregando />
        ) : (
          <>
            {semPasta.length > 0 && (
              <>
                <span className="texto2 pequeno-texto">Seus projetos que ainda não têm pasta:</span>
                {semPasta.map((p) => (
                  <button type="button" key={p.id} className="linha-h pj-sem-pasta" onClick={() => conferir(p.id)}>
                    <Bolinha cor={p.cor} />
                    <span className="pj-corta espaco">{p.exemplo ? `ex.: ${p.exemplo}` : p.id}</span>
                    <span className="texto2 pequeno-texto">
                      {p.tasks} task{p.tasks === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </>
            )}
            <div className="linha-h">
              <Campo
                placeholder="Cole o link do projeto no Journify (…/projects/…)"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && link.trim() && conferir(link)}
              />
              <Botao disabled={!link.trim() || conferindo} onClick={() => conferir(link)}>
                Conferir
              </Botao>
              {conferindo && <Carregando />}
            </div>
            <span className="texto2 pequeno-texto">O jfy confere no Journify se você tem acesso ao projeto.</span>
          </>
        )
      )}
      {secao(
        '2',
        'Pasta do código',
        <>
          <Caixa marcado={semRepo} mudar={setSemRepo}>
            Sem repositório (estudo, documentos): o Claude abre numa pasta só deste projeto
          </Caixa>
          {!semRepo && (
            <>
              {pastas.map((pasta) => (
                <div key={pasta} className="linha-h">
                  <Folder size={15} className="destaque" fill="currentColor" />
                  <span className="pj-corta espaco" title={pasta}>
                    {casa && pasta.startsWith(casa) ? '~' + pasta.slice(casa.length) : pasta}
                  </span>
                  <Botao tipo="icone" title="Tirar esta pasta" onClick={() => setPastas(pastas.filter((x) => x !== pasta))}>
                    <X size={14} />
                  </Botao>
                </div>
              ))}
              <span>
                <Botao onClick={escolherPasta}>
                  <FolderPlus size={14} /> {pastas.length ? 'Outra pasta (front e back, por exemplo)…' : 'Escolher ou criar a pasta…'}
                </Botao>
              </span>
            </>
          )}
        </>
      )}
      {secao(
        '3',
        'Nome no jfy',
        <Campo
          placeholder="curto, como aparece no menu e na barra (ex.: portal)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && salvar()}
        />
      )}
      {!semRepo &&
        !!conferido?.contas_github.length &&
        secao(
          '4',
          'Conta do GitHub',
          <>
            <Select
              largura={320}
              opcoes={[
                { valor: '', rotulo: 'A ativa do gh (sem conta fixa)' },
                ...conferido.contas_github.map((c) => ({ valor: c, rotulo: c, foto: `https://github.com/${c}.png?size=48` }))
              ]}
              valor={conta}
              mudar={setConta}
            />
            <span className="texto2 pequeno-texto">
              Os commits destas pastas saem com o nome e o email dessa conta, e o push e o gh do Claude usam ela, seja qual for a conta ativa.
            </span>
          </>
        )}
      <Aviso texto={aviso} />
    </Modal>
  )
}
