import AppKit
import SwiftUI

/// Quantos não lidos tem a Principal: o mesmo número do ✉ da barra do tmux, que o jfy guarda em ~/.jfy/email.json
/// (olha o Gmail a cada ~25 s). O app lê o arquivo a cada 10 s, sem rodar o jfy: é o selo na barra lateral.
final class CaixaEmail: ObservableObject {
    private struct Estado: Decodable { let ids: [String]? }
    static let arquivo = URL(fileURLWithPath: NSHomeDirectory() + "/.jfy/email.json")
    @Published private(set) var naoLidos = 0
    @Published private(set) var chatNaoLidas = 0  // conversas do chat com mensagem não lida (o jfy guarda os ids)
    static let chat = URL(fileURLWithPath: NSHomeDirectory() + "/.jfy/chat-nao-lidas.json")
    private var timer: Timer?

    init() {
        ler()
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.ler() }
    }

    func ler() {
        let n = (try? JSONDecoder().decode(Estado.self, from: Data(contentsOf: Self.arquivo)))?.ids?.count ?? 0
        if n != naoLidos { naoLidos = n }
        let c = (try? JSONDecoder().decode([String].self, from: Data(contentsOf: Self.chat)))?.count ?? 0
        if c != chatNaoLidas { chatNaoLidas = c }
    }
}

/// Os não lidos da Principal: ler (continua não lido), marcar como lido ou não lido, marcar todos e abrir no Gmail.
/// Quem fala com o Gmail é o jfy (--emails-json, --email-json, --email-acao, --emails-lidos).
struct EmailsTela: View {
    @ObservedObject var caixa: CaixaEmail
    let ativa: Bool
    @ObservedObject var nav: Navegacao

    struct Lista: Decodable {
        let mudou, cache: Bool?  // cache: a lista guardada; mudou: a busca achou algo diferente da guardada
        struct Item: Decodable, Identifiable, Hashable {
            let id, de, assunto: String
            let ts: Double
            let email: String?
            let lido, importante: Bool?
        }
        let conta, url: String?
        let total: Int
        let mais: Bool
        let naoLidos: Int?
        let emails: [Item]
    }

    /// As caixas da lista: os não lidos da Principal ou os importantes (como a pasta Importantes do Gmail).
    enum Caixa: String, CaseIterable { case naoLidos = "nao_lidos", importantes }
    enum Grupo: String, CaseIterable { case data = "Data", remetente = "Remetente", nenhum = "Sem grupo" }

    struct Email: Decodable {
        let mudou, cache: Bool?  // o mesmo da Lista, para o email aberto
        struct Anexo: Decodable, Identifiable {
            let nome, tipo, parte: String
            let tamanho: Int
            var id: String { parte }
        }
        struct Mensagem: Decodable, Identifiable {
            let id, de, data, texto: String
            let eu: Bool
            var anexos: [Anexo]?
        }
        let id, de, para, data, assunto, texto, link: String
        let cc: String?
        let anexos: [Anexo]
        let lido, temAssinatura: Bool
        let conversa: [Mensagem]
    }

    enum Modo: String, CaseIterable { case responder = "Responder", todos = "Responder a todos", encaminhar = "Encaminhar" }

