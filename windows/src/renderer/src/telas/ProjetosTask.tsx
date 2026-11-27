// A task inteira (TaskDetalhe em app/Sources/JFY/Projetos.swift) e as peças que a lista, a tabela e o lote dividem:
// os rótulos e as cores de status e prioridade, a bolinha do status e o pedido do vídeo do teste.
import { useEffect, useState, type ReactNode } from 'react'
import {
  CodeXml, Crosshair, ExternalLink, File, FileArchive, FileText, Film, GitPullRequestArrow, Hammer, HardDrive, Link,
  MessageSquare, Palette, Paperclip, Presentation, Sheet, SquarePlay, X, type LucideIcon
} from 'lucide-react'
import { api, fazer, ler } from '../jfy'
import { irPara } from '../estado'
import {
  Aviso, AreaTexto, Bolinha, Botao, BotaoContexto, Campo, CampoData, Carregando, Modal, Select, TextoRico, dataLocal,
  diaLocal, itemMenuContexto, menuContexto
} from '../souv'

/** Uma task na lista (resumo_task do jfy). */
export type Resumo = {
  id: string
  titulo: string
  status: string
  etapa: string
  pid: string
  prioridade?: string | null
  prazo?: string | null
  prazo_txt?: string | null
  projeto?: string | null
  cor?: string | null
  dias?: number | null
  pontos?: number | null
  etapa_n: number
  resp?: number | null // quantos responsáveis
  eu?: boolean | null // você é um deles
}

// ---------- rótulos e cores ----------
export const rotulo = (status: string) =>
  ({ em_revisao: 'em revisão', pendente_validacao: 'pendente validação', finalizado_validacao: 'finalizado validação' })[status] ??
  status.replace(/_/g, ' ')
export const rotuloPrioridade = (p: string) => ({ media: 'média', critica: 'crítica' })[p] ?? p

// as cores do sistema do macOS que o app do Mac usa, em hex
const VERMELHO = '#ff3b30', LARANJA = '#ff9500', CINZA = '#8e8e93'
/** Cor da bolinha de cada status: uma para cada, para bater o olho na lista. */
export const CORES_STATUS: Record<string, string> = {
  em_aberto: CINZA,
  criando_escopo: '#30b0c7',
  priorizado: 'rgb(0, 77, 255)', // azul bem forte
  em_progresso: '#34c759',
  em_revisao: '#ffcc00',
  em_teste: '#af52de',
  pendente_validacao: 'rgb(255, 122, 199)', // rosa claro: longe do vermelho de atrasada
  bloqueado: LARANJA,
  finalizado_validacao: '#a2845e',
  fechado: 'light-dark(#3a3a3c, #c7c7cc)' // grafite: não some no fundo escuro
}
export const corStatus = (s: string) => CORES_STATUS[s] ?? CINZA
export const corPrioridade = (p: string): string | null =>
  ({ critica: VERMELHO, alta: LARANJA, media: 'var(--primaria)', baixa: CINZA })[p] ?? null
export const PRIORIDADES = ['critica', 'alta', 'media', 'baixa']
/** Os status que o Journify só aceita com o link do vídeo do teste (ou o motivo de não ter). */
export const PEDE_VIDEO = new Set(['fechado', 'finalizado_validacao'])
export const fmtPontos = (n: number) => n.toLocaleString('pt-BR')

/** A bolinha do status, sempre com o nome escrito. Prazo vencido numa task ainda aberta pinta de vermelho e escreve
 * "atrasada": atrasada não é um status do Journify, é o prazo. */
export function StatusChip({ status, dias }: { status: string; dias?: number | null }) {
  const atrasada = (dias ?? 0) < 0 && !PEDE_VIDEO.has(status)
  return (
    <span className="pj-status">
      {status === 'em_aberto' && !atrasada ? (
        <span className="pj-vazada" /> // vazada: ainda não começou
      ) : (
        <Bolinha cor={atrasada ? VERMELHO : corStatus(status)} />
      )}
      {rotulo(status) + (atrasada ? ' · atrasada' : '')}
    </span>
  )
}

