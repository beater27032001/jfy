// O jfy (menu e abas) num terminal dentro da janela: um xterm.js por aba, todos montados, só a ativa aparece.
// Quem guarda as abas é o processo principal (abas.ts): recarregar a tela redesenha cada uma com o fim da saída.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from './jfy'

type Term = { xt: XTerm; fit: FitAddon; el: HTMLDivElement; n: number; fila: [string, number][] | null }
const terms = new Map<string, Term>()
let palco: HTMLDivElement | null = null
let ativa = '@0'
let visivel = false
const WIN = navigator.userAgent.includes('Windows')

/** Os caminhos como o terminal do sistema cola: no Windows entre aspas (quando têm espaço); no Mac, espaço e símbolos
 * com \\ na frente. Um espaço no fim, para continuar digitando. */
function colarCaminhos(caminhos: string[]) {
  const um = (c: string) => (WIN ? (/[\s&()^%!]/.test(c) ? `"${c}"` : c) : c.replace(/[ '"()[\]{}&;|<>$`\\!*?#~]/g, '\\$&'))
  api.abas.escrever(ativa, caminhos.map(um).join(' ') + ' ')
}

// as abas com o sino (o Claude pediu atenção): a bolinha vermelha na barra lateral
const sinos = new Set<string>()
const ouvintes = new Set<() => void>()
let versao = 0
const avisar = () => {
  versao++
  ouvintes.forEach((f) => f())
}
const assinar = (f: () => void) => (ouvintes.add(f), () => void ouvintes.delete(f))
export function useSinos() {
  useSyncExternalStore(assinar, () => versao)
  return sinos
}

const fonte = document.fonts.load('13px "JFY Mono"') // o xterm mede a letra ao abrir: a fonte tem que ter chegado

async function criar(id: string) {
  if (!palco || terms.has(id)) return
  const el = document.createElement('div')
  el.className = 'xt escondida'
  palco.appendChild(el)
  const xt = new XTerm({
    fontFamily: '"JFY Mono", Consolas, monospace',
    fontSize: 13,
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 5000,
    theme: { background: '#0a0e2d', foreground: '#e6e6e6', cursor: '#61fafa', selectionBackground: '#2054e180' }
  })
  const fit = new FitAddon()
  xt.loadAddon(fit)
  const t: Term = { xt, fit, el, n: 0, fila: [] }
  terms.set(id, t)
  await fonte
  xt.open(el)
  xt.onData((d) => api.abas.escrever(id, d))
  xt.onBell(() => {
    if (id !== ativa || !visivel || !document.hasFocus()) {
      sinos.add(id)
      avisar()
    }
  })
  // Ctrl+C com texto selecionado copia, como no Terminal do Windows; sem seleção, vai para o programa (interrompe)
  xt.attachCustomKeyEventHandler((e) => {
    if (e.type === 'keydown' && e.ctrlKey && e.key === 'c' && xt.hasSelection()) {
      navigator.clipboard.writeText(xt.getSelection())
      xt.clearSelection()
      return false
    }
    return true
  })
  const { texto, n } = await api.abas.saida(id)
  xt.write(texto)
  t.n = n
  for (const [d, k] of t.fila ?? []) if (k > t.n) (xt.write(d), (t.n = k))
  t.fila = null
  mostrar()
}

api.ao.dados((id, d, n) => {
  const t = terms.get(id)
  if (!t) return void criar(id) // aba nova: o criar() pega a saída inteira, este pedaço junto
  if (t.fila) return void t.fila.push([d, n])
  if (n > t.n) {
    t.xt.write(d)
    t.n = n
  }
})

function mostrar() {
  for (const [id, t] of terms) t.el.classList.toggle('escondida', id !== ativa)
  const t = terms.get(ativa)
  if (!t || !visivel || t.fila) return
  t.fit.fit()
  api.abas.redimensionar(t.xt.cols, t.xt.rows)
  if (sinos.delete(ativa)) avisar()
  t.xt.focus()
}

/** As abas que a tela conhece; a que sumiu (fechou) leva o xterm junto. */
export function sincronizar(ids: string[], nova: string, telaVisivel: boolean) {
  ativa = nova
  visivel = telaVisivel
  for (const [id, t] of terms)
    if (!ids.includes(id)) {
      t.xt.dispose()
      t.el.remove()
      terms.delete(id)
      sinos.delete(id)
    }
  ids.forEach((id) => void criar(id))
  mostrar()
}

export function TerminalTela({ menuVivo }: { menuVivo: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    palco = ref.current
    for (const t of terms.values()) palco!.appendChild(t.el) // montada de novo (login de novo): os xterms vêm junto
    const ro = new ResizeObserver(() => mostrar())
    ro.observe(ref.current!)
    return () => ro.disconnect()
  }, [])
  return (
    <div
      className="palco-terminal"
      ref={ref}
      // um arquivo arrastado (do Explorador, um print) vira o caminho colado, e o Claude anexa a imagem
      // colar com só uma imagem copiada (um print): o atalho do Claude para colar imagem, que lê do clipboard.
      // No Windows é o Alt+V (ESC v); no Mac, o Ctrl+V (0x16). Na captura, antes do xterm colar texto vazio
      onPasteCapture={(e) => {
        const d = e.clipboardData
        if (d.getData('text/plain') || ![...d.items].some((i) => i.type.startsWith('image/'))) return
        e.preventDefault()
        e.stopPropagation()
        api.abas.escrever(ativa, WIN ? '\x1bv' : '\x16')
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const caminhos = [...e.dataTransfer.files].map((f) => api.caminhoDe(f)).filter(Boolean)
        if (caminhos.length) colarCaminhos(caminhos)
        terms.get(ativa)?.xt.focus()
      }}
    >
      {!menuVivo && ativa === '@0' && (
        <div className="encerrado">
          O jfy fechou. As abas abertas continuam rodando.
          <button className="botao primario" onClick={() => api.abas.abrirMenu()}>
            Abrir de novo
          </button>
        </div>
      )}
    </div>
  )
}
