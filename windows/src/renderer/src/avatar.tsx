// A pessoa num círculo, como o Google Agenda: a foto do diretório do Google (as pessoas da Souv, que o jfy lê pela
// People API) ou, sem ela, as iniciais sobre uma cor que é sempre a mesma para o mesmo email. `cor`: a cor da pessoa
// no "Reunião com…", num anel (a mesma dos eventos dela na agenda). O mesmo AvatarPessoa do app do Mac (Emails.swift).
import { useState, type CSSProperties } from 'react'
import './avatar.css'

const CORES = ['#14b8a6', '#f97316', '#ec4899', '#a855f7', '#84cc16', '#eab308', '#06b6d4', '#f43f5e']

const iniciais = (nome: string | null | undefined, email: string) =>
  (nome || email.split('@')[0])
    .replace(/[._]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('')

const corDe = (email: string) => CORES[[...email.toLowerCase()].reduce((s, c) => (s + c.charCodeAt(0)) % 997, 0) % CORES.length]

export function Avatar({ nome, email, foto, cor, tamanho = 18, style }: {
  nome?: string | null
  email: string
  foto?: string | null
  cor?: string
  tamanho?: number
  style?: CSSProperties
}) {
  const [quebrou, setQuebrou] = useState(false) // foto que não carrega (link velho, sem rede): as iniciais
  return (
    <span
      className="avatar"
      title={nome ? `${nome} · ${email}` : email}
      style={{
        width: tamanho, height: tamanho, fontSize: tamanho * 0.42, background: corDe(email),
        boxShadow: cor ? `0 0 0 ${Math.max(1.5, tamanho / 10)}px ${cor}` : undefined, ...style
      }}
    >
      {foto && !quebrou ? (
        <img src={foto} alt="" referrerPolicy="no-referrer" onError={() => setQuebrou(true)} />
      ) : (
        iniciais(nome, email)
      )}
    </span>
  )
}
