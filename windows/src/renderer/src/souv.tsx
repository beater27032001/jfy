// As interações da Souv (app/Sources/JFY/Souv.swift): botões, campos, caixa de marcar, segmentos, select com busca,
// menus (botão e clique direito), modal de confirmação, calendário e campo de data, markdown e as linhas de lista.
// Tudo na cor da Souv, nada na cor de destaque do sistema.
import {
  useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type TextareaHTMLAttributes
} from 'react'
import { createPortal } from 'react-dom'
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Calendar as IconeCalendario, LoaderCircle, PlusCircle } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { alternarNaCesta, carregarContatos, cesta, contatos, loja, naCesta, type ItemContexto } from './estado'
import { Avatar } from './avatar'

// ---------- botões e campos ----------
type TipoBotao = 'secundario' | 'primario' | 'perigo' | 'link' | 'icone'
/** Secundário (o padrão), primário (Vivid Blue), perigo (apagar), link (texto na cor de destaque) e ícone (sem fundo). */
export function Botao({ tipo = 'secundario', pequeno, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tipo?: TipoBotao; pequeno?: boolean }) {
  return <button type="button" {...p} className={`botao ${tipo} ${pequeno ? 'pequeno' : ''} ${className ?? ''}`} />
}

export function Campo({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`campo ${className ?? ''}`} />
}

export function AreaTexto({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`campo area ${className ?? ''}`} />
}

/** A caixa de marcar da Souv: quadradinho com a borda; marcado, Vivid Blue com o visto branco. */
export function Caixa({ marcado, mudar, children, title }: { marcado: boolean; mudar: (v: boolean) => void; children?: ReactNode; title?: string }) {
  return (
    <label className="caixa" title={title} onClick={(e) => (e.preventDefault(), e.stopPropagation(), mudar(!marcado))}>
      <span className={`quadrado ${marcado ? 'marcado' : ''}`}>{marcado && <Check size={11} strokeWidth={4} />}</span>
      {children}
    </label>
  )
}

