// Tela "Chat" (app/Sources/JFY/Chat.swift no Mac): o chat do time do Journify. A tela só desenha; quem fala com o
// Journify (pelo MCP) é o jfy: `--chat` (conversas), `--chat <id>` (mensagens; abrir marca como lida),
// `--chat <id> <texto> [ids marcados]` (envia), `--chat-ia` (melhora a mensagem pelo Claude) e `--corrigir` (o corretor
// de português, o Claude Haiku nos bastidores; `--corretor-aquecer` abre ele antes). A mensagem programada (o Journify
// não tem) é guardada pelo jfy (`--chat-programar`, `--chat-programadas`, `--chat-desprogramar`) e sai na hora pelo
// relógio dele, sem a tela. Mensagem nova vira notificação pelo vigia, e o clique abre a conversa aqui.
import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleArrowUp, Clock, Copy, Eye, MessagesSquare, Reply, Smile, Sparkles, SpellCheck, Star, StarOff, X } from 'lucide-react'
import { api, aquecerCorretor, fazer, ler } from '../jfy'
import { atendido, loja, nav } from '../estado'
import { Avatar as AvatarPessoa } from '../avatar'
import { Aviso, Botao, Carregando, Flutuante, Linha, Segmentos, Selo, diaLocal, fmtHora, menuContexto } from '../souv'
import './Chat.css'

type Mensagem = { id: string; autor: string; autor_id?: string | null; texto: string; quando?: string; minha?: boolean }
type Conversa = {
  id: string; nome: string; tipo?: string; nao_lidas?: number
  membro?: boolean // false: um canal que você vê sem participar, só leitura
  ultima?: { autor?: string | null; texto: string; quando?: string } | null
}
type Resultado = { status: number; saida: string; erro: string }
type Tipo = 'direta' | 'canal'
type Pessoa = { id: string; nome: string }
type Favoritas = { diretas: string[]; grupos: string[] }
type Troca = { de: string; para: string }
// a correção do Claude para o texto exato `de` (sem trocas: nada a corrigir, ou o motor descartou). dispensada: o ✕,
// ou já aplicada; a faixa não volta para esse texto
type Correcao = { de: string; texto: string; trocas: Troca[]; dispensada?: boolean }
// quando: epoch em segundos. erro: não foi (falhou, ou o computador estava desligado na hora) e espera você decidir
type Programada = { id: string; conversa: string; texto: string; mencoes: string; quando: number; erro?: string }

const tipoDe = (c: Conversa): Tipo => (c.tipo === 'canal' ? 'canal' : 'direta')
const abaLembrada = loja<Tipo>('direta', 'chat.aba')
// as fixadas no topo, na ordem em que foram fixadas. A que sumiu da lista fica guardada (volta quando ela voltar) e
// não conta na vaga, senão prenderia uma das 3 sem ter como tirar
const MAX_FIXAS = 3
const favoritas = loja<Favoritas>({ diretas: [], grupos: [] }, 'chat.favoritas')
const chaveFav = (t: Tipo) => (t === 'canal' ? 'grupos' : 'diretas')
const EMOJIS = ['👍', '🙏', '😂', '✅', '🎉', '❤️', '👀', '🚀', '🔥', '😅', '🤝', '💡']

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// "@Ana" não vale dentro de "@Anabela": depois do nome, nada de letra ou número
const depoisDoNome = '(?![\\p{L}\\p{N}])'

// o --chat não passa pelo app() do motor: o erro pode vir com o traceback, e o que interessa é a última linha
const motivo = (r: Resultado) => r.erro.trim().split('\n').at(-1) || `jfy --chat falhou (código ${r.status})`
function decodificar<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

