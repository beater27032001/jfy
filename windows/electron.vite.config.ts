import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// a marca (fontes e símbolo da Souv), a JFY Mono e o mural dos créditos ficam no repo, junto do app do Mac: não
// duplicamos os arquivos (o mural entra no app quando ele é montado)
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@marca': resolve('../app/Marca'), '@fonte': resolve('../fonte'), '@mural': resolve('../mural') } },
    server: { fs: { allow: [resolve('..')] } }
  }
})
