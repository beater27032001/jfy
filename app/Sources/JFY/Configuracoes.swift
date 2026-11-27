import AppKit
import SwiftUI

/// As contas ligadas ao jfy: Google (agenda e Gmail), GitHub (as contas do gh) e Journify (o token do MCP). Quem lê e
/// mexe é o jfy (--contas-json, --login, --google-sair, --github-conta, --github-sair, --github-login,
/// --journify-token, --journify-sair); vale também para o jfy no terminal.
struct ConfiguracoesTela: View {
    let ativa: Bool
    let irParaJFY: () -> Void

    struct Contas: Decodable {
        struct Google: Decodable {
            let conectado, cliente: Bool
            let conta, erro: String?
            let drive, fotos: Bool?
        }
        struct Github: Decodable {
            let ativa: String?
            let contas: [String]
            let instalado, brew: Bool?
        }
        struct Journify: Decodable {
            let conectado: Bool
            let fim, erro, site: String?
            let tasks: Int?
        }
        let google: Google
        let github: Github
        let journify: Journify
    }

    /// O que tira acesso pede confirmação antes.
    enum Pedido: Identifiable {
        case googleSair, githubSair(String), githubSairTodas, journifySair, sair
        var id: String { "\(self)" }
        var titulo: String {
            switch self {
            case .googleSair: "Desconectar o Google?"
            case .githubSair(let u): "Tirar \(u) deste Mac?"
            case .githubSairTodas: "Tirar todas as contas do GitHub deste Mac?"
            case .journifySair: "Desconectar o Journify?"
            case .sair: "Sair do jfy?"
            }
        }
        var mensagem: String {
            switch self {
            case .googleSair: "A Agenda, os Emails e os avisos deles param até você conectar de novo. O acesso do jfy é revogado no Google."
            case .githubSair: "O gh e o git deste Mac deixam de usar essa conta. Se ela estiver em uso, o gh passa para outra que sobrar."
            case .githubSairTodas: "O gh e o git deste Mac ficam sem conta até você adicionar de novo, e a aba GitHub para."
            case .journifySair: "O jfy e o Claude deixam de ver e mexer nas suas tasks até você colar um token de novo."
            case .sair: "Você volta para a tela de login e o acesso do jfy à sua conta Google é revogado: a Agenda, os Emails e os avisos deles param até você entrar de novo. As tasks e as abas do terminal continuam como estão."
            }
        }
        var botao: String {
            switch self {
            case .githubSair: "Sair"
            case .githubSairTodas: "Sair de todas"
            case .sair: "Sair"
            default: "Desconectar"
            }
        }
    }

    @State private var contas: Contas?
    @State private var aviso: String?
    @State private var feito: String?
    @State private var ocupado: String?  // "google", "github" ou "journify" enquanto o jfy trabalha
    @State private var pedido: Pedido?
    @State private var colandoToken = false
    @State private var modelos: Modelos?
    @AppStorage("primeirosPassos.estado") private var passos = ""  // "" nunca feito, "feito", "refazer"
    @State private var agentes: Agentes?

    struct Agentes: Decodable {
        struct Agente: Decodable, Identifiable {
            let id, papel, modelo: String
            let atual, oficial: String?
        }
        let opcoes: [String]
        let agentes: [Agente]
    }

    struct Modelos: Decodable {
        struct Atividade: Decodable, Identifiable {
            let id, nome, descricao, modelo, padraoJfy: String
            let opcoes: [String]?
        }
        let opcoes: [String]
        let atividades: [Atividade]
    }

