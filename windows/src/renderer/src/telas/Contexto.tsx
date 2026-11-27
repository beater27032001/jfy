// Tela "Contexto" (ContextoTela em app/Sources/JFY/Contexto.swift no app do Mac): a cesta de tasks, documentos,
// reuniões, arquivos, links, emails e PRs marcados pelo app inteiro, montada pelo jfy numa pasta (CONTEXTO.md e os
// arquivos) e mandada ao Claude: conversa nova no projeto, uma aba aberta ou o /pipeline de uma task. A cesta fica
// guardada (estado.ts) até ser enviada ou limpa.
import { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, CheckCircle2, FileText, GitPullRequest, Inbox, Link, ListChecks, Mail, Package, Paperclip,
  Users, X, type LucideIcon
} from 'lucide-react'
import { api, fazer, ler } from '../jfy'
import { abas, cesta, irPara, loja, ROTULOS_CONTEXTO, type ItemContexto } from '../estado'
import { AreaTexto, Botao, Campo, Segmentos, Select, fmtData, fmtHora } from '../souv'
import './Contexto.css'

type Projeto = { id: string; nome?: string | null }
type Montado = {
  pasta: string; pedido: string; pid?: string | null; projeto?: string | null; tokens: number; arquivos: number; quando: number
  itens: { titulo: string; tipo: string; tokens: number; aviso?: string | null }[]
}
type Destino = 'conversa' | 'aba' | 'pipeline'

const ORDEM = ['task', 'documento', 'reuniao', 'arquivo', 'link', 'email', 'pr'] as const
const ICONES: Record<ItemContexto['tipo'], LucideIcon> = {
  task: ListChecks, documento: FileText, reuniao: Users, arquivo: Paperclip, link: Link, email: Mail, pr: GitPullRequest
}
const pedidoGuardado = loja('', 'contexto.pedido')

const mil = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n))

