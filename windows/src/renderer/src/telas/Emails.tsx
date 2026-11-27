// Tela "Emails" (app/Sources/JFY/Emails.swift no Mac): os não lidos da Principal ou os importantes, a conversa com os
// anexos, responder/encaminhar com o Claude e o email do zero. Quem fala com o Gmail é o jfy (--emails-json,
// --email-json, --email-acao, --emails-lidos, --email-enviar, --email-ia, --email-anexo, --email-assinatura).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Check, Image as IconeFoto, ListFilter, Paperclip, RefreshCw, Search, Signature, Sparkles, SquarePen, Tag,
  TriangleAlert
} from 'lucide-react'
import { aquecerCorretor, api, fazer, ler } from '../jfy'
import { atendido, loja, nav, selos } from '../estado'
import {
  AreaTexto, Aviso, Bolinha, Botao, BotaoContexto, CampoEmails, Carregando, Campo, Flutuante, Linha, Modal, Segmentos,
  Select, confirmar, fmtHora
} from '../souv'
import './Emails.css'

// ---------- CaixaEmail: o selo da barra lateral ----------
// Quantos não lidos tem a Principal: o mesmo número do ✉ da barra do tmux, que o jfy guarda em ~/.jfy/email.json
// (olha o Gmail a cada ~25 s). Lê o arquivo a cada 10 s, sem rodar o jfy, com a tela aberta ou não.
async function lerCaixa() {
  let n = 0
  try {
    n = JSON.parse((await api.lerJfy('email.json')) ?? '{}').ids?.length ?? 0
  } catch {
    /* arquivo pela metade: fica 0 até a próxima */
  }
  if (n !== selos.get().emails) selos.set((s) => ({ ...s, emails: n }))
  let c = 0 // e as conversas do chat com mensagem não lida (o jfy guarda os ids)
  try {
    c = JSON.parse((await api.lerJfy('chat-nao-lidas.json')) ?? '[]').length ?? 0
  } catch {
    /* idem */
  }
  if (c !== selos.get().chat) selos.set((s) => ({ ...s, chat: c }))
}
lerCaixa()
setInterval(lerCaixa, 10_000)

// ---------- o que o jfy devolve ----------
type Item = { id: string; de: string; assunto: string; ts: number; email?: string; lido?: boolean; importante?: boolean }
// cache: a lista guardada; mudou: a busca achou algo diferente da guardada (o mesmo vale para o Email aberto)
type Lista = { conta?: string; url?: string; total: number; mais: boolean; nao_lidos?: number; emails: Item[]; cache?: boolean; mudou?: boolean }
type Anexo = { nome: string; tipo: string; parte: string; tamanho: number }
type Mensagem = { id: string; de: string; data: string; texto: string; eu: boolean; anexos?: Anexo[] }
type Email = {
  id: string; de: string; para: string; data: string; assunto: string; texto: string; link: string; cc?: string
  anexos: Anexo[]; lido: boolean; tem_assinatura: boolean; conversa: Mensagem[]; cache?: boolean; mudou?: boolean
}
type Feito = { para: string; cc: string }

/** As caixas: os não lidos da Principal ou os importantes (como a pasta Importantes do Gmail). */
type Caixa = 'nao_lidos' | 'importantes'
type Grupo = 'Data' | 'Remetente' | 'Sem grupo'
type Modo = 'responder' | 'todos' | 'encaminhar'
const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: 'responder', rotulo: 'Responder' }, { valor: 'todos', rotulo: 'Responder a todos' }, { valor: 'encaminhar', rotulo: 'Encaminhar' }
]
const caixaLista = loja<Caixa>('nao_lidos', 'emails.caixa')
const grupoLista = loja<Grupo>('Data', 'emails.grupo')

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const remetente = (de: string) => de.split(' <')[0]
const iaFazendo = (m: string) => `O Claude está ${m === 'gerar' ? 'escrevendo' : m === 'corrigir' ? 'corrigindo' : 'melhorando'}…`
const feitoTexto = (enviar: boolean, r: Feito) =>
  (enviar ? 'Enviado para ' : 'Rascunho salvo no Gmail, para ') + r.para + (r.cc ? `, com cópia para ${r.cc}` : '') + '.'

