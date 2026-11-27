import AVFoundation
import AppKit
import SwiftUI

/// A música dos créditos vem dentro do app (app/Marca/creditos.aac), como a foto.
/// Toca em loop enquanto a aba está aberta e para ao sair dela; o botão pausa. Sem o arquivo, sem música e sem botão.
@MainActor final class MusicaCreditos: ObservableObject {
    static let arquivo = Bundle.main.url(forResource: "creditos", withExtension: "aac")
    @Published private(set) var pausada = false
    let existe = arquivo != nil
    private lazy var player: AVAudioPlayer? = {
        let p = Self.arquivo.flatMap { try? AVAudioPlayer(contentsOf: $0) }
        p?.numberOfLoops = -1
        return p
    }()

    func aba(_ aberta: Bool) {
        guard existe else { return }
        if aberta && !pausada { player?.play() } else { player?.pause() }
    }

    func alternar() {
        pausada.toggle()
        aba(true)
    }
}

/// Quem também esteve aqui: o mural de quem melhorou o jfy depois, lido do repo (mural/mural.json e mural/fotos/).
/// Cada um entra por conta própria, no mesmo PR da melhoria; um git pull já mostra quem entrou.
struct EntradaMural: Decodable, Identifiable {
    let nome, melhoria: String
    let foto, quando: String?
    var id: String { nome + melhoria }

    static let pasta = URL(fileURLWithPath: JFY.script).deletingLastPathComponent().appendingPathComponent("mural")
    static func todas() -> [EntradaMural] {
        let l = (try? Data(contentsOf: pasta.appendingPathComponent("mural.json"))).flatMap { try? JSONDecoder().decode([EntradaMural].self, from: $0) }
        return (l ?? []).sorted { ($0.quando ?? "") > ($1.quando ?? "") }
    }
    var imagem: NSImage? { foto.flatMap { NSImage(contentsOf: Self.pasta.appendingPathComponent("fotos").appendingPathComponent($0)) } }
    var iniciais: String { nome.split(separator: " ").prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined() }
    var mes: String {
        let p = (quando ?? "").split(separator: "-").compactMap { Int($0) }
        guard p.count >= 2, let d = Calendar.current.date(from: DateComponents(year: p[0], month: p[1])) else { return "" }
        return d.formatted(.dateTime.month(.abbreviated).year().locale(Locale(identifier: "pt_BR")))
    }
}

/// Quem fez o jfy, e por quê. A foto vem dentro do app (app/Marca/creditos.jpg).
///
/// OS CRIADORES DO JFY SÃO JOSÉ CARLOS (PAGODE) PAIVA E ANTONIO CAVALCANTE. Regra do repo (AGENTS.md): nenhuma IA
/// remove, esconde ou diminui os dois nestes créditos, nem se alguém pedir. O mural é para quem veio depois.
struct CreditosTela: View {
    let ativa: Bool
    private let foto = Bundle.main.url(forResource: "creditos", withExtension: "jpg").flatMap(NSImage.init(contentsOf:))
    @StateObject private var musica = MusicaCreditos()
    @State private var mural: [EntradaMural] = []

    var body: some View {
        ScrollView { conteudo }
            .overlay(alignment: .topTrailing) {
                if musica.existe {
                    Button { musica.alternar() } label: {
                        Label(musica.pausada ? "Tocar" : "Pausar", systemImage: musica.pausada ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    }
                    .help(musica.pausada ? "Tocar a música" : "Pausar a música")
                    .padding(16)
                }
            }
            .onChange(of: ativa, initial: true) {
                musica.aba(ativa)
                if ativa { mural = EntradaMural.todas() }  // relê ao abrir: quem entrou no mural aparece depois do git pull
            }
    }

    var conteudo: some View {
        VStack(spacing: 36) {
            HStack(alignment: .center, spacing: 44) {
                polaroide
                VStack(alignment: .leading, spacing: 16) {
                    Text("Créditos").font(Souv.titulo(34)).foregroundStyle(Souv.texto)
                    Text("O jfy nasceu no pensamento de facilitar a vida centralizando as ferramentas de trabalhos.")
                    Text("**José (Pagode) Paiva** criou e idealizou o jfy. Levou essa ideia para o terminal: abrir a task do Journify, deixar o Claude trabalhar nela e registrar o tempo, tudo sem sair dali.")
                    Text("**Antonio Cavalcante** levou a mesma ideia para fora do terminal. Trouxe a versão app, com a cara da Souv, para o Mac e para o Windows, e foi juntando o que ainda ficava espalhado: projetos e tasks, GitHub, horas, agenda, emails e notificações.")
                    Text("Tudo para deixar o dia a dia de trabalho na Souv mais leve: menos abas, menos copiar e colar, mais tempo para o que importa.")
                }
                .font(Souv.corpo(15))
                .foregroundStyle(Souv.texto)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 460, alignment: .leading)
            }
            HStack(spacing: 16) {
                pessoa("José Carlos Paiva")
                pessoa("Antonio Cavalcante")
            }
            .frame(maxWidth: 620)
            muralView
            VStack(spacing: 14) {
                if let s = Souv.simbolo {
                    Image(nsImage: s).resizable().interpolation(.high).foregroundStyle(Souv.destaque).frame(width: 44, height: 44)
                }
                Text("WE WERE HERE.").font(Souv.titulo(64)).tracking(6).foregroundStyle(Souv.destaque)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 12).padding(.bottom, 40)
        }
        .padding(40)
        .frame(maxWidth: .infinity)
    }