    @State private var lista: Lista?
    @State private var selecao: String?
    @State private var email: Email?
    @State private var aviso: String?
    @State private var carregando = false
    @State private var confirmarTodos = false
    @State private var resposta = ""
    @State private var contexto = ""
    @State private var escrevendo: String?  // o modo que o Claude está fazendo
    @State private var confirmarEnvio = false
    @State private var feito: String?
    @State private var modo = Modo.responder
    @State private var para = ""  // encaminhar
    @State private var cc = ""
    @State private var abertas: Set<String> = []  // mensagens antigas da conversa abertas
    @State private var escrevendoNovo = false  // o email do zero
    @AppStorage("emails.caixa") private var caixaLista: Caixa = .naoLidos
    @AppStorage("emails.grupo") private var grupo: Grupo = .data
    @State private var busca = ""
    @State private var filtroLeitura: Set<String> = []  // "nao_lido", "lido"

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("Emails").font(Souv.titulo(24))
                if let l = lista {
                    Text(caixaLista == .naoLidos ? "\(l.total)\(l.mais ? "+" : "") não lido(s) na Principal"
                         : "\(l.total)\(l.mais ? "+" : "") importantes · \(l.naoLidos ?? 0) não lido(s) na Principal")
                        .foregroundStyle(.secondary).lineLimit(1)
                    if let c = l.conta { Text("· \(c)").foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle).layoutPriority(-1) }
                }
                Spacer()
                Button { escrevendoNovo = true } label: { Label("Escrever", systemImage: "square.and.pencil") }
                    .buttonStyle(.souvPrimario)
                if let u = lista?.url.flatMap(URL.init(string:)) { Link("Abrir o Gmail", destination: u).buttonStyle(.souvLink) }
                Button("Marcar todos como lidos") { confirmarTodos = true }.disabled((lista?.naoLidos ?? lista?.total ?? 0) == 0)
                Button { Task { await carregar() } } label: { Image(systemName: "arrow.clockwise") }.help("Atualizar").disabled(carregando)
            }
            .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 8)
            filtros.padding(.horizontal, 20).padding(.bottom, 10)
            Divider()
            if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).padding(10).textSelection(.enabled) }
            if let feito { Label(feito, systemImage: "checkmark.circle.fill").foregroundStyle(.green).padding(10) }
            GeometryReader { g in
            HStack(spacing: 0) {
                List {
                    if let l = lista, l.emails.isEmpty {
                        Text(caixaLista == .naoLidos ? "Caixa zerada: nenhum não lido na Principal." : "Nenhum email importante.")
                            .foregroundStyle(.secondary)
                    } else if lista != nil, grupos.isEmpty {
                        Text("Nada com esses filtros.").foregroundStyle(.secondary)
                    }
                    ForEach(grupos, id: \.0) { titulo, itens in
                        Section {
                            ForEach(itens) { linhaEmail($0) }
                        } header: {
                            if grupo != .nenhum {
                                Text("\(titulo.uppercased()) · \(itens.count)").font(.caption.weight(.semibold)).tracking(0.5).lineLimit(1)
                            }
                        }
                    }
                }
                .listaSouv()
                .frame(width: min(360, max(260, g.size.width * 0.34)))
                Divider()
                detalhe.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            }
        }
        .task(id: "\(ativa)|\(caixaLista.rawValue)") { if ativa { await carregar() } }
        .onChange(of: caixaLista) { selecao = nil; filtroLeitura = [] }
        .task(id: selecao) { await abrir() }
        .onChange(of: nav.abrirEmail) {  // o clique na notificação de email novo
            guard let id = nav.abrirEmail else { return }
            selecao = id
            nav.abrirEmail = nil
            Task { await carregar() }
        }
        .onChange(of: caixa.naoLidos) { if ativa { Task { await carregar() } } }  // chegou email com a aba aberta
        .dialogoSouv("Marcar todos os não lidos da Principal como lidos no Gmail?", isPresented: $confirmarTodos) {
            Button("Marcar todos") { agir(["--emails-lidos"]) }
        }
        .dialogoSouv(modo == .encaminhar ? "Encaminhar para \(para)?" : "Enviar a resposta para \(email.map { remetente($0.de) } ?? "")" + (modo == .todos ? " e os outros da conversa?" : "?"),
                            isPresented: $confirmarEnvio) {
            Button("Enviar") { if let e = email { responderGmail(e, enviar: true) } }
        } message: {
            Text("Sai da sua conta do Gmail, na mesma conversa" + (email?.temAssinatura == true ? ", com a sua assinatura" : "") + ". Não tem volta pelo app.")
        }
        .sheet(isPresented: $escrevendoNovo) {
            NovoEmail(fechar: { escrevendoNovo = false }, enviado: { feito = $0; escrevendoNovo = false }).identidadeSouv()
        }
        .onChange(of: selecao) {
            feito = nil
            resposta = ""
            contexto = ""
            para = ""
            cc = ""
            modo = .responder
            abertas = []
        }
    }

    // ---------- filtros e grupos ----------
    private var filtros: some View {
        HStack(spacing: 8) {
            Segmentos(selecao: $caixaLista, opcoes: [.init(valor: .naoLidos, rotulo: "Não lidos"), .init(valor: .importantes, rotulo: "Importantes")])
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(Souv.texto2)
                TextField("Buscar remetente ou assunto", text: $busca).textFieldStyle(.plain)
            }
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 8).fill(Souv.superficie2))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Souv.borda))
            .frame(minWidth: 140, maxWidth: 280)
            if caixaLista == .importantes {
                FiltroMulti(titulo: "Leitura", opcoes: [("nao_lido", "Não lidos", Souv.primaria), ("lido", "Lidos", nil)], marcados: $filtroLeitura)
            }
            if !busca.isEmpty || !filtroLeitura.isEmpty {
                Button("Limpar") { busca = ""; filtroLeitura = [] }.buttonStyle(.souvLink)
            }
            Spacer(minLength: 4)
            SouvSelect(opcoes: Grupo.allCases.map { .init(valor: $0, rotulo: $0.rawValue) }, selecionado: grupo) { grupo = $0 }
                .frame(width: 130).help("Agrupar por")
        }
        .lineLimit(1)
    }

    private var filtrados: [Lista.Item] {
        (lista?.emails ?? []).filter { e in
            (busca.isEmpty || "\(e.de) \(e.email ?? "") \(e.assunto)".range(of: busca, options: [.caseInsensitive, .diacriticInsensitive]) != nil)
                && (filtroLeitura.isEmpty || filtroLeitura.contains(e.lido == false ? "nao_lido" : "lido"))
        }
    }

    /// Os emails em grupos: por data (Hoje, Ontem, Esta semana, Este mês, Mais antigos), por remetente (o mais recente
    /// primeiro) ou num grupo só.
    private var grupos: [(String, [Lista.Item])] {
        let es = filtrados
        switch grupo {
        case .nenhum: return es.isEmpty ? [] : [("Todos", es)]
        case .remetente:
            var ordem: [String] = [], por: [String: [Lista.Item]] = [:]
            for e in es.sorted(by: { $0.ts > $1.ts }) {
                let k = e.email ?? e.de
                if por[k] == nil { ordem.append(k) }
                por[k, default: []].append(e)
            }
            return ordem.map { (por[$0]![0].de, por[$0]!) }
        case .data:
            let cal = Calendar.current, hoje = cal.startOfDay(for: Date())
            let faixa = { (e: Lista.Item) -> String in
                let d = cal.startOfDay(for: Date(timeIntervalSince1970: e.ts))
                let dias = cal.dateComponents([.day], from: d, to: hoje).day ?? 0
                return dias <= 0 ? "Hoje" : dias == 1 ? "Ontem" : dias < 7 ? "Esta semana" : dias < 31 ? "Este mês" : "Mais antigos"
            }
            let por = Dictionary(grouping: es, by: faixa)
            return ["Hoje", "Ontem", "Esta semana", "Este mês", "Mais antigos"].compactMap { k in por[k].map { (k, $0) } }
        }
    }

    private func linhaEmail(_ e: Lista.Item) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                if e.lido == false { Circle().fill(Souv.primaria).frame(width: 7, height: 7).help("Não lido") }
                Text(e.de).fontWeight(e.lido == false ? .semibold : .regular).lineLimit(1)
                if e.importante == true && caixaLista == .naoLidos {
                    Image(systemName: "tag.fill").font(.caption2).foregroundStyle(.yellow).help("Importante para o Gmail")
                }
                Spacer()
                Text(quando(e.ts)).font(.caption).foregroundStyle(.secondary)
            }
            Text(e.assunto).lineLimit(2).foregroundStyle(e.lido == false ? Souv.texto : .secondary)
        }
        .padding(.vertical, 3)
        .linhaSouv(selecao == e.id) { selecao = e.id }
    }

    @ViewBuilder private var detalhe: some View {
        if let e = email {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text(e.assunto).font(.title3.weight(.semibold)).textSelection(.enabled)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("De: \(e.de)")
                        Text("Para: \(e.para)")
                        Text(e.data)
                    }
                    .font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
                    HStack {
                        Button(e.lido ? "Marcar como não lido" : "Marcar como lido") { agir(["--email-acao", e.id, e.lido ? "nao_lido" : "lido"]) }
                        if let u = URL(string: e.link) { Link("Abrir no Gmail", destination: u).buttonStyle(.souvLink) }
                        BotaoContexto(item: .init(tipo: "email", ref: e.id, titulo: e.assunto, origem: e.de))
                    }
                    Divider()
                    conversa(e)
                    Divider().padding(.top, 8)
                    responder(e)
                }
                .padding(24)
                .frame(maxWidth: 820, alignment: .leading)
            }
        } else {
            Text(selecao == nil ? "Escolha um email" : "").foregroundStyle(.secondary)
        }
    }

    /// A conversa inteira: a última mensagem aberta, as antigas em uma linha (o clique abre). A sua resposta entra aqui.
    @ViewBuilder private func conversa(_ e: Email) -> some View {
        let msgs = e.conversa.isEmpty ? [Email.Mensagem(id: e.id, de: e.de, data: e.data, texto: e.texto, eu: false, anexos: e.anexos)] : e.conversa
        if msgs.count > 1 { Text("CONVERSA (\(msgs.count))").font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
        ForEach(Array(msgs.enumerated()), id: \.element.id) { i, m in
            let aberta = i == msgs.count - 1 || abertas.contains(m.id) || m.id == e.id
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(m.eu ? "Você" : remetente(m.de)).fontWeight(.semibold)
                    Spacer()
                    Text(m.data).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                if aberta {
                    TextoEmail(texto: m.texto)
                } else {
                    Text(m.texto.split(separator: "\n").first.map(String.init) ?? "").foregroundStyle(.secondary).lineLimit(1)
                }
                if aberta, let anexos = m.anexos, !anexos.isEmpty {
                    ForEach(anexos) { AnexoEmail(mid: m.id, anexo: $0) }
                }
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 8).fill(m.eu ? Souv.primaria.opacity(0.08) : Color.secondary.opacity(0.06)))
            .contentShape(Rectangle())
            .onTapGesture { if !aberta { abertas.insert(m.id) } }
        }
    }

    // ---------- responder ----------
    private func responder(_ e: Email) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Segmentos(selecao: $modo, opcoes: Modo.allCases.map { .init(valor: $0, rotulo: $0.rawValue) })
            switch modo {
            case .encaminhar:
                CampoEmails(rotulo: "Para", texto: $para)
                CampoEmails(rotulo: "Cc", texto: $cc)
                if !e.anexos.isEmpty { Label("Os anexos vão junto: \(e.anexos.map(\.nome).joined(separator: ", "))", systemImage: "paperclip").font(.caption).foregroundStyle(.secondary) }
            case .todos:
                Text("Para \(remetente(e.de)), com cópia para os outros de Para e Cc (menos você).").font(.caption).foregroundStyle(.secondary)
            case .responder:
                Text("Para \(remetente(e.de)).").font(.caption).foregroundStyle(.secondary)
            }
            TextEditor(text: $resposta)
                .font(.body).frame(minHeight: 140)
                .campoSouv()
                .disabled(escrevendo != nil)
            TextField("Contexto para o Claude (opcional): o que responder, o tom, o que já foi combinado…", text: $contexto, axis: .vertical)
                .lineLimit(1...4).campoSouv()
            HStack {
                Button { ia(e, "gerar") } label: { Label("Gerar com o Claude", systemImage: "sparkles") }
                Button("Corrigir") { ia(e, "corrigir") }.disabled(vazia).help("Só os erros do seu texto, sem mudar o que ele diz")
                Button("Melhorar") { ia(e, "melhorar") }.disabled(vazia).help("Seu texto como base, mais claro e direto")
                if let m = escrevendo { ProgressView().controlSize(.small); Text("O Claude está \(m == "gerar" ? "escrevendo" : m == "corrigir" ? "corrigindo" : "melhorando")…").foregroundStyle(.secondary) }
                Spacer()
                Button("Salvar rascunho") { responderGmail(e, enviar: false) }.disabled(vazia || semDestino)
                Button("Enviar") { confirmarEnvio = true }.buttonStyle(.souvPrimario).disabled(vazia || semDestino)
            }
            .disabled(escrevendo != nil)
            Text("O Claude só escreve aqui; nada sai sem você apertar Enviar. Gerar, corrigir e melhorar usam tokens.")
                .font(.caption).foregroundStyle(.secondary)
            if e.temAssinatura {
                Text("Vai com a sua assinatura do Gmail.").font(.caption).foregroundStyle(.secondary)
            } else {
                AvisoAssinatura(url: lista?.url.map { $0.replacingOccurrences(of: "#inbox", with: "#settings/general") })
            }
        }
        .task(id: e.id) { JFY.aquecerCorretor() }  // o Corrigir já acha o Claude do corretor aberto
    }

    private var vazia: Bool { resposta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var semDestino: Bool { modo == .encaminhar && !para.contains("@") }

    private func remetente(_ de: String) -> String { de.components(separatedBy: " <").first ?? de }

    private func ia(_ e: Email, _ modo: String) {
        Task {
            escrevendo = modo
            struct Texto: Decodable { let texto: String }
            let (r, msg): (Texto?, String?) = await JFY.ler(["--email-ia", e.id, modo, resposta, contexto])
            escrevendo = nil
            if let r { resposta = r.texto }
            aviso = msg
        }
    }

    private func responderGmail(_ e: Email, enviar: Bool) {
        Task {
            struct Feito: Decodable { let para, cc: String }
            let modoJfy = modo == .encaminhar ? "encaminhar" : modo == .todos ? "todos" : "responder"
            let d: [String: Any] = ["id": e.id, "modo": modoJfy, "texto": resposta, "enviar": enviar, "para": para, "cc": cc]
            guard let json = try? JSONSerialization.data(withJSONObject: d), let txt = String(data: json, encoding: .utf8) else { return }
            let (r, msg): (Feito?, String?) = await JFY.ler(["--email-enviar", txt])
            aviso = r == nil ? msg : nil
            feito = r.map { (enviar ? "Enviado para " : "Rascunho salvo no Gmail, para ") + $0.para + ($0.cc.isEmpty ? "" : ", com cópia para \($0.cc)") + "." }
            if r != nil, enviar {
                resposta = ""
                await abrir()  // a resposta aparece na conversa
            }
        }
    }

    /// A lista guardada aparece na hora (o vigia do jfy a mantém em dia de 2 em 2 min); a busca roda por trás e só
    /// troca a lista quando achou algo novo.
    private func carregar() async {
        let c = caixaLista
        let (g, msgG): (Lista?, String?) = await JFY.ler(["--emails-json", c.rawValue, "cache"])
        guard c == caixaLista else { return }  // trocou de caixa no meio: vale a resposta da nova
        if let g { lista = g }
        guard g?.cache == true else { aviso = msgG; caixa.ler(); return }  // sem lista guardada, o jfy já buscou
        carregando = true
        defer { carregando = false }
        let (l, msg): (Lista?, String?) = await JFY.ler(["--emails-json", c.rawValue])
        guard c == caixaLista else { return }
        if let l, l.mudou == true { lista = l }
        aviso = msg
        caixa.ler()  // o jfy acabou de guardar o total: o selo acompanha
    }

    /// O email aberto da última vez aparece na hora; a leitura de verdade só troca quando mudou (resposta nova na
    /// conversa, lido ou não lido).
    private func abrir() async {
        guard let id = selecao else { email = nil; return }
        let (g, msgG): (Email?, String?) = await JFY.ler(["--email-json", id, "cache"])
        guard selecao == id else { return }
        email = g
        if msgG != nil { aviso = msgG }
        guard g?.cache == true else { return }
        let (e, msg): (Email?, String?) = await JFY.ler(["--email-json", id])
        guard selecao == id else { return }
        if let e, e.mudou == true { email = e }
        if msg != nil { aviso = msg }
    }

    private func agir(_ args: [String]) {
        Task {
            aviso = await JFY.fazer(args)
            await carregar()
            await abrir()
        }
    }

    private func quando(_ ts: Double) -> String {
        let d = Date(timeIntervalSince1970: ts)
        return Calendar.current.isDateInToday(d) ? d.formatted(.dateTime.hour().minute())
            : d.formatted(.dateTime.day().month(.twoDigits).locale(Locale(identifier: "pt_BR")))
    }
}


