// As seções de um projeto, como no Journify (app/Sources/JFY/ProjetoConteudo.swift): Tasks (a tela de sempre),
// Documentos (ler, criar e editar), Reuniões, Arquivos (o Drive do projeto, os anexos das tasks e os documentos que
// são arquivo; enviar vai para o Drive) e Formulários (os campos e as respostas). Tudo pelo MCP, via jfy.
import { useEffect, useState } from 'react'
import {
  ArrowUpRight, ClipboardList, File, FileText, FileUp, Folder, Globe, Image, Link, ListChecks, Lock, Paperclip, PencilLine,
  Plus, RefreshCw, Sheet, TextAlignStart, Users, type LucideIcon
} from 'lucide-react'
import { api, fazer, ler } from '../jfy'
import {
  AreaTexto, Aviso, Botao, BotaoContexto, Campo, Carregando, Linha, Modal, Segmentos, TextoRico, itemMenuContexto, menuContexto
} from '../souv'

export const SECOES: { nome: string; icone: LucideIcon }[] = [
  { nome: 'Tasks', icone: ListChecks },
  { nome: 'Documentos', icone: FileText },
  { nome: 'Reuniões', icone: Users },
  { nome: 'Arquivos', icone: Folder },
  { nome: 'Formulários', icone: ClipboardList }
]

export function ProjetoConteudo({ secao, pid, abrirTask }: { secao: string; pid: string; abrirTask: (tid: string) => void }) {
  if (secao === 'Documentos') return <DocumentosProjeto pid={pid} />
  if (secao === 'Reuniões') return <ReunioesProjeto pid={pid} />
  if (secao === 'Arquivos') return <ArquivosProjeto pid={pid} abrirTask={abrirTask} />
  return <FormulariosProjeto pid={pid} />
}

// ---------- datas ----------
function dataISO(iso?: string | null) {
  const d = iso ? new Date(iso) : null
  return d && !isNaN(+d) ? d : null
}
const rtf = new Intl.RelativeTimeFormat('pt-BR', { style: 'short' })
/** "há 3 dias", como o RelativeDateTimeFormatter do macOS: a maior unidade que cabe. */
export function relativo(iso?: string | null) {
  const d = dataISO(iso)
  if (!d) return ''
  const s = (d.getTime() - Date.now()) / 1000, a = Math.abs(s)
  const [n, u]: [number, Intl.RelativeTimeFormatUnit] =
    a < 60 ? [s, 'second'] : a < 3600 ? [s / 60, 'minute'] : a < 86400 ? [s / 3600, 'hour'] : a < 7 * 86400 ? [s / 86400, 'day']
    : a < 30 * 86400 ? [s / (7 * 86400), 'week'] : a < 365 * 86400 ? [s / (30 * 86400), 'month'] : [s / (365 * 86400), 'year']
  return rtf.format(Math.trunc(n), u)
}

// ---------- documentos ----------
type Doc = { id: string; titulo: string; atualizado?: string | null; sensivel: boolean }

