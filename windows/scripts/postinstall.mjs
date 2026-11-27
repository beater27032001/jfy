// Depois do npm install: o Electron baixa o binário dele (o npm 11 não rodou esse passo sozinho) e, no Mac (só para
// desenvolver), o spawn-helper do node-pty, que vem sem permissão de execução, ganha a permissão.
import { chmodSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

execFileSync(process.execPath, ['node_modules/electron/install.js'], { stdio: 'inherit' })
const helper = `node_modules/node-pty/prebuilds/${process.platform}-${process.arch}/spawn-helper`
if (existsSync(helper)) chmodSync(helper, 0o755)