/// O texto de um email com os links clicáveis (e os emails, como mailto). O "texto <url>" que o jfy deixa no lugar do
/// link do html (e o Gmail no texto puro) vira "↗ dominio": o endereço inteiro, com rastreio, ocupava linhas.
private let detectorLinks = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

func comLinks(_ s: String) -> AttributedString {
    let ns = s as NSString
    var out = AttributedString(), resto = 0
    for m in detectorLinks?.matches(in: s, range: NSRange(location: 0, length: ns.length)) ?? [] {
        guard let url = m.url, m.range.location >= resto else { continue }
        let fim = m.range.location + m.range.length
        let entre = m.range.location > 0 && fim < ns.length && ns.character(at: m.range.location - 1) == 60 && ns.character(at: fim) == 62  // < >
        let ini = entre ? m.range.location - 1 : m.range.location
        out += AttributedString(ns.substring(with: NSRange(location: resto, length: ini - resto)))
        var link = AttributedString(entre ? "↗ " + (url.host() ?? url.absoluteString) : ns.substring(with: m.range))
        link.link = url
        out += link
        resto = entre ? fim + 1 : fim
    }
    out += AttributedString(ns.substring(from: resto))
    return out
}

/// O texto de uma mensagem aberta: selecionável, com os links clicáveis, sublinhados na cor de destaque e com a mãozinha
/// em cima deles. O Text do SwiftUI não muda o cursor no link; o NSTextView muda. TextKit 1 para medir a altura na
/// largura que a tela dá.
struct TextoEmail: NSViewRepresentable {
    let texto: String

