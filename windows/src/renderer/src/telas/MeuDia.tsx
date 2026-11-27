// Tela "Meu dia" (app/Sources/JFY/MeuDia.swift no app do Mac): o que pede você hoje, de todas as telas num lugar só.
// Os Claudes que pediram resposta, as reuniões que faltam, as tasks no foco, os PRs esperando sua revisão, os
// importantes não lidos e a jornada. Cada cartão carrega sozinho, com os mesmos comandos das telas (--agenda-json,
// --projetos-json, --github-json, --emails-json), e o clique leva à tela certa, já no item.
import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Bell, Calendar, Clock, Crosshair, GitBranch, Mail, MessageSquare, Pause, Play, RotateCw, type LucideIcon } from 'lucide-react'
import { api, ler } from '../jfy'
import { abas, irPara, useACada } from '../estado'
import { useSinos } from '../Terminal'
import { Bolinha, Botao, Carregando, Selo, diaLocal, fmtHora } from '../souv'
import './MeuDia.css'

type Evento = { id: string; titulo: string; ini: number; fim: number; dia_inteiro: boolean; minha_resposta?: string | null; link?: string | null }
type Resumo = {
  id: string; titulo: string; status: string; pid: string; projeto?: string | null; cor?: string | null
  prazo_txt?: string | null; dias?: number | null
}
type PR = { repo: string; n: number; titulo: string; autor?: string | null; rascunho: boolean; atualizado: string; comentarios: number; projeto?: string | null; cor?: string | null }
type Email = { id: string; de: string; assunto: string; ts: number; lido?: boolean | null }

/** null: carregando; texto: o erro do jfy; lista: pronto. */
type Estado<T> = T[] | string | null

const META = 8 * 60 // a JORNADA do jfy, em minutos