function DocumentosProjeto({ pid }: { pid: string }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState<{ titulo: string; texto: string } | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [revelado, setRevelado] = useState<Set<string>>(new Set()) // sensíveis que a pessoa pediu para ver
  const [editor, setEditor] = useState<'novo' | 'editar' | null>(null)
  const [versao, setVersao] = useState(0) // salvou: lê o conteúdo de novo

  async function carregarDocs() {
    const [d, msg] = await ler<Doc[]>(['--docs-json', pid])
    if (d) setDocs(d)
    setAviso(msg)
    setAberto((a) => a ?? d?.find((x) => !x.sensivel)?.id ?? null)
    return d
  }
  useEffect(() => void carregarDocs(), [])

  /** Depois de criar ou salvar: a lista de novo (o "atualizado" mudou) e o documento aberto, relido. */
  async function salvo(id: string | null, titulo: string) {
    setEditor(null)
    const d = await carregarDocs()
    // o id vem na resposta do criar_documento; se o formato não trouxer, o mais novo com esse título
    const novo = id ?? d?.find((x) => x.titulo === titulo.trim())?.id
    if (novo) setAberto(novo)
    setVersao((v) => v + 1)
  }

  const doc = docs?.find((x) => x.id === aberto)
  const liberado = !!doc && (!doc.sensivel || revelado.has(doc.id))
  useEffect(() => {
    setConteudo(null)
    if (!doc || !liberado) return
    let vivo = true // trocou de documento antes de chegar: não mostra o velho
    setCarregando(true)
    ler<{ titulo: string; texto: string }>(['--doc-json', doc.id]).then(([c, msg]) => {
      if (!vivo) return
      setCarregando(false)
      setConteudo(c)
      setAviso(msg)
    })
    return () => void (vivo = false)
  }, [aberto, liberado, versao])

  const b = busca.toLowerCase()
  const filtrados = (docs ?? []).filter((d) => !b || d.titulo.toLowerCase().includes(b))
  const item = (d: Doc) => ({ tipo: 'documento' as const, ref: d.id, titulo: d.titulo, pid })

  return (
    <div className="colunas">
      <div className="coluna pj-col-300">
        <div className="linha-h pj-pad10">
          <Campo placeholder="Buscar documento" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Botao title="Novo documento" onClick={() => setEditor('novo')}>
            <Plus size={14} />
          </Botao>
        </div>
        {docs && !docs.length ? (
          <div className="pj-centro texto2">{aviso ?? 'Nenhum documento neste projeto.'}</div>
        ) : !docs ? (
          <div className="pj-centro texto2">{aviso ?? <Carregando />}</div>
        ) : (
          <div className="lista">
            {filtrados.map((d) => (
              <Linha
                key={d.id}
                marcada={aberto === d.id}
                onClick={() => setAberto(d.id)}
                onContextMenu={menuContexto(() => (d.sensivel ? [] : [itemMenuContexto(item(d))]))}
              >
                {d.sensivel ? <Lock size={14} className="pj-laranja" /> : <FileText size={14} className="texto2" />}
                <span className="pilha pj-gap2 pj-min0">
                  <span className="pj-corta">{d.titulo}</span>
                  <span className="texto2 pequeno-texto">{relativo(d.atualizado)}</span>
                </span>
              </Linha>
            ))}
          </div>
        )}
      </div>
      <div className="painel pj-fundo">
        {!doc ? (
          <div className="pj-centro texto2">Escolha um documento</div>
        ) : doc.sensivel && !revelado.has(doc.id) ? (
          <div className="pj-aguardando">
            <Lock size={34} className="pj-laranja" />
            <strong>{doc.titulo}</strong>
            <span className="texto2">
              Pelo título, este documento parece guardar credenciais. O conteúdo fica escondido até você pedir, e segredo não deveria morar em documento do projeto.
            </span>
            <Botao onClick={() => setRevelado(new Set([...revelado, doc.id]))}>Mostrar o conteúdo</Botao>
          </div>
        ) : conteudo ? (
          <div className="pj-leitor">
            <div className="linha-h pj-leitor-topo">
              <h2 className="pj-titulo24 selecionavel">{conteudo.titulo}</h2>
              <span className="espaco" />
              {!doc.sensivel && <BotaoContexto item={item(doc)} />}
              <Botao onClick={() => setEditor('editar')}>
                <PencilLine size={13} /> Editar
              </Botao>
            </div>
            <span className="texto2 pequeno-texto">Atualizado {relativo(doc.atualizado)}</span>
            <TextoRico texto={conteudo.texto} />
          </div>
        ) : carregando ? (
          <div className="pj-centro"><Carregando /></div>
        ) : (
          aviso && <div className="pj-centro texto2">{aviso}</div>
        )}
      </div>
      {editor === 'novo' && <EditarDoc pid={pid} fechar={() => setEditor(null)} salvo={salvo} />}
      {editor === 'editar' && doc && conteudo && (
        <EditarDoc pid={pid} doc={{ id: doc.id, ...conteudo }} fechar={() => setEditor(null)} salvo={salvo} />
      )}
    </div>
  )
}