/** O seletor segmentado: as opções numa faixa, a escolhida em Vivid Blue. `cheio` divide a largura toda. */
export function Segmentos<T extends string | number>(p: {
  valor: T
  opcoes: { valor: T; rotulo?: string; icone?: ReactNode; ajuda?: string }[]
  mudar: (v: T) => void
  cheio?: boolean
}) {
  return (
    <div className={`segmentos ${p.cheio ? 'cheio' : ''}`}>
      {p.opcoes.map((o) => (
        <button
          type="button"
          key={String(o.valor)}
          className={o.valor === p.valor ? 'marcado' : ''}
          title={o.ajuda ?? o.rotulo}
          onClick={() => p.mudar(o.valor)}
        >
          {o.icone}
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export function Carregando({ tamanho = 14 }: { tamanho?: number }) {
  return <LoaderCircle size={tamanho} className="girando" />
}

/** O número numa cápsula Vivid Blue (não lidos, novas, portas). Zero não aparece. */
export function Selo({ n }: { n: number }) {
  return n > 0 ? <span className="selo">{n}</span> : null
}

export function FotoConta({ url, tamanho = 18 }: { url: string; tamanho?: number }) {
  return <img className="foto-conta" src={url} width={tamanho} height={tamanho} alt="" />
}

export function Bolinha({ cor, tamanho = 8 }: { cor?: string | null; tamanho?: number }) {
  return <span className="bolinha" style={{ background: cor ?? 'var(--texto2)', width: tamanho, height: tamanho }} />
}

/** Uma mensagem no topo de um painel: erro (vermelho), alerta (laranja), ok (verde) ou só informação. O × fecha. */
export function Aviso({ texto, tipo = 'erro', fechar }: { texto: string | null | undefined; tipo?: 'erro' | 'alerta' | 'ok' | 'info'; fechar?: () => void }) {
  if (!texto) return null
  return (
    <div className={`aviso ${tipo}`}>
      <span>{texto}</span>
      {fechar && (
        <button type="button" className="botao icone" onClick={fechar} aria-label="Fechar">
          ×
        </button>
      )}
    </div>
  )
}

/** Uma linha de lista: o clique escolhe; a escolhida ganha o fundo Vivid Blue suave e a barrinha de destaque. */
export function Linha({ marcada, className, ...p }: React.HTMLAttributes<HTMLDivElement> & { marcada?: boolean }) {
  return <div {...p} className={`linha ${marcada ? 'marcada' : ''} ${className ?? ''}`} />
}

export function Vazio({ titulo, children, icone }: { titulo: string; children?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="vazio">
      {icone}
      <h2>{titulo}</h2>
      {children && <span>{children}</span>}
    </div>
  )
}

// ---------- o que flutua: popover, menus e modais ----------
// tudo que abre por cima (modal, popover, menu) entra numa pilha só: o Esc fecha o de cima e mais nada. Um calendário
// aberto dentro do formulário do evento fecha sozinho, sem levar o formulário (e o que foi digitado) junto
const camadas: object[] = []
function useCamada(fechar: () => void) {
  const eu = useRef({}).current
  useEffect(() => {
    camadas.push(eu)
    return () => void camadas.splice(camadas.indexOf(eu), 1)
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || camadas.at(-1) !== eu) return
      e.stopPropagation()
      e.preventDefault()
      fechar()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [fechar])
}

/** Um painel preso a um elemento (abaixo dele), por cima de tudo. Fecha com Esc e com o clique fora. */
export function Flutuante(p: { ancora: HTMLElement | null; fechar: () => void; children: ReactNode; largura?: number; lado?: 'baixo' | 'direita' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!p.ancora || !ref.current) return
    const a = p.ancora.getBoundingClientRect()
    const r = ref.current.getBoundingClientRect()
    let left = p.lado === 'direita' ? a.right + 6 : a.left
    let top = p.lado === 'direita' ? a.top : a.bottom + 4
    left = Math.max(8, Math.min(left, innerWidth - r.width - 8))
    if (top + r.height > innerHeight - 8) top = Math.max(8, p.lado === 'direita' ? innerHeight - r.height - 8 : a.top - r.height - 4)
    setPos({ left, top })
  }, [p.ancora])
  useCamada(p.fechar)
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !p.ancora?.contains(e.target as Node)) p.fechar()
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [p.ancora, p.fechar])
  return createPortal(
    <div ref={ref} className="flutuante" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, minWidth: p.largura }}>
      {p.children}
    </div>,
    document.body
  )
}

export type ItemMenu = { rotulo: string; acao: () => void; perigo?: boolean; desativado?: boolean; icone?: ReactNode } | '-'

function ListaMenu({ itens, fechar }: { itens: ItemMenu[]; fechar: () => void }) {
  return (
    <div className="lista-menu">
      {itens.map((i, k) =>
        i === '-' ? (
          <hr key={k} />
        ) : (
          <button
            type="button"
            key={k}
            disabled={i.desativado}
            className={i.perigo ? 'perigo' : ''}
            // fecha antes de rodar: a ação pode abrir um modal
            onClick={() => (fechar(), setTimeout(i.acao))}
          >
            {i.icone}
            {i.rotulo}
          </button>
        )
      )}
    </div>
  )
}

/** Um botão que abre um menu da Souv: o rótulo com a setinha e, no clique, a lista. */
export function MenuBotao({ rotulo, itens, tipo, pequeno, title, desativado }: { rotulo: ReactNode; itens: ItemMenu[]; tipo?: TipoBotao; pequeno?: boolean; title?: string; desativado?: boolean }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  return (
    <>
      <Botao tipo={tipo} pequeno={pequeno} title={title} disabled={desativado} onClick={(e) => setAncora(ancora ? null : e.currentTarget)}>
        {rotulo} <ChevronDown size={11} strokeWidth={3} className="texto2" />
      </Botao>
      {ancora && (
        <Flutuante ancora={ancora} fechar={() => setAncora(null)} largura={210}>
          <ListaMenu itens={itens} fechar={() => setAncora(null)} />
        </Flutuante>
      )}
    </>
  )
}