    final class Coordinator { var texto: String? }
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSTextView {
        let v = NSTextView(usingTextLayoutManager: false)
        v.isEditable = false
        v.isSelectable = true
        v.drawsBackground = false
        v.isVerticallyResizable = false
        v.textContainerInset = .zero
        v.textContainer?.lineFragmentPadding = 0
        v.textContainer?.widthTracksTextView = true
        v.linkTextAttributes = [.foregroundColor: NSColor(Souv.destaque), .cursor: NSCursor.pointingHand,
                                .underlineStyle: NSUnderlineStyle.single.rawValue]
        return v
    }

    func updateNSView(_ v: NSTextView, context: Context) {
        guard context.coordinator.texto != texto else { return }
        context.coordinator.texto = texto
        let s = NSMutableAttributedString(comLinks(texto))
        s.addAttributes([.font: NSFont.systemFont(ofSize: 13), .foregroundColor: NSColor.labelColor], range: NSRange(location: 0, length: s.length))
        v.textStorage?.setAttributedString(s)
    }

    func sizeThatFits(_ proposta: ProposedViewSize, nsView v: NSTextView, context: Context) -> CGSize? {
        guard let lm = v.layoutManager, let tc = v.textContainer else { return nil }
        let w = proposta.width.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } ?? 600
        tc.containerSize = NSSize(width: w, height: .greatestFiniteMagnitude)
        lm.ensureLayout(for: tc)
        return CGSize(width: w, height: ceil(lm.usedRect(for: tc).height))
    }
}