/** O modal do vídeo do teste: o Journify só fecha (ou finaliza validação) com o link ou o motivo. `quantas`: no lote,
 * o mesmo vale para todas. */
export function PedirVideo(p: { status: string; botao: string; quantas?: number; fechar: () => void; mover: (video: string) => void }) {
  const [video, setVideo] = useState('')
  const ok = video.trim().length >= 3
  const enviar = () => ok && (p.mover(video.trim()), p.fechar())
  return (
    <Modal
      titulo="Vídeo do teste"
      fechar={p.fechar}
      acoes={
        <>
          <Botao onClick={p.fechar}>Cancelar</Botao>
          <Botao tipo="primario" disabled={!ok} onClick={enviar}>
            {p.botao}
          </Botao>
        </>
      }
    >
      <div className="mensagem">
        {p.quantas
          ? `O Journify só move para ${rotulo(p.status)} com o link do vídeo do teste ou o motivo de não ter vídeo. Ele vale para as ${p.quantas} tasks.`
          : `O Journify só move a task para ${rotulo(p.status)} com o link do vídeo do teste ou o motivo de não ter vídeo.`}
      </div>
      <Campo
        autoFocus
        placeholder="link do vídeo, ou por que não tem"
        value={video}
        onChange={(e) => setVideo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && enviar()}
      />
    </Modal>
  )
}

// ---------- a task ----------
type Detalhe = Resumo & {
  url: string
  descricao: string
  epico?: string | null
  configurado: boolean
  foco?: boolean | null // marcada como foco (só sua, no config do jfy)
  status_app: string[]
  pede_video: string[]
  anexos: { n: number; nome: string; tipo: string; url?: string | null; imagem: boolean }[]
  comentarios: { autor?: string | null; texto: string; quando?: string | null }[]
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="pj-secao">
      <div className="pj-secao-titulo">{titulo}</div>
      {children}
    </section>
  )
}

/** A task inteira: status, prioridade e prazo por clique, a descrição, os anexos, os links e PRs citados e os
 * comentários. `fechar`: o × do painel (Esc também fecha, pela tela). */