// o menu do clique direito: um só na tela, aberto onde você clicou
const menuAberto = loja<{ x: number; y: number; itens: ItemMenu[] } | null>(null)
/** onContextMenu={menuContexto(() => [...])}: o clique direito abre o menu da Souv com estes itens. */
export const menuContexto = (itens: () => ItemMenu[]) => (e: React.MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  const l = itens()
  if (l.length) menuAberto.set({ x: e.clientX, y: e.clientY, itens: l })
}

// a confirmação: confirmar({...}) abre o modal e responde true (o botão) ou false (Cancelar, Esc)
type Pedido = { titulo: string; mensagem?: ReactNode; botao: string; perigo?: boolean; ok: (v: boolean) => void }
const confirmacao = loja<Pedido | null>(null)
/** O modal de confirmação da Souv. O que apaga (perigo) não vai no Enter, para não apagar sem querer. */
export const confirmar = (p: Omit<Pedido, 'ok'>) => new Promise<boolean>((ok) => confirmacao.set({ ...p, ok }))

/** Um modal com conteúdo seu (formulários): título em Lexend, o corpo e os botões embaixo. Esc e o clique fora fecham. */
export function Modal(p: { titulo: string; children?: ReactNode; acoes?: ReactNode; fechar: () => void; largura?: number }) {
  useCamada(p.fechar)
  return createPortal(
    <div className="veu" onMouseDown={(e) => e.target === e.currentTarget && p.fechar()}>
      <div className="modal" role="dialog" aria-label={p.titulo} style={{ width: p.largura }}>
        <h3>{p.titulo}</h3>
        {p.children}
        {p.acoes && <div className="acoes">{p.acoes}</div>}
      </div>
    </div>,
    document.body
  )
}