/// Um anexo de email: a foto aparece na mensagem (o html vira texto e perde as <img>); o resto é uma linha que abre o
/// arquivo no app padrão do Mac. Quem baixa é o jfy (--email-anexo), para ~/.jfy/anexos: da segunda vez já está lá.
struct AnexoEmail: View {
    let mid: String
    let anexo: EmailsTela.Email.Anexo
    @State private var caminho: String?
    @State private var imagem: NSImage?
    @State private var baixando = false
    @State private var erro: String?

    private var foto: Bool { anexo.tipo.hasPrefix("image/") }

    var body: some View {
        if let imagem, let caminho {
            Image(nsImage: imagem).resizable().scaledToFit()
                .frame(maxWidth: 480, maxHeight: 320, alignment: .leading)
                .onTapGesture { abrir(caminho) }.help("\(anexo.nome): abrir")
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Button { Task { if let c = await baixar() { abrir(c) } } } label: {
                    HStack(spacing: 6) {
                        Image(systemName: foto ? "photo" : "paperclip")
                        Text(anexo.nome).lineLimit(1)
                        if anexo.tamanho > 0 {
                            Text(ByteCountFormatter.string(fromByteCount: Int64(anexo.tamanho), countStyle: .file)).foregroundStyle(.secondary)
                        }
                        if baixando { ProgressView().controlSize(.small) }
                    }
                }
                .buttonStyle(.souvLink).disabled(baixando).help("Abrir o arquivo")
                if let erro { Text(erro).font(.caption).foregroundStyle(.orange) }
            }
            .task { if foto { _ = await baixar() } }
        }
    }

    private func baixar() async -> String? {
        if let caminho { return caminho }
        baixando = true
        defer { baixando = false }
        struct Baixado: Decodable { let caminho: String }
        let (r, msg): (Baixado?, String?) = await JFY.ler(["--email-anexo", mid, anexo.parte])
        erro = msg
        caminho = r?.caminho
        if foto, let c = r?.caminho { imagem = NSImage(contentsOfFile: c) }  // formato que o Mac não lê: fica a linha
        return r?.caminho
    }

    private func abrir(_ c: String) { NSWorkspace.shared.open(URL(fileURLWithPath: c)) }
}