export default function Contexto({ ativa }: { ativa: boolean }) {
  const itens = cesta.use()
  const pedido = pedidoGuardado.use()
  const { abas: lista } = abas.use()
  const [destino, setDestino] = useState<Destino>('conversa')
  const [pid, setPid] = useState('')
  const [aba, setAba] = useState('')
  const [tarefa, setTarefa] = useState('')
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [montado, setMontado] = useState<Montado | null>(null)
  const [historico, setHistorico] = useState<Montado[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const abasClaude = lista.filter((a) => a.nome !== 'menu')
  const tasksNaCesta = itens.filter((i) => i.tipo === 'task')
  const podeEnviar = destino === 'aba' ? abasClaude.some((a) => a.id === aba) : destino === 'pipeline' ? !!tarefa : !!pid

  const lerHistorico = async () => {
    const [h] = await ler<Montado[]>(['--contexto-historico'])
    if (h) setHistorico(h)
  }

  useEffect(() => {
    if (!ativa) return
    ;(async () => {
      await lerHistorico()
      let ps = projetos
      if (!ps.length) {
        const [p] = await ler<{ projetos: Projeto[] }>(['--projetos-json'])
        if (p) setProjetos((ps = p.projetos.filter((x) => x.nome != null)))
      }
      const cs = cesta.get()
      setPid((atual) => atual || (cs.map((i) => i.pid).find((p) => ps.some((x) => x.id === p)) ?? ps[0]?.id ?? ''))
      setTarefa((atual) => atual || (cs.find((i) => i.tipo === 'task')?.ref ?? ''))
    })()
  }, [ativa])

  // a cesta mudou: o que estava montado não vale mais
  useEffect(() => setMontado(null), [itens])

  async function montar() {
    setOcupado(true)
    setAviso(null)
    setMontado(null)
    const [m, msg] = await ler<Montado>(['--contexto-montar'], JSON.stringify({ itens, pedido, pid }))
    setMontado(m)
    setAviso(msg)
    setOcupado(false)
  }

  async function enviar(pasta: string) {
    setOcupado(true)
    const alvo = destino === 'aba' ? aba : destino === 'pipeline' ? tarefa : ''
    const erro = await fazer(['--contexto-enviar', pasta, destino, ...(alvo ? [alvo] : [])])
    setAviso(erro)
    setOcupado(false)
    if (erro) return
    if (montado?.pasta === pasta) (cesta.set([]), pedidoGuardado.set(''), setMontado(null)) // enviada: a cesta esvazia (fica no histórico)
    await lerHistorico()
    irPara('jfy')
  }

  const mudarNota = (i: ItemContexto, nota: string) =>
    cesta.set((l) => l.map((x) => (x.tipo === i.tipo && x.ref === i.ref ? { ...x, nota } : x)))

  return (
    <div className="colunas cx">
      <div className="pilha cx-lista" style={{ gap: 0 }}>
        <div className="linha-h cx-topo">
          <h1 className="titulo-tela">Cesta de contexto</h1>
          <span className="texto2">{itens.length}</span>
          <span className="espaco" />
          {itens.length > 0 && <Botao onClick={() => cesta.set([])}>Limpar</Botao>}
        </div>
        {itens.length === 0 ? (
          <div className="cx-vazio texto2">
            <Inbox size={34} />
            <span>
              Marque tasks, documentos, reuniões, arquivos, links, emails e PRs com o botão Contexto (ou o botão direito). Eles se
              juntam aqui até você mandar para o Claude.
            </span>
          </div>
        ) : (
          <div className="lista cx-itens">
            {ORDEM.map((tipo) => {
              const doTipo = itens.filter((i) => i.tipo === tipo)
              if (!doTipo.length) return null
              const Icone = ICONES[tipo]
              return (
                <section key={tipo}>
                  <div className="secao-titulo">{ROTULOS_CONTEXTO[tipo]}</div>
                  {doTipo.map((i) => (
                    <div key={i.ref} className="cx-item">
                      <Icone size={16} className="destaque cx-icone" />
                      <div className="pilha" style={{ flex: 1, gap: 4 }}>
                        <span className="cx-uma">{i.titulo}</span>
                        {i.origem && <span className="cx-legenda texto2 cx-uma">{i.origem}</span>}
                        <Campo placeholder="nota para o Claude (opcional)" value={i.nota ?? ''} onChange={(e) => mudarNota(i, e.target.value)} />
                      </div>
                      <Botao tipo="icone" title="Tirar da cesta" onClick={() => cesta.set((l) => l.filter((x) => !(x.tipo === i.tipo && x.ref === i.ref)))}>
                        <X size={14} />
                      </Botao>
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        )}
        {historico.length > 0 && (
          <div className="pilha cx-enviados" style={{ gap: 6 }}>
            <span className="cx-legenda texto2" style={{ fontWeight: 600 }}>ENVIADOS</span>
            {historico.slice(0, 5).map((h) => {
              const d = new Date(h.quando * 1000)
              return (
                <div key={h.pasta} className="linha-h">
                  <div className="pilha" style={{ flex: 1, gap: 1 }}>
                    <span className="cx-uma">{h.pedido || h.itens.map((x) => x.titulo).join(', ')}</span>
                    <span className="cx-legenda texto2">
                      {`${fmtData(d)}, ${fmtHora(d)} · ${h.itens.length} itens · ~${mil(h.tokens)} tokens` + (h.projeto ? ` · ${h.projeto}` : '')}
                    </span>
                  </div>
                  <Botao disabled={!podeEnviar || ocupado} title="Manda esta cesta, como foi montada, para o destino escolhido ao lado" onClick={() => enviar(h.pasta)}>
                    Mandar de novo
                  </Botao>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="coluna cx-painel rolavel">
        <div className="pilha" style={{ gap: 14, padding: 20 }}>
          <strong>O que você quer que o Claude faça</strong>
          <AreaTexto style={{ height: 110 }} value={pedido} onChange={(e) => pedidoGuardado.set(e.target.value)} />
          <strong>Mandar para</strong>
          <Segmentos<Destino>
            cheio
            valor={destino}
            mudar={setDestino}
            opcoes={[{ valor: 'conversa', rotulo: 'Conversa nova' }, { valor: 'aba', rotulo: 'Aba aberta' }, { valor: 'pipeline', rotulo: 'Pipeline' }]}
          />
          {destino === 'aba' ? (
            <>
              {abasClaude.length === 0 ? (
                <span className="texto2">Nenhuma aba aberta no jfy.</span>
              ) : (
                <Select opcoes={abasClaude.map((a) => ({ valor: a.id, rotulo: a.nome, cor: a.cor }))} valor={aba} mudar={setAba} vazio="Escolha a aba" />
              )}
              <span className="cx-legenda texto2">O pedido é escrito na aba, como se você digitasse.</span>
            </>
          ) : destino === 'pipeline' ? (
            <>
              {tasksNaCesta.length === 0 ? (
                <span className="texto2">Ponha a task na cesta para mandar pelo /pipeline dela.</span>
              ) : (
                <Select opcoes={tasksNaCesta.map((t) => ({ valor: t.ref, rotulo: t.titulo }))} valor={tarefa} mudar={setTarefa} vazio="Escolha a task" />
              )}
              <span className="cx-legenda texto2">Abre o /pipeline da task com o contexto nas notas (se a aba dela já existe, escreve nela).</span>
            </>
          ) : (
            <>
              <Select opcoes={projetos.map((p) => ({ valor: p.id, rotulo: p.nome ?? p.id }))} valor={pid} mudar={setPid} vazio="Escolha o projeto" />
              <span className="cx-legenda texto2">Uma aba nova com o Claude na pasta do projeto.</span>
            </>
          )}
          <Botao tipo="primario" className="cx-cheio" disabled={!itens.length || ocupado} onClick={montar}>
            <Package size={14} />
            {ocupado && !montado ? 'Montando…' : 'Montar o contexto'}
          </Botao>
          {montado && (
            <div className="pilha cx-revisao">
              <strong>
                ~{mil(montado.tokens)} tokens · {montado.arquivos} arquivo{montado.arquivos === 1 ? '' : 's'} baixado{montado.arquivos === 1 ? '' : 's'}
              </strong>
              {montado.tokens > 150_000 && (
                <span className="cx-alerta">
                  <AlertTriangle size={13} /> Ficou grande: o Claude perde detalhe com contexto demais. Tire o que não importa.
                </span>
              )}
              {montado.itens.map((i, k) => (
                <div key={k} className="linha-h" style={{ alignItems: 'baseline' }}>
                  {i.aviso ? <AlertCircle size={13} className="cx-laranja" /> : <CheckCircle2 size={13} className="cx-verde" />}
                  <div className="pilha" style={{ flex: 1, gap: 1 }}>
                    <span className="cx-uma">{i.titulo}</span>
                    {i.aviso && <span className="cx-legenda cx-laranja selecionavel">{i.aviso}</span>}
                  </div>
                  <span className="cx-legenda texto2">{mil(i.tokens)}</span>
                </div>
              ))}
              <div className="linha-h">
                <Botao onClick={() => api.mostrarPasta(montado.pasta)}>Abrir a pasta</Botao>
                <span className="espaco" />
                <Botao tipo="primario" disabled={!podeEnviar || ocupado} onClick={() => enviar(montado.pasta)}>
                  Enviar
                </Botao>
              </div>
            </div>
          )}
          {aviso && (
            <span className="cx-alerta selecionavel">
              <AlertTriangle size={13} /> {aviso}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
