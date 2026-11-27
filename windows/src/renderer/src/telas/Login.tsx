// O portão do app (Sessao, Portao e LoginTela em app/Sources/JFY/Login.swift no app do Mac): só entra quem está
// conectado ao Google com uma conta @souv.tech, o mesmo login da Agenda e do Gmail. O jfy confere a sessão
// (--sessao-json) e recusa conta de fora no próprio login (--login), antes de guardar qualquer coisa. Desconectar o
// Google nas Configurações (sessaoMudou) volta para cá. Depois do login, os primeiros passos guiam o resto.
import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, UserX } from 'lucide-react'
import simbolo from '@marca/souv-simbolo.svg'
import nome from '@marca/souv-nome.svg'
import { api, fazer, ler } from '../jfy'
import { abas, loja, nav, passos, sessaoVersao } from '../estado'
import { sincronizar } from '../Terminal'
import { Botao, Carregando } from '../souv'
import PrimeirosPassos, { comando } from './PrimeirosPassos'
import './Login.css'

type Info = {
  conectado: boolean; permitido: boolean; cliente: boolean; dominio: string
  conta?: string | null; arquivo_cliente?: string | null; erro?: string | null
}
type Estado = { tipo: 'verificando' } | { tipo: 'fora'; info: Info | null } | { tipo: 'dentro'; conta: string }

const sessao = loja<Estado>({ tipo: 'verificando' })
let conferidaEm = Date.now()

/** `forcar`: renova o token no Google, para conta desligada ou suspensa na Souv perder o acesso. */
async function verificar(forcar = false) {
  conferidaEm = Date.now()
  const [i] = await ler<Info>(['--sessao-json', ...(forcar ? ['forcar'] : [])])
  sessao.set(i?.conectado && i.permitido && i.conta ? { tipo: 'dentro', conta: i.conta } : { tipo: 'fora', info: i })
}

/** Mostra o app só com a sessão da Souv; antes, a tela de login. */
export default function Portao({ children }: { children: ReactNode }) {
  const estado = sessao.use()
  const versao = sessaoVersao.use()
  const p = passos.use()
  const rodando = comando.use()

  useEffect(() => void verificar(), [versao])
  useEffect(() => {
    // a cada 20 min, e quando a janela volta para a frente (no máximo a cada 5 min), o Google é consultado de novo
    const t = setInterval(() => verificar(true), 20 * 60_000)
    const foco = () => void (Date.now() - conferidaEm > 5 * 60_000 && verificar(true))
    window.addEventListener('focus', foco)
    return () => (clearInterval(t), window.removeEventListener('focus', foco))
  }, [])

  // depois da primeira entrada o app não desmonta mais (só some com o login na frente): remontado, o terminal perderia
  // os xterm que já criou
  const dentro = estado.tipo === 'dentro'
  const [entrou, setEntrou] = useState(false)
  if (dentro && !entrou) setEntrou(true)
  // o terminal só monta agora, depois de o App já ter mandado as abas: manda de novo, para ele criar os xterm
  useEffect(() => {
    if (!entrou) return
    const { abas: l, ativa } = abas.get()
    sincronizar(l.map((a) => a.id), ativa, nav.get().tela === 'jfy')
  }, [entrou])

  return (
    <>
      {entrou && (
        // por baixo dos primeiros passos fica inerte, mas montado: o passo que roda um comando mostra a aba do jfy
        <div className="lg-app" hidden={!dentro} inert={!dentro || (p !== 'feito' && !rodando)}>
          {children}
        </div>
      )}
      {estado.tipo === 'verificando' && (
        <div className="lg-centro">
          <Carregando tamanho={22} />
        </div>
      )}
      {estado.tipo === 'fora' && <LoginTela info={estado.info} />}
      {dentro && p !== 'feito' && <PrimeirosPassos automatico={p === ''} concluir={() => passos.set('feito')} />}
    </>
  )
}

function LoginTela({ info }: { info: Info | null }) {
  const [entrando, setEntrando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const dominio = info?.dominio ?? 'souv.tech'
  const bloqueado = entrando || info?.cliente === false

  async function entrar() {
    setEntrando(true)
    setAviso(null)
    const erro = await fazer(['--login']) // abre o Google no navegador e espera (até 5 min)
    setEntrando(false)
    await verificar()
    if (sessao.get().tipo === 'fora') setAviso(erro ?? 'O login não terminou. Tente de novo.')
  }

  async function desconectar() {
    const e = await fazer(['--google-sair'])
    if (e) setAviso(e)
    await verificar()
  }

  async function escolherArquivo() {
    const arq = await api.escolher({
      titulo: 'Escolha o JSON do app jfy da Souv que você baixou do Drive.',
      filtros: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!arq) return
    setAviso(await fazer(['--login-cliente', arq]))
    await verificar()
  }

  // Enter entra, como o botão padrão do Mac (menos quando o foco está noutro botão)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !bloqueado && !(e.target instanceof HTMLButtonElement)) entrar()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <div className="lg-fundo">
      <div className="lg-miolo">
        <span className="lg-simbolo" style={{ ['--svg' as string]: `url("${simbolo}")` }} />
        <div className="linha-h" style={{ gap: 20 }}>
          <span className="lg-nome" style={{ ['--svg' as string]: `url("${nome}")` }} />
          <span className="lg-divisor" />
          <span className="lg-jfy">JFY</span>
        </div>
        <h2 className="lg-lema">Seu dia de trabalho num lugar só</h2>
        <div className="pilha lg-coluna">
          {info?.cliente === false && (
            <div className="cartao pilha" style={{ gap: 10 }}>
              <strong>Primeiro acesso neste computador</strong>
              <span className="texto2">
                Baixe o arquivo do app jfy da Souv no Drive da empresa e escolha ele aqui. Ele só identifica o app; quem entra é você,
                com a sua conta.
              </span>
              <div className="linha-h">
                <Botao onClick={() => info.arquivo_cliente && api.abrirLink(info.arquivo_cliente)}>Abrir no Drive</Botao>
                <Botao tipo="primario" onClick={escolherArquivo}>
                  Escolher o arquivo…
                </Botao>
              </div>
            </div>
          )}
          <button type="button" className="lg-google" disabled={bloqueado} onClick={entrar}>
            <span className="lg-g">G</span>
            {entrando ? 'Entrando…' : 'Entrar com Google'}
          </button>
          <span className="texto2 lg-legenda">Use a sua conta @{dominio}. Ela também liga a Agenda e o Gmail do jfy.</span>
          {entrando && (
            <span className="linha-h texto2" style={{ justifyContent: 'center' }}>
              <Carregando /> Termine o login no navegador que abriu.
            </span>
          )}
          {info?.conectado && !info.permitido && info.conta && (
            <>
              <span className="lg-alerta">
                <UserX size={14} /> {info.conta} não é uma conta @{dominio}.
              </span>
              <Botao tipo="link" onClick={desconectar}>
                Desconectar essa conta
              </Botao>
            </>
          )}
          {aviso && (
            <span className="lg-alerta selecionavel">
              <AlertTriangle size={14} /> {aviso}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
