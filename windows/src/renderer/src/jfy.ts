// O jfy em Python é o motor; a tela só chama ele, como o app do Mac (JFY.ler / JFY.fazer em JFYApp.swift).
import type { API } from '../../preload'

declare global {
  interface Window {
    jfy: API
  }
}
export const api = window.jfy

/** Roda um comando do app e lê o JSON da saída. O segundo valor é a mensagem para mostrar: o erro (stderr do jfy)
 * ou um aviso que veio junto com o resultado. */
export async function ler<T>(args: string[], entrada?: string): Promise<[T | null, string | null]> {
  const r = await api.jfy(args, entrada)
  const msg = r.erro.trim() || null
  if (r.status !== 0) return [null, msg ?? `jfy ${args[0]} falhou (código ${r.status})`]
  try {
    return [JSON.parse(r.saida) as T, msg]
  } catch (e) {
    return [null, `Não entendi a resposta do jfy ${args[0]}: ${e}`]
  }
}

/** Roda um comando que só muda algo. Devolve null se deu certo, senão a mensagem de erro. */
export async function fazer(args: string[], entrada?: string): Promise<string | null> {
  const r = await api.jfy(args, entrada)
  return r.status === 0 ? null : r.erro.trim() || `jfy ${args[0]} falhou (código ${r.status})`
}

// o Claude do corretor (Haiku) fica aberto nos bastidores e fecha com 10 min parado: aquecer mais de 1 vez a cada 5 min
// não adianta nada, e cada vez é um processo do jfy
let aquecido = 0
/** Abre o Claude do corretor antes da primeira correção (sem esperar a resposta). */
export function aquecerCorretor() {
  if (Date.now() - aquecido < 5 * 60_000) return
  aquecido = Date.now()
  void api.jfy(['--corretor-aquecer']).catch(() => {})
}
