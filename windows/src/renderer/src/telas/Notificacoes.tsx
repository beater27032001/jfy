// Tela "Notificações" (app/Sources/JFY/Notificacoes.swift no Mac): o histórico do que o jfy avisou (reunião, email, o
// Claude, a jornada, o resumo das 7h). O notificar() do jfy grava cada aviso em ~/.jfy/notificacoes.jsonl; a tela lê
// o arquivo direto, sem rodar o jfy. Os avisos do Windows são do processo principal: aqui é só o histórico, o
// número de novas (barra lateral e ícone da barra de tarefas) e o mesmo clique.
import { useEffect, useRef, useState } from 'react'
import { Calendar, Flame, Mail, Sparkles } from 'lucide-react'
import { api } from '../jfy'
import { abrirUrl, irPara, loja, selos } from '../estado'
import { Botao, confirmar, fmtHora } from '../souv'
import './Notificacoes.css'

type Item = { ts: number; titulo: string; texto: string; abrir?: string | null; executar?: string | null; app?: string | null }

const itens = loja<Item[]>([])
/** Até onde você já viu; o que veio depois conta como novo na barra lateral e no ícone da barra de tarefas. */
const vistoAte = loja(0, 'notificacoesVistoAte')

function novas() {
  const v = vistoAte.get()
  const i = itens.get().findIndex((x) => x.ts <= v)
  return i < 0 ? itens.get().length : i
}

/** O número no ícone da barra de tarefas: um círculo vermelho com o número branco, desenhado aqui (o Windows quer a
 * imagem pronta). Com a janela fechada, é por ele que você vê que chegou algo. */
function imagemSelo(n: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#e5484d'
  g.beginPath()
  g.arc(16, 16, 16, 0, Math.PI * 2)
  g.fill()
  const t = n > 99 ? '99+' : String(n)
  g.fillStyle = '#fff'
  g.font = `bold ${t.length > 2 ? 13 : t.length > 1 ? 18 : 21}px Roboto, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(t, 16, 17)
  return c.toDataURL('image/png')
}

let seloAtual = -1
function selo() {
  const n = novas()
  if (n !== selos.get().notificacoes) selos.set((s) => ({ ...s, notificacoes: n }))
  if (n === seloAtual) return
  seloAtual = n
  if (n) api.selo(n, imagemSelo(n))
  else api.selo(0)
}

async function ler() {
  let txt = ''
  try {
    txt = (await api.lerJfy('notificacoes.jsonl')) ?? ''
  } catch {
    /* sem arquivo: lista vazia */
  }
  const l: Item[] = []
  // ponytail: lê o arquivo todo quando ele muda; só as 300 últimas aparecem
  for (const linha of txt.split('\n').filter(Boolean).slice(-300)) {
    try {
      const x = JSON.parse(linha)
      if (typeof x.ts === 'number' && typeof x.titulo === 'string' && typeof x.texto === 'string') l.push(x)
    } catch {
      /* linha estragada: pula */
    }
  }
  itens.set(l.reverse())
  selo()
}
// com a tela fechada também: o selo da barra lateral e o do ícone contam sempre
ler()
api.ao.notificacoes(ler)

const marcarLidas = () => (vistoAte.set((v) => Math.max(v, itens.get()[0]?.ts ?? 0)), selo())

function tipo(t: string) {
  return t.startsWith('Reunião') ? Calendar : t.startsWith('Email') ? Mail : t.startsWith('Claude') ? Sparkles : Flame
}

function nomeDia(d: Date) {
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  if (d.toDateString() === new Date().toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** O mesmo clique da notificação: a tela certa do app (jfy://…) ou o link (a chamada da reunião). */
function clicar(it: Item) {
  if (it.app) {
    abrirUrl('jfy://' + it.app.split('/').map(encodeURIComponent).join('/'))
    if (it.app.startsWith('aba/')) api.abas.ir(it.app.slice(4)) // o abrirUrl só leva ao terminal; isto escolhe a aba
  } else if (it.abrir) {
    if (it.abrir.startsWith('jfy://')) abrirUrl(it.abrir)
    else if (/^[a-z][\w+.-]*:/i.test(it.abrir)) api.abrirLink(it.abrir)
  } else if (it.executar) {
    irPara('jfy') // o executar é um comando do tmux, que só existe no Mac: aqui leva ao terminal do jfy
  }
}

export default function Notificacoes({ ativa }: { ativa: boolean }) {
  const lista = itens.use()
  // o que era novo quando a tela abriu continua marcado enquanto ela está aberta
  const [destaqueAte, setDestaqueAte] = useState(Infinity)
  const antes = useRef(false)

  useEffect(() => {
    if (ativa === antes.current) return
    antes.current = ativa
    if (ativa) setDestaqueAte(vistoAte.get())
    marcarLidas() // ao abrir e ao sair da tela
  }, [ativa])
  useEffect(() => void (ativa && marcarLidas()), [lista[0]?.ts])

  const porDia: [string, Item[]][] = []
  for (const it of lista) {
    const nome = nomeDia(new Date(it.ts * 1000))
    if (porDia.at(-1)?.[0] === nome) porDia.at(-1)![1].push(it)
    else porDia.push([nome, [it]])
  }

  return (
    <div className="nt">
      <div className="linha-h nt-topo">
        <div className="pilha nt-cabeca">
          <h1 className="nt-titulo">Notificações</h1>
          <span className="texto2">O que o jfy avisou: reuniões, emails, o Claude e a jornada. O clique faz o mesmo que na notificação.</span>
        </div>
        <span className="espaco" />
        <Botao
          disabled={!lista.length}
          onClick={async () => {
            if (!(await confirmar({ titulo: 'Apagar o histórico de notificações?', botao: 'Apagar', perigo: true }))) return
            await api.escreverJfy('notificacoes.jsonl', null)
            ler()
          }}
        >
          Limpar
        </Botao>
      </div>
      {!lista.length ? (
        <div className="vazio">
          <span>Nenhuma notificação ainda. As próximas que o jfy mandar aparecem aqui.</span>
        </div>
      ) : (
        <div className="nt-lista">
          {porDia.map(([dia, l]) => (
            <section key={dia}>
              <div className="nt-dia">{dia}</div>
              {l.map((it) => {
                const nova = it.ts > destaqueAte
                const acao = !!(it.abrir || it.executar || it.app)
                const Icone = tipo(it.titulo)
                return (
                  <div
                    key={it.ts}
                    className={`nt-linha ${acao ? 'acao' : ''} ${nova ? 'nova' : ''}`}
                    title={it.abrir ? 'Abrir o link' : it.executar ? 'Ir para o jfy' : undefined}
                    onClick={() => acao && clicar(it)}
                  >
                    <Icone size={16} className="nt-icone" />
                    <div className="nt-textos">
                      <div className="nt-tit">{it.titulo}</div>
                      <div className="texto2 nt-texto">{it.texto}</div>
                    </div>
                    <span className="texto2 pequeno-texto">{fmtHora(new Date(it.ts * 1000))}</span>
                    {nova && <span className="nt-ponto" />}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
