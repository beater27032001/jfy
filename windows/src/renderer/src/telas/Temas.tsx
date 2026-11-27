// Tela "Temas" (app/Sources/JFY/Temas.swift): os temas do jfy (o t do menu), com as cores e os ícones de cada um; um
// clique troca. Quem lê e grava é o jfy (--temas-json, --tema).
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { fazer, ler } from '../jfy'
import { Aviso } from '../souv'
import './Temas.css'

type Tema = { nome: string; atual: boolean; cores: string[]; projetos: string[]; icones: string[] }

export default function Temas({ ativa }: { ativa: boolean }) {
  const [temas, setTemas] = useState<Tema[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = async () => {
    const [d, msg] = await ler<Tema[]>(['--temas-json'])
    if (d) setTemas(d)
    setAviso(msg)
  }
  useEffect(() => {
    if (ativa && !temas.length) carregar()
  }, [ativa])

  const usar = async (t: Tema) => {
    if (t.atual) return
    setAviso(await fazer(['--tema', t.nome]))
    await carregar()
  }

  return (
    <div className="te-tela">
      <div className="pilha" style={{ gap: 4 }}>
        <h1 className="titulo-tela">Temas</h1>
        {/* no Mac falava também da barra de baixo (a do tmux), que aqui não existe */}
        <span className="texto2">Cores e ícones do jfy no terminal. A troca vale na hora, inclusive nas abas abertas.</span>
      </div>
      <Aviso texto={aviso} tipo="info" />
      <div className="te-grade">
        {temas.map((t) => (
          <button type="button" key={t.nome} className={`te-cartao ${t.atual ? 'atual' : ''}`} title={t.atual ? 'Tema em uso' : `Usar o tema ${t.nome}`} onClick={() => usar(t)}>
            <span className="linha-h">
              <strong>{t.nome}</strong>
              <span className="espaco" />
              {t.atual && (
                <span className="te-em-uso">
                  <CheckCircle2 size={12} /> em uso
                </span>
              )}
            </span>
            <span className="te-cores">
              {t.cores.map((h, i) => <span key={i} style={{ background: h }} />)}
            </span>
            <span className="te-projetos">
              {t.projetos.map((h, i) => <span key={i} style={{ background: h }} />)}
            </span>
            <span className="te-icones">
              {t.icones.map((b, i) => <img key={i} src={`data:image/png;base64,${b}`} width={22} height={22} alt="" />)}
              {!t.icones.length && <span className="texto2 pequeno-texto">ícones do Padrão</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
