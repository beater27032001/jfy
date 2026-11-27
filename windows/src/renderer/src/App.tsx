// A janela do jfy: a marca e o uso da IA em cima, a barra lateral com as telas (as abas do jfy embaixo de "jfy", os
// favoritos embaixo de Projetos) e as telas, todas montadas, como o app do Mac (Principal em JFYApp.swift).
import { useEffect, type ComponentType } from 'react'
import {
  Bell, BarChart3, Calendar, ChevronRight, Clock, Folder, GitBranch, Heart, Inbox, Mail, MessagesSquare, Network,
  Palette, Settings, Sun, SquareTerminal, type LucideIcon
} from 'lucide-react'
import simbolo from '@marca/souv-simbolo.svg'
import nome from '@marca/souv-nome.svg'
import { api } from './jfy'
import { abas, abrirUrl, cesta, favoritos, irPara, limites, loja, nav, selos, TELAS, type Janela, type Tela } from './estado'
import { Bolinha, Campo, Botao, HostSouv, Modal, Selo, confirmar, menuContexto } from './souv'
import { TerminalTela, sincronizar, useSinos } from './Terminal'
import Portao from './telas/Login'
import MeuDia from './telas/MeuDia'
import Projetos from './telas/Projetos'
import Contexto from './telas/Contexto'
import Github from './telas/Github'
import Horas from './telas/Horas'
import Agenda from './telas/Agenda'
import Emails from './telas/Emails'
import Portas from './telas/Portas'
import Uso from './telas/Uso'
import Chat from './telas/Chat'
import Notificacoes from './telas/Notificacoes'
import Temas from './telas/Temas'
import Configuracoes from './telas/Configuracoes'
import Creditos from './telas/Creditos'

const ICONES: Record<Tela, LucideIcon> = {
  'Meu dia': Sun, jfy: SquareTerminal, Projetos: Folder, Contexto: Inbox, GitHub: GitBranch, Horas: Clock,
  Agenda: Calendar, Emails: Mail, Portas: Network, 'Uso da IA': BarChart3, Chat: MessagesSquare,
  'Notificações': Bell, Temas: Palette, 'Configurações': Settings, 'Créditos': Heart
}
const TELA: Partial<Record<Tela, ComponentType<{ ativa: boolean }>>> = {
  'Meu dia': MeuDia, Projetos, Contexto, GitHub: Github, Horas, Agenda, Emails, Portas, 'Uso da IA': Uso, Chat,
  'Notificações': Notificacoes, Temas, 'Configurações': Configuracoes, 'Créditos': Creditos
}

const recolhidas = loja({ abas: false, favoritos: false }, 'barra.recolhidas')
const renomeando = loja<{ id: string; nome: string } | null>(null)

function Marca() {
  return (
    <div className="marca" aria-label="souv JFY">
      <span className="simbolo" style={{ ['--svg' as string]: `url("${simbolo}")` }} />
      <span className="nome" style={{ ['--svg' as string]: `url("${nome}")` }} />
      <span className="divisor" />
      <span className="jfy">JFY</span>
    </div>
  )
}

/** O uso dos limites do Claude (5 h e semana, com quando renova), em qualquer tela. */
function BarraUsoIA() {
  const { cinco, semana } = limites.use()
  if (!cinco) return null
  const dia = (d: Date) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()]
  const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const medidor = (nomeJ: string, j: Janela, renova: string | null) => {
    const cor = j.pct >= 80 ? '#e5484d' : j.pct >= 50 ? '#f5a524' : '#2fbf71'
    return (
      <span className="medidor">
        <span className="texto2">{nomeJ}</span>
        <span className="trilho">
          <span style={{ width: Math.max(3, (70 * Math.min(j.pct, 100)) / 100), background: cor }} />
        </span>
        <strong>{j.pct}%</strong>
        {renova && <span className="texto2">{renova}</span>}
      </span>
    )
  }
  return (
    <div className="uso-ia" title="Uso dos limites do Claude: o mesmo da barra do jfy no terminal">
      {medidor('5 h', cinco, cinco.renova && `renova ${hora(cinco.renova)}`)}
      {semana && medidor('Semana', semana, semana.renova && `renova ${dia(semana.renova)} ${hora(semana.renova)}`)}
    </div>
  )
}

function Setinha({ chave, oque }: { chave: 'abas' | 'favoritos'; oque: string }) {
  const r = recolhidas.use()
  return (
    <button
      className={`setinha ${r[chave] ? '' : 'aberta'}`}
      title={r[chave] ? `Mostrar ${oque}` : `Recolher ${oque}`}
      onClick={(e) => (e.stopPropagation(), recolhidas.set({ ...r, [chave]: !r[chave] }))}
    >
      <ChevronRight size={12} strokeWidth={3} />
    </button>
  )
}