function quando(ts: number) {
  const d = new Date(ts * 1000)
  return d.toDateString() === new Date().toDateString() ? fmtHora(d) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Os emails em grupos: por data (Hoje, Ontem, Esta semana, Este mês, Mais antigos), por remetente (o mais recente
 * primeiro) ou num grupo só. */
function agrupar(es: Item[], grupo: Grupo): [string, Item[]][] {
  if (grupo === 'Sem grupo') return es.length ? [['Todos', es]] : []
  if (grupo === 'Remetente') {
    const por = new Map<string, Item[]>()
    for (const e of [...es].sort((a, b) => b.ts - a.ts)) {
      const k = e.email ?? e.de
      por.set(k, [...(por.get(k) ?? []), e])
    }
    return [...por.values()].map((l) => [l[0].de, l])
  }
  const hoje = new Date().setHours(0, 0, 0, 0)
  const faixa = (e: Item) => {
    const dias = Math.round((hoje - new Date(e.ts * 1000).setHours(0, 0, 0, 0)) / 86_400_000)
    return dias <= 0 ? 'Hoje' : dias === 1 ? 'Ontem' : dias < 7 ? 'Esta semana' : dias < 31 ? 'Este mês' : 'Mais antigos'
  }
  return ['Hoje', 'Ontem', 'Esta semana', 'Este mês', 'Mais antigos']
    .map((k): [string, Item[]] => [k, es.filter((e) => faixa(e) === k)])
    .filter(([, l]) => l.length)
}

export default function Emails({ ativa }: { ativa: boolean }) {
  const caixa = caixaLista.use()
  const grupo = grupoLista.use()
  const { abrirEmail } = nav.use()
  const naoLidos = selos.use().emails
  const [lista, setLista] = useState<Lista | null>(null)
  const [selecao, setSelecao] = useState<string | null>(null)
  const [email, setEmail] = useState<Email | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [escrevendoNovo, setEscrevendoNovo] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroLeitura, setFiltroLeitura] = useState<string[]>([]) // "nao_lido", "lido"
  const sel = useRef(selecao)
  sel.current = selecao

  // a lista guardada aparece na hora (o vigia do jfy a mantém em dia de 2 em 2 min); a busca roda por trás e só troca
  // a lista quando achou algo novo
  async function carregar() {
    const c = caixaLista.get()
    const [g, msgG] = await ler<Lista>(['--emails-json', c, 'cache'])
    if (caixaLista.get() !== c) return // trocou de caixa no meio: vale a resposta da nova
    if (g) setLista(g)
    if (!g?.cache) {
      setAviso(msgG) // sem lista guardada, o jfy já buscou
      lerCaixa()
      return
    }
    setCarregando(true)
    const [l, msg] = await ler<Lista>(['--emails-json', c])
    setCarregando(false)
    if (caixaLista.get() !== c) return
    if (l?.mudou) setLista(l)
    setAviso(msg)
    lerCaixa() // o jfy acabou de guardar o total: o selo acompanha
  }

  // o email aberto da última vez aparece na hora; a leitura de verdade só troca quando mudou (resposta nova, lido)
  async function abrir(id = sel.current) {
    if (!id) return setEmail(null)
    const [g, msgG] = await ler<Email>(['--email-json', id, 'cache'])
    if (sel.current !== id) return
    setEmail(g)
    if (msgG) setAviso(msgG)
    if (!g?.cache) return
    const [e, msg] = await ler<Email>(['--email-json', id])
    if (sel.current !== id) return
    if (e?.mudou) setEmail(e)
    if (msg) setAviso(msg)
  }

  async function agir(args: string[]) {
    const erro = await fazer(args)
    await carregar()
    await abrir()
    if (erro) setAviso(erro) // o carregar() zera o aviso: o erro da ação fica por cima
  }

  useEffect(() => void (ativa && carregar()), [ativa, caixa])
  useEffect(() => {
    setFeito(null)
    abrir(selecao)
  }, [selecao])

  // o clique na notificação de email novo
  useEffect(() => {
    if (!abrirEmail) return
    setSelecao(abrirEmail)
    atendido('abrirEmail')
    carregar()
  }, [abrirEmail])

  // chegou email com a tela aberta
  const naoLidosAntes = useRef(naoLidos)
  useEffect(() => {
    if (naoLidos === naoLidosAntes.current) return
    naoLidosAntes.current = naoLidos
    if (ativa) carregar()
  }, [naoLidos])

  const mudarCaixa = (c: Caixa) => {
    if (c === caixaLista.get()) return // o clique na caixa já escolhida não zera nada
    caixaLista.set(c)
    setSelecao(null)
    setFiltroLeitura([])
  }

  const filtrados = (lista?.emails ?? []).filter(
    (e) =>
      (!busca || semAcento(`${e.de} ${e.email ?? ''} ${e.assunto}`).includes(semAcento(busca))) &&
      (!filtroLeitura.length || filtroLeitura.includes(e.lido === false ? 'nao_lido' : 'lido'))
  )
  const grupos = agrupar(filtrados, grupo)
  const mais = lista?.mais ? '+' : ''

  return (
    <div className="em">
      <div className="em-topo">
        <div className="linha-h">
          <h1 className="em-titulo">Emails</h1>
          {lista && (
            <span className="texto2 em-resumo">
              {caixa === 'nao_lidos'
                ? `${lista.total}${mais} não lido(s) na Principal`
                : `${lista.total}${mais} importantes · ${lista.nao_lidos ?? 0} não lido(s) na Principal`}
              {lista.conta && ` · ${lista.conta}`}
            </span>
          )}
          <span className="espaco" />
          <Botao tipo="primario" onClick={() => setEscrevendoNovo(true)}>
            <SquarePen size={13} /> Escrever
          </Botao>
          {lista?.url && (
            <Botao tipo="link" onClick={() => api.abrirLink(lista.url!)}>
              Abrir o Gmail
            </Botao>
          )}
          <Botao
            disabled={(lista?.nao_lidos ?? lista?.total ?? 0) === 0}
            onClick={async () =>
              (await confirmar({ titulo: 'Marcar todos os não lidos da Principal como lidos no Gmail?', botao: 'Marcar todos' })) &&
              agir(['--emails-lidos'])
            }
          >
            Marcar todos como lidos
          </Botao>
          <Botao tipo="icone" title="Atualizar" disabled={carregando} onClick={carregar}>
            <RefreshCw size={14} />
          </Botao>
        </div>
        <div className="linha-h">
          <Segmentos<Caixa>
            valor={caixa}
            mudar={mudarCaixa}
            opcoes={[{ valor: 'nao_lidos', rotulo: 'Não lidos' }, { valor: 'importantes', rotulo: 'Importantes' }]}
          />
          <label className="em-busca">
            <Search size={13} className="texto2" />
            <input placeholder="Buscar remetente ou assunto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          {caixa === 'importantes' && (
            <FiltroMulti
              titulo="Leitura"
              opcoes={[['nao_lido', 'Não lidos', 'var(--primaria)'], ['lido', 'Lidos', null]]}
              marcados={filtroLeitura}
              mudar={setFiltroLeitura}
            />
          )}
          {(busca || filtroLeitura.length > 0) && (
            <Botao tipo="link" onClick={() => (setBusca(''), setFiltroLeitura([]))}>
              Limpar
            </Botao>
          )}
          <span className="espaco" />
          <Select<Grupo>
            largura={130}
            semBusca
            title="Agrupar por"
            valor={grupo}
            mudar={grupoLista.set}
            opcoes={(['Data', 'Remetente', 'Sem grupo'] as Grupo[]).map((g) => ({ valor: g, rotulo: g }))}
          />
        </div>
      </div>
      {aviso && (
        <div className="em-aviso">
          <Aviso texto={aviso} />
        </div>
      )}
      {feito && (
        <div className="em-aviso">
          <Aviso tipo="ok" texto={feito} />
        </div>
      )}
      <div className="colunas em-corpo">
        <div className="coluna em-lista">
          <div className="lista">
            {lista && !lista.emails.length ? (
              <div className="texto2 em-nada">{caixa === 'nao_lidos' ? 'Caixa zerada: nenhum não lido na Principal.' : 'Nenhum email importante.'}</div>
            ) : (
              lista && !grupos.length && <div className="texto2 em-nada">Nada com esses filtros.</div>
            )}
            {grupos.map(([titulo, itens]) => (
              <div key={titulo}>
                {grupo !== 'Sem grupo' && <div className="secao-titulo em-grupo">{`${titulo} · ${itens.length}`}</div>}
                {itens.map((e) => (
                  <Linha key={e.id} marcada={selecao === e.id} className="em-linha" onClick={() => setSelecao(e.id)}>
                    <div className="linha-h">
                      {e.lido === false && <span className="em-ponto" title="Não lido" />}
                      <span className={`em-de ${e.lido === false ? 'forte' : ''}`}>{e.de}</span>
                      {e.importante && caixa === 'nao_lidos' && (
                        <span title="Importante para o Gmail" className="em-importante">
                          <Tag size={10} fill="currentColor" />
                        </span>
                      )}
                      <span className="espaco" />
                      <span className="texto2 pequeno-texto">{quando(e.ts)}</span>
                    </div>
                    <div className={`em-assunto ${e.lido === false ? '' : 'texto2'}`}>{e.assunto}</div>
                  </Linha>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="painel">
          {email ? (
            <Detalhe
              key={selecao ?? ''}
              e={email}
              urlGmail={lista?.url}
              agir={agir}
              reabrir={() => abrir()}
              setAviso={setAviso}
              setFeito={setFeito}
            />
          ) : (
            <div className="vazio">{selecao === null && <span>Escolha um email</span>}</div>
          )}
        </div>
      </div>
      {escrevendoNovo && (
        <NovoEmail fechar={() => setEscrevendoNovo(false)} enviado={(t) => (setFeito(t), setEscrevendoNovo(false))} />
      )}
    </div>
  )
}

/** O email aberto: cabeçalho, ações, a conversa e o responder. Montado de novo a cada escolha (key): a resposta, o
 * contexto, os destinos e as mensagens abertas começam do zero na hora, como o onChange(of: selecao) do Mac. */
function Detalhe(p: {
  e: Email
  urlGmail?: string
  agir: (args: string[]) => void
  reabrir: () => Promise<void>
  setAviso: (s: string | null) => void
  setFeito: (s: string | null) => void
}) {
  const { e } = p
  return (
    <div className="em-detalhe">
      <h2 className="em-assunto-grande selecionavel">{e.assunto}</h2>
      <div className="texto2 selecionavel em-cabecalho">
        <div>De: {e.de}</div>
        <div>Para: {e.para}</div>
        <div>{e.data}</div>
      </div>
      <div className="linha-h">
        <Botao onClick={() => p.agir(['--email-acao', e.id, e.lido ? 'nao_lido' : 'lido'])}>
          {e.lido ? 'Marcar como não lido' : 'Marcar como lido'}
        </Botao>
        {e.link && (
          <Botao tipo="link" onClick={() => api.abrirLink(e.link)}>
            Abrir no Gmail
          </Botao>
        )}
        <BotaoContexto item={{ tipo: 'email', ref: e.id, titulo: e.assunto, origem: e.de }} />
      </div>
      <hr className="em-divisor" />
      <Conversa e={e} />
      <hr className="em-divisor" />
      <Responder {...p} />
    </div>
  )
}

/** A conversa inteira: a última mensagem aberta, as antigas em uma linha (o clique abre). */
function Conversa({ e }: { e: Email }) {
  const [abertas, setAbertas] = useState<string[]>([])
  const msgs: Mensagem[] = e.conversa.length ? e.conversa : [{ id: e.id, de: e.de, data: e.data, texto: e.texto, eu: false, anexos: e.anexos }]
  return (
    <>
      {msgs.length > 1 && <div className="secao-titulo em-sem-recuo">CONVERSA ({msgs.length})</div>}
      {msgs.map((m, i) => {
        const aberta = i === msgs.length - 1 || abertas.includes(m.id) || m.id === e.id
        return (
          <div
            key={m.id}
            className={`em-msg ${m.eu ? 'eu' : ''} ${aberta ? '' : 'fechada'}`}
            onClick={() => !aberta && setAbertas([...abertas, m.id])}
          >
            <div className="linha-h">
              <strong>{m.eu ? 'Você' : remetente(m.de)}</strong>
              <span className="espaco" />
              <span className="texto2 pequeno-texto em-uma-linha">{m.data}</span>
            </div>
            {aberta ? <TextoEmail texto={m.texto} /> : <div className="texto2 em-uma-linha">{m.texto.split('\n')[0]}</div>}
            {aberta && m.anexos?.map((a) => <AnexoEmail key={a.parte} mid={m.id} anexo={a} />)}
          </div>
        )
      })}
    </>
  )
}

function Responder(p: {
  e: Email
  urlGmail?: string
  reabrir: () => Promise<void>
  setAviso: (s: string | null) => void
  setFeito: (s: string | null) => void
}) {
  const { e } = p
  const [modo, setModo] = useState<Modo>('responder')
  const [resposta, setResposta] = useState('')
  const [contexto, setContexto] = useState('')
  const [para, setPara] = useState('') // encaminhar
  const [cc, setCc] = useState('')
  const [escrevendo, setEscrevendo] = useState<string | null>(null) // o modo que o Claude está fazendo
  const vazia = !resposta.trim()
  const semDestino = modo === 'encaminhar' && !para.includes('@')
  const ocupado = escrevendo !== null
  useEffect(aquecerCorretor, []) // o Corrigir já acha o Claude do corretor aberto

  async function ia(m: string) {
    setEscrevendo(m)
    const [r, msg] = await ler<{ texto: string }>(['--email-ia', e.id, m, resposta, contexto])
    setEscrevendo(null)
    if (r) setResposta(r.texto)
    p.setAviso(msg)
  }

  async function responderGmail(enviar: boolean) {
    const d = { id: e.id, modo, texto: resposta, enviar, para, cc }
    const [r, msg] = await ler<Feito>(['--email-enviar', JSON.stringify(d)])
    p.setAviso(r ? null : msg)
    p.setFeito(r ? feitoTexto(enviar, r) : null)
    if (r && enviar) {
      setResposta('')
      await p.reabrir() // a resposta aparece na conversa
    }
  }

  async function enviar() {
    const titulo =
      modo === 'encaminhar'
        ? `Encaminhar para ${para}?`
        : `Enviar a resposta para ${remetente(e.de)}` + (modo === 'todos' ? ' e os outros da conversa?' : '?')
    const ok = await confirmar({
      titulo,
      mensagem: 'Sai da sua conta do Gmail, na mesma conversa' + (e.tem_assinatura ? ', com a sua assinatura' : '') + '. Não tem volta pelo app.',
      botao: 'Enviar'
    })
    if (ok) responderGmail(true)
  }

  return (
    <div className="pilha">
      <Segmentos<Modo> valor={modo} mudar={setModo} opcoes={MODOS} />
      {modo === 'encaminhar' ? (
        <>
          <CampoEmails rotulo="Para" texto={para} mudar={setPara} />
          <CampoEmails rotulo="Cc" texto={cc} mudar={setCc} />
          {e.anexos.length > 0 && (
            <span className="texto2 pequeno-texto linha-h">
              <Paperclip size={12} /> Os anexos vão junto: {e.anexos.map((a) => a.nome).join(', ')}
            </span>
          )}
        </>
      ) : (
        <span className="texto2 pequeno-texto">
          {modo === 'todos' ? `Para ${remetente(e.de)}, com cópia para os outros de Para e Cc (menos você).` : `Para ${remetente(e.de)}.`}
        </span>
      )}
      <AreaTexto className="em-texto" value={resposta} onChange={(x) => setResposta(x.target.value)} disabled={ocupado} />
      <AreaTexto
        className="em-contexto"
        rows={Math.min(4, contexto.split('\n').length)}
        placeholder="Contexto para o Claude (opcional): o que responder, o tom, o que já foi combinado…"
        value={contexto}
        onChange={(x) => setContexto(x.target.value)}
      />
      <div className="linha-h em-acoes">
        <Botao disabled={ocupado} onClick={() => ia('gerar')}>
          <Sparkles size={13} /> Gerar com o Claude
        </Botao>
        <Botao disabled={ocupado || vazia} title="Só os erros do seu texto, sem mudar o que ele diz" onClick={() => ia('corrigir')}>
          Corrigir
        </Botao>
        <Botao disabled={ocupado || vazia} title="Seu texto como base, mais claro e direto" onClick={() => ia('melhorar')}>
          Melhorar
        </Botao>
        {escrevendo && (
          <>
            <Carregando />
            <span className="texto2">{iaFazendo(escrevendo)}</span>
          </>
        )}
        <span className="espaco" />
        <Botao disabled={ocupado || vazia || semDestino} onClick={() => responderGmail(false)}>
          Salvar rascunho
        </Botao>
        <Botao tipo="primario" disabled={ocupado || vazia || semDestino} onClick={enviar}>
          Enviar
        </Botao>
      </div>
      <span className="texto2 pequeno-texto">O Claude só escreve aqui; nada sai sem você apertar Enviar. Gerar, corrigir e melhorar usam tokens.</span>
      {e.tem_assinatura ? (
        <span className="texto2 pequeno-texto">Vai com a sua assinatura do Gmail.</span>
      ) : (
        <AvisoAssinatura url={p.urlGmail?.replace('#inbox', '#settings/general')} />
      )}
    </div>
  )
}

// ---------- o texto de um email, com os links clicáveis ----------
// O "texto <url>" que o jfy deixa no lugar do link do html (e o Gmail no texto puro) vira "↗ dominio": o endereço
// inteiro, com rastreio, ocupava linhas. Só http(s) e mailto viram link: o abrirLink abre caminho local também.
const LINK = /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

function TextoEmail({ texto }: { texto: string }) {
  const partes: ReactNode[] = []
  let resto = 0
  for (const m of texto.matchAll(LINK)) {
    const bruto = m[0].replace(/[.,;:!?)\]'"]+$/, '') // a pontuação do fim é da frase, não do link
    const ini = m.index!
    const fim = ini + bruto.length
    if (ini < resto || !bruto) continue
    const url = /^https?:/i.test(bruto) ? bruto : bruto.startsWith('www.') ? `https://${bruto}` : `mailto:${bruto}`
    const entre = ini > 0 && texto[ini - 1] === '<' && texto[fim] === '>'
    let rotulo = bruto
    if (entre) {
      try {
        rotulo = `↗ ${new URL(url).hostname || url}`
      } catch {
        rotulo = `↗ ${bruto}`
      }
    }
    partes.push(texto.slice(resto, entre ? ini - 1 : ini))
    partes.push(
      <a key={ini} href={url} title={url} onClick={(ev) => (ev.preventDefault(), ev.stopPropagation(), api.abrirLink(url))}>
        {rotulo}
      </a>
    )
    resto = entre ? fim + 1 : fim
  }
  partes.push(texto.slice(resto))
  return <div className="em-texto-email selecionavel">{partes}</div>
}

// ---------- anexos ----------
// a foto vem pelo jfyarq://x/<caminho dentro de ~/.jfy>, que o processo principal serve sem a tela ler o disco
const dirJfy = api.caminhos().then((c) => c.jfy)
async function urlArquivo(caminho: string) {
  const rel = caminho.slice((await dirJfy).length).replace(/^[\\/]+/, '')
  return 'jfyarq://x/' + rel.split(/[\\/]/).map(encodeURIComponent).join('/')
}

function tamanho(n: number) {
  if (n < 1000) return `${n} bytes`
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`
  return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/** Um anexo: a foto aparece na mensagem (o html vira texto e perde as <img>); o resto é uma linha que abre o arquivo
 * no app padrão. Quem baixa é o jfy (--email-anexo), para ~/.jfy/anexos: da segunda vez já está lá. */
function AnexoEmail({ mid, anexo }: { mid: string; anexo: Anexo }) {
  const foto = anexo.tipo.startsWith('image/')
  const [caminho, setCaminho] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function baixar() {
    if (caminho) return caminho
    setBaixando(true)
    const [r, msg] = await ler<{ caminho: string }>(['--email-anexo', mid, anexo.parte])
    setBaixando(false)
    setErro(msg)
    setCaminho(r?.caminho ?? null)
    if (foto && r) setSrc(await urlArquivo(r.caminho))
    return r?.caminho ?? null
  }
  useEffect(() => void (foto && baixar()), [])

  if (src && caminho)
    return (
      // formato que o navegador não lê (HEIC, TIFF): o onError volta para a linha
      <img className="em-foto" src={src} alt={anexo.nome} title={`${anexo.nome}: abrir`} onError={() => setSrc(null)}
        onClick={(ev) => (ev.stopPropagation(), api.abrirLink(caminho))} />
    )
  return (
    <div className="em-anexo">
      <Botao tipo="link" disabled={baixando} title="Abrir o arquivo"
        onClick={async (ev) => {
          ev.stopPropagation()
          const c = await baixar()
          if (c) api.abrirLink(c)
        }}>
        {foto ? <IconeFoto size={13} /> : <Paperclip size={13} />}
        <span className="em-uma-linha">{anexo.nome}</span>
        {anexo.tamanho > 0 && <span className="texto2">{tamanho(anexo.tamanho)}</span>}
        {baixando && <Carregando />}
      </Botao>
      {erro && <div className="pequeno-texto em-laranja">{erro}</div>}
    </div>
  )
}

// ---------- o filtro de várias escolhas (FiltroMulti do TabelaTasks.swift) ----------
function FiltroMulti(p: { titulo: string; opcoes: [string, string, string | null][]; marcados: string[]; mudar: (m: string[]) => void }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null)
  const alternar = (v: string) => p.mudar(p.marcados.includes(v) ? p.marcados.filter((x) => x !== v) : [...p.marcados, v])
  return (
    <>
      <button type="button" className={`select em-filtro ${p.marcados.length ? 'ligado' : ''} ${ancora ? 'aberto' : ''}`}
        onClick={(ev) => setAncora(ancora ? null : ev.currentTarget)}>
        <ListFilter size={12} />
        {p.marcados.length ? `${p.titulo} · ${p.marcados.length}` : p.titulo}
      </button>
      {ancora && (
        <Flutuante ancora={ancora} fechar={() => setAncora(null)} largura={200}>
          <div className="lista-menu">
            {p.opcoes.map(([valor, rotulo, cor]) => (
              <button type="button" key={valor} onClick={() => alternar(valor)}>
                {cor && <Bolinha cor={cor} />}
                <span className="rotulo">{rotulo}</span>
                {p.marcados.includes(valor) && <Check size={13} strokeWidth={3} className="destaque" />}
              </button>
            ))}
            {p.marcados.length > 0 && (
              <>
                <hr />
                <button type="button" className="texto2" onClick={() => p.mudar([])}>
                  Limpar
                </button>
              </>
            )}
          </div>
        </Flutuante>
      )}
    </>
  )
}

// ---------- o email do zero ----------
/** Para e Cc (com as sugestões de contato), assunto e o texto, escrito por você ou pelo Claude (a partir do
 * contexto), com a assinatura padrão do Gmail. Salva como rascunho ou envia (`--email-enviar` no modo novo). */
function NovoEmail({ fechar, enviado }: { fechar: () => void; enviado: (t: string) => void }) {
  const [para, setPara] = useState('')
  const [cc, setCc] = useState('')
  const [assunto, setAssunto] = useState('')
  const [texto, setTexto] = useState('')
  const [contexto, setContexto] = useState('')
  const [escrevendo, setEscrevendo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [assinatura, setAssinatura] = useState<{ tem: boolean; url: string } | null>(null)
  // com a confirmação aberta, o Esc fecha só ela (os dois modais ouvem a mesma tecla)
  const [confirmando, setConfirmando] = useState(false)
  const vazio = !texto.trim()
  const semDestino = !para.includes('@')
  const ocupado = escrevendo !== null

  useEffect(() => {
    ler<{ tem: boolean; url: string }>(['--email-assinatura']).then(([a]) => setAssinatura(a))
    aquecerCorretor() // o Corrigir já acha o Claude do corretor aberto
  }, [])

  async function ia(m: string) {
    setEscrevendo(m)
    const [r, msg] = await ler<{ texto: string }>(['--email-ia', '', m, texto, contexto]) // sem id: email novo
    setEscrevendo(null)
    if (r) setTexto(r.texto)
    setAviso(msg)
  }

  async function mandar(enviar: boolean) {
    setEnviando(true)
    const [r, msg] = await ler<Feito>(['--email-enviar', JSON.stringify({ modo: 'novo', para, cc, assunto, texto, enviar })])
    setEnviando(false)
    if (r) enviado(feitoTexto(enviar, r))
    else setAviso(msg)
  }

  async function pedirEnvio() {
    setConfirmando(true)
    const ok = await confirmar({
      titulo: `Enviar para ${para}?`,
      mensagem: 'Sai da sua conta do Gmail' + (cc.includes('@') ? `, com cópia para ${cc}` : '') + '. Não tem volta pelo app.',
      botao: 'Enviar'
    })
    setConfirmando(false)
    if (ok) mandar(true)
  }

  return (
    <Modal titulo="Novo email" largura={660} fechar={() => !confirmando && fechar()}>
      <div className="pilha em-novo">
        <CampoEmails rotulo="Para" texto={para} mudar={setPara} />
        <CampoEmails rotulo="Cc" texto={cc} mudar={setCc} />
        <Campo placeholder="Assunto" value={assunto} onChange={(x) => setAssunto(x.target.value)} />
        <AreaTexto className="em-texto-novo" value={texto} onChange={(x) => setTexto(x.target.value)} disabled={ocupado} />
        <AreaTexto
          className="em-contexto"
          rows={Math.min(4, contexto.split('\n').length)}
          placeholder="Contexto para o Claude: o que o email precisa dizer, para quem, o tom…"
          value={contexto}
          onChange={(x) => setContexto(x.target.value)}
        />
        <div className="linha-h em-acoes">
          <Botao disabled={ocupado || !contexto.trim()} title="Escreve o email a partir do contexto" onClick={() => ia('gerar')}>
            <Sparkles size={13} /> Gerar com o Claude
          </Botao>
          <Botao disabled={ocupado || vazio} title="Só os erros do seu texto, sem mudar o que ele diz" onClick={() => ia('corrigir')}>
            Corrigir
          </Botao>
          <Botao disabled={ocupado || vazio} title="Seu texto como base, mais claro e direto" onClick={() => ia('melhorar')}>
            Melhorar
          </Botao>
          {escrevendo && (
            <>
              <Carregando />
              <span className="texto2">{iaFazendo(escrevendo)}</span>
            </>
          )}
          <span className="espaco" />
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao disabled={ocupado || vazio || semDestino || enviando} onClick={() => mandar(false)}>
            Salvar rascunho
          </Botao>
          <Botao tipo="primario" disabled={ocupado || vazio || semDestino || enviando} onClick={pedirEnvio}>
            Enviar
          </Botao>
        </div>
        {aviso && (
          <span className="em-laranja selecionavel linha-h">
            <TriangleAlert size={13} /> {aviso}
          </span>
        )}
        {assinatura && !assinatura.tem && <AvisoAssinatura url={assinatura.url} />}
        <span className="texto2 pequeno-texto">
          {(assinatura?.tem ? 'Vai com a sua assinatura do Gmail. ' : '') +
            'O Claude só escreve aqui; nada sai sem você apertar Enviar. Gerar, corrigir e melhorar usam tokens.'}
        </span>
      </div>
    </Modal>
  )
}

/** Sem assinatura padrão no Gmail, o email sai sem assinatura: diz exatamente onde marcar (a API não vê as outras). */
function AvisoAssinatura({ url }: { url?: string }) {
  return (
    <div className="em-sem-assinatura">
      <span className="linha-h em-laranja">
        <Signature size={14} /> Vai sem assinatura: o Gmail não tem uma assinatura padrão.
      </span>
      <span className="texto2 pequeno-texto">
        No Gmail, em Configurações › Geral › Assinatura › Padrões de assinatura, escolha a sua (ex.: Souv) em "Para uso em novos
        e-mails" e em "Para respostas/encaminhamentos" e salve. O jfy só enxerga a assinatura marcada como padrão.
      </span>
      {url && (
        <Botao tipo="link" className="pequeno-texto" onClick={() => api.abrirLink(url)}>
          Abrir as configurações do Gmail
        </Botao>
      )}
    </div>
  )
}
