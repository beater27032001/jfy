// O que as telas dividem, como os ObservableObject do app do Mac: a navegação de uma tela para outra (Navegacao), os
// favoritos, a cesta de contexto (Cesta), as abas do jfy (AbasTmux) e os limites da IA (LimitesIA).
import { useEffect, useSyncExternalStore } from 'react'
import { api } from './jfy'
import type { Aba } from '../../preload'

/** Um valor que várias telas leem e mudam; `use()` redesenha quem usa quando muda. `chave`: fica no localStorage. */
export function loja<T>(inicial: T, chave?: string) {
  let valor: T = chave ? (JSON.parse(localStorage.getItem(chave) ?? 'null') ?? inicial) : inicial
  const ouvintes = new Set<() => void>()
  const assinar = (f: () => void) => (ouvintes.add(f), () => void ouvintes.delete(f))
  return {
    get: () => valor,
    set(v: T | ((atual: T) => T)) {
      valor = typeof v === 'function' ? (v as (a: T) => T)(valor) : v
      if (chave) localStorage.setItem(chave, JSON.stringify(valor))
      ouvintes.forEach((f) => f())
    },
    use: () => useSyncExternalStore(assinar, () => valor)
  }
}

// ---------- navegação ----------
export const TELAS = [
  'Meu dia', 'jfy', 'Projetos', 'Contexto', 'GitHub', 'Horas', 'Agenda', 'Emails', 'Portas', 'Uso da IA', 'Chat',
  'Notificações', 'Temas', 'Configurações', 'Créditos'
] as const
export type Tela = (typeof TELAS)[number]

/** Para uma tela abrir algo em outra: o PR abre a task em Projetos, a task abre o PR em GitHub, a notificação abre o
 * email. A tela de destino lê o pedido quando aparece e o zera (nav.set({...nav.get(), abrirX: null})). */
export type Nav = {
  tela: Tela
  abrirTask: { pid: string; tid: string } | null
  abrirPR: string | null // "dono/repo#n"
  abrirProjeto: string | null
  abrirEmail: string | null
  abrirEvento: string | null
  abrirConversa: string | null
}
export const nav = loja<Nav>({
  tela: (localStorage.getItem('tela.inicial') as Tela) || 'Meu dia', // o app abre na Meu dia
  abrirTask: null, abrirPR: null, abrirProjeto: null, abrirEmail: null, abrirEvento: null, abrirConversa: null
})
export const irPara = (tela: Tela, pedido: Partial<Nav> = {}) => nav.set((n) => ({ ...n, ...pedido, tela }))
/** Zera um pedido depois que a tela de destino o atendeu. */
export const atendido = (k: Exclude<keyof Nav, 'tela'>) => nav.set((n) => ({ ...n, [k]: null }))

/** jfy://<destino>/<resto>: o clique nas notificações. email/<id>, pr/<dono>/<repo>#<n>, evento/<id>, aba/<@n>,
 * chat/<conversa>, horas, agenda, emails, github, notificacoes. */
