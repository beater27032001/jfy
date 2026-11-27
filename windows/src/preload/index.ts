// A ponte entre a tela e o processo principal: só o que a tela usa, nada de Node solto no renderer.
import { contextBridge, ipcRenderer, webUtils } from 'electron'

type Resultado = { status: number; saida: string; erro: string }
export type Aba = { id: string; nome: string; chave: string; cor?: string; cwd: string; viva: boolean }

const ouvir = (canal: string, f: (...a: any[]) => void) => {
  const h = (_e: unknown, ...a: any[]) => f(...a)
  ipcRenderer.on(canal, h)
  return () => void ipcRenderer.removeListener(canal, h)
}

const api = {
  jfy: (args: string[], entrada?: string): Promise<Resultado> => ipcRenderer.invoke('jfy', args, entrada),
  caminhos: (): Promise<{ jfy: string; marca: string; casa: string; win: boolean }> => ipcRenderer.invoke('caminhos'),
  /** Lê (ou grava; null apaga) um arquivo de ~/.jfy, pelo nome relativo: "claude-status.json", "notificacoes.jsonl". */
  lerJfy: (nome: string): Promise<string | null> => ipcRenderer.invoke('jfy:ler', nome),
  escreverJfy: (nome: string, texto: string | null): Promise<void> => ipcRenderer.invoke('jfy:escrever', nome, texto),
  /** O painel do sistema para escolher uma pasta ou um arquivo. null: cancelou. */
  /** `inicio`: a pasta em que o painel abre ("downloads" ou um caminho). */
  escolher: (o: { pasta?: boolean; titulo?: string; criar?: boolean; filtros?: { name: string; extensions: string[] }[]; inicio?: string }): Promise<string | null> =>
    ipcRenderer.invoke('escolher', o),
  copiar: (texto: string) => ipcRenderer.send('copiar', texto),
  /** O caminho no disco de um arquivo arrastado para a janela (o File do navegador não tem mais o .path). */
  caminhoDe: (f: File) => webUtils.getPathForFile(f),
  mostrarPasta: (p: string) => ipcRenderer.send('mostrar-pasta', p),
  selo: (n: number, imagem?: string) => ipcRenderer.send('selo', n, imagem),
  abrirLink: (alvo: string) => ipcRenderer.send('abrir-link', alvo),
  tela: (nome: string) => ipcRenderer.send('tela', nome),
  abas: {
    listar: (): Promise<{ abas: Aba[]; ativa: string }> => ipcRenderer.invoke('abas:listar'),
    saida: (id: string): Promise<{ texto: string; n: number }> => ipcRenderer.invoke('abas:saida', id),
    ir: (id: string) => ipcRenderer.send('abas:ir', id),
    escrever: (id: string, d: string) => ipcRenderer.send('abas:escrever', id, d),
    redimensionar: (cols: number, rows: number) => ipcRenderer.send('abas:redimensionar', cols, rows),
    renomear: (id: string, nome: string) => ipcRenderer.send('abas:renomear', id, nome),
    fechar: (id: string) => ipcRenderer.send('abas:fechar', id),
    abrirMenu: () => ipcRenderer.send('abas:menu'),
    /** Uma aba nova com `jfy <args>` (ex.: ["--github-login"]). */
    abrirJfy: (nome: string, args: string[]) => ipcRenderer.send('abas:jfy', nome, args),
    /** Uma aba nova com o terminal do sistema (PowerShell no Windows) aberto na pasta. */
    abrirTerminal: (pasta: string, nome?: string) => ipcRenderer.send('abas:terminal', pasta, nome)
  },
  ao: {
    dados: (f: (id: string, d: string, n: number) => void) => ouvir('abas:dados', f),
    abasMudou: (f: () => void) => ouvir('abas:mudou', f),
    navegar: (f: (url: string) => void) => ouvir('navegar', f),
    notificacoes: (f: () => void) => ouvir('notificacoes:mudou', f)
  }
}

export type API = typeof api
contextBridge.exposeInMainWorld('jfy', api)
