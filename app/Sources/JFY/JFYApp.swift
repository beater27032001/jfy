import AppKit
import SwiftUI

/// O jfy em Python é o motor; o app só chama ele. O caminho vem do Info.plist (o build.sh grava).
enum JFY {
    static let script = Bundle.main.object(forInfoDictionaryKey: "JFYScript") as? String
        ?? NSHomeDirectory() + "/jfy/jfy"

    /// Roda `jfy <args>` fora da thread principal e devolve o código de saída, a saída e o erro. `entrada` vai pelo
    /// stdin (um token, por exemplo, que não pode aparecer na linha de comando).
    static func rodar(_ args: [String], entrada: String? = nil) async -> (status: Int32, saida: String, erro: String) {
        await withCheckedContinuation { cont in
            DispatchQueue.global(qos: .userInitiated).async {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: script)
                p.arguments = args
                var env = ProcessInfo.processInfo.environment
                env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "/usr/bin:/bin")
                p.environment = env
                let out = Pipe(), err = Pipe()
                p.standardOutput = out
                p.standardError = err
                let inn = Pipe()
                if entrada != nil { p.standardInput = inn }
                do {
                    try p.run()
                } catch {
                    return cont.resume(returning: (-1, "", "Não consegui rodar \(script): \(error.localizedDescription)"))
                }
                if let entrada {
                    // sem "\n" no fim: o --corrigir descarta a correção que muda as quebras de linha do texto
                    inn.fileHandleForWriting.write(Data(entrada.utf8))
                    try? inn.fileHandleForWriting.close()
                }
                // ponytail: lê a saída toda antes do erro; o stderr do jfy é curto, então o pipe não enche
                let o = out.fileHandleForReading.readDataToEndOfFile()
                let e = err.fileHandleForReading.readDataToEndOfFile()
                p.waitUntilExit()
                cont.resume(returning: (p.terminationStatus, String(decoding: o, as: UTF8.self),
                                        String(decoding: e, as: UTF8.self)))
            }
        }
    }
}

extension JFY {
    /// Roda um comando do app e decodifica o JSON da saída. O segundo valor é a mensagem para mostrar: o erro
    /// (stderr do jfy, ex.: o Journify recusou) ou um aviso que veio junto com o resultado.
    static func ler<T: Decodable>(_ args: [String], entrada: String? = nil) async -> (T?, String?) {
        let r = await rodar(args, entrada: entrada)
        let msg = r.erro.trimmingCharacters(in: .whitespacesAndNewlines)
        guard r.status == 0 else { return (nil, msg.isEmpty ? "jfy \(args[0]) falhou (código \(r.status))" : msg) }
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        do {
            return (try d.decode(T.self, from: Data(r.saida.utf8)), msg.isEmpty ? nil : msg)
        } catch {
            return (nil, "Não entendi a resposta do jfy \(args[0]): \(error)")
        }
    }

    /// Roda um comando que só muda algo. Devolve nil se deu certo, senão a mensagem de erro.
    static func fazer(_ args: [String], entrada: String? = nil) async -> String? {
        let r = await rodar(args, entrada: entrada)
        let msg = r.erro.trimmingCharacters(in: .whitespacesAndNewlines)
        return r.status == 0 ? nil : msg.isEmpty ? "jfy \(args[0]) falhou (código \(r.status))" : msg
    }

    /// Abre o Claude do corretor antes da primeira correção (o chat e os emails chamam quando a pessoa vai escrever),
    /// sem esperar. No máximo 1 vez a cada 5 min: o corretor fica de pé 10 min depois do último uso.
    @MainActor static func aquecerCorretor() {
        guard Date().timeIntervalSince(aquecidoEm) > 300 else { return }
        aquecidoEm = Date()
        Task { _ = await rodar(["--corretor-aquecer"]) }
    }
    @MainActor private static var aquecidoEm = Date.distantPast
}

/// "AAAA-MM-DD" do dia local, e de volta. O .iso8601 do Swift usa UTC: no Brasil, "25/11" virava 24/11 às 21h
/// (o prazo aparecia um dia antes e podia ser salvo um dia depois).
func diaLocal(_ d: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

func dataLocal(_ s: String) -> Date? {
    let p = s.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))  // meio-dia: longe da virada
}