// ---------- campo de emails com sugestão (envio e convites) ----------
/// Os contatos para a sugestão: quem você escreve, quem te escreve e quem esteve nos seus eventos (jfy --contatos-json,
/// que guarda e atualiza a cada 6 h). Carrega uma vez por sessão do app.
final class Contatos: ObservableObject {
    struct Contato: Decodable, Hashable {
        let email, nome: String
        let foto: String?  // do diretório do Google (as pessoas da Souv); sem ela, as iniciais
    }
    static let todos = Contatos()
    @Published private(set) var lista: [Contato] = []
    private var pedido = false

    func carregar() {
        guard !pedido else { return }
        pedido = true
        Task { @MainActor in
            let (l, _): ([Contato]?, String?) = await JFY.ler(["--contatos-json"])
            lista = l ?? []
        }
    }
}

/// A pessoa num círculo, como o Google Agenda: a foto do diretório do Google (as pessoas da Souv) ou, sem ela, as
/// iniciais sobre uma cor que é sempre a mesma para o mesmo email. `cor`: a cor da pessoa no "Reunião com…" (um anel).
struct AvatarPessoa: View {
    let nome: String?
    let email: String
    let foto: String?
    var cor: Color?
    var tamanho: CGFloat = 18

    private static let cores = ["#14b8a6", "#f97316", "#ec4899", "#a855f7", "#84cc16", "#eab308", "#06b6d4", "#f43f5e"]
    private var iniciais: String {
        let base = (nome?.isEmpty == false ? nome! : email.components(separatedBy: "@")[0])
            .replacingOccurrences(of: ".", with: " ").replacingOccurrences(of: "_", with: " ")
        return base.split(separator: " ").prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
    }
    private var corFundo: Color {
        Color(hex: Self.cores[Int(email.lowercased().unicodeScalars.reduce(0) { ($0 + Int($1.value)) % 997 }) % Self.cores.count])
    }