/** "14:05" hoje, "24/11" antes. */
function hora(iso?: string) {
  const d = iso ? new Date(iso) : null
  if (!d || isNaN(+d)) return ''
  return d.toDateString() === new Date().toDateString() ? fmtHora(d) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** "AAAA-MM-DDTHH:MM" na hora local: o que o datetime-local e o --chat-programar entendem. */
const local = (d: Date) => `${diaLocal(d)}T${d.toTimeString().slice(0, 5)}`
/** Daqui a `dias` dias, às `h` em ponto (o setHours passa da meia-noite sozinho: 24h vira 0h do dia seguinte). */
function emPonto(dias: number, h: number) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(h, 0, 0, 0)
  return local(d)
}
/** "hoje 14:30", "amanhã 09:00" ou "sex 28/11 14:30". */
function quandoSai(ts: number) {
  const d = new Date(ts * 1000)
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  const dia = diaLocal(d) === diaLocal(new Date()) ? 'hoje' : diaLocal(d) === diaLocal(amanha) ? 'amanhã'
    : `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
  return `${dia} ${fmtHora(d)}`
}
// ponytail: a que chegou na hora (ou chega em 5 s) está saindo pelo relógio, que olha a fila a cada segundo: não dá
// mais para editar nem cancelar, senão o texto voltava ao campo de uma mensagem já enviada. O motor dizer no
// --chat-desprogramar se tirou de fato fecha a janela de vez
const saindo = (p: Programada) => !p.erro && p.quando * 1000 < Date.now() + 5_000

/** As conversas da aba: as fixadas (as que estão na lista) primeiro, e o resto. */
function separar(lista: Conversa[], aba: Tipo, fav: Favoritas) {
  const daAba = lista.filter((c) => tipoDe(c) === aba)
  const ids = fav[chaveFav(aba)]
  const fixadas = ids.map((id) => daAba.find((c) => c.id === id)).filter((c): c is Conversa => !!c)
  return { fixadas, resto: daAba.filter((c) => !ids.includes(c.id)) }
}

export default function Chat({ ativa }: { ativa: boolean }) {
  const { abrirConversa } = nav.use()
  const aba = abaLembrada.use()
  const fav = favoritas.use()
  const [conversas, setConversas] = useState<Conversa[] | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null) // a lista não veio (sem rede, sem o Journify)
  const [avisoFixa, setAvisoFixa] = useState<string | null>(null)
  // o @ sendo digitado: de onde até onde vai no campo, o que vem depois do @ e a sugestão marcada (↑/↓)
  const [mencao, setMencao] = useState<{ inicio: number; fim: number; busca: string; idx: number } | null>(null)
  // quem foi escolhido no @. Não precisa zerar: o id só vai se o "@Nome" ainda estiver no texto
  const [marcados, setMarcados] = useState<Pessoa[]>([])
  const [melhorando, setMelhorando] = useState(false)
  const [antes, setAntes] = useState<string | null>(null) // o texto de antes do Claude (ou do corretor), para o Desfazer
  // o Desfazer é do Melhorar (com a nota) ou do corretor (Corrigir, Aplicar ou Tab: só o botão)
  const [melhorada, setMelhorada] = useState(false)
  const [correcao, setCorrecao] = useState<Correcao | null>(null) // a última que voltou dos bastidores
  const [corrigindo, setCorrigindo] = useState(false) // o Corrigir esperando o corretor
  const [recado, setRecado] = useState<string | null>(null) // "Nada para corrigir.", por uns segundos
  const [erroCampo, setErroCampo] = useState<string | null>(null) // do Melhorar, do Corrigir ou da mensagem programada
  const [paleta, setPaleta] = useState<HTMLElement | null>(null) // os emojis abertos, presos ao botão
  const [relogio, setRelogio] = useState<HTMLElement | null>(null) // o "Programar envio" aberto, preso ao botão
  const [quando, setQuando] = useState('') // o dia e hora escolhidos no datetime-local
  const [programadas, setProgramadas] = useState<Programada[]>([]) // as desta conversa
  const sel = useRef(selecionada)
  sel.current = selecionada
  const textoAtual = useRef(texto) // a resposta do corretor só vale se o campo ainda tem o texto que foi
  textoAtual.current = texto
  const campo = useRef<HTMLTextAreaElement>(null)
  const rolagem = useRef<HTMLDivElement>(null)

  async function carregarConversas() {
    const r = await api.jfy(['--chat'])
    const lista = r.status === 0 ? decodificar<Conversa[]>(r.saida) : null
    // falhou: a lista que já estava fica, com o aviso; a próxima volta tenta de novo
    if (!lista) return setErro(r.status === 0 ? 'Não entendi a lista de conversas do jfy --chat.' : motivo(r))
    setErro(null)
    setConversas(lista)
    setSelecionada((s) => {
      if (s && lista.some((c) => c.id === s)) return s
      const { fixadas, resto } = separar(lista, abaLembrada.get(), favoritas.get()) // a primeira da aba, como aparece
      return (fixadas[0] ?? resto[0] ?? lista[0])?.id ?? null
    })
  }

  // a lista da última busca (jfy --chat-guardado), na hora; a busca de verdade, logo atrás, troca se mudou
  async function conversasGuardadas() {
    const r = await api.jfy(['--chat-guardado'])
    const lista = r.status === 0 ? decodificar<Conversa[]>(r.saida) : null
    if (!lista) return
    setConversas((l) => l ?? lista) // a busca de verdade chegou antes: fica a dela
    setSelecionada((s) => {
      if (s) return s
      const { fixadas, resto } = separar(lista, abaLembrada.get(), favoritas.get())
      return (fixadas[0] ?? resto[0] ?? lista[0])?.id ?? null
    })
  }

  // as mensagens da última vez, na hora e sem marcar como lida; a busca de verdade, logo atrás, traz as novas
  async function mensagensGuardadas(cid: string) {
    const r = await api.jfy(['--chat-guardado', cid])
    const lista = r.status === 0 ? decodificar<Mensagem[]>(r.saida) : null
    if (lista && sel.current === cid) setMensagens((m) => (m.length ? m : lista)) // a de verdade chegou antes: fica
  }

  async function carregarMensagens(cid: string) {
    const r = await api.jfy(['--chat', cid])
    const lista = r.status === 0 ? decodificar<Mensagem[]>(r.saida) : null
    if (!lista || sel.current !== cid) return
    // igual não troca: não redesenha nem rola
    setMensagens((m) => (JSON.stringify(m) === JSON.stringify(lista) ? m : lista))
    // o jfy marcou como lida no Journify: o selo some já, sem esperar a lista
    setConversas((l) => l && l.map((x) => (x.id === cid ? { ...x, nao_lidas: 0 } : x)))
  }

  // erro aqui fica quieto, como nas mensagens: a lista que estava fica e a próxima volta tenta de novo
  async function carregarProgramadas(cid: string) {
    const [lista] = await ler<Programada[]>(['--chat-programadas', cid])
    if (lista && sel.current === cid) setProgramadas((l) => (JSON.stringify(l) === JSON.stringify(lista) ? l : lista))
  }

  // ponytail: busca de tempos em tempos (conversas a cada 15 s, mensagens a cada 5 s, só com a tela à vista); tempo
  // real (SSE ou websocket) se o MCP do Journify oferecer
  useEffect(() => {
    conversasGuardadas()
    carregarConversas()
    if (!ativa) return
    const t = setInterval(carregarConversas, 15_000)
    return () => clearInterval(t)
  }, [ativa])

  // só com a tela à vista: ler as mensagens marca a conversa como lida no Journify. As programadas vêm junto: a que
  // sai pelo relógio some da lista e aparece na conversa
  useEffect(() => {
    if (!selecionada || !ativa) return
    mensagensGuardadas(selecionada)
    const ver = () => (carregarMensagens(selecionada), carregarProgramadas(selecionada))
    ver()
    const t = setInterval(ver, 5_000)
    return () => clearInterval(t)
  }, [selecionada, ativa])

  // o clique na notificação de mensagem nova
  useEffect(() => {
    if (!abrirConversa) return
    setSelecionada(abrirConversa)
    atendido('abrirConversa')
  }, [abrirConversa])
  // a conversa nova não mostra as mensagens (nem as programadas) da outra enquanto carrega
  useEffect(() => void (setMensagens([]), setProgramadas([])), [selecionada])

  const c = conversas?.find((x) => x.id === selecionada)
  // a conversa aberta por fora (o clique na notificação) aparece na aba dela; trocar de aba à mão não fecha a aberta
  const tipoAberta = c && tipoDe(c)
  useEffect(() => void (tipoAberta && abaLembrada.set(tipoAberta)), [selecionada, !conversas])

  // a última à vista quando chega uma nova (o scrollTop, não o scrollIntoView, que rolaria a janela toda)
  useEffect(() => {
    const r = rolagem.current
    if (r) r.scrollTop = r.scrollHeight
  }, [mensagens.at(-1)?.id])
  useEffect(() => void (ativa && campo.current?.focus()), [selecionada, ativa])

  const soLeitura = c?.membro === false
  const podeEnviar = !enviando && !melhorando && !corrigindo && !!texto.trim() && !soLeitura
  // a faixa das trocas acima do campo: a correção é deste texto, tem troca e ninguém dispensou
  const faixa = correcao?.de === texto && correcao.trocas.length && !correcao.dispensada && !melhorando && !corrigindo ? correcao : null

  // a primeira correção já acha o Claude do corretor aberto
  useEffect(() => void (ativa && selecionada && !soLeitura && aquecerCorretor()), [ativa, selecionada, soLeitura])

  // a correção nos bastidores: 1,5 s depois da última tecla, com 3 palavras ou mais. Não corrige de novo o texto que
  // já tem resposta, nem o que saiu de uma correção. Erro aqui fica quieto: o Corrigir mostra o dele
  useEffect(() => {
    if (soLeitura || texto.trim().split(/\s+/).length < 3 || correcao?.de === texto || correcao?.texto === texto) return
    const t = setTimeout(() => pedirCorrecao(texto), 1_500)
    return () => clearTimeout(t)
  }, [texto, soLeitura])

  // ponytail: o MCP do Journify não lista os membros da conversa; o @ sugere quem escreveu nas mensagens carregadas (as
  // 100 últimas), da mais recente para a mais antiga. Os membros de verdade quando o MCP der a lista
  const pessoas: Pessoa[] = []
  for (const m of [...mensagens].reverse())
    if (m.autor_id && !m.minha && !pessoas.some((p) => p.id === m.autor_id)) pessoas.push({ id: m.autor_id, nome: m.autor })
  const sugestoes = mencao ? pessoas.filter((p) => semAcento(p.nome).includes(semAcento(mencao.busca))).slice(0, 8) : []
  // com gente para sugerir mas nada batendo, a lista some (é só um @ no meio do texto)
  const listaMencao = !!mencao && (sugestoes.length > 0 || pessoas.length === 0)
  const idx = Math.min(mencao?.idx ?? 0, sugestoes.length - 1)

  // as "@Nome" dos autores conhecidos ficam em destaque nas mensagens (a mais comprida primeiro: "@Ana Souza" antes de "@Ana")
  const nomes = [...new Set(mensagens.map((m) => m.autor))].filter((n) => n && n !== '?').sort((a, b) => b.length - a.length)
  const reMencao = nomes.length ? new RegExp(`(@(?:${nomes.map(escapar).join('|')}))${depoisDoNome}`, 'gu') : null

  /** O que a pessoa digita: o Desfazer do Claude some na primeira edição. */
  function editar(t: string) {
    setTexto(t)
    setAntes(null)
  }

  /** Muda o campo por código (menção, emoji, citação) e devolve o foco com o cursor em `cursor`. Com o Claude
   * trabalhando, não: o texto dele chegaria por cima. */
  function trocar(t: string, cursor: number) {
    if (melhorando) return
    editar(t)
    requestAnimationFrame(() => campo.current && (campo.current.focus(), campo.current.setSelectionRange(cursor, cursor)))
  }

  /** Um @ logo antes do cursor (no começo ou depois de espaço: email não conta) abre as sugestões. */
  function verMencao(el: HTMLTextAreaElement) {
    const ate = el.selectionStart
    const m = ate === el.selectionEnd ? el.value.slice(0, ate).match(/(?:^|\s)@([^\s@]*)$/) : null
    setMencao((a) => (m ? { inicio: ate - m[1].length - 1, fim: ate, busca: m[1], idx: a?.busca === m[1] ? a.idx : 0 } : null))
  }

  function escolher(p: Pessoa) {
    if (!mencao) return
    const nome = `@${p.nome} `
    trocar(texto.slice(0, mencao.inicio) + nome + texto.slice(mencao.fim), mencao.inicio + nome.length)
    setMarcados((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]))
    setMencao(null)
  }

  function porEmoji(e: string) {
    const el = campo.current
    const [a, b] = el ? [el.selectionStart, el.selectionEnd] : [texto.length, texto.length]
    trocar(texto.slice(0, a) + e + texto.slice(b), a + e.length)
    setPaleta(null)
  }

  // o MCP do Journify ainda não tem resposta em thread: a resposta cita a mensagem no começo do texto
  function responder(m: Mensagem) {
    const trecho = [...m.texto.split('\n').filter((l) => !l.startsWith('> ')).join(' ').replace(/\s+/g, ' ').trim()]
    const cit = `> ${m.autor}: ${trecho.length > 80 ? trecho.slice(0, 79).join('').trimEnd() + '…' : trecho.join('')}\n\n`
    const novo = cit + texto.replace(/^(> .*\n)+\n?/, '') // responder de novo troca a citação, não empilha
    trocar(novo, novo.length)
  }

  /** O corretor (Claude Haiku, nos bastidores). Guarda a resposta só se o campo ainda tem o mesmo texto: uma resposta
   * atrasada não apaga a do texto novo. */
  async function pedirCorrecao(t: string): Promise<[Correcao | null, string | null]> {
    const [r, msg] = await ler<{ texto: string; trocas: Troca[] }>(['--corrigir'], t).catch((): [null, null] => [null, null])
    const c = r && { de: t, texto: r.texto, trocas: r.trocas }
    if (c && textoAtual.current === t) setCorrecao(c)
    return [c, msg]
  }

  /** Troca o campo pela correção, com o Desfazer de sempre. */
  function aplicar(x: Correcao) {
    trocar(x.texto, x.texto.length)
    setAntes(x.de)
    setMelhorada(false)
    setCorrecao({ ...x, dispensada: true })
  }

  /** O Corrigir: usa a correção pronta deste texto ou pede uma agora, e aplica. */
  async function corrigir() {
    const t = texto
    if (!t.trim() || corrigindo || melhorando || enviando) return
    setErroCampo(null)
    let x = correcao?.de === t ? correcao : null
    if (!x) {
      setCorrigindo(true) // o campo fica só leitura, como no Melhorar: a correção não atropela o que fosse digitado
      const [r, msg] = await pedirCorrecao(t)
      setCorrigindo(false)
      if (!r) return setErroCampo(msg ?? 'O corretor não respondeu.')
      x = r
    }
    // sem troca: nada a corrigir, ou o motor descartou a correção pelas travas dele
    if (x.trocas.length) return aplicar(x)
    setRecado('Nada para corrigir.')
    setTimeout(() => setRecado(null), 2_000)
    campo.current?.focus()
  }

  async function melhorar() {
    const t = texto
    if (!t.trim() || melhorando || enviando) return
    setMelhorando(true)
    setErroCampo(null)
    const [r, msg] = await ler<{ texto: string }>(['--chat-ia'], t)
    setMelhorando(false)
    if (!r?.texto) return setErroCampo(msg ?? 'O Claude não devolveu texto.')
    setTexto(r.texto)
    setAntes(t)
    setMelhorada(true)
    setCorrecao({ de: r.texto, texto: r.texto, trocas: [] }) // o texto do Claude não passa pelo corretor
    campo.current?.focus()
  }

  function alternarFixa(x: Conversa) {
    const k = chaveFav(tipoDe(x))
    const ids = favoritas.get()[k]
    if (ids.includes(x.id)) return favoritas.set((f) => ({ ...f, [k]: f[k].filter((i) => i !== x.id) }))
    if (ids.filter((i) => conversas?.some((y) => y.id === i)).length >= MAX_FIXAS)
      return setAvisoFixa(
        k === 'grupos'
          ? 'Até 3 conversas fixas em grupos (e 3 em diretas): tire uma para fixar esta.'
          : 'Até 3 conversas fixas em diretas (e 3 em grupos): tire uma para fixar esta.'
      )
    setAvisoFixa(null)
    favoritas.set((f) => ({ ...f, [k]: [...f[k], x.id] }))
  }

  /** Os ids dos marcados cujo "@Nome" ainda está no texto, separados por vírgula: o Journify avisa cada um, como no app. */
  const mencoesDe = (t: string) =>
    marcados.filter((p) => new RegExp(`@${escapar(p.nome)}${depoisDoNome}`, 'u').test(t)).map((p) => p.id).join(',')

  /** O campo depois de enviar (ou programar): vazio, sem o Desfazer nem a lista do @. */
  function limparCampo() {
    setTexto('')
    setAntes(null)
    setMencao(null)
  }

  /** Manda pelo jfy --chat e põe a mensagem na conversa. Devolve o erro (à vista embaixo das mensagens), ou null. */
  async function mandar(cid: string, t: string, mencoes: string) {
    setEnviando(true)
    setErroEnvio(null)
    const r = await api.jfy(['--chat', cid, t, ...(mencoes ? [mencoes] : [])])
    setEnviando(false)
    const m = r.status === 0 ? decodificar<Mensagem>(r.saida) : null
    if (m && sel.current === cid) setMensagens((l) => [...l, m])
    const erro = m ? null : motivo(r)
    setErroEnvio(erro)
    return erro
  }

  async function enviar() {
    const t = texto.trim()
    const cid = selecionada
    if (!cid || !t || !podeEnviar) return
    limparCampo()
    if (await mandar(cid, t, mencoesDe(t))) setTexto(t) // não perde o que foi escrito
  }

  /** Guarda no jfy para sair em `q` ("AAAA-MM-DDTHH:MM"), com as mesmas menções que o envio levaria. */
  async function programar(q: string) {
    const t = texto.trim()
    const cid = selecionada
    setRelogio(null)
    if (!cid || !t || !podeEnviar) return
    setErroCampo(null)
    const mencoes = mencoesDe(t)
    limparCampo()
    campo.current?.focus() // o botão do popover, que tinha o foco, sumiu
    const erro = await fazer(['--chat-programar', cid, q, t, ...(mencoes ? [mencoes] : [])])
    if (erro) (setTexto(t), setErroCampo(erro)) // "Esse horário já passou.": o texto volta para o campo
    carregarProgramadas(cid)
  }

  /** Cancelar, ou Editar (`devolver`: o texto e as menções voltam para o campo vazio). */
  async function desprogramar(p: Programada, devolver?: boolean) {
    if (saindo(p) || (devolver && texto.trim())) return
    const erro = await fazer(['--chat-desprogramar', p.id])
    if (erro) return setErroCampo(erro)
    setProgramadas((l) => l.filter((x) => x.id !== p.id)) // some já, sem esperar a lista
    if (devolver) {
      trocar(p.texto, p.texto.length)
      // o @ só marca quem está em `marcados`: quem estava na programada volta para lá (se ainda escreve na conversa)
      const ids = p.mencoes.split(',')
      setMarcados((l) => [...l, ...pessoas.filter((x) => ids.includes(x.id) && !l.some((y) => y.id === x.id))])
    }
    carregarProgramadas(p.conversa)
  }

  /** A que não foi: manda pelo caminho do envio, com as menções guardadas, e só então tira da fila. */
  async function enviarAgora(p: Programada) {
    if (enviando || (await mandar(p.conversa, p.texto, p.mencoes))) return
    // foi, mas ficou na fila: o aviso, para ninguém mandar de novo achando que não foi
    const erro = await fazer(['--chat-desprogramar', p.id])
    if (erro) setErroCampo(`A mensagem foi, mas não saiu da fila: ${erro}`)
    else setProgramadas((l) => l.filter((x) => x.id !== p.id))
    carregarProgramadas(p.conversa)
  }

  function teclas(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return
    if (listaMencao) {
      if (e.key === 'Escape') return e.preventDefault(), setMencao(null)
      if (sugestoes.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        const n = (idx + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length
        return setMencao((a) => a && { ...a, idx: n })
      }
      if (sugestoes.length && (e.key === 'Enter' || e.key === 'Tab')) return e.preventDefault(), escolher(sugestoes[idx])
    }
    // Tab com a faixa à vista (e sem a lista do @) aplica a correção
    if (faixa && !listaMencao && e.key === 'Tab' && !e.shiftKey) return e.preventDefault(), aplicar(faixa)
    // Enter envia; Shift+Enter quebra a linha
    if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), enviar())
  }

  if (!conversas)
    return (
      <div className="ch-fora">
        {erro ? (
          <>
            <MessagesSquare size={40} strokeWidth={1.5} className="ch-apagado" />
            <h2>Chat do time</h2>
            <span className="texto2 selecionavel">{erro}</span>
            <Botao onClick={() => (setErro(null), carregarConversas())}>Tentar de novo</Botao>
          </>
        ) : (
          <Carregando tamanho={20} />
        )}
      </div>
    )

  const { fixadas, resto } = separar(conversas, aba, fav)
  const naoLidas = (t: Tipo) => conversas.filter((x) => tipoDe(x) === t).reduce((s, x) => s + (x.nao_lidas ?? 0), 0)
  const rotulo = (t: Tipo, nome: string) => (naoLidas(t) ? `${nome} · ${naoLidas(t)}` : nome)

  const linha = (x: Conversa) => {
    const fixa = fav[chaveFav(tipoDe(x))].includes(x.id)
    const acao = fixa ? 'Tirar do topo' : 'Fixar no topo'
    return (
      <Linha
        key={x.id}
        marcada={selecionada === x.id}
        className="ch-linha"
        onClick={() => setSelecionada(x.id)}
        onContextMenu={menuContexto(() => [{ rotulo: acao, icone: fixa ? <StarOff size={13} /> : <Star size={13} />, acao: () => alternarFixa(x) }])}
      >
        <Avatar nome={x.nome} canal={x.tipo === 'canal'} />
        <div className="ch-resumo">
          <div className="linha-h">
            <span className={`ch-nome ${(x.nao_lidas ?? 0) > 0 ? 'forte' : ''}`}>{x.nome}</span>
            <span className="espaco" />
            <button type="button" className={`ch-estrela ${fixa ? 'fixa' : ''}`} title={acao} onClick={(e) => (e.stopPropagation(), alternarFixa(x))}>
              <Star size={12} fill={fixa ? 'currentColor' : 'none'} />
            </button>
            <span className="texto2 ch-mini">{hora(x.ultima?.quando)}</span>
          </div>
          <div className="linha-h">
            <span className="texto2 ch-ultima">{x.ultima ? (x.ultima.autor ? `${x.ultima.autor}: ` : '') + x.ultima.texto : ''}</span>
            <span className="espaco" />
            <Selo n={x.nao_lidas ?? 0} />
          </div>
        </div>
      </Linha>
    )
  }

  return (
    <div className="colunas">
      <div className="coluna ch-lista">
        <div className="ch-abas">
          <Segmentos
            cheio
            valor={aba}
            mudar={abaLembrada.set}
            opcoes={[
              { valor: 'direta', rotulo: rotulo('direta', 'Diretas') },
              { valor: 'canal', rotulo: rotulo('canal', 'Grupos') }
            ]}
          />
        </div>
        {erro && <div className="ch-aviso"><Aviso texto={erro} fechar={() => setErro(null)} /></div>}
        {avisoFixa && <div className="ch-aviso"><Aviso tipo="info" texto={avisoFixa} fechar={() => setAvisoFixa(null)} /></div>}
        <div className="lista">
          {fixadas.length > 0 && (
            <>
              <div className="secao-titulo">Fixadas</div>
              {fixadas.map(linha)}
              {resto.length > 0 && <div className="secao-titulo">Conversas</div>}
            </>
          )}
          {resto.map(linha)}
          {!fixadas.length && !resto.length && (
            <div className="texto2 ch-nenhuma">{aba === 'canal' ? 'Nenhum grupo.' : 'Nenhuma conversa direta.'}</div>
          )}
        </div>
      </div>
      {c ? (
        <div className="painel ch-conversa">
          <div className="cabecalho">
            <Avatar nome={c.nome} canal={c.tipo === 'canal'} />
            <strong className="ch-titulo">{c.nome}</strong>
          </div>
          <div ref={rolagem} className="rolavel ch-mensagens">
            {mensagens.map((m, i) => (
              <Balao
                key={m.id}
                m={m}
                // o nome do autor só na primeira de uma sequência dele
                mostrarAutor={!m.minha && (i === 0 || mensagens[i - 1].autor !== m.autor)}
                reMencao={reMencao}
                menu={menuContexto(() => [
                  ...(soLeitura ? [] : [{ rotulo: 'Responder', icone: <Reply size={13} />, acao: () => responder(m) }]),
                  { rotulo: 'Copiar texto', icone: <Copy size={13} />, acao: () => api.copiar(m.texto) }
                ])}
              />
            ))}
          </div>
          {erroEnvio && (
            <span className="texto2 pequeno-texto linha-h ch-erro">
              <CircleAlert size={12} /> {erroEnvio}
            </span>
          )}
          {programadas.length > 0 && (
            <div className="ch-programadas">
              {programadas.map((p) => (
                <div key={p.id} className="texto2 pequeno-texto ch-prog">
                  <Clock size={12} />
                  <span className="ch-prog-quando">{quandoSai(p.quando)}</span>
                  <span className="ch-prog-texto" title={p.texto}>{p.texto}</span>
                  {p.erro && <span className="perigo-texto ch-prog-erro" title={p.erro}>{p.erro}</span>}
                  {saindo(p) ? (
                    <span>Enviando…</span>
                  ) : (
                    <>
                      {p.erro ? (
                        <Botao tipo="link" disabled={enviando} onClick={() => enviarAgora(p)}>Enviar agora</Botao>
                      ) : (
                        <Botao
                          tipo="link"
                          disabled={!!texto.trim()}
                          title={texto.trim() ? 'Para editar, o campo precisa estar vazio' : 'Tira da fila e devolve o texto para o campo'}
                          onClick={() => desprogramar(p, true)}
                        >
                          Editar
                        </Botao>
                      )}
                      <Botao tipo="link" onClick={() => desprogramar(p)}>Cancelar</Botao>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {erroCampo && <div className="ch-aviso-campo"><Aviso texto={erroCampo} fechar={() => setErroCampo(null)} /></div>}
          {/* o Desfazer fica até a primeira edição; só o Melhorar ganha a nota */}
          {antes !== null && !melhorando && !corrigindo && (
            <span className="texto2 pequeno-texto linha-h ch-nota">
              {melhorada && <><Sparkles size={12} /> Melhorada pelo Claude.</>}
              <Botao tipo="link" onClick={() => trocar(antes, antes.length)}>Desfazer</Botao>
            </span>
          )}
          {recado && <span className="texto2 pequeno-texto linha-h ch-nota">{recado}</span>}
          {faixa && !soLeitura && (
            <div className="texto2 pequeno-texto ch-faixa">
              {faixa.trocas.slice(0, 3).map((x, i) => (
                <span key={i} className="ch-troca" title={`${x.de} → ${x.para}`}>
                  <s>{x.de}</s> → <strong>{x.para}</strong>
                </span>
              ))}
              {faixa.trocas.length > 3 && <span>…</span>}
              <span className="espaco" />
              <Botao tipo="link" onClick={() => aplicar(faixa)}>Aplicar</Botao>
              <span className="ch-faixa-dica">Tab</span>
              <Botao tipo="icone" title="Dispensar" aria-label="Dispensar" onClick={() => setCorrecao({ ...faixa, dispensada: true })}>
                <X size={12} />
              </Botao>
            </div>
          )}
          {soLeitura ? (
            <div className="ch-escrever ch-so-leitura texto2">
              <Eye size={14} /> Você não participa desta conversa: só leitura.
            </div>
          ) : (
            <div className="ch-escrever">
              {listaMencao && (
                <div className="ch-sugestoes">
                  {sugestoes.length ? (
                    sugestoes.map((p, i) => (
                      // mousedown, não click: o campo não perde o foco (nem o cursor)
                      <button type="button" key={p.id} className={i === idx ? 'marcada' : ''} onMouseDown={(e) => (e.preventDefault(), escolher(p))}>
                        {/* o Journify não dá o email: o nome faz o papel dele (iniciais, cor e title) */}
                        <AvatarPessoa email={p.nome} tamanho={20} />
                        <span>{p.nome}</span>
                      </button>
                    ))
                  ) : (
                    <span className="texto2">Ninguém para sugerir: só aparece quem já escreveu nesta conversa</span>
                  )}
                </div>
              )}
              <textarea
                ref={campo}
                rows={Math.min(6, texto.split('\n').length)}
                placeholder={`Mensagem para ${c.nome}`}
                value={texto}
                readOnly={melhorando || corrigindo} // o texto do Claude não atropela o que fosse digitado enquanto ele trabalha
                onChange={(e) => (editar(e.target.value), verMencao(e.target))}
                onSelect={(e) => verMencao(e.currentTarget)}
                onBlur={() => setMencao(null)}
                onKeyDown={teclas}
              />
              <span className="ch-dica" data-dica="Emojis">
                <Botao tipo="icone" aria-label="Emojis" disabled={melhorando || corrigindo} onClick={(e) => setPaleta(paleta ? null : e.currentTarget)}>
                  <Smile size={20} />
                </Botao>
              </span>
              {paleta && (
                <Flutuante ancora={paleta} fechar={() => setPaleta(null)}>
                  <div className="ch-emojis">
                    {EMOJIS.map((e) => (
                      <button type="button" key={e} onClick={() => porEmoji(e)}>{e}</button>
                    ))}
                  </div>
                </Flutuante>
              )}
              <span className="ch-dica" data-dica="Corrigir o português">
                <Botao tipo="icone" aria-label="Corrigir o português" disabled={!texto.trim() || corrigindo || melhorando || enviando} onClick={corrigir}>
                  {corrigindo ? <Carregando tamanho={20} /> : <SpellCheck size={20} />}
                </Botao>
              </span>
              <span className="ch-dica" data-dica="Melhorar o texto com o Claude">
                <Botao tipo="icone" aria-label="Melhorar o texto com o Claude" disabled={!texto.trim() || melhorando || corrigindo || enviando} onClick={melhorar}>
                  {melhorando ? <Carregando tamanho={20} /> : <Sparkles size={20} />}
                </Botao>
              </span>
              <span className="ch-dica" data-dica="Programar envio">
                <Botao
                  tipo="icone"
                  aria-label="Programar envio"
                  disabled={!podeEnviar}
                  // abre na próxima hora cheia
                  onClick={(e) => (setQuando(emPonto(0, new Date().getHours() + 1)), setRelogio(relogio ? null : e.currentTarget))}
                >
                  <Clock size={20} />
                </Botao>
              </span>
              {relogio && (
                <Flutuante ancora={relogio} fechar={() => setRelogio(null)} largura={250}>
                  <div className="lista-menu">
                    <button type="button" onClick={() => programar(local(new Date(Date.now() + 3_600_000)))}>Daqui a 1 hora</button>
                    <button type="button" onClick={() => programar(emPonto(1, 9))}>Amanhã às 9:00</button>
                    <hr />
                  </div>
                  <div className="ch-programar">
                    <input
                      type="datetime-local"
                      className="campo"
                      min={local(new Date())}
                      value={quando}
                      onChange={(e) => setQuando(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && quando && programar(quando)}
                    />
                    <Botao tipo="primario" pequeno disabled={!quando} onClick={() => programar(quando)}>Programar</Botao>
                  </div>
                </Flutuante>
              )}
              <span className="ch-dica direita" data-dica="Enviar (Enter)">
                <button type="button" className={`ch-enviar ${podeEnviar ? 'pode' : ''}`} disabled={!podeEnviar} aria-label="Enviar" onClick={enviar}>
                  {enviando ? <Carregando /> : <CircleArrowUp size={24} />}
                </button>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="painel">
          <div className="vazio">Escolha uma conversa</div>
        </div>
      )}
    </div>
  )
}

/** As "@Nome" conhecidas em destaque, o resto como veio. */
const realcar = (s: string, re: RegExp | null) =>
  re ? s.split(re).map((p, i) => (i % 2 ? <span key={i} className="ch-mencao">{p}</span> : p)) : s

function Balao({ m, mostrarAutor, reMencao, menu }: {
  m: Mensagem
  mostrarAutor: boolean
  reMencao: RegExp | null
  menu: (e: React.MouseEvent) => void
}) {
  return (
    <div className={`ch-msg ${m.minha ? 'minha' : ''}`}>
      {mostrarAutor && <span className="texto2 ch-autor">{m.autor}</span>}
      <div className="ch-bolha-linha">
        <div className="bolha selecionavel" onContextMenu={menu}>
          {/* uma linha por div: as que começam com "> " são a citação de uma resposta */}
          {m.texto.split('\n').map((l, i) =>
            l.startsWith('> ') ? (
              <div key={i} className="ch-citacao">{l.slice(2)}</div>
            ) : (
              <div key={i}>{l ? realcar(l, reMencao) : <br />}</div>
            )
          )}
        </div>
        <span className="ch-mini ch-hora">{hora(m.quando)}</span>
      </div>
    </div>
  )
}

// as cores das séries (SERIES em Uso.swift): cor estável pelo nome, a mesma do Mac
const SERIES = ['#257DE0', '#F47230', '#00B894', '#F2A600', '#EE7FAC', '#008A17']

function Avatar({ nome, canal }: { nome: string; canal: boolean }) {
  const iniciais = canal ? '#' : nome.split(' ').filter(Boolean).slice(0, 2).map((p) => [...p][0]).join('').toUpperCase()
  let soma = 0
  for (const ch of nome) soma += ch.codePointAt(0)!
  return (
    <span className="ch-avatar" style={{ background: SERIES[soma % SERIES.length] }}>
      {iniciais}
    </span>
  )
}