export function TaskDetalhe({ tid, mudou, fechar }: { tid: string; mudou: () => void; fechar?: () => void }) {
  const [d, setD] = useState<Detalhe | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [comentario, setComentario] = useState('')
  const [fechandoEm, setFechandoEm] = useState<string | null>(null) // status que pede o vídeo do teste
  const [anexando, setAnexando] = useState(false)

  async function carregar() {
    const [r, msg] = await ler<Detalhe>(['--task-json', tid])
    if (r) setD(r)
    setAviso(msg)
  }
  useEffect(() => void carregar(), [])

  async function mudar(campo: string, valor: string, extra = '') {
    setOcupado(true)
    const erro = await fazer(['--task-mudar', tid, campo, valor, ...(extra ? [extra] : [])])
    await carregar()
    setOcupado(false)
    setAviso(erro)
    if (!erro && campo !== 'comentario') mudou()
  }

  async function focar(sim: boolean) {
    setOcupado(true)
    const erro = await fazer(['--foco-marcar', tid, sim ? 'sim' : 'nao'])
    await carregar()
    setOcupado(false)
    setAviso(erro)
    if (!erro) mudou()
  }

  /** Um print ou o vídeo do teste vira anexo da task. Fora do `ocupado`: arquivo grande leva um tempo, e a task segue
   * para ler enquanto sobe. */
  async function anexar() {
    const arq = await api.escolher({ titulo: 'Anexar à task' })
    if (!arq) return
    setAnexando(true)
    const erro = await fazer(['--arquivo-enviar', arq, 'task', tid])
    if (!erro) await carregar()
    setAnexando(false)
    setAviso(erro)
  }

  // a mesma aba do 1 e do 2 na tela da task: o jfy abre a aba no app pela ponte e a tela vai para o terminal
  async function abrir(modo: 'pipeline' | 'livre') {
    const erro = await fazer(['--task-abrir', tid, modo])
    if (erro) setAviso(erro)
    else irPara('jfy')
  }

  if (!d) return <div className="pj-centro">{aviso ? <span className="texto2 selecionavel">{aviso}</span> : <Carregando />}</div>

  const atrasada = (d.dias ?? 0) < 0 && !PEDE_VIDEO.has(d.status)
  const noFoco = d.foco === true
  const links = linksCitados(d)
  const prs = prsCitados(d)
  const imgs = d.anexos.filter((a) => a.imagem), docs = d.anexos.filter((a) => !a.imagem)
  const menuAnexo = (a: Detalhe['anexos'][number]) =>
    menuContexto(() => (a.url ? [itemMenuContexto({ tipo: 'arquivo', ref: a.url, titulo: a.nome, origem: d.titulo, pid: d.pid })] : []))

  return (
    <div className="pj-detalhe rolavel" style={{ opacity: ocupado ? 0.6 : 1 }}>
      <div className="pj-detalhe-corpo">
        <div className="linha-h pj-detalhe-topo">
          <Bolinha cor={d.cor} tamanho={9} />
          <span className="texto2 pj-corta">{d.projeto ?? 'projeto sem nome'}</span>
          {d.epico && <span className="texto2 pj-corta">· {d.epico}</span>}
          <span className="espaco" />
          <BotaoContexto item={{ tipo: 'task', ref: tid, titulo: d.titulo, origem: d.projeto, pid: d.pid }} />
          <Botao tipo="link" onClick={() => api.abrirLink(d.url)}>
            <ExternalLink size={13} /> Abrir no Journify
          </Botao>
          {fechar && (
            <Botao tipo="icone" onClick={fechar} title="Fechar os detalhes (Esc)">
              <X size={16} strokeWidth={2.5} />
            </Botao>
          )}
        </div>
        <h2 className="pj-detalhe-titulo selecionavel">{d.titulo}</h2>

        {/* status, prioridade, prazo e pontos: numa linha quando cabe; no painel estreito, quebra */}
        <div className="pj-controles">
          <Select
            largura={190}
            title={atrasada ? 'Atrasada: o prazo já passou' : 'Status'}
            opcoes={d.status_app.map((s) => ({ valor: s, rotulo: rotulo(s), cor: corStatus(s) }))}
            valor={d.status}
            mudar={(s) => (d.pede_video.includes(s) ? setFechandoEm(s) : mudar('status', s))}
          />
          <Select
            largura={140}
            vazio="sem prioridade"
            opcoes={['baixa', 'media', 'alta', 'critica'].map((p) => ({ valor: p, rotulo: rotuloPrioridade(p), cor: corPrioridade(p) }))}
            valor={d.prioridade}
            mudar={(p) => mudar('prioridade', p)}
          />
          <span className="linha-h">
            <CampoData data={dataLocal(d.prazo) ?? new Date()} mudar={(x) => mudar('prazo', diaLocal(x))} />
            {!d.prazo && <span className="texto2 pequeno-texto">sem prazo</span>}
            {d.pontos != null && (
              <span
                className={d.pontos > 8 ? 'perigo-texto' : 'texto2'}
                title={d.pontos > 8 ? 'Acima de 8 pontos: não cabe num PR, divida a task' : undefined}
              >
                {fmtPontos(d.pontos)} pts
              </span>
            )}
          </span>
        </div>
        <Aviso texto={aviso} />

        <div className="linha-h pj-quebra">
          <span title={d.configurado ? 'Abre numa aba do jfy' : 'Configure o projeto no menu do jfy antes'} className="linha-h">
            <Botao tipo="primario" disabled={!d.configurado} onClick={() => abrir('pipeline')}>
              <Hammer size={14} /> Implementar (/pipeline)
            </Botao>
            <Botao disabled={!d.configurado} onClick={() => abrir('livre')}>
              <MessageSquare size={14} /> Conversar com o Claude
            </Botao>
          </span>
          <Botao
            disabled={ocupado}
            onClick={() => focar(!noFoco)}
            title={
              noFoco
                ? 'Sai do Foco (volta a entrar sozinha se o prazo chegar perto)'
                : 'Entra no topo do Foco e da Meu dia, mesmo sem prazo. Só para você: o Journify não muda'
            }
          >
            <Crosshair size={14} /> {noFoco ? 'Tirar do foco' : 'Marcar como foco'}
          </Botao>
          <Botao disabled={anexando} onClick={anexar} title="Um print ou o vídeo do teste. Anexo até 20 MB, vídeo até 100 MB: arquivo grande leva um tempo">
            {anexando ? <Carregando /> : <Paperclip size={14} />} {anexando ? 'Enviando…' : 'Anexar arquivo'}
          </Botao>
        </div>

        <Secao titulo="O que fazer">
          {d.descricao.trim() ? (
            // a imagem da descrição abre pelo link, como no app do Mac (a que está dentro de um link já abre por ele)
            <div onClick={(e) => e.target instanceof HTMLImageElement && !e.target.closest('a') && api.abrirLink(e.target.src)}>
              <TextoRico texto={d.descricao} className="pj-com-imagens" />
            </div>
          ) : (
            <span className="texto2">(sem descrição)</span>
          )}
        </Secao>

        {d.anexos.length > 0 && (
          <Secao titulo={`Anexos (${d.anexos.length})`}>
            {imgs.length > 0 && (
              <div className="pj-imagens">
                {imgs.map((a) => (
                  <button type="button" key={a.n} className="pj-imagem" title={a.nome} onClick={() => abrirURL(a.url)} onContextMenu={menuAnexo(a)}>
                    {a.url ? <img src={a.url} alt="" /> : <span />}
                    <span className="pj-imagem-n">a{a.n}</span>
                  </button>
                ))}
              </div>
            )}
            {docs.map((a) => {
              const Icone = iconeAnexo(a.tipo)
              return (
                <Botao tipo="link" key={a.n} title={`Abrir ${a.nome}`} onClick={() => abrirURL(a.url)} onContextMenu={menuAnexo(a)}>
                  <Icone size={14} /> a{a.n}  {a.nome}
                </Botao>
              )
            })}
          </Secao>
        )}

        {links.length > 0 && (
          <Secao titulo={`Links (${links.length})`}>
            {links.map((l) => (
              <button
                type="button"
                key={l.url}
                className="pj-link"
                title={l.url}
                onClick={() => abrirURL(l.url)}
                onContextMenu={menuContexto(() => [
                  { rotulo: 'Copiar o link', icone: <Link size={13} />, acao: () => api.copiar(l.url) },
                  itemMenuContexto({ tipo: 'link', ref: l.url, titulo: l.nome, origem: d.titulo, pid: d.pid })
                ])}
              >
                <l.icone size={16} className="destaque" />
                <span className="pilha pj-link-texto">
                  <span className="pj-corta">{l.nome}</span>
                  <span className="texto2 pequeno-texto pj-corta">{l.tipo} · {l.origem}</span>
                </span>
              </button>
            ))}
          </Secao>
        )}

        {prs.length > 0 && (
          <Secao titulo={`Pull requests (${prs.length})`}>
            {prs.map((pr) => (
              <Botao tipo="link" key={pr} title="Abrir na aba GitHub" onClick={() => irPara('GitHub', { abrirPR: pr })}>
                <GitPullRequestArrow size={14} /> {pr}
              </Botao>
            ))}
          </Secao>
        )}

        <Secao titulo={`Comentários (${d.comentarios.length})`}>
          {d.comentarios.map((c, i) => (
            <div key={i} className="pj-comentario">
              <div className="linha-h">
                <strong>{c.autor ?? '?'}</strong>
                <span className="texto2 pequeno-texto">{quando(c.quando)}</span>
              </div>
              <TextoRico texto={c.texto} />
            </div>
          ))}
          <div className="pj-comentar">
            <AreaTexto placeholder="Comentar" rows={1} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <Botao disabled={!comentario.trim() || ocupado} onClick={() => (mudar('comentario', comentario), setComentario(''))}>
              Enviar
            </Botao>
          </div>
        </Secao>
      </div>
      {fechandoEm && (
        <PedirVideo status={fechandoEm} botao="Mover" fechar={() => setFechandoEm(null)} mover={(v) => mudar('status', fechandoEm, v)} />
      )}
    </div>
  )
}