    var body: some View {
        Group {
            if let foto, let url = URL(string: foto) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { letras }
            } else {
                letras
            }
        }
        .frame(width: tamanho, height: tamanho)
        .clipShape(Circle())
        .overlay { if let cor { Circle().strokeBorder(cor, lineWidth: max(1.5, tamanho / 10)) } }
        .help(nome.map { "\($0) · \(email)" } ?? email)
    }

    private var letras: some View {
        Text(iniciais).font(.system(size: tamanho * 0.42, weight: .semibold)).foregroundStyle(.white)
            .frame(width: tamanho, height: tamanho).background(corFundo)
    }
}

/// Campo de emails separados por vírgula: enquanto você digita, sugere os contatos que batem (nome ou email); o
/// clique troca o que está sendo digitado pelo email escolhido, como o Gmail.
/// Um email do zero: Para e Cc (com as sugestões de contato), assunto e o texto, escrito por você ou pelo Claude (a
/// partir do contexto), com a assinatura padrão do Gmail. Salva como rascunho ou envia (`--email-enviar` no modo novo).
struct NovoEmail: View {
    let fechar: () -> Void
    let enviado: (String) -> Void
    @State private var para = ""
    @State private var cc = ""
    @State private var assunto = ""
    @State private var texto = ""
    @State private var contexto = ""
    @State private var escrevendo: String?
    @State private var enviando = false
    @State private var aviso: String?
    @State private var confirmar = false
    @State private var assinatura: Assinatura?

    struct Assinatura: Decodable {
        let tem: Bool
        let url: String
    }

    private var vazio: Bool { texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var semDestino: Bool { !para.contains("@") }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Novo email").font(Souv.titulo(22))
                Spacer()
                Button("Cancelar", action: fechar).keyboardShortcut(.cancelAction)
            }
            CampoEmails(rotulo: "Para", texto: $para)
            CampoEmails(rotulo: "Cc", texto: $cc)
            TextField("Assunto", text: $assunto).campoSouv()
            TextEditor(text: $texto)
                .font(.body).frame(minHeight: 220)
                .campoSouv()
                .disabled(escrevendo != nil)
            TextField("Contexto para o Claude: o que o email precisa dizer, para quem, o tom…", text: $contexto, axis: .vertical)
                .lineLimit(1...4).campoSouv()
            HStack {
                Button { ia("gerar") } label: { Label("Gerar com o Claude", systemImage: "sparkles") }
                    .disabled(contexto.trimmingCharacters(in: .whitespaces).isEmpty).help("Escreve o email a partir do contexto")
                Button("Corrigir") { ia("corrigir") }.disabled(vazio).help("Só os erros do seu texto, sem mudar o que ele diz")
                Button("Melhorar") { ia("melhorar") }.disabled(vazio).help("Seu texto como base, mais claro e direto")
                if let m = escrevendo {
                    ProgressView().controlSize(.small)
                    Text("O Claude está \(m == "gerar" ? "escrevendo" : m == "corrigir" ? "corrigindo" : "melhorando")…").foregroundStyle(Souv.texto2)
                }
                Spacer()
                Button("Salvar rascunho") { mandar(false) }.disabled(vazio || semDestino || enviando)
                Button("Enviar") { confirmar = true }.buttonStyle(.souvPrimario).disabled(vazio || semDestino || enviando)
            }
            .disabled(escrevendo != nil)
            if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled) }
            if let a = assinatura, !a.tem { AvisoAssinatura(url: a.url) }
            Text((assinatura?.tem == true ? "Vai com a sua assinatura do Gmail. " : "")
                 + "O Claude só escreve aqui; nada sai sem você apertar Enviar. Gerar, corrigir e melhorar usam tokens.")
                .font(.caption).foregroundStyle(Souv.texto2).fixedSize(horizontal: false, vertical: true)
        }
        .task {
            JFY.aquecerCorretor()  // o Corrigir já acha o Claude do corretor aberto
            let (a, _): (Assinatura?, String?) = await JFY.ler(["--email-assinatura"]); assinatura = a
        }
        .padding(20)
        .frame(width: 660)
        .background(Souv.fundo)
        .dialogoSouv("Enviar para \(para)?", isPresented: $confirmar) {
            Button("Enviar") { mandar(true) }
        } message: { Text("Sai da sua conta do Gmail" + (cc.contains("@") ? ", com cópia para \(cc)" : "") + ". Não tem volta pelo app.") }
    }

    private func ia(_ modo: String) {
        Task {
            escrevendo = modo
            struct Texto: Decodable { let texto: String }
            let (r, msg): (Texto?, String?) = await JFY.ler(["--email-ia", "", modo, texto, contexto])  // sem id: email novo
            escrevendo = nil
            if let r { texto = r.texto }
            aviso = msg
        }
    }

    private func mandar(_ enviar: Bool) {
        Task {
            enviando = true
            defer { enviando = false }
            struct Feito: Decodable { let para, cc: String }
            let d: [String: Any] = ["modo": "novo", "para": para, "cc": cc, "assunto": assunto, "texto": texto, "enviar": enviar]
            guard let json = try? JSONSerialization.data(withJSONObject: d), let txt = String(data: json, encoding: .utf8) else { return }
            let (r, msg): (Feito?, String?) = await JFY.ler(["--email-enviar", txt])
            if let r {
                enviado((enviar ? "Enviado para " : "Rascunho salvo no Gmail, para ") + r.para + (r.cc.isEmpty ? "" : ", com cópia para \(r.cc)") + ".")
            } else {
                aviso = msg
            }
        }
    }
}

