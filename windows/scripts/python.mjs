// Baixa o Python embutível do python.org para windows/python, se faltar: ele vai dentro do instalador, e o motor roda
// nele (ninguém precisa instalar Python no Windows). `tar` abre .zip no Windows 10+ e no Mac.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const VERSAO = '3.14.10' // ponytail: fixa; trocar aqui quando quiser um Python mais novo
if (!existsSync('python/python.exe')) {
  const url = `https://www.python.org/ftp/python/${VERSAO}/python-${VERSAO}-embed-amd64.zip`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`não consegui baixar ${url} (${r.status})`)
  rmSync('python', { recursive: true, force: true })
  mkdirSync('python')
  writeFileSync('python/python.zip', Buffer.from(await r.arrayBuffer()))
  execFileSync('tar', ['-xf', 'python.zip'], { cwd: 'python' })
  rmSync('python/python.zip')
  console.log(`Python ${VERSAO} em windows/python`)
}