    private static let nomesModelo = ["conversa": "O mesmo da conversa", "padrao": "Padrão do Claude Code", "fable": "Fable", "opus": "Opus", "sonnet": "Sonnet", "haiku": "Haiku"]
    @State private var token = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Configurações").font(Souv.titulo(30))
                    Text("As contas ligadas ao jfy. Valem também para o jfy no terminal.").foregroundStyle(Souv.texto2)
                }
                if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled) }
                if let feito { Label(feito, systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                if let c = contas {
                    VStack(spacing: 14) {
                        cartaoSessao(c.google)
                        google(c.google)
                        github(c.github)
                        journify(c.journify)
                        if let m = modelos { cartaoModelos(m) }
                        if let ag = agentes, !ag.agentes.isEmpty { cartaoAgentes(ag) }
                    }
                    .disabled(ocupado != nil)
                } else if aviso == nil {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .padding(24)
            .frame(maxWidth: 760, alignment: .leading)
        }
        .task(id: ativa) { if ativa { await carregar() } }
        .dialogoSouv(pedido?.titulo ?? "", isPresented: Binding(get: { pedido != nil }, set: { if !$0 { pedido = nil } }),
                            presenting: pedido) { p in
            Button(p.botao, role: .destructive) { confirmar(p) }
        } message: { p in Text(p.mensagem) }
    }

    // ---------- sessão ----------
    private func cartaoSessao(_ g: Contas.Google) -> some View {
        cartao("Sessão", "person.crop.circle", "A sua entrada no jfy, pela conta Google da Souv") {
            estado(g.conectado, g.conta.map { "Entrou como \($0)" } ?? "Sem sessão")
            HStack {
                Button("Sair do jfy", role: .destructive) { pedido = .sair }
                Button("Refazer os primeiros passos") { passos = "refazer" }
                    .help("Abre de novo o assistente que liga Journify, GitHub, projetos e notificações")
            }
        }
    }

    // ---------- Google ----------
    private func google(_ g: Contas.Google) -> some View {
        cartao("Google", "envelope", "Agenda, Gmail e leitura do Drive") {
            if g.conectado {
                estado(g.erro == nil, g.conta.map { "Conectado como \($0)" } ?? "Conectado")
                // permissão que o login antigo não tem: o Drive (a cesta de contexto) e o diretório (as fotos das pessoas)
                let faltam = [g.drive == false ? "o Drive (a cesta de contexto manda Docs e Planilhas só como link)" : nil,
                              g.fotos == false ? "as fotos das pessoas (a Agenda e as sugestões de email mostram só as iniciais)" : nil].compactMap { $0 }
                if !faltam.isEmpty {
                    Text("O login ainda não tem " + faltam.joined(separator: " nem ") + ". Entre de novo para ligar.")
                        .font(.callout).foregroundStyle(.orange)
                    Button("Entrar de novo") { entrarGoogle(trocando: false) }.disabled(ocupado == "google")
                }
                if let e = g.erro { Text(e).font(.caption).foregroundStyle(.orange).textSelection(.enabled) }
            } else {
                estado(false, "Desconectado: a Agenda, os Emails e os avisos deles ficam parados.")
            }
            if ocupado == "google" {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Esperando você entrar no Google, no navegador (até 5 min)…").foregroundStyle(Souv.texto2)
                }
            } else if !g.cliente {
                Text("Primeiro acesso: rode jfy --login no terminal (ele pede o arquivo do app jfy da Souv).").foregroundStyle(Souv.texto2)
            } else {
                HStack {
                    if g.conectado {
                        Button("Trocar de conta") { entrarGoogle(trocando: true) }
                        Button("Desconectar", role: .destructive) { pedido = .googleSair }
                    } else {
                        Button("Conectar") { entrarGoogle(trocando: false) }.buttonStyle(.souvPrimario)
                    }
                }
            }
        }
    }

    /// Trocar = desconectar e entrar de novo (a conta antiga não deixa contatos, não lidos e agenda para a nova).
    private func entrarGoogle(trocando: Bool) {
        Task {
            ocupado = "google"; aviso = nil; feito = nil
            if trocando, let e = await JFY.fazer(["--google-sair"]) {
                aviso = e
            } else if let e = await JFY.fazer(["--login"]) {
                aviso = e
            }
            ocupado = nil
            await carregar()
            NotificationCenter.default.post(name: Sessao.mudou, object: nil)  // a conta nova precisa ser da Souv
            if aviso == nil {
                if let c = contas?.google.conta, contas?.google.conectado == true { feito = "Google conectado como \(c)." }
                else { aviso = "O login do Google não terminou. Tente de novo." }
            }
        }
    }

    // ---------- GitHub ----------
    private func github(_ g: Contas.Github) -> some View {
        cartao("GitHub", "arrow.triangle.branch", "As contas do gh: valem para o gh e o git deste Mac") {
            if g.contas.isEmpty { estado(false, "Nenhuma conta conectada.") }
            ForEach(g.contas, id: \.self) { u in
                HStack(spacing: 10) {
                    AsyncImage(url: URL(string: "https://github.com/\(u).png?size=48")) { $0.resizable() } placeholder: {
                        Circle().fill(Souv.superficie2)
                    }
                    .frame(width: 24, height: 24).clipShape(Circle())
                    Text(u).fontWeight(u == g.ativa ? .semibold : .regular)
                    if u == g.ativa {
                        Text("em uso").font(.caption2.bold()).foregroundStyle(Souv.destaque)
                            .padding(.horizontal, 6).padding(.vertical, 1).background(Capsule().fill(Souv.primaria.opacity(0.2)))
                    }
                    Spacer()
                    if u != g.ativa { Button("Usar") { agir("github", ["--github-conta", u], "Agora o gh usa \(u).") } }
                    Button("Sair") { pedido = .githubSair(u) }
                }
                .padding(.vertical, 2)
            }
            HStack {
                Button { conectarGithub() } label: { Label("Adicionar conta", systemImage: "plus") }
                if g.contas.count > 1 { Button("Sair de todas", role: .destructive) { pedido = .githubSairTodas } }
            }
            Text("Sair tira a conta deste Mac; o token continua valendo no GitHub até você revogar em github.com/settings/applications.")
                .font(.caption).foregroundStyle(Souv.texto2)
        }
    }

    private func conectarGithub() {
        Task { if let e = await JFY.fazer(["--github-login"]) { aviso = e } else { irParaJFY() } }  // o gh auth login roda numa aba
    }

    // ---------- Journify ----------
    private func journify(_ j: Contas.Journify) -> some View {
        cartao("Journify", "checklist", "O MCP do Journify: é por ele que o jfy e o Claude leem e mexem nas suas tasks") {
            if !j.conectado {
                estado(false, "Desconectado: sem o Journify, o jfy não vê as suas tasks.")
            } else if let e = j.erro {
                estado(false, "O Journify recusou o token")
                Text(e).font(.caption).foregroundStyle(.orange).textSelection(.enabled)
            } else {
                estado(true, "Conectado · enxerga \(j.tasks ?? 0) task(s) suas · token …\(j.fim ?? "")")
            }
            if colandoToken {
                HStack {
                    SecureField("Cole o token gerado no Journify", text: $token).campoSouv().onSubmit(salvarToken)
                    Button("Salvar") { salvarToken() }.buttonStyle(.souvPrimario).disabled(token.isEmpty)
                    Button("Cancelar") { colandoToken = false; token = "" }
                }
                Text("No Journify, em Configurações › Conectar meu Claude, clique em Gerar token e cole aqui. O jfy testa o token antes de trocar.")
                    .font(.caption).foregroundStyle(Souv.texto2)
                if ocupado == "journify" { ProgressView().controlSize(.small) }
            } else {
                HStack {
                    Button(j.conectado ? "Trocar token" : "Conectar") {
                        colandoToken = true
                        if let u = URL(string: (j.site ?? "https://journify.souv.tech") + "/settings") { NSWorkspace.shared.open(u) }
                    }
                    if j.conectado { Button("Desconectar", role: .destructive) { pedido = .journifySair } }
                }
            }
        }
    }

    private func salvarToken() {
        let t = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        token = ""
        Task {
            ocupado = "journify"; aviso = nil; feito = nil
            if let e = await JFY.fazer(["--journify-token"], entrada: t) { aviso = e } else { colandoToken = false; feito = "Journify conectado." }
            ocupado = nil
            await carregar()
        }
    }

    // ---------- comum ----------
    private func confirmar(_ p: Pedido) {
        switch p {
        case .googleSair: agir("google", ["--google-sair"], "Google desconectado.")
        case .githubSair(let u): agir("github", ["--github-sair", u], "\(u) saiu deste Mac.")
        case .githubSairTodas: agir("github", ["--github-sair"], "Todas as contas do GitHub saíram deste Mac.")
        case .journifySair: agir("journify", ["--journify-sair"], "Journify desconectado.")
        case .sair: agir("google", ["--google-sair"], "Você saiu do jfy.")
        }
    }

    private func agir(_ qual: String, _ args: [String], _ ok: String) {
        Task {
            ocupado = qual; aviso = nil; feito = nil
            if let e = await JFY.fazer(args) { aviso = e } else { feito = ok }
            ocupado = nil
            await carregar()
            if qual == "google" { NotificationCenter.default.post(name: Sessao.mudou, object: nil) }  // sem Google, volta ao login
        }
    }

    private func carregar() async {
        let (c, msg): (Contas?, String?) = await JFY.ler(["--contas-json"])
        if let c { contas = c } else { aviso = msg }
        let (m, _): (Modelos?, String?) = await JFY.ler(["--modelos-json"])
        if let m { modelos = m }
        let (ag, _): (Agentes?, String?) = await JFY.ler(["--agentes-json"])
        if let ag { agentes = ag }
    }

    // ---------- agentes da pipeline ----------
    private func cartaoAgentes(_ ag: Agentes) -> some View {
        cartao("Agentes da pipeline", "person.3.sequence", "O modelo de cada agente do /pipeline") {
            Text("O /pipeline roda no modelo de \"Tasks pelo /pipeline\"; cada agente que ele chama pode ter o seu. A escolha fica no jfy e volta sozinha depois de atualizar a pipeline do time (o install.sh).")
                .font(.caption).foregroundStyle(Souv.texto2).fixedSize(horizontal: false, vertical: true)
            ForEach(ag.agentes) { a in
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.id).fontWeight(.medium)
                        Text(a.papel).font(.caption).foregroundStyle(Souv.texto2).lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    SouvSelect(opcoes: ag.opcoes.map { .init(valor: $0, rotulo: rotuloAgente($0, oficial: a.oficial)) }, selecionado: a.modelo) { novo in
                        Task {
                            if let e = await JFY.fazer(["--agente-modelo", a.id, novo]) { aviso = e } else {
                                feito = "\(a.id): \(rotuloAgente(novo, oficial: a.oficial))."
                            }
                            let (ag, _): (Agentes?, String?) = await JFY.ler(["--agentes-json"])
                            if let ag { agentes = ag }
                        }
                    }
                    .frame(width: 230)
                }
                .padding(.vertical, 2)
                if a.id != ag.agentes.last?.id { Divider().opacity(0.5) }
            }
        }
    }

    private func rotuloAgente(_ v: String, oficial: String?) -> String {
        switch v {
        case "oficial": "Padrão da pipeline" + (oficial.map { " (\(Self.nomesModelo[$0] ?? $0))" } ?? "")
        case "inherit": "O mesmo da sessão"
        default: Self.nomesModelo[v] ?? v
        }
    }

    // ---------- modelos do Claude ----------
    private func cartaoModelos(_ m: Modelos) -> some View {
        cartao("Modelos do Claude", "cpu", "Qual modelo o Claude usa em cada atividade do jfy") {
            Text("Os mais leves (Sonnet, Haiku) custam menos e bastam para tarefas simples. O padrão do Claude Code é o modelo que você usa no terminal (/model). A troca vale na hora, também para o jfy do terminal.")
                .font(.caption).foregroundStyle(Souv.texto2).fixedSize(horizontal: false, vertical: true)
            ForEach(m.atividades) { a in
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.nome).fontWeight(.medium)
                        Text(a.descricao + (a.padraoJfy == "padrao" || a.padraoJfy == "conversa" ? "" : " · padrão do jfy: \(Self.nomesModelo[a.padraoJfy] ?? a.padraoJfy)"))
                            .font(.caption).foregroundStyle(Souv.texto2).lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    SouvSelect(opcoes: (a.opcoes ?? m.opcoes).map { .init(valor: $0, rotulo: Self.nomesModelo[$0] ?? $0) }, selecionado: a.modelo) { novo in
                        Task {
                            if let e = await JFY.fazer(["--modelo", a.id, novo]) { aviso = e } else { feito = "\(a.nome): \(Self.nomesModelo[novo] ?? novo)." }
                            let (m, _): (Modelos?, String?) = await JFY.ler(["--modelos-json"])
                            if let m { modelos = m }
                        }
                    }
                    .frame(width: 210)
                }
                .padding(.vertical, 2)
                if a.id != m.atividades.last?.id { Divider().opacity(0.5) }
            }
        }
    }

    private func estado(_ ok: Bool, _ texto: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(ok ? Color.green : Souv.texto2).frame(width: 8, height: 8)
            Text(texto)
        }
    }

    private func cartao(_ titulo: String, _ icone: String, _ subtitulo: String, @ViewBuilder _ corpo: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: icone).font(.title3).foregroundStyle(Souv.destaque).frame(width: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(titulo).font(Souv.titulo(18))
                    Text(subtitulo).font(.caption).foregroundStyle(Souv.texto2)
                }
            }
            corpo()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Souv.superficie))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Souv.borda))
    }
}