extension Color {
    /// "#rrggbb" do jfy (a cor do projeto nas abas do tmux, a do tema); sem cor, o cinza secundário.
    init(hex: String?) {
        guard let hex, hex.count == 7, let v = UInt32(hex.dropFirst(), radix: 16) else {
            self = .secondary
            return
        }
        self.init(red: Double(v >> 16 & 255) / 255, green: Double(v >> 8 & 255) / 255, blue: Double(v & 255) / 255)
    }
}

enum Tela: String, CaseIterable, Identifiable {
    case dia = "Meu dia", terminal = "jfy", projetos = "Projetos", contexto = "Contexto", github = "GitHub", horas = "Horas", reunioes = "Agenda", emails = "Emails",
         portas = "Portas", uso = "Uso da IA",
         chat = "Chat", notificacoes = "Notificações", temas = "Temas", configuracoes = "Configurações", creditos = "Créditos"
    var id: Self { self }
    var icone: String {
        switch self {
        case .dia: "sun.max"
        case .terminal: "terminal"
        case .projetos: "folder"
        case .contexto: "tray.full"
        case .github: "arrow.triangle.branch"
        case .horas: "clock"
        case .reunioes: "calendar"
        case .emails: "envelope"
        case .portas: "network"
        case .uso: "chart.bar.xaxis"
        case .chat: "bubble.left.and.bubble.right"
        case .notificacoes: "bell"
        case .creditos: "heart"
        case .configuracoes: "gearshape"
        case .temas: "paintpalette"
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    // fechar a janela não fecha o app: o jfy segue rodando em segundo plano (o terminal e as notificações são do app,
    // não da janela) e volta igual pelo ícone do Dock ou por Janela > jfy. ⌘Q sai de verdade; as tasks ficam no tmux
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    // ⌘Q: o jfy volta a mostrar os avisos pelo terminal-notifier na hora (sem esperar o sinal de vida vencer)
    func applicationWillTerminate(_ notification: Notification) { try? FileManager.default.removeItem(at: Notificacoes.sinal) }
}

/// A imagem da mesa desfocada, atrás da barra lateral em tela cheia. Imagem que não carrega (fundo em vídeo, por
/// exemplo) fica sem: a barra volta ao normal.
struct FundoDaMesa: View {
    private let imagem = NSScreen.main.flatMap { NSWorkspace.shared.desktopImageURL(for: $0) }.flatMap { NSImage(contentsOf: $0) }
    var body: some View {
        if let imagem {
            Image(nsImage: imagem).resizable().scaledToFill().blur(radius: 40).overlay(.ultraThinMaterial).clipped()
                .ignoresSafeArea()
        }
    }
}

/// Para uma aba abrir algo em outra: o PR abre a task na aba Projetos, a task abre o PR na aba GitHub.
final class Navegacao: ObservableObject {
    struct TaskRef: Equatable {
        let pid, tid: String
    }
    /// Projeto favorito: aparece na barra lateral, embaixo de Projetos.
    struct Favorito: Codable, Equatable, Identifiable {
        let id, nome: String
        let cor: String?
    }
    static let maxFavoritos = 4

    @Published var tela: Tela? = .dia  // o app abre na Meu dia
    @Published var abrirTask: TaskRef?
    @Published var abrirPR: String?  // "dono/repo#n"
    @Published var abrirProjeto: String?
    @Published var abrirEmail: String?
    @Published var abrirEvento: String?
    @Published var abrirConversa: String?  // conversa do chat (o clique na notificação de mensagem nova)
    @Published var abrirAba: String?  // janela do tmux do jfy (o clique na notificação do Claude)

    /// jfy://<destino>, o clique nas notificações do jfy: email/<id>, pr/<dono>/<repo>#<n>, evento/<id>, chat/<conversa>,
    /// aba/<janela do tmux>, horas, agenda, emails, github, notificacoes.
    func abrir(_ url: URL) {
        guard url.scheme == "jfy", let destino = url.host else { return }
        let resto = String(url.path.drop(while: { $0 == "/" }))  // o path já vem decodificado (%23 → #, %25 → %)
        switch destino {
        case "email": abrirEmail = resto; tela = .emails
        case "pr": abrirPR = resto; tela = .github
        case "evento": abrirEvento = resto; tela = .reunioes
        case "chat": abrirConversa = resto; tela = .chat
        case "aba": abrirAba = resto; tela = .terminal
        case "horas": tela = .horas
        case "agenda": tela = .reunioes
        case "emails": tela = .emails
        case "github": tela = .github
        case "notificacoes": tela = .notificacoes
        default: tela = .terminal
        }
        NSApp.activate(ignoringOtherApps: true)
    }
    @Published var favoritos: [Favorito] = (try? JSONDecoder().decode([Favorito].self,
        from: UserDefaults.standard.data(forKey: "favoritos") ?? Data())) ?? [] {
        didSet { UserDefaults.standard.set(try? JSONEncoder().encode(favoritos), forKey: "favoritos") }
    }

    /// Marca ou desmarca. Devolve false quando já há 4 e este não é um deles.
    func alternarFavorito(_ f: Favorito) -> Bool {
        if let i = favoritos.firstIndex(where: { $0.id == f.id }) {
            favoritos.remove(at: i)
        } else if favoritos.count < Self.maxFavoritos {
            favoritos.append(f)
        } else {
            return false
        }
        return true
    }
}

@main
struct JFYApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var terminal = TerminalHost()
    @StateObject private var notificacoes = Notificacoes()
    @StateObject private var caixa = CaixaEmail()
    @StateObject private var portas = PortasAbertas()
    @StateObject private var nav = Navegacao()
    @StateObject private var abas = AbasTmux()
    @StateObject private var limites = LimitesIA()
    @StateObject private var sessao = Sessao()

    var body: some Scene {
        Window("jfy", id: "jfy") {
            Portao(sessao: sessao) {  // só entra com a conta da Souv
                Principal(terminal: terminal, notificacoes: notificacoes, caixa: caixa, portas: portas, nav: nav, abas: abas, limites: limites)
            }
        }
            .defaultSize(width: 1200, height: 780)
            // abre sempre com a janela: sem isto, o macOS restaurava "nenhuma janela" quando o app saía com ela fechada,
            // e só o segundo clique no Dock mostrava o app
            .restorationBehavior(.disabled)
            .defaultLaunchBehavior(.presented)
    }
}

struct Principal: View {
    @ObservedObject var terminal: TerminalHost
    @ObservedObject var notificacoes: Notificacoes
    @ObservedObject var caixa: CaixaEmail
    @ObservedObject var portas: PortasAbertas
    @ObservedObject var nav: Navegacao
    @ObservedObject var abas: AbasTmux
    @ObservedObject private var cesta = Cesta.shared
    @ObservedObject var limites: LimitesIA
    private var tela: Tela? { nav.tela }
    @State private var telaCheia = false
    @AppStorage("barra.abasRecolhidas") private var abasRecolhidas = false
    @AppStorage("barra.favoritosRecolhidos") private var favoritosRecolhidos = false
    @State private var renomeando: AbasTmux.Aba?
    @State private var novoNome = ""
    @State private var fechando: AbasTmux.Aba?