/** O documento novo (título e o texto em Markdown) ou a edição do aberto: trocar o conteúdo todo ou acrescentar ao fim
 * (o decision log, as regras depois de uma reunião). Cada modo guarda o seu rascunho: trocar de modo não perde o que
 * foi escrito. */
function EditarDoc({ pid, doc, fechar, salvo }: {
  pid: string
  doc?: { id: string; titulo: string; texto: string }
  fechar: () => void
  salvo: (id: string | null, titulo: string) => void
}) {
  const [titulo, setTitulo] = useState(doc?.titulo ?? '')
  const [modo, setModo] = useState<'substituir' | 'anexar'>('substituir')
  const [textos, setTextos] = useState({ substituir: doc?.texto ?? '', anexar: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const texto = textos[modo]

  async function salvar() {
    setSalvando(true)
    let id = doc?.id ?? null, falhou: string | null
    if (doc) falhou = await fazer(['--doc-salvar', doc.id], JSON.stringify({ titulo, conteudo: texto, modo }))
    else {
      const [r, msg] = await ler<any>(['--doc-criar', pid], JSON.stringify({ titulo, conteudo: texto }))
      falhou = r ? null : msg
      // o formato da resposta do criar_documento não foi visto: o id em qualquer um dos nomes de costume
      id = r?.id ?? r?.docId ?? r?.documento?.id ?? r?.document?.id ?? null
    }
    setSalvando(false)
    if (falhou) return setErro(falhou)
    salvo(id, titulo)
  }

  return (
    <Modal
      titulo={doc ? 'Editar o documento' : 'Novo documento'}
      largura={720}
      fechar={() => !salvando && fechar()}
      acoes={
        <>
          <Botao onClick={fechar} disabled={salvando}>Cancelar</Botao>
          <Botao tipo="primario" disabled={salvando || !titulo.trim()} onClick={salvar}>
            {salvando && <Carregando />} {doc ? 'Salvar' : 'Criar'}
          </Botao>
        </>
      }
    >
      <Campo autoFocus={!doc} placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      {doc && (
        <Segmentos
          cheio
          valor={modo}
          opcoes={[
            { valor: 'substituir', rotulo: 'Trocar o conteúdo', ajuda: 'O texto abaixo fica no lugar do que está lá' },
            { valor: 'anexar', rotulo: 'Acrescentar ao fim', ajuda: 'O texto abaixo entra depois do que já está lá' }
          ]}
          mudar={setModo}
        />
      )}
      <AreaTexto
        className="pj-doc-texto"
        autoFocus={!!doc}
        placeholder={modo === 'anexar' ? 'O que entra no fim do documento, em Markdown' : 'O texto, em Markdown'}
        value={texto}
        onChange={(e) => setTextos({ ...textos, [modo]: e.target.value })}
      />
      <Aviso texto={erro} />
    </Modal>
  )
}

// ---------- reuniões ----------
type Reuniao = { id: string; titulo: string; data?: string | null; resumo: boolean }
type DetalheReuniao = { titulo: string; data?: string | null; participantes: string[]; resumo: string }

function ReunioesProjeto({ pid }: { pid: string }) {
  const [reunioes, setReunioes] = useState<Reuniao[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<DetalheReuniao | null>(null)

  useEffect(() => {
    ler<Reuniao[]>(['--reunioes-projeto-json', pid]).then(([r, msg]) => {
      setReunioes(r)
      setAviso(msg)
      setAberta(r?.[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    setDetalhe(null)
    if (!aberta) return
    let vivo = true
    ler<DetalheReuniao>(['--reuniao-json', aberta]).then(([d, msg]) => {
      if (!vivo) return
      setDetalhe(d)
      if (!d) setAviso(msg)
    })
    return () => void (vivo = false)
  }, [aberta])

  if (!reunioes) return <div className="pj-centro texto2 pj-fundo">{aviso ?? <Carregando />}</div>
  if (!reunioes.length)
    return (
      <div className="pj-aguardando">
        <Users size={34} className="texto2" />
        <span className="texto2">{aviso ?? 'Nenhuma reunião registrada neste projeto no Journify.'}</span>
      </div>
    )
  const quando = dataISO(detalhe?.data)
  return (
    <div className="colunas">
      <div className="coluna pj-col-300">
        <div className="lista">
          {reunioes.map((r) => {
            const d = dataISO(r.data)
            return (
              <Linha key={r.id} marcada={aberta === r.id} onClick={() => setAberta(r.id)}>
                <span className="pilha pj-gap2 pj-min0">
                  <span className="pj-corta">{r.titulo}</span>
                  <span className="linha-h texto2 pequeno-texto">
                    {d && d.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}
                    {r.resumo && (
                      <span className="linha-h pj-gap4">
                        <TextAlignStart size={11} /> resumo
                      </span>
                    )}
                  </span>
                </span>
              </Linha>
            )
          })}
        </div>
      </div>
      <div className="painel pj-fundo">
        {detalhe ? (
          <div className="pj-leitor">
            <div className="linha-h pj-leitor-topo">
              <h2 className="pj-titulo24 selecionavel">{detalhe.titulo}</h2>
              <span className="espaco" />
              {aberta && <BotaoContexto item={{ tipo: 'reuniao', ref: aberta, titulo: detalhe.titulo, pid }} />}
            </div>
            {quando && <span className="texto2">{quando.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}</span>}
            {detalhe.participantes.length > 0 && (
              <span className="linha-h texto2 selecionavel">
                <Users size={14} /> {detalhe.participantes.join(', ')}
              </span>
            )}
            <hr className="pj-divisor" />
            {detalhe.resumo ? <TextoRico texto={detalhe.resumo} /> : <span className="texto2">Esta reunião ainda não tem resumo.</span>}
          </div>
        ) : aberta ? (
          <div className="pj-centro"><Carregando /></div>
        ) : (
          <div className="pj-centro texto2">Escolha uma reunião</div>
        )}
      </div>
    </div>
  )
}

// ---------- arquivos ----------
type Arquivo = {
  id: string
  nome: string
  tipo: string
  categoria: string
  task?: string | null // só nos anexos de task
  origem?: 'drive' | 'task' | 'documento' | null
  url?: string | null
  por?: string | null
  quando?: string | null
  task_titulo?: string | null
  tamanho?: number | null
}
type RespostaArquivos = { arquivos: Arquivo[]; tasks: number }
const CATEGORIAS = ['Todas', 'Documentos', 'Planilhas', 'Imagens', 'Reuniões', 'Outros']
const ICONE_CATEGORIA: Record<string, LucideIcon> = { Imagens: Image, Planilhas: Sheet, Documentos: FileText, Reuniões: Users }
/** De onde o arquivo veio, quando não é de uma task (aí vale o título dela). */
const ORIGEM: Record<string, string> = { drive: 'Drive do projeto', documento: 'Documentos do projeto', task: 'Anexo de task' }
const deOnde = (a: Arquivo) => a.task_titulo || (a.origem ? ORIGEM[a.origem] : null)
const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** O tamanho como o Finder escreve (base 1000): "512 bytes", "12 KB", "1,2 MB". */
function tamanho(n: number) {
  const u = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1000 && i < u.length - 1) (n /= 1000), i++
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: i && n < 10 ? 1 : 0 })} ${u[i]}`
}

function ArquivosProjeto({ pid, abrirTask }: { pid: string; abrirTask: (tid: string) => void }) {
  const [r, setR] = useState<RespostaArquivos | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [categoria, setCategoria] = useState('Todas')
  const [busca, setBusca] = useState('')

  async function carregar() {
    setCarregando(true)
    const [x, msg] = await ler<RespostaArquivos>(['--arquivos-json', pid])
    setCarregando(false)
    if (x) setR(x) // o ↻ que falha mantém a lista que já estava, com o aviso
    setAviso(x ? null : msg)
  }
  useEffect(() => void carregar(), [])

  /** Um arquivo por vez para o Drive do projeto. Arquivo grande leva um tempo (o jfy manda pelo link de envio). */
  async function enviar() {
    const arq = await api.escolher({ titulo: 'Enviar para o Drive do projeto' })
    if (!arq) return
    setEnviando(true)
    const erro = await fazer(['--arquivo-enviar', arq, 'projeto', pid])
    setEnviando(false)
    if (erro) setAviso(erro)
    else await carregar()
  }

  const b = busca.toLowerCase()
  const filtrados = (r?.arquivos ?? []).filter(
    (a) => (categoria === 'Todas' || a.categoria === categoria) && (!b || a.nome.toLowerCase().includes(b) || (deOnde(a) ?? '').toLowerCase().includes(b))
  )
  const abrir = (a: Arquivo) => a.url && api.abrirLink(a.url) // só o link: nada é baixado

  function rodape(r: RespostaArquivos) {
    const n = (o: string) => r.arquivos.filter((a) => a.origem === o).length
    return [
      n('drive') && `${n('drive')} no Drive do projeto`,
      n('task') && `${pl(n('task'), 'anexo', 'anexos')} em ${pl(r.tasks, 'task', 'tasks')}`,
      n('documento') && `${n('documento')} nos documentos`
    ].filter(Boolean).join(', ')
  }

  return (
    <div className="pj-arquivos pj-fundo">
      <div className="linha-h pj-pad12 pj-borda-baixo">
        <Segmentos valor={categoria} opcoes={CATEGORIAS.map((c) => ({ valor: c, rotulo: c }))} mudar={setCategoria} />
        <span className="espaco" />
        <Campo placeholder="Buscar arquivo" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 240 }} />
        <Botao tipo="icone" title="Ler de novo do Journify" disabled={carregando} onClick={() => carregar()}>
          {carregando && r ? <Carregando /> : <RefreshCw size={15} />}
        </Botao>
        <Botao tipo="primario" disabled={enviando} onClick={enviar} title="Um arquivo por vez. Arquivo grande leva um tempo">
          {enviando ? <Carregando /> : <FileUp size={14} />} {enviando ? 'Enviando…' : 'Enviar arquivos'}
        </Botao>
      </div>
      {r ? (
        <>
          {aviso && <div className="pj-pad8"><Aviso texto={aviso} fechar={() => setAviso(null)} /></div>}
          {!filtrados.length ? (
            <div className="pj-centro texto2">{r.arquivos.length ? 'Nenhum arquivo com esse filtro.' : 'Nenhum arquivo neste projeto.'}</div>
          ) : (
            <div className="lista">
              {filtrados.map((a) => {
                const Icone = ICONE_CATEGORIA[a.categoria] ?? File
                return (
                  <Linha
                    key={a.id}
                    title="Abrir o arquivo"
                    onClick={() => abrir(a)}
                    onContextMenu={menuContexto(() => [
                      { rotulo: 'Abrir o arquivo', icone: <ArrowUpRight size={13} />, acao: () => abrir(a) },
                      ...(a.task ? [{ rotulo: 'Abrir a task', icone: <ListChecks size={13} />, acao: () => abrirTask(a.task!) }] : []),
                      ...(a.url
                        ? [
                            itemMenuContexto({ tipo: 'arquivo', ref: a.url, titulo: a.nome, origem: deOnde(a), pid }),
                            { rotulo: 'Copiar o link', icone: <Link size={13} />, acao: () => api.copiar(a.url!) }
                          ]
                        : [])
                    ])}
                  >
                    <Icone size={18} className="destaque" />
                    <span className="pilha pj-gap2 pj-min0 espaco">
                      <span className="pj-corta">{a.nome}</span>
                      <span className="texto2 pequeno-texto pj-corta">
                        {[deOnde(a), a.por, relativo(a.quando)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {a.tamanho != null && <span className="texto2 pequeno-texto">{tamanho(a.tamanho)}</span>}
                  </Linha>
                )
              })}
            </div>
          )}
          {r.arquivos.length > 0 && <div className="texto2 pequeno-texto pj-pad8">{rodape(r)}</div>}
        </>
      ) : aviso ? (
        <div className="pj-centro texto2">{aviso}</div>
      ) : (
        <div className="pj-centro"><Carregando tamanho={20} /></div>
      )}
    </div>
  )
}

// ---------- formulários ----------
type Formulario = { id: string; titulo: string; descricao: string; campos: number; respostas: number; publico: boolean }
type Obj = Record<string, any>

// ponytail: o formato dos campos e das respostas não foi visto com dados reais (o único formulário estava vazio): cada
// coisa é procurada em mais de um nome. Ajustar quando aparecer um formulário com respostas
const pega = (o: Obj | null | undefined, ...ks: string[]) => ks.map((k) => o?.[k]).find((v) => v != null && v !== '')
/** Um valor de resposta como texto: lista vira "a, b"; objeto, o rótulo ou o valor dele. */
function valorTexto(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(valorTexto).filter(Boolean).join(', ')
  if (typeof v === 'object') return valorTexto(pega(v as Obj, 'label', 'rotulo', 'valor', 'value', 'nome', 'name') ?? JSON.stringify(v))
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}
const rotuloCampo = (f: Obj) => String(pega(f, 'label', 'rotulo', 'title', 'name', 'id') ?? 'Campo')

/** Os pares campo → valor de uma resposta: o primeiro objeto entre respostas, valores, answers e campos, seja um
 * mapa ({rótulo: valor}) ou uma lista ([{campo, valor}]). */
function pares(r: Obj): [string, string][] {
  const m = ['respostas', 'valores', 'answers', 'campos'].map((k) => r[k]).find((v) => v && typeof v === 'object')
  if (!m) return []
  if (Array.isArray(m))
    return m.map((x: Obj) => [
      String(pega(x, 'campo', 'label', 'rotulo', 'title', 'pergunta', 'name', 'fieldId', 'id') ?? 'Campo'),
      valorTexto(pega(x, 'valor', 'value', 'resposta', 'answer'))
    ])
  return Object.entries(m).map(([k, v]) => [k, valorTexto(v)])
}
const dataResposta = (r: Obj): string => pega(r, 'data', 'em', 'enviadoEm', 'criadoEm', 'submittedAt', 'createdAt') ?? ''

function FormulariosProjeto({ pid }: { pid: string }) {
  const [forms, setForms] = useState<Formulario[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<{ formulario: Obj; respostas: Obj[] } | null>(null)

  useEffect(() => {
    ler<Formulario[]>(['--formularios-json', pid]).then(([f, msg]) => {
      setForms(f)
      setAviso(msg)
      setAberto(f?.[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    setDetalhe(null)
    if (!aberto) return
    let vivo = true
    ler<{ formulario: Obj; respostas: Obj[] }>(['--formulario-json', aberto]).then(([d, msg]) => {
      if (!vivo) return
      setDetalhe(d)
      if (!d) setAviso(msg)
    })
    return () => void (vivo = false)
  }, [aberto])

  if (!forms) return <div className="pj-centro texto2 pj-fundo">{aviso ?? <Carregando />}</div>
  if (!forms.length)
    return (
      <div className="pj-aguardando">
        <ClipboardList size={34} className="texto2" />
        <span className="texto2">{aviso ?? 'Nenhum formulário neste projeto.'}</span>
      </div>
    )
  const f = forms.find((x) => x.id === aberto)
  const campos: Obj[] = Array.isArray(detalhe?.formulario?.fields) ? detalhe!.formulario.fields : []
  // as mais novas primeiro (o Journify já manda assim; sem data, fica a ordem dele)
  const respostas = [...(Array.isArray(detalhe?.respostas) ? detalhe!.respostas : [])].sort((a, b) =>
    dataResposta(b).localeCompare(dataResposta(a)))
  return (
    <div className="colunas">
      <div className="coluna pj-col-300">
        <div className="lista">
          {forms.map((x) => (
            <Linha key={x.id} marcada={aberto === x.id} onClick={() => setAberto(x.id)}>
              <ClipboardList size={14} className="texto2" />
              <span className="pilha pj-gap2 pj-min0">
                <span className="pj-corta">{x.titulo}</span>
                <span className="texto2 pequeno-texto">
                  {pl(x.campos, 'campo', 'campos')} · {pl(x.respostas, 'resposta', 'respostas')}
                </span>
              </span>
            </Linha>
          ))}
        </div>
      </div>
      <div className="painel pj-fundo">
        {detalhe && f ? (
          <div className="pj-leitor">
            <div className="linha-h pj-leitor-topo">
              <h2 className="pj-titulo24 selecionavel">{pega(detalhe.formulario, 'title', 'titulo') ?? f.titulo}</h2>
              <span className="espaco" />
              {f.publico && (
                <span className="linha-h texto2 pequeno-texto">
                  <Globe size={13} /> público
                </span>
              )}
            </div>
            {f.descricao && <span className="texto2 selecionavel">{f.descricao}</span>}
            {campos.length > 0 && (
              <div className="pilha pj-gap4">
                <span className="pj-secao-titulo">Campos ({campos.length})</span>
                {campos.map((c, i) => {
                  const opcoes = valorTexto(pega(c, 'opcoes', 'options'))
                  const extra = [pega(c, 'tipo', 'type'), (c.obrigatorio ?? c.required) && 'obrigatório', opcoes].filter(Boolean).join(' · ')
                  return (
                    <span key={i} className="linha-h pj-campo-form">
                      <span>{rotuloCampo(c)}</span>
                      {extra && <span className="texto2 pequeno-texto pj-corta">{extra}</span>}
                    </span>
                  )
                })}
              </div>
            )}
            <hr className="pj-divisor" />
            <span className="pj-secao-titulo">Respostas ({respostas.length})</span>
            {!respostas.length ? (
              <span className="texto2">Nenhuma resposta ainda.</span>
            ) : (
              respostas.map((r, i) => <RespostaForm key={pega(r, 'id') ?? i} r={r} />)
            )}
          </div>
        ) : aberto && !aviso ? (
          <div className="pj-centro"><Carregando /></div>
        ) : (
          <div className="pj-centro texto2">{aviso ?? 'Escolha um formulário'}</div>
        )}
      </div>
    </div>
  )
}

/** Uma resposta: quem, quando e o status em cima; os pares campo → valor; os anexos (os links valem 60 min). */
function RespostaForm({ r }: { r: Obj }) {
  const d = dataResposta(r) ? new Date(dataResposta(r)) : null
  const quem = valorTexto(pega(r, 'quem', 'respondente', 'nome', 'autor', 'email', 'respondentName', 'submittedBy')) || 'Anônimo'
  const anexos: Obj[] = Array.isArray(r.anexos ?? r.attachments) ? (r.anexos ?? r.attachments) : []
  return (
    <div className="pj-resposta">
      <div className="linha-h texto2 pequeno-texto">
        <strong className="pj-texto">{quem}</strong>
        {d && !isNaN(+d) && <span>{d.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        <span className="espaco" />
        {pega(r, 'status') && <span>{valorTexto(r.status)}</span>}
      </div>
      {pares(r).map(([k, v], i) => (
        <div key={i} className="pilha pj-gap2">
          <span className="texto2 pequeno-texto">{k}</span>
          <span className="selecionavel pj-valor">{v || '—'}</span>
        </div>
      ))}
      {anexos.map((a, i) => {
        const url = pega(a, 'url', 'link')
        return (
          <Botao tipo="link" key={i} disabled={!url} title="O link do anexo vale 60 min: se expirou, recarregue o formulário" onClick={() => url && api.abrirLink(url)}>
            <Paperclip size={13} /> {pega(a, 'nome', 'name') ?? 'anexo'}
          </Botao>
        )
      })}
    </div>
  )
}