// só o link, como no jfy: nada é baixado
const abrirURL = (u?: string | null) => u && api.abrirLink(u)

function iconeAnexo(tipo: string): LucideIcon {
  return tipo.includes('pdf') ? FileText
    : tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv') ? Sheet
    : tipo.startsWith('video/') ? Film
    : tipo.includes('zip') ? FileArchive
    : File
}

function quando(iso?: string | null) {
  const d = iso ? new Date(iso) : null
  return d && !isNaN(+d) ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}

/** Os PRs citados na task (o pr-creator da pipeline comenta o link do PR nela), como "dono/repo#n". */
function prsCitados(d: Detalhe) {
  const txt = [d.descricao, ...d.comentarios.map((c) => c.texto)].join('\n')
  return [...new Set([...txt.matchAll(/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g)].map((m) => `${m[1]}#${m[2]}`))]
}

type LinkCitado = { url: string; nome: string; tipo: string; icone: LucideIcon; origem: string }

/** Os links citados na descrição e nos comentários (Figma, Google Docs, Drive…), sem repetir, sem as imagens que a
 * descrição já mostra, sem os anexos e sem os PRs (que têm a seção deles). */
function linksCitados(d: Detalhe): LinkCitado[] {
  const fontes: [string, string][] = [['descrição', d.descricao], ...d.comentarios.map((c): [string, string] => [`comentário de ${c.autor ?? 'alguém'}`, c.texto])]
  const vistos = new Set(d.anexos.map((a) => a.url).filter(Boolean)), out: LinkCitado[] = []
  for (const [origem, texto] of fontes) {
    const semImagens = texto.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    for (const m of semImagens.matchAll(/https?:\/\/[^\s<>"'()[\]]+/g)) {
      const u = m[0].replace(/[.,;:!?]+$/, '')
      if (vistos.has(u) || /github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.test(u)) continue
      vistos.add(u)
      // o rótulo do link: o texto antes dele na linha ("Regras de Negócio: <link>") ou o de [texto](<link>)
      const linha = semImagens.slice(0, m.index).split('\n').pop() ?? ''
      const r = (linha.match(/\[([^\]]+)\]\($/)?.[1] ?? linha).replaceAll('**', '').replace(/^[-*•:([ \t]+|[-*•:([ \t]+$/g, '')
      out.push(linkCitado(u, origem, r.length >= 2 && r.length <= 50 ? r : null))
    }
  }
  return out
}

function linkCitado(u: string, origem: string, rotuloAntes: string | null): LinkCitado {
  let host = '', caminho = ''
  try {
    const url = new URL(u)
    host = url.hostname.replace(/^www\./, '')
    caminho = decodeURIComponent(url.pathname)
  } catch {
    /* link torto: fica só o texto */
  }
  const [tipo, icone]: [string, LucideIcon] =
    host.endsWith('figma.com') ? ['Figma', Palette]
    : host === 'docs.google.com' && caminho.startsWith('/spreadsheets') ? ['Planilha Google', Sheet]
    : host === 'docs.google.com' && caminho.startsWith('/presentation') ? ['Apresentação Google', Presentation]
    : host === 'docs.google.com' ? ['Documento Google', FileText]
    : host === 'drive.google.com' ? ['Google Drive', HardDrive]
    : host.endsWith('github.com') ? ['GitHub', CodeXml]
    : host.includes('loom.com') || host.includes('youtu') ? ['Vídeo', SquarePlay]
    : [host, Link]
  // o Figma traz o nome do arquivo no link: figma.com/design/<chave>/<Nome-do-arquivo>
  const partes = caminho.split('/').filter(Boolean)
  const r = rotuloAntes?.toLowerCase() === tipo.toLowerCase() ? null : rotuloAntes // "Figma: <link>" não diz mais que o tipo
  const nome = r ?? (host.endsWith('figma.com') && partes.length >= 3 ? partes[2].replace(/-/g, ' ').split(' ').filter(Boolean).join(' ')
    : (host + caminho).slice(0, 80))
  return { url: u, nome, tipo, icone, origem }
}