function BarraLateral() {
  const { tela } = nav.use()
  const { abas: lista, ativa } = abas.use()
  const favs = favoritos.use()
  const itens = cesta.use()
  const n = selos.use()
  const r = recolhidas.use()
  const sinos = useSinos()
  const algumSino = lista.some((a) => sinos.has(a.id))
  const selo: Partial<Record<Tela, number>> = {
    'Notificações': n.notificacoes, Emails: n.emails, Chat: n.chat, Portas: n.portas, Contexto: itens.length
  }

  return (
    <nav className="lateral">
      {TELAS.map((t) => {
        const Icone = ICONES[t]
        return (
          <div key={t}>
            <div className={`linha ${tela === t ? 'marcada' : ''}`} onClick={() => irPara(t)}>
              <span className="icone">
                {t === 'Meu dia' ? (
                  <span className="marca">
                    <span className="simbolo" style={{ width: 16, height: 16, ['--svg' as string]: `url("${simbolo}")` }} />
                  </span>
                ) : (
                  <Icone size={16} />
                )}
              </span>
              <span className="rotulo">{t}</span>
              <Selo n={selo[t] ?? 0} />
              {t === 'jfy' && lista.length > 0 && (
                <>
                  {r.abas && algumSino && <span className="sino" />}
                  <Setinha chave="abas" oque="as abas do jfy" />
                </>
              )}
              {t === 'Projetos' && favs.length > 0 && <Setinha chave="favoritos" oque="os projetos favoritos" />}
            </div>
            {t === 'jfy' &&
              !r.abas &&
              lista.map((a) => (
                <div
                  key={a.id}
                  className={`linha sub ${tela === 'jfy' && ativa === a.id ? 'marcada' : ''}`}
                  onClick={() => (irPara('jfy'), api.abas.ir(a.id))}
                  onContextMenu={menuContexto(() =>
                    a.id === '@0'
                      ? []
                      : [
                          { rotulo: 'Renomear…', acao: () => renomeando.set({ id: a.id, nome: a.nome }) },
                          {
                            rotulo: 'Fechar aba…',
                            perigo: true,
                            acao: async () =>
                              (await confirmar({
                                titulo: `Fechar a aba ${a.nome}?`,
                                mensagem: 'O que roda nela (o Claude daquela task, um servidor…) é encerrado junto.',
                                botao: 'Fechar aba',
                                perigo: true
                              })) && api.abas.fechar(a.id)
                          }
                        ]
                  )}
                >
                  <Bolinha cor={a.cor} />
                  <span className="rotulo">{a.nome}</span>
                  {sinos.has(a.id) && <span className="sino" />}
                </div>
              ))}
            {t === 'Projetos' &&
              !r.favoritos &&
              favs.map((f) => (
                <div key={f.id} className="linha sub" onClick={() => irPara('Projetos', { abrirProjeto: f.id })}>
                  <Bolinha cor={f.cor} />
                  <span className="rotulo">{f.nome}</span>
                </div>
              ))}
          </div>
        )
      })}
    </nav>
  )
}

function Renomear() {
  const r = renomeando.use()
  if (!r) return null
  const valido = !!r.nome.trim() && r.nome.trim() !== 'menu'
  const ok = () => valido && (api.abas.renomear(r.id, r.nome.trim()), renomeando.set(null))
  return (
    <Modal
      titulo="Renomear aba"
      fechar={() => renomeando.set(null)}
      acoes={
        <>
          <Botao onClick={() => renomeando.set(null)}>Cancelar</Botao>
          <Botao tipo="primario" disabled={!valido} onClick={ok}>
            Renomear
          </Botao>
        </>
      }
    >
      <Campo autoFocus value={r.nome} onChange={(e) => renomeando.set({ ...r, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      <p>"menu" é o nome da aba principal do jfy e não pode ser usado.</p>
    </Modal>
  )
}

export default function App() {
  const { tela } = nav.use()
  const { abas: lista, ativa } = abas.use()

  useEffect(() => {
    const atualizar = async () => abas.set(await api.abas.listar())
    atualizar()
    const fora = [api.ao.abasMudou(atualizar), api.ao.navegar(abrirUrl)]
    return () => fora.forEach((f) => f())
  }, [])

  useEffect(() => {
    api.tela(tela)
    sincronizar(lista.map((a) => a.id), ativa, tela === 'jfy')
  }, [lista, ativa, tela])

  // Ctrl+1 a Ctrl+9: as nove primeiras telas (⌘1 a ⌘9 no Mac). Na captura, antes do terminal pegar a tecla
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && n >= 1 && n <= 9) {
        e.preventDefault()
        e.stopPropagation()
        irPara(TELAS[n - 1])
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [])

  const menuVivo = lista.find((a) => a.id === '@0')?.viva ?? true

  return (
    <Portao>
      <div className="app">
        <header className="topo">
          <Marca />
          <span className="espaco" />
          <BarraUsoIA />
        </header>
        <BarraLateral />
        <main className="telas">
          {TELAS.map((t) => {
            const C = TELA[t]
            return (
              <section key={t} className={`tela ${tela === t ? '' : 'escondida'}`}>
                {t === 'jfy' ? <TerminalTela menuVivo={menuVivo} /> : C && <C ativa={tela === t} />}
              </section>
            )
          })}
        </main>
        <Renomear />
        <HostSouv />
      </div>
    </Portao>
  )
}