export default function MeuDia({ ativa }: { ativa: boolean }) {
  const [reunioes, setReunioes] = useState<Estado<Evento>>(null)
  const [foco, setFoco] = useState<Estado<Resumo>>(null)
  const [prs, setPrs] = useState<Estado<PR>>(null)
  const [emails, setEmails] = useState<Estado<Email>>(null)
  const [recarga, setRecarga] = useState(0)
  const [agora, setAgora] = useState(() => Date.now() / 1000)
  const [dia, setDia] = useState<string | null>(null)

  // cada cartão vai sozinho: o lento (Gmail, GitHub) não segura os outros
  useEffect(() => {
    if (!ativa) return
    const hoje = diaLocal(new Date())
    pegar(['--agenda-json', hoje, hoje], setReunioes, (a: { eventos: Evento[] }) =>
      a.eventos.filter((e) => !e.dia_inteiro && e.minha_resposta !== 'declined').sort((x, y) => x.ini - y.ini))
    pegar(['--projetos-json'], setFoco, (p: { foco: Resumo[] }) => p.foco)
    pegar(['--github-json'], setPrs, (d: { revisar: PR[] }) => d.revisar)
    pegar(['--emails-json', 'importantes'], setEmails, (l: { emails: Email[] }) => l.emails.filter((e) => e.lido === false))
  }, [ativa, recarga])

  // a cada 30 s: a jornada anda e o "em 10 min" da reunião se atualiza, sem ir à rede
  useACada(async () => (setAgora(Date.now() / 1000), setDia(await api.lerJfy('dia.json'))), 30_000, ativa)

  const faltam = Array.isArray(reunioes) ? reunioes.filter((e) => e.fim > agora) : reunioes
  const sinos = useSinos()
  const esperando = abas.use().abas.filter((a) => sinos.has(a.id))
  const [m, rodando] = jornada(dia, agora)
  const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="md">
      <div className="linha-h md-cabeca">
        <div className="pilha" style={{ gap: 4 }}>
          <h1 className="md-titulo">Meu dia</h1>
          <span className="texto2">{data[0].toUpperCase() + data.slice(1)}</span>
        </div>
        <span className="espaco" />
        <Botao tipo="icone" title="Atualizar" onClick={() => setRecarga((r) => r + 1)}>
          <RotateCw size={15} />
        </Botao>
      </div>
      <div className="md-grade">
        <Cartao titulo="Claudes esperando você" Icone={Bell} total={esperando.length}>
          {esperando.length === 0 ? (
            <span className="texto2">Nenhum Claude pediu resposta.</span>
          ) : (
            esperando.map((a) => (
              <LinhaDia key={a.id} acao={() => (api.abas.ir(a.id), irPara('jfy'))}>
                <span className="linha-h">
                  <span className="sino" />
                  <span className="md-uma">{a.nome}</span>
                </span>
              </LinhaDia>
            ))
          )}
        </Cartao>

        <Cartao titulo="Reuniões de hoje" Icone={Calendar} total={total(faltam)} mais={['Agenda', () => irPara('Agenda')]}>
          <Bloco estado={faltam} vazio="Nenhuma reunião pela frente hoje." limite={4}>
            {(ev) => (
              <div className="linha-h" key={ev.id}>
                <LinhaDia acao={() => irPara('Agenda', { abrirEvento: ev.id })}>
                  <div className="pilha" style={{ gap: 2 }}>
                    <span className="md-uma">{ev.titulo}</span>
                    <span className={`md-legenda ${ev.ini - agora <= 5 * 60 ? 'destaque' : 'texto2'}`}>
                      {fmtHora(new Date(ev.ini * 1000))}–{fmtHora(new Date(ev.fim * 1000))}
                      {falta(ev.ini, agora)}
                    </span>
                  </div>
                </LinhaDia>
                {ev.link && (
                  <Botao tipo="primario" title={ev.link} onClick={() => api.abrirLink(ev.link!)}>
                    Entrar
                  </Botao>
                )}
              </div>
            )}
          </Bloco>
        </Cartao>

        <Cartao titulo="Foco" Icone={Crosshair} total={total(foco)} mais={['Ver todas', () => irPara('Projetos', { abrirProjeto: 'foco' })]}>
          <Bloco estado={foco} vazio="Nenhuma task com prazo perto ou crítica.">
            {(t) => (
              <LinhaDia key={t.id} acao={() => irPara('Projetos', { abrirTask: { pid: t.pid, tid: t.id } })}>
                <div className="pilha" style={{ gap: 3 }}>
                  <span className="md-duas">{t.titulo}</span>
                  <span className="linha-h md-legenda texto2" style={{ gap: 6 }}>
                    <Bolinha cor={t.cor} tamanho={6} />
                    <span>{t.projeto ?? ''}</span>
                    <StatusChip status={t.status} dias={t.dias} />
                    {t.prazo_txt && <span style={{ color: (t.dias ?? 99) <= 0 ? 'var(--md-vermelho)' : undefined }}>{t.prazo_txt}</span>}
                  </span>
                </div>
              </LinhaDia>
            )}
          </Bloco>
        </Cartao>

        <Cartao titulo="PRs esperando sua revisão" Icone={GitBranch} total={total(prs)} mais={['GitHub', () => irPara('GitHub')]}>
          <Bloco estado={prs} vazio="Nenhum PR pedindo sua revisão.">
            {(p) => (
              <LinhaDia key={`${p.repo}#${p.n}`} acao={() => irPara('GitHub', { abrirPR: `${p.repo}#${p.n}` })}>
                <div className="pilha" style={{ gap: 3, padding: '3px 0' }}>
                  <span className="linha-h" style={{ alignItems: 'baseline' }}>
                    <span className="md-duas">{p.titulo}</span>
                    {p.rascunho && <span className="md-rascunho">rascunho</span>}
                  </span>
                  <span className="linha-h md-legenda texto2" style={{ gap: 5 }}>
                    {p.projeto && <Bolinha cor={p.cor} tamanho={6} />}
                    <span className="md-uma">{`${p.projeto ?? p.repo} #${p.n} · ${p.autor ?? '?'} · ${relativo(Date.parse(p.atualizado) / 1000, true)}`}</span>
                    {p.comentarios > 0 && (
                      <span className="linha-h" style={{ gap: 3 }}>
                        <MessageSquare size={11} /> {p.comentarios}
                      </span>
                    )}
                  </span>
                </div>
              </LinhaDia>
            )}
          </Bloco>
        </Cartao>

        <Cartao titulo="Importantes não lidos" Icone={Mail} total={total(emails)} mais={['Emails', () => irPara('Emails')]}>
          <Bloco estado={emails} vazio="Nenhum email importante esperando.">
            {(e) => (
              <LinhaDia key={e.id} acao={() => irPara('Emails', { abrirEmail: e.id })}>
                <div className="pilha" style={{ gap: 2 }}>
                  <span className="md-uma" style={{ fontWeight: 500 }}>{e.assunto || '(sem assunto)'}</span>
                  <span className="md-uma md-legenda texto2">{`${e.de} · ${relativo(e.ts)}`}</span>
                </div>
              </LinhaDia>
            )}
          </Bloco>
        </Cartao>

        <Cartao titulo="Jornada" Icone={Clock} mais={['Horas', () => irPara('Horas')]}>
          <div className="linha-h" style={{ alignItems: 'baseline', gap: 6 }}>
            <span className="md-jornada">{`${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`}</span>
            <span className="texto2">de {META / 60}h</span>
            <span className="espaco" />
            <span className="linha-h md-legenda texto2" style={{ gap: 4 }}>
              {rodando ? <Play size={11} fill="currentColor" /> : <Pause size={11} fill="currentColor" />}
              {rodando ? 'rodando' : 'pausada'}
            </span>
          </div>
          <div className="md-barra">
            <span style={{ width: `${(100 * Math.min(m, META)) / META}%`, background: m >= META ? 'var(--md-verde)' : 'var(--primaria)' }} />
          </div>
        </Cartao>
      </div>
    </div>
  )
}

// ---------- ajudantes ----------
async function pegar<T, R>(args: string[], set: (e: Estado<R>) => void, f: (d: T) => R[]) {
  const [d, msg] = await ler<T>(args)
  set(d ? f(d) : (msg ?? 'O jfy não respondeu.'))
}