    var body: some View {
        NavigationSplitView {
            List {
                ForEach(Tela.allCases) { t in
                    let marcada = (tela ?? .terminal) == t
                    HStack(spacing: 8) {
                        Group {
                            // a tela inicial leva o símbolo da Souv (sem o arquivo no app, fica o ícone do sistema)
                            if t == .dia, let s = Souv.simbolo {
                                Image(nsImage: s).resizable().interpolation(.high).frame(width: 16, height: 16)
                            } else {
                                Image(systemName: t.icone)
                            }
                        }
                        .frame(width: 18)
                        .foregroundStyle(marcada ? Souv.destaque : Souv.texto2)
                        Text(t.rawValue).foregroundStyle(Souv.texto).fontWeight(marcada ? .medium : .regular).lineLimit(1)
                        Spacer(minLength: 0)
                        selo(t == .notificacoes ? notificacoes.novas : t == .emails ? caixa.naoLidos : t == .chat ? caixa.chatNaoLidas : t == .portas ? portas.itens.count
                             : t == .contexto ? cesta.itens.count : 0)
                        if t == .terminal, !abas.itens.isEmpty {
                            Spacer(minLength: 0)
                            // recolhida, a bolinha do sino continua aparecendo na linha do jfy
                            if abasRecolhidas, abas.itens.contains(where: \.sino) { Circle().fill(.red).frame(width: 7, height: 7) }
                            setinha($abasRecolhidas, "as abas do jfy")
                        }
                        if t == .projetos, !nav.favoritos.isEmpty {
                            Spacer(minLength: 0)
                            setinha($favoritosRecolhidos, "os projetos favoritos")
                        }
                    }
                    .padding(.vertical, 2)
                    .linhaSouv(marcada) { nav.tela = t }
                    if t == .terminal, !abasRecolhidas { abasDoJFY }
                    if t == .projetos, !favoritosRecolhidos { favoritosDaBarra }
                }
            }
            .navigationSplitViewColumnWidth(min: 150, ideal: 180, max: 230)
            // em tela cheia não há nada atrás da janela e a barra lateral, que deixa ver o fundo, fica chapada:
            // nela, a barra mostra a imagem da mesa desfocada, como fora da tela cheia
            // Midnight Blue (Cloud White no claro) um pouco transparente: a barra continua deixando ver o fundo
            .scrollContentBackground(.hidden)
            .background {
                ZStack {
                    if telaCheia { FundoDaMesa() }
                    Souv.barraLateral
                }
                .ignoresSafeArea()
            }
        } detail: {
            // todas ficam montadas: trocar de tela não reinicia o terminal nem perde a conversa
            ZStack {
                Souv.fundo.ignoresSafeArea()
                mostrar(.dia) { MeuDiaTela(ativa: tela == .dia, nav: nav, abas: abas) }
                mostrar(.terminal) { TerminalTela(host: terminal) }
                mostrar(.projetos) { ProjetosTela(ativa: tela == .projetos, nav: nav, irParaJFY: irParaJFY) }
                mostrar(.contexto) { ContextoTela(ativa: tela == .contexto, irParaJFY: irParaJFY, abas: abas) }
                mostrar(.github) { GithubTela(ativa: tela == .github, nav: nav, irParaJFY: irParaJFY) }
                mostrar(.horas) { HorasTela(ativa: tela == .horas) }
                mostrar(.reunioes) { ReunioesTela(ativa: tela == .reunioes, nav: nav, irParaJFY: irParaJFY) }
                mostrar(.emails) { EmailsTela(caixa: caixa, ativa: tela == .emails, nav: nav) }
                mostrar(.portas) { PortasTela(portas: portas, ativa: tela == .portas) }
                mostrar(.uso) { UsoTela() }
                mostrar(.chat) { ChatTela(ativa: tela == .chat, nav: nav) }
                mostrar(.notificacoes) {
                    NotificacoesTela(notificacoes: notificacoes, ativa: tela == .notificacoes, irParaJFY: irParaJFY)
                }
                mostrar(.temas) { TemasTela(ativa: tela == .temas) }
                mostrar(.configuracoes) { ConfiguracoesTela(ativa: tela == .configuracoes, irParaJFY: irParaJFY) }
                mostrar(.creditos) { CreditosTela(ativa: tela == .creditos) }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigation) { MarcaJFY() }  // a marca no lugar do título da janela
            ToolbarItem(placement: .principal) { BarraUsoIA(limites: limites) }  // em qualquer aba
        }
        .toolbar(removing: .title)
        .frame(minWidth: 1040, minHeight: 640)  // abaixo disso as telas de três colunas ficariam espremidas
        .font(Souv.corpo())  // Roboto no texto; os títulos usam Souv.titulo (Lexend)
        .identidadeSouv()
        .onOpenURL { nav.abrir($0) }  // o clique nas notificações (jfy://…)
        .onChange(of: nav.abrirAba) {
            guard let alvo = nav.abrirAba else { return }
            abas.irPara(alvo)
            nav.abrirAba = nil
        }
        .background { atalhos }
        .dialogoSouv("Renomear aba", isPresented: Binding(get: { renomeando != nil }, set: { if !$0 { renomeando = nil } })) {
            Button("Renomear") { if let a = renomeando { abas.renomear(a, novoNome) } }
        } message: {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Nome", text: $novoNome).foregroundStyle(Souv.texto).campoSouv()
                Text("\"menu\" é o nome da aba principal do jfy e não pode ser usado.")
            }
        }
        .dialogoSouv("Fechar a aba \(fechando?.nome ?? "")?", isPresented: Binding(get: { fechando != nil }, set: { if !$0 { fechando = nil } }),
                            presenting: fechando) { a in
            Button("Fechar aba", role: .destructive) { abas.fechar(a) }
        } message: { _ in Text("O que roda nela (o Claude daquela task, um servidor…) é encerrado junto.") }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEnterFullScreenNotification)) { _ in telaCheia = true }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.willExitFullScreenNotification)) { _ in telaCheia = false }
        .onChange(of: tela) { _, nova in
            if nova == .terminal { terminal.focar() }
        }
    }

    private func irParaJFY() { nav.tela = .terminal }

    /// O número da linha da barra lateral (não lidos, novas, portas), no Vivid Blue da Souv.
    @ViewBuilder private func selo(_ n: Int) -> some View {
        if n > 0 {
            Text("\(n)").font(.caption2.bold()).monospacedDigit().foregroundStyle(.white)
                .padding(.horizontal, 6).padding(.vertical, 1)
                .background(Capsule().fill(Souv.primaria))
        }
    }

    /// A setinha que recolhe e abre a lista embaixo de uma linha da barra lateral (fica lembrado entre aberturas).
    private func setinha(_ recolhida: Binding<Bool>, _ oque: String) -> some View {
        Button { withAnimation(.snappy(duration: 0.2)) { recolhida.wrappedValue.toggle() } } label: {
            Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                .rotationEffect(.degrees(recolhida.wrappedValue ? 0 : 90))
                .frame(width: 18, height: 18).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(recolhida.wrappedValue ? "Mostrar \(oque)" : "Recolher \(oque)")
    }

    /// Os projetos favoritos (até 4, marcados com a estrela na aba Projetos), embaixo de Projetos: o clique abre o projeto.
    @ViewBuilder private var favoritosDaBarra: some View {
        ForEach(nav.favoritos) { f in
            Button {
                nav.abrirProjeto = f.id
                nav.tela = .projetos
            } label: {
                HStack(spacing: 6) {
                    Circle().fill(Color(hex: f.cor)).frame(width: 8, height: 8).frame(width: 14)
                    Text(f.nome).lineLimit(1)
                    Spacer(minLength: 0)
                }
                .font(.callout)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 20)
        }
    }

    /// As abas abertas no jfy (o menu e as tasks), embaixo de "jfy": o clique leva o terminal até ela. A bolinha
    /// vermelha é o Claude daquela aba pedindo atenção (o sino do tmux).
    @ViewBuilder private var abasDoJFY: some View {
        ForEach(abas.itens) { a in
            Button {
                abas.ir(a)
                nav.tela = .terminal
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: a.nome == "menu" ? "list.bullet" : "chevron.right.square")
                        .font(.caption).foregroundStyle(.secondary).frame(width: 14)
                    Text(a.nome).lineLimit(1).truncationMode(.tail)
                        .fontWeight(a.ativa && tela == .terminal ? .semibold : .regular)
                    Spacer(minLength: 0)
                    if a.sino { Circle().fill(.red).frame(width: 7, height: 7).help("O Claude desta aba pediu atenção") }
                }
                .font(.callout)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 20)
            .help(a.nome)
            .menuSouv(se: a.nome != "menu") {
                Button("Renomear…", systemImage: "pencil") { novoNome = a.nome; renomeando = a }
                Button("Fechar aba…", systemImage: "xmark", role: .destructive) { fechando = a }
            }
            .moveDisabled(a.nome == "menu")
        }
        .onMove { abas.mover($0, $1) }  // arrastar reordena as abas no tmux
    }

    private func mostrar(_ t: Tela, @ViewBuilder _ conteudo: () -> some View) -> some View {
        let ativa = (tela ?? .terminal) == t
        return conteudo().opacity(ativa ? 1 : 0).allowsHitTesting(ativa).accessibilityHidden(!ativa)
    }

    /// ⌘1 a ⌘9 para as nove primeiras da barra lateral (não existe ⌘10)
    private var atalhos: some View {
        ForEach(Array(Tela.allCases.prefix(9).enumerated()), id: \.element) { i, t in
            Button("") { nav.tela = t }.keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command).hidden()
        }
    }
}