/// Sem assinatura padrão no Gmail, o email sai sem assinatura: diz exatamente onde marcar (a API não vê as outras).
struct AvisoAssinatura: View {
    let url: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("Vai sem assinatura: o Gmail não tem uma assinatura padrão.", systemImage: "signature").foregroundStyle(.orange)
            Text("No Gmail, em Configurações › Geral › Assinatura › Padrões de assinatura, escolha a sua (ex.: Souv) em \"Para uso em novos e-mails\" e em \"Para respostas/encaminhamentos\" e salve. O jfy só enxerga a assinatura marcada como padrão.")
                .font(.caption).foregroundStyle(Souv.texto2).fixedSize(horizontal: false, vertical: true)
            if let u = url.flatMap(URL.init(string:)) { Link("Abrir as configurações do Gmail", destination: u).font(.caption).buttonStyle(.souvLink) }
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.orange.opacity(0.1)))
    }
}

struct CampoEmails: View {
    let rotulo: String
    @Binding var texto: String
    @ObservedObject private var contatos = Contatos.todos
    @FocusState private var focado: Bool

    private var digitando: String {
        String(texto.split(separator: ",", omittingEmptySubsequences: false).last ?? "").trimmingCharacters(in: .whitespaces).lowercased()
    }

    private var sugestoes: [Contatos.Contato] {
        guard focado, digitando.count >= 2 else { return [] }
        let ja = Set(texto.lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
        return Array(contatos.lista.filter { !ja.contains($0.email) && ($0.email.contains(digitando) || $0.nome.lowercased().contains(digitando)) }.prefix(6))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(rotulo).foregroundStyle(.secondary).fixedSize().frame(minWidth: 64, alignment: .leading)
                TextField("emails, separados por vírgula", text: $texto, axis: .vertical).lineLimit(1...3)
                    .focused($focado).campoSouv(foco: focado)
                    .onSubmit {  // Enter fecha o email digitado, como no Gmail (na Agenda, ele vira uma pessoa)
                        if let s = sugestoes.first { escolher(s) } else if digitando.contains("@") { texto += ", " }
                    }
            }
            if !sugestoes.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(sugestoes, id: \.email) { c in
                        Button { escolher(c) } label: {
                            HStack {
                                AvatarPessoa(nome: c.nome, email: c.email, foto: c.foto, tamanho: 18)
                                Text(c.nome.isEmpty ? c.email : c.nome).lineLimit(1)
                                if !c.nome.isEmpty { Text(c.email).foregroundStyle(.secondary).lineLimit(1) }
                                Spacer()
                            }
                            .padding(.horizontal, 8).padding(.vertical, 4).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(RoundedRectangle(cornerRadius: 6).fill(Souv.superficie))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Souv.borda))
                .padding(.leading, 72)
            }
        }
        .onAppear { contatos.carregar() }
    }

    private func escolher(_ c: Contatos.Contato) {
        var partes = texto.split(separator: ",", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespaces) }
        partes[partes.count - 1] = c.email
        texto = partes.filter { !$0.isEmpty }.joined(separator: ", ") + ", "
    }
}