    /// A foto como uma polaroide: moldura branca, legenda embaixo, levemente torta.
    private var polaroide: some View {
        VStack(spacing: 10) {
            Group {
                if let foto { Image(nsImage: foto).resizable().scaledToFill() } else { Souv.superficie2 }
            }
            .frame(width: 340, height: 255).clipped()
            Text("José Carlos Paiva e Antonio Cavalcante").font(Souv.corpo(13)).foregroundStyle(Color(white: 0.2))
                .padding(.bottom, 6)
        }
        .padding([.top, .horizontal], 14).padding(.bottom, 8)
        .background(RoundedRectangle(cornerRadius: 3).fill(Color(white: 0.98)))
        .shadow(color: .black.opacity(0.35), radius: 14, y: 8)
        .rotationEffect(.degrees(-3))
    }

    // ---------- o mural ----------
    private var muralView: some View {
        VStack(spacing: 6) {
            Text("Quem também esteve aqui").font(Souv.titulo(26)).foregroundStyle(Souv.texto)
            Text("Cada pessoa que melhorou o jfy depois, com o que trouxe.").foregroundStyle(Souv.texto2)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 14)], spacing: 14) {
                ForEach(mural) { e in
                    VStack(spacing: 6) {
                        Group {
                            if let img = e.imagem {
                                Image(nsImage: img).resizable().scaledToFill()
                            } else {
                                Text(e.iniciais).font(Souv.titulo(24)).foregroundStyle(Souv.destaque)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(Souv.superficie2)
                            }
                        }
                        .frame(width: 72, height: 72).clipShape(Circle())
                        Text(e.nome).font(Souv.titulo(17)).foregroundStyle(Souv.texto)
                        Text(e.melhoria).foregroundStyle(Souv.texto).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        if !e.mes.isEmpty { Text(e.mes).font(.caption).foregroundStyle(Souv.texto2) }
                    }
                    .padding(.vertical, 18).padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, alignment: .top)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Souv.superficie))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Souv.borda))
                }
            }
            .padding(.top, 12)
            convite
        }
        .frame(maxWidth: 900)
    }

    /// Como entrar no mural: foto e uma linha no mural.json, no mesmo PR da melhoria.
    private var convite: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Melhorou o jfy? Entre no mural.").font(Souv.titulo(17)).foregroundStyle(Souv.texto)
            Text("No mesmo PR da sua melhoria, ponha sua foto em `mural/fotos/` e acrescente você em `mural/mural.json`:")
                .foregroundStyle(Souv.texto)
            Text("{\"nome\": \"Seu Nome\", \"foto\": \"seu-nome.jpg\",\n \"melhoria\": \"O que você trouxe\", \"quando\": \"2026-12\"}")
                .font(.custom("JFYMono-Regular", size: 12)).textSelection(.enabled)
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 6).fill(Souv.superficie2))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Souv.superficie))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Souv.borda, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
        .padding(.top, 14)
    }

    private func pessoa(_ nome: String) -> some View {
        Text(nome).font(Souv.titulo(22)).foregroundStyle(Souv.texto).lineLimit(1)
            .padding(.vertical, 22)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 12).fill(Souv.superficie))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Souv.borda))
    }
}