/** Quantos itens, para o número no título (nada enquanto carrega ou com erro). */
const total = <T,>(e: Estado<T>) => (Array.isArray(e) ? e.length : 0)

/** " · agora", " · em 25 min", " · em 2h10"; vazio depois de 3 h. */
function falta(ini: number, agora: number) {
  const m = Math.trunc((ini - agora) / 60)
  return m <= 0 ? ' · agora' : m < 60 ? ` · em ${m} min` : m <= 180 ? ` · em ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : ''
}

/** Minutos de hoje no cronômetro da jornada (o mesmo da barra do tmux: blocos [início, fim ou nulo]) e se está rodando. */
function jornada(texto: string | null, agora: number): [number, boolean] {
  try {
    const d = JSON.parse(texto ?? 'null') as { data: string; blocos: (number | null)[][] } | null
    if (!d || d.data !== diaLocal(new Date())) return [0, false]
    const s = d.blocos.reduce((soma, b) => soma + (b[1] ?? agora) - (b[0] ?? agora), 0)
    const ultimo = d.blocos[d.blocos.length - 1]
    return [Math.max(0, Math.floor(s / 60)), !!ultimo && (ultimo.length < 2 || ultimo[1] == null)]
  } catch {
    return [0, false] // arquivo pela metade: a próxima volta lê de novo
  }
}

/** "há 3 horas", "ontem" (curto: "há 3 h"), como o RelativeDateTimeFormatter do Mac. */
function relativo(ts: number, curto = false) {
  if (!ts) return ''
  const s = ts - Date.now() / 1000
  const f = new Intl.RelativeTimeFormat('pt-BR', curto ? { style: 'short', numeric: 'always' } : { numeric: 'auto' })
  const unidades = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60]] as const
  for (const [u, n] of unidades) if (Math.abs(s) >= n) return f.format(Math.round(s / n), u)
  return f.format(Math.round(s), 'second')
}

const ROTULOS_STATUS: Record<string, string> = {
  em_revisao: 'em revisão', pendente_validacao: 'pendente validação', finalizado_validacao: 'finalizado validação'
}
const CORES_STATUS: Record<string, string> = {
  em_aberto: '#8e8e93', criando_escopo: '#30b0c7', priorizado: '#004dff', em_progresso: '#34c759', em_revisao: '#ffcc00',
  em_teste: '#af52de', pendente_validacao: '#ff7ac7', bloqueado: '#ff9500', finalizado_validacao: '#a2845e',
  fechado: 'var(--md-fechado)'
}

/** A bolinha do status, sempre com o nome escrito. Prazo vencido numa task aberta pinta de vermelho e escreve
 * "atrasada": atrasada não é um status do Journify, é o prazo. */
function StatusChip({ status, dias }: { status: string; dias?: number | null }) {
  const atrasada = (dias ?? 0) < 0 && !['fechado', 'finalizado_validacao'].includes(status)
  const vazada = status === 'em_aberto' && !atrasada // ainda não começou
  return (
    <span className="linha-h" style={{ gap: 4 }}>
      <span
        className="bolinha"
        style={vazada ? { border: '1.5px solid #8e8e93' } : { background: atrasada ? 'var(--md-vermelho)' : CORES_STATUS[status] ?? '#8e8e93' }}
      />
      {(ROTULOS_STATUS[status] ?? status.replace(/_/g, ' ')) + (atrasada ? ' · atrasada' : '')}
    </span>
  )
}

/** Um cartão da Meu dia: título com o número, o atalho para a tela inteira e o conteúdo. */
function Cartao(p: { titulo: string; Icone: LucideIcon; total?: number; mais?: [string, () => void]; children: ReactNode }) {
  return (
    <div className="cartao md-cartao">
      <div className="linha-h">
        <p.Icone size={15} className="destaque" />
        <h3 className="md-cartao-titulo">{p.titulo}</h3>
        <Selo n={p.total ?? 0} />
        <span className="espaco" />
        {p.mais && (
          <Botao tipo="link" onClick={p.mais[1]}>
            {p.mais[0]}
          </Botao>
        )}
      </div>
      {p.children}
    </div>
  )
}

/** A lista de um cartão: carregando, o erro do jfy, o vazio ou as primeiras linhas. */
function Bloco<T>({ estado, vazio, limite = 5, children }: { estado: Estado<T>; vazio: string; limite?: number; children: (x: T) => ReactNode }) {
  if (estado === null) return <Carregando />
  if (typeof estado === 'string')
    return (
      <span className="md-erro md-legenda selecionavel">
        <AlertTriangle size={12} /> {estado}
      </span>
    )
  if (!estado.length) return <span className="texto2">{vazio}</span>
  return (
    <>
      {estado.slice(0, limite).map(children)}
      {estado.length > limite && <span className="md-legenda texto2">e mais {estado.length - limite}</span>}
    </>
  )
}

/** Uma linha clicável do cartão, que acende ao passar o mouse. */
function LinhaDia({ acao, children }: { acao: () => void; children: ReactNode }) {
  return (
    <div className="md-linha" onClick={acao}>
      {children}
    </div>
  )
}