export function abrirUrl(url: string) {
  const [destino, ...r] = url.replace(/^jfy:\/\//, '').split('/')
  let resto = r.join('/')
  try {
    resto = decodeURIComponent(resto)
  } catch {
    /* um % solto (o motor nem sempre codifica): fica como veio */
  }
  if (destino === 'aba') api.abas.ir(resto) // o clique no aviso do Claude: o terminal já na aba dele
  const mapa: Record<string, [Tela, Partial<Nav>?]> = {
    email: ['Emails', { abrirEmail: resto }], pr: ['GitHub', { abrirPR: resto }], evento: ['Agenda', { abrirEvento: resto }],
    chat: ['Chat', { abrirConversa: resto || null }], aba: ['jfy'], horas: ['Horas'], agenda: ['Agenda'], emails: ['Emails'],
    github: ['GitHub'], notificacoes: ['Notificações']
  }
  const [tela, pedido] = mapa[destino] ?? ['jfy']
  irPara(tela, pedido)
}

// ---------- favoritos: até 4 projetos na barra lateral, embaixo de Projetos ----------
export type Favorito = { id: string; nome: string; cor?: string | null }
export const MAX_FAVORITOS = 4
export const favoritos = loja<Favorito[]>([], 'favoritos')
/** Marca ou desmarca. Devolve false quando já há 4 e este não é um deles. */
export function alternarFavorito(f: Favorito) {
  const l = favoritos.get()
  if (l.some((x) => x.id === f.id)) favoritos.set(l.filter((x) => x.id !== f.id))
  else if (l.length < MAX_FAVORITOS) favoritos.set([...l, f])
  else return false
  return true
}

// ---------- a cesta de contexto (aba Contexto): o que o Claude precisa ler ----------
export type ItemContexto = {
  tipo: 'task' | 'documento' | 'reuniao' | 'arquivo' | 'link' | 'email' | 'pr'
  ref: string // o id, o link ou repo#n
  titulo: string
  origem?: string | null // de onde veio (projeto, task, remetente), só para mostrar
  pid?: string | null
  nota?: string
}
export const ROTULOS_CONTEXTO: Record<ItemContexto['tipo'], string> = {
  task: 'Tasks', documento: 'Documentos', reuniao: 'Reuniões', arquivo: 'Arquivos', link: 'Links', email: 'Emails',
  pr: 'Pull requests'
}
const idItem = (i: Pick<ItemContexto, 'tipo' | 'ref'>) => `${i.tipo}|${i.ref}`
export const cesta = loja<ItemContexto[]>([], 'contexto.itens')
export const naCesta = (i: Pick<ItemContexto, 'tipo' | 'ref'>) => cesta.get().some((x) => idItem(x) === idItem(i))
export function alternarNaCesta(i: ItemContexto) {
  cesta.set((l) => (l.some((x) => idItem(x) === idItem(i)) ? l.filter((x) => idItem(x) !== idItem(i)) : [...l, { nota: '', ...i }]))
}

// ---------- as abas do jfy (o menu e uma por task): quem atualiza é o App, pelo processo principal ----------
export const abas = loja<{ abas: Aba[]; ativa: string }>({ abas: [], ativa: '@0' })

// ---------- os limites do Claude (5 h e semana), lidos do ~/.jfy/claude-status.json que o statusline grava ----------
export type Janela = { pct: number; renova: Date | null }
export const limites = loja<{ cinco: Janela | null; semana: Janela | null }>({ cinco: null, semana: null })

async function lerLimites() {
  for (const arq of ['claude-status.json', 'claude-status.json.ok']) {
    try {
      const rl = JSON.parse((await api.lerJfy(arq)) ?? 'null')?.rate_limits
      if (!rl) continue
      const janela = (k: string): Janela | null => {
        const x = rl[k]
        if (!x) return null
        const renova = x.resets_at ? new Date(x.resets_at * 1000) : null
        const viva = !!renova && renova > new Date()
        return { pct: viva ? Math.round(x.used_percentage ?? 0) : 0, renova: viva ? renova : null }
      }
      return limites.set({ cinco: janela('five_hour'), semana: janela('seven_day') })
    } catch {
      /* arquivo pela metade: tenta o próximo */
    }
  }
}
lerLimites()
setInterval(lerLimites, 15_000)

/** Roda `f` agora e a cada `ms` enquanto `ativo` (a tela está aberta). */
export function useACada(f: () => void, ms: number, ativo = true) {
  useEffect(() => {
    if (!ativo) return
    f()
    const t = setInterval(f, ms)
    return () => clearInterval(t)
  }, [ativo])
}

// ---------- os números da barra lateral: cada tela põe o seu (emails não lidos, notificações novas, portas abertas) ----------
export const selos = loja<{ emails: number; chat: number; notificacoes: number; portas: number }>({ emails: 0, chat: 0, notificacoes: 0, portas: 0 })

// ---------- sessão (Login.swift): os primeiros passos e o aviso "a conta do Google mudou, confira a sessão" ----------
export const passos = loja('', 'primeirosPassos.estado') // "" nunca feito, "feito", "refazer"
export const sessaoVersao = loja(0)
/** Quem mexe na conta do Google (Configurações) chama isto, e o portão confere a sessão de novo. */
export const sessaoMudou = () => sessaoVersao.set((v) => v + 1)

// ---------- contatos (sugestões dos campos de email: Emails e Agenda), lidos uma vez do jfy ----------
export type Contato = { email: string; nome: string; foto?: string | null } // foto: do diretório do Google
export const contatos = loja<Contato[]>([])
let contatosPedidos = false
export async function carregarContatos() {
  if (contatosPedidos) return
  contatosPedidos = true
  const r = await api.jfy(['--contatos-json'])
  try {
    if (r.status === 0) contatos.set(JSON.parse(r.saida))
  } catch {
    /* sem contatos: o campo funciona sem sugestão */
  }
}