const fecharMenu = () => menuAberto.set(null)
function MenuDoClique({ menu }: { menu: { x: number; y: number; itens: ItemMenu[] } }) {
  useCamada(fecharMenu)
  useEffect(() => {
    setTimeout(() => document.addEventListener('mousedown', fecharMenu))
    return () => document.removeEventListener('mousedown', fecharMenu)
  }, [menu])
  return createPortal(
    <div
      className="flutuante"
      style={{ left: Math.min(menu.x, innerWidth - 230), top: Math.min(menu.y, innerHeight - 40 - 32 * menu.itens.length) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ListaMenu itens={menu.itens} fechar={fecharMenu} />
    </div>,
    document.body
  )
}

/** Vai uma vez na raiz do app: o menu do clique direito e a confirmação. */
export function HostSouv() {
  const menu = menuAberto.use()
  const pedido = confirmacao.use()
  const fechar = (v: boolean) => (pedido?.ok(v), confirmacao.set(null))
  return (
    <>
      {menu && <MenuDoClique menu={menu} />}
      {pedido && (
        <Modal
          titulo={pedido.titulo}
          fechar={() => fechar(false)}
          acoes={
            <>
              <Botao onClick={() => fechar(false)}>Cancelar</Botao>
              <Botao tipo={pedido.perigo ? 'perigo' : 'primario'} autoFocus={!pedido.perigo} onClick={() => fechar(true)}>
                {pedido.botao}
              </Botao>
            </>
          }
        >
          {pedido.mensagem && <div className="mensagem">{pedido.mensagem}</div>}
        </Modal>
      )}
    </>
  )
}

// ---------- o select da Souv ----------
export type Opcao<T> = { valor: T; rotulo: string; cor?: string | null; foto?: string }
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** O valor escolhido (com a bolinha de cor, quando tem) num campo arredondado; o clique abre a lista, com a marca no
 * escolhido. Lista com mais de 12 ganha a busca (sem acento). `extra`: uma ação no fim ("Outro nome…"). `rotuloLivre`:
 * aparece quando o valor atual não está entre as opções (um nome livre). */
export function Select<T>(p: {
  opcoes: Opcao<T>[]
  valor: T | null | undefined
  mudar: (v: T) => void
  vazio?: string
  rotuloLivre?: string | null
  corLivre?: string | null
  extra?: [string, () => void]
  semBusca?: boolean
  largura?: number | string
  desativado?: boolean
  title?: string
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const [busca, setBusca] = useState('')
  const atual = p.opcoes.find((o) => o.valor === p.valor)
  const comBusca = p.opcoes.length > 12 && !p.semBusca
  const visiveis = busca.trim() ? p.opcoes.filter((o) => semAcento(o.rotulo).includes(semAcento(busca.trim()))) : p.opcoes
  const pegar = (o: Opcao<T>) => (setAncora(null), o.valor !== p.valor && p.mudar(o.valor))
  const cor = atual?.cor ?? (!atual && p.rotuloLivre ? p.corLivre : null)
  return (
    <>
      <button
        type="button"
        className={`select ${ancora ? 'aberto' : ''}`}
        style={{ width: p.largura }}
        disabled={p.desativado}
        title={p.title}
        onClick={(e) => (setBusca(''), setAncora(ancora ? null : e.currentTarget))}
      >
        {cor && <Bolinha cor={cor} />}
        {atual?.foto && <FotoConta url={atual.foto} />}
        <span className={`rotulo ${!atual && !p.rotuloLivre ? 'texto2' : ''}`}>{atual?.rotulo ?? p.rotuloLivre ?? p.vazio ?? 'Escolher'}</span>
        <ChevronDown size={11} strokeWidth={3} className="texto2" />
      </button>
      {ancora && (
        <Flutuante ancora={ancora} fechar={() => setAncora(null)} largura={Math.max(240, ancora.offsetWidth)}>
          {comBusca && (
            <Campo
              autoFocus
              placeholder="Buscar"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && visiveis[0] && pegar(visiveis[0])}
              style={{ marginBottom: 6 }}
            />
          )}
          <div className="lista-menu rolavel">
            {visiveis.map((o, i) => (
              <button type="button" key={i} onClick={() => pegar(o)}>
                {o.cor && <Bolinha cor={o.cor} />}
                {o.foto && <FotoConta url={o.foto} />}
                <span className="rotulo">{o.rotulo}</span>
                {o.valor === p.valor && <Check size={13} strokeWidth={3} className="destaque" />}
              </button>
            ))}
            {!visiveis.length && <div className="texto2" style={{ padding: 10 }}>Nada com "{busca}"</div>}
            {p.extra && (
              <>
                <hr />
                <button type="button" className="texto2" onClick={() => (setAncora(null), p.extra![1]())}>
                  {p.extra[0]}
                </button>
              </>
            )}
          </div>
        </Flutuante>
      )}
    </>
  )
}

// ---------- datas ----------
/** "AAAA-MM-DD" do dia local, e de volta (meio-dia: longe da virada). Nada de toISOString, que é UTC: no Brasil,
 * "25/11" virava 24/11 às 21h. */
export const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function dataLocal(s: string | null | undefined): Date | null {
  const m = s?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null
}
const mesmoDia = (a: Date, b: Date) => diaLocal(a) === diaLocal(b)
export const fmtData = (d: Date, o: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  d.toLocaleDateString('pt-BR', o).replace(/ de /g, ' ').replace('.', '')
export const fmtHora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** O mês com a semana começando no domingo, o dia escolhido em Vivid Blue e hoje com o anel. Mantém a hora da data.
 * `ate` bloqueia os dias depois dele (as horas não vão para o futuro). */
export function Calendario({ data, mudar, ate }: { data: Date; mudar: (d: Date) => void; ate?: Date | null }) {
  const [mes, setMes] = useState(() => new Date(data.getFullYear(), data.getMonth(), 1))
  const vazios = mes.getDay()
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const limite = ate ? new Date(ate.getFullYear(), ate.getMonth(), ate.getDate()) : null
  const proximo = new Date(mes.getFullYear(), mes.getMonth() + 1, 1)
  const titulo = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ')
  return (
    <div className="calendario">
      <div className="cabeca">
        <Botao tipo="icone" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mês anterior">
          <ChevronLeft size={14} />
        </Botao>
        <strong>{titulo[0].toUpperCase() + titulo.slice(1)}</strong>
        <Botao tipo="icone" disabled={!!limite && proximo > limite} onClick={() => setMes(proximo)} aria-label="Próximo mês">
          <ChevronRight size={14} />
        </Botao>
      </div>
      <div className="grade">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="semana">{d}</span>
        ))}
        {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
        {Array.from({ length: dias }, (_, i) => {
          const d = new Date(mes.getFullYear(), mes.getMonth(), i + 1, data.getHours(), data.getMinutes())
          const bloqueado = !!limite && d > new Date(limite.getTime() + 86_399_000)
          return (
            <button
              type="button"
              key={i}
              disabled={bloqueado}
              className={`${mesmoDia(d, data) ? 'escolhido' : ''} ${mesmoDia(d, new Date()) ? 'hoje' : ''}`}
              onClick={() => mudar(d)}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** O dia (e a hora, com `comHora`): o clique abre o calendário da Souv. */
export function CampoData({ data, mudar, ate, comHora }: { data: Date; mudar: (d: Date) => void; ate?: Date | null; comHora?: boolean }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const hora = (h: number, m: number) => {
    const d = new Date(data)
    d.setHours(h, m, 0, 0)
    mudar(d)
  }
  const min = data.getMinutes()
  return (
    <span className="campo-data">
      <Botao onClick={(e) => setAncora(ancora ? null : e.currentTarget)}>
        <IconeCalendario size={13} /> {fmtData(data)}
      </Botao>
      {ancora && (
        <Flutuante ancora={ancora} fechar={() => setAncora(null)}>
          <Calendario data={data} ate={ate} mudar={(d) => (mudar(d), setAncora(null))} />
        </Flutuante>
      )}
      {comHora && (
        <>
          <Select
            largura={64}
            semBusca
            valor={data.getHours()}
            opcoes={Array.from({ length: 24 }, (_, h) => ({ valor: h, rotulo: String(h).padStart(2, '0') }))}
            mudar={(h) => hora(h, min)}
          />
          <span className="texto2">:</span>
          <Select
            largura={64}
            semBusca
            valor={min}
            rotuloLivre={String(min).padStart(2, '0')}
            opcoes={Array.from({ length: 12 }, (_, i) => ({ valor: i * 5, rotulo: String(i * 5).padStart(2, '0') }))}
            mudar={(m) => hora(data.getHours(), m)}
          />
        </>
      )}
    </span>
  )
}

// ---------- texto do Journify e de emails: markdown ou HTML, sempre limpo ----------
DOMPurify.addHook('afterSanitizeAttributes', (n) => {
  // todo link abre no navegador (o processo principal manda para fora); nada navega dentro do app
  if (n.tagName === 'A') (n.setAttribute('target', '_blank'), n.setAttribute('rel', 'noopener'))
})
// HTML de verdade (o editor do Journify) começa com uma tag de bloco; markdown com <img> ou <br> no meio (comum em PR do
// GitHub) vai pelo marked, que já deixa passar o HTML do meio
const pareceHtml = (s: string) => /^\s*<(p|div|h[1-6]|ul|ol|table|blockquote|figure|section)\b/i.test(s)

/** Markdown ou HTML (o Journify manda dos dois), limpo pelo DOMPurify antes de entrar na tela. */
export function TextoRico({ texto, className }: { texto: string | null | undefined; className?: string }) {
  if (!texto) return null
  const html = pareceHtml(texto) ? texto : (marked.parse(texto, { async: false, breaks: true }) as string)
  return <div className={`texto-rico ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
}

// ---------- cesta de contexto: o botão "Contexto" e a linha do clique direito ----------
/** "+ Contexto" no topo de uma task, documento, reunião, email ou PR. */
export function BotaoContexto({ item, pequeno }: { item: ItemContexto; pequeno?: boolean }) {
  cesta.use()
  const dentro = naCesta(item)
  return (
    <Botao pequeno={pequeno} onClick={() => alternarNaCesta(item)}
      title={dentro ? 'Tirar da cesta de contexto' : 'Pôr na cesta de contexto, para mandar ao Claude'}>
      {dentro ? <CheckCircle2 size={13} className="destaque" /> : <PlusCircle size={13} />}
      {dentro ? 'No contexto' : 'Contexto'}
    </Botao>
  )
}
/** O mesmo, como item de menu do clique direito (linhas de arquivo, link, documento). */
export const itemMenuContexto = (item: ItemContexto): ItemMenu => ({
  rotulo: naCesta(item) ? 'Tirar do contexto' : 'Adicionar ao contexto',
  acao: () => alternarNaCesta(item)
})

// ---------- campo de emails (Para, Cc, convidados, "Reunião com…") ----------
/** Emails separados por vírgula: enquanto você digita, sugere os contatos que batem (nome ou email); o clique troca o
 * que está sendo digitado pelo email escolhido, como o Gmail. Enter fecha o email digitado (`aoEnter` recebe o texto,
 * para a Agenda virar uma pessoa). */
export function CampoEmails({ rotulo, texto, mudar, aoEnter, largura }: {
  rotulo: string
  texto: string
  mudar: (t: string) => void
  aoEnter?: (t: string) => void
  largura?: number | string
}) {
  const lista = contatos.use()
  const [focado, setFocado] = useState(false)
  useEffect(() => void carregarContatos(), [])
  const digitando = (texto.split(',').pop() ?? '').trim().toLowerCase()
  const ja = new Set(texto.toLowerCase().split(',').map((x) => x.trim()))
  const sugestoes = focado && digitando.length >= 2
    ? lista.filter((c) => !ja.has(c.email) && (c.email.includes(digitando) || c.nome.toLowerCase().includes(digitando))).slice(0, 6)
    : []
  const escolher = (email: string) => {
    const partes = texto.split(',').map((x) => x.trim())
    partes[partes.length - 1] = email
    const novo = partes.filter(Boolean).join(', ') + ', '
    mudar(novo)
    aoEnter?.(novo)
  }
  return (
    <div className="campo-emails" style={{ width: largura }}>
      <div className="linha-h">
        <span className="texto2 rotulo-campo">{rotulo}</span>
        <Campo
          placeholder="emails, separados por vírgula"
          value={texto}
          onChange={(e) => mudar(e.target.value)}
          onFocus={() => setFocado(true)}
          onBlur={() => setTimeout(() => setFocado(false), 150)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (sugestoes[0]) escolher(sugestoes[0].email)
            else if (digitando.includes('@')) (mudar(texto + ', '), aoEnter?.(texto + ', '))
          }}
        />
      </div>
      {sugestoes.length > 0 && (
        <div className="sugestoes">
          {sugestoes.map((c) => (
            <button type="button" key={c.email} onMouseDown={(e) => (e.preventDefault(), escolher(c.email))}>
              <Avatar nome={c.nome} email={c.email} foto={c.foto} tamanho={18} />
              <span>{c.nome || c.email}</span>
              {c.nome && <span className="texto2">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
