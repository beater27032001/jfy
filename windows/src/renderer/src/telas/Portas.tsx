// Tela "Portas" (app/Sources/JFY/Portas.swift): as portas de desenvolvimento abertas, as mesmas do o do jfy.
// A tela fica sempre montada, então a contagem roda daqui mesmo: a cada 30 s (5 s com a tela aberta), para o selo.
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api, fazer, ler } from '../jfy'
import { selos } from '../estado'
import { Aviso, Botao, confirmar } from '../souv'
import './Portas.css'

type Porta = { portas: number[]; tipo: string; nome: string; parar: string; notas: string[]; cor?: string | null; icone?: string | null }

const BANCOS = ['postgres', 'mysql', 'redis', 'mongo'] // banco não abre no navegador
const txt = (p: number[]) => p.slice(0, 3).join(', ') + (p.length > 3 ? '…' : '')

export default function Portas({ ativa }: { ativa: boolean }) {
  const [itens, setItens] = useState<Porta[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const ultima = useRef(0)
  const olhando = useRef(ativa)
  olhando.current = ativa

  const atualizar = async () => {
    ultima.current = Date.now()
    const [l, msg] = await ler<Porta[]>(['--portas-json'])
    if (l) {
      setItens(l)
      selos.set((s) => ({ ...s, portas: l.length }))
    }
    setAviso(msg)
  }

  useEffect(() => {
    const t = setInterval(() => {
      if (olhando.current || Date.now() - ultima.current >= 30_000) atualizar()
    }, 5_000)
    return () => clearInterval(t)
  }, [])
  // na abertura do app e sempre que a tela aparece
  useEffect(() => {
    if (ativa || !ultima.current) atualizar()
  }, [ativa])

  const encerrar = async (p: Porta) => {
    const ok = await confirmar({
      titulo: `Encerrar ${p.tipo} ${p.nome} (${txt(p.portas)})?`,
      mensagem: 'Pede para o programa sair; se em 3 s ele não saiu, força. Container do Docker é parado com docker stop.',
      botao: 'Encerrar',
      perigo: true
    })
    if (!ok) return
    setAviso(await fazer(['--porta-encerrar', p.parar]))
    await atualizar()
  }

  const encerrarTodas = async () => {
    const ok = await confirmar({
      titulo: `Encerrar as ${itens.length} portas abertas?`,
      // no Mac falava do brew services; aqui vale para qualquer banco que roda como serviço
      mensagem: itens.map((p) => `${p.tipo} ${p.nome}`).join(', ') + '. Servidores que o Claude usa param também; banco que roda como serviço do sistema volta sozinho.',
      botao: 'Encerrar todas',
      perigo: true
    })
    if (!ok) return
    setAviso(await fazer(['--portas-encerrar-todas']))
    await atualizar()
  }

  return (
    <div className="po-tela">
      <div className="linha-h po-topo">
        <div className="pilha" style={{ gap: 4 }}>
          <h1 className="titulo-tela">Portas abertas</h1>
          <span className="texto2">Servidores de desenvolvimento rodando neste computador: de que projeto são, se o Claude subiu, e encerrar.</span>
        </div>
        <span className="espaco" />
        <Botao tipo="perigo" disabled={!itens.length} onClick={encerrarTodas}>Encerrar todas</Botao>
        <Botao tipo="icone" title="Atualizar" onClick={atualizar}>
          <RefreshCw size={15} />
        </Botao>
      </div>
      <Aviso texto={aviso} />
      {itens.length === 0 ? (
        <div className="po-vazio texto2">Nenhuma porta de desenvolvimento aberta.</div>
      ) : (
        <div className="pilha">
          {itens.map((p) => {
            const porta = p.portas[0]
            return (
              <div key={p.parar} className="po-linha">
                <span className="po-numero">{txt(p.portas)}</span>
                <span className="po-tipo">
                  {p.icone && <img src={`data:image/png;base64,${p.icone}`} width={18} height={18} alt="" />}
                  <span style={{ color: p.cor ?? undefined }}>{p.tipo}</span>
                </span>
                <span className="pilha po-nome">
                  <strong>{p.nome}</strong>
                  <span className="texto2 pequeno-texto">{p.notas.join(' · ')}</span>
                </span>
                {porta !== undefined && !BANCOS.includes(p.tipo) && (
                  <Botao tipo="link" title={`Abre http://localhost:${porta}`} onClick={() => api.abrirLink(`http://localhost:${porta}`)}>
                    Abrir
                  </Botao>
                )}
                <Botao onClick={() => encerrar(p)}>Encerrar</Botao>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
