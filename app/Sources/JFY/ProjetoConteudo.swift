import AppKit
import SwiftUI

/// As seções de um projeto, como no Journify: Tasks (a tela de sempre) e, pelo MCP, Documentos (ler, criar, editar),
/// Reuniões, Arquivos (o Drive do projeto, os anexos das tasks e os documentos que são arquivo; enviar) e Formulários.
enum SecaoProjeto: String, CaseIterable {
    case tasks = "Tasks", documentos = "Documentos", reunioes = "Reuniões", arquivos = "Arquivos", formularios = "Formulários"
    var icone: String {
        switch self {
        case .tasks: "checklist"
        case .documentos: "doc.text"
        case .reunioes: "person.2"
        case .arquivos: "folder"
        case .formularios: "list.bullet.clipboard"
        }
    }
}

struct ProjetoConteudo: View {
    let secao: SecaoProjeto
    let pid: String
    let abrirTask: (String) -> Void

    var body: some View {
        switch secao {
        case .documentos: DocumentosProjeto(pid: pid)
        case .reunioes: ReunioesProjeto(pid: pid)
        case .arquivos: ArquivosProjeto(pid: pid, abrirTask: abrirTask)
        case .formularios: FormulariosProjeto(pid: pid)
        case .tasks: EmptyView()  // a lista de tasks é da ProjetosTela
        }
    }
}

/// Escolhe arquivos no painel do macOS e manda um por vez pelo jfy (`--arquivo-enviar`): para a task ou para o Drive do
/// projeto. `andamento` diz qual está indo (vídeo grande leva uns minutos). Devolve quantos foram e os erros, por arquivo.
@MainActor  // o painel do macOS e o andamento na tela: na thread principal
func enviarArquivos(para onde: String, _ id: String, andamento: (String) -> Void) async -> (enviados: Int, erro: String?) {
    let painel = NSOpenPanel()
    painel.canChooseFiles = true
    painel.canChooseDirectories = false
    painel.allowsMultipleSelection = true
    painel.prompt = "Enviar"
    painel.message = onde == "task" ? "Um print ou o vídeo do teste: vai anexado à task no Journify (até 20 MB; vídeo, até 100 MB)."
        : "Os arquivos vão para o Drive do projeto no Journify."
    guard painel.runModal() == .OK else { return (0, nil) }
    var enviados = 0, erros: [String] = []
    for (i, u) in painel.urls.enumerated() {
        andamento("Enviando \(u.lastPathComponent)" + (painel.urls.count > 1 ? " (\(i + 1) de \(painel.urls.count))" : "") + "…")
        if let e = await JFY.fazer(["--arquivo-enviar", u.path, onde, id]) { erros.append("\(u.lastPathComponent): \(e)") } else { enviados += 1 }
    }
    return (enviados, erros.isEmpty ? nil : erros.joined(separator: "\n"))
}

/// Texto de documento ou resumo do Journify: uns vêm em markdown, outros em HTML. O HTML passa pelo leitor do próprio
/// macOS (títulos, listas, links, código), sem as cores dele, para seguir o tema do app.
struct TextoJournify: View {
    let texto: String
    @State private var rico: AttributedString?

    private var html: Bool { texto.range(of: #"<(p|h[1-6]|ul|ol|li|div|br|pre|table)\b"#, options: .regularExpression) != nil }

    var body: some View {
        Group {
            if !html { Markdown(texto: texto) }
            else if let rico { Text(rico).foregroundStyle(Souv.texto).textSelection(.enabled).fixedSize(horizontal: false, vertical: true) }
            else { ProgressView() }
        }
        .task(id: texto) {
            guard html else { return }
            let css = "<style>body{font-family:Roboto,-apple-system;font-size:14px;line-height:1.5}h1{font-size:22px}h2{font-size:18px}"
                + "h3{font-size:15px}code,pre{font-family:Menlo;font-size:12px}</style>"
            guard let dados = (css + texto).data(using: .utf8),
                  let ns = try? NSMutableAttributedString(data: dados, options: [.documentType: NSAttributedString.DocumentType.html,
                                                                                 .characterEncoding: String.Encoding.utf8.rawValue],
                                                          documentAttributes: nil)
            else { rico = AttributedString(texto); return }
            ns.removeAttribute(.foregroundColor, range: NSRange(location: 0, length: ns.length))
            rico = (try? AttributedString(ns, including: \.appKit)) ?? AttributedString(ns.string)
        }
    }
}

// ---------- documentos ----------
private struct DocumentosProjeto: View {
    let pid: String
    struct Doc: Decodable, Identifiable { let id, titulo: String; let atualizado: String?; let sensivel: Bool }
    struct Conteudo: Decodable { let titulo, texto: String }

    @State private var docs: [Doc]?
    @State private var aviso: String?
    @State private var busca = ""
    @State private var aberto: String?
    @State private var conteudo: Conteudo?
    @State private var carregando = false
    @State private var revelado: Set<String> = []  // sensíveis que a pessoa pediu para ver
    @State private var editando: EditorDoc.Pedido?
    @State private var versao = 0  // sobe a cada edição salva: lê de novo o documento aberto

    private var filtrados: [Doc] {
        (docs ?? []).filter { busca.isEmpty || $0.titulo.localizedCaseInsensitiveContains(busca) }
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                HStack {
                    TextField("Buscar documento", text: $busca).campoSouv()
                    Button { editando = .init(docId: nil, titulo: "", conteudo: "") } label: { Label("Novo documento", systemImage: "plus") }
                        .labelStyle(.iconOnly).help("Novo documento")
                }
                .padding(10)
                if let docs, docs.isEmpty {
                    Text(aviso ?? "Nenhum documento neste projeto.").foregroundStyle(.secondary).frame(maxHeight: .infinity)
                } else if docs == nil {
                    Group { if let aviso { Text(aviso).foregroundStyle(.secondary).padding() } else { ProgressView() } }.frame(maxHeight: .infinity)
                } else {
                    List(filtrados) { d in
                        HStack(spacing: 8) {
                            Image(systemName: d.sensivel ? "lock.fill" : "doc.text").foregroundStyle(d.sensivel ? .orange : Souv.texto2)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(d.titulo).lineLimit(1)
                                Text(relativo(d.atualizado)).font(.caption).foregroundStyle(Souv.texto2)
                            }
                        }
                        .linhaSouv(aberto == d.id) { aberto = d.id }
                        .menuSouv(se: !d.sensivel) { MenuContexto(item: .init(tipo: "documento", ref: d.id, titulo: d.titulo, pid: pid)) }
                    }
                    .listaSouv()
                }
            }
            .frame(width: 300)
            .background(Souv.superficie)
            Divider()
            leitor.frame(maxWidth: .infinity, maxHeight: .infinity).background(Souv.fundo)
        }
        .task { await carregar() }
        .task(id: "\(aberto ?? "")|\(revelado.count)|\(versao)") { await abrir() }
        .sheet(item: $editando) { p in
            EditorDoc(pid: pid, pedido: p, fechar: { editando = nil }) { id, titulo in
                editando = nil
                Task { await salvo(id, titulo) }
            }
            .identidadeSouv()
        }
    }

    @ViewBuilder private var leitor: some View {
        if let id = aberto, let d = docs?.first(where: { $0.id == id }) {
            if d.sensivel && !revelado.contains(id) {
                VStack(spacing: 12) {
                    Image(systemName: "lock.fill").font(.largeTitle).foregroundStyle(.orange)
                    Text(d.titulo).font(.headline)
                    Text("Pelo título, este documento parece guardar credenciais. O conteúdo fica escondido até você pedir, e segredo não deveria morar em documento do projeto.")
                        .foregroundStyle(Souv.texto2).multilineTextAlignment(.center).frame(maxWidth: 420)
                    Button("Mostrar o conteúdo") { revelado.insert(id) }
                }
            } else if let conteudo {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(conteudo.titulo).font(Souv.titulo(24)).foregroundStyle(Souv.texto)
                            Spacer()
                            // credencial só chega aqui depois do "Mostrar o conteúdo"
                            Button { editando = .init(docId: d.id, titulo: conteudo.titulo, conteudo: conteudo.texto) } label: {
                                Label("Editar", systemImage: "pencil")
                            }
                            if !d.sensivel { BotaoContexto(item: .init(tipo: "documento", ref: d.id, titulo: d.titulo, pid: pid)) }
                        }
                        Text("Atualizado \(relativo(d.atualizado))").font(.caption).foregroundStyle(Souv.texto2)
                        TextoJournify(texto: conteudo.texto)
                    }
                    .padding(28)
                    .frame(maxWidth: 820, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else if carregando {
                ProgressView()
            } else if let aviso {
                Text(aviso).foregroundStyle(.secondary)
            }
        } else {
            Text("Escolha um documento").foregroundStyle(.secondary)
        }
    }

    private func carregar() async {
        let (d, msg): ([Doc]?, String?) = await JFY.ler(["--docs-json", pid])
        docs = d
        aviso = msg
        if aberto == nil { aberto = d?.first(where: { !$0.sensivel })?.id }
    }

    /// Depois de criar ou salvar: a lista de novo (o título pode ter mudado) e o documento aberto, relido. O criado abre
    /// pelo id, se o Journify disse, senão pelo título (a lista vem com o mais recente primeiro).
    private func salvo(_ id: String?, _ titulo: String) async {
        await carregar()
        if let novo = id ?? docs?.first(where: { $0.titulo == titulo })?.id { aberto = novo }
        versao += 1
    }

    private func abrir() async {
        conteudo = nil
        guard let id = aberto, let d = docs?.first(where: { $0.id == id }), !d.sensivel || revelado.contains(id) else { return }
        carregando = true
        let (c, msg): (Conteudo?, String?) = await JFY.ler(["--doc-json", id])
        carregando = false
        if aberto == id { conteudo = c; aviso = msg }
    }
}

// ---------- reuniões ----------
private struct ReunioesProjeto: View {
    let pid: String
    struct Reuniao: Decodable, Identifiable { let id, titulo: String; let data: String?; let resumo: Bool }
    struct Detalhe: Decodable { let titulo: String; let data: String?; let participantes: [String]; let resumo: String }

    @State private var reunioes: [Reuniao]?
    @State private var aviso: String?
    @State private var aberta: String?
    @State private var detalhe: Detalhe?

    var body: some View {
        Group {
            if let reunioes, reunioes.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "person.2").font(.largeTitle).foregroundStyle(Souv.texto2)
                    Text(aviso ?? "Nenhuma reunião registrada neste projeto no Journify.").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let reunioes {
                HStack(spacing: 0) {
                    List(reunioes) { r in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.titulo).lineLimit(1)
                            HStack(spacing: 6) {
                                Text(dataISO(r.data).map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "").font(.caption)
                                if r.resumo { Label("resumo", systemImage: "text.alignleft").font(.caption2) }
                            }
                            .foregroundStyle(Souv.texto2)
                        }
                        .linhaSouv(aberta == r.id) { aberta = r.id }
                    }
                    .listaSouv()
                    .frame(width: 300)
                    Divider()
                    Group {
                        if let detalhe {
                            ScrollView {
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(detalhe.titulo).font(Souv.titulo(24)).foregroundStyle(Souv.texto)
                                        Spacer()
                                        if let a = aberta { BotaoContexto(item: .init(tipo: "reuniao", ref: a, titulo: detalhe.titulo, pid: pid)) }
                                    }
                                    if let d = dataISO(detalhe.data) {
                                        Text(d.formatted(date: .complete, time: .shortened)).foregroundStyle(Souv.texto2)
                                    }
                                    if !detalhe.participantes.isEmpty {
                                        Label(detalhe.participantes.joined(separator: ", "), systemImage: "person.2").foregroundStyle(Souv.texto2)
                                    }
                                    Divider()
                                    if detalhe.resumo.isEmpty { Text("Esta reunião ainda não tem resumo.").foregroundStyle(.secondary) }
                                    else { TextoJournify(texto: detalhe.resumo) }
                                }
                                .padding(28)
                                .frame(maxWidth: 820, alignment: .leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        } else if aberta != nil { ProgressView() } else { Text("Escolha uma reunião").foregroundStyle(.secondary) }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            } else {
                Group { if let aviso { Text(aviso).foregroundStyle(.secondary) } else { ProgressView() } }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Souv.fundo)
        .task {
            let (r, msg): ([Reuniao]?, String?) = await JFY.ler(["--reunioes-projeto-json", pid])
            reunioes = r
            aviso = msg
            aberta = r?.first?.id
        }
        .task(id: aberta) {
            detalhe = nil
            guard let id = aberta else { return }
            let (d, msg): (Detalhe?, String?) = await JFY.ler(["--reuniao-json", id])
            if aberta == id { detalhe = d; if d == nil { aviso = msg } }
        }
    }
}

// ---------- arquivos ----------
private struct ArquivosProjeto: View {
    let pid: String
    let abrirTask: (String) -> Void
    struct Arquivo: Decodable, Identifiable {
        let id, nome, tipo, categoria: String
        let task, url, por, quando, taskTitulo: String?  // sem task: veio do Drive do projeto ou de um documento
        let origem: String?  // "drive", "task" ou "documento"
        let tamanho: Double?
        /// De onde veio, discreto na linha: a task, ou o Drive do projeto.
        var deOnde: String? { taskTitulo ?? (origem == "drive" ? "Drive do projeto" : origem == "documento" ? "Documento do projeto" : nil) }
    }
    struct Resposta: Decodable { let arquivos: [Arquivo]; let tasks: Int }
    static let categorias = ["Todas", "Documentos", "Reuniões", "Planilhas", "Imagens", "Outros"]

    @State private var r: Resposta?
    @State private var aviso: String?
    @State private var carregando = false
    @State private var enviando: String?  // o arquivo que está indo agora
    @State private var erroEnvio: String?
    @State private var categoria = "Todas"
    @State private var busca = ""

    private var filtrados: [Arquivo] {
        (r?.arquivos ?? []).filter {
            (categoria == "Todas" || $0.categoria == categoria)
                && (busca.isEmpty || $0.nome.localizedCaseInsensitiveContains(busca) || ($0.deOnde ?? "").localizedCaseInsensitiveContains(busca))
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Segmentos(selecao: $categoria, opcoes: Self.categorias.map { .init(valor: $0, rotulo: $0) })
                Spacer(minLength: 8)
                TextField("Buscar arquivo", text: $busca).campoSouv().frame(maxWidth: 240)
                Button { Task { await carregar() } } label: {
                    if carregando && r != nil { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.clockwise") }
                }
                .help("Ler de novo do Journify").disabled(carregando)
                Button { enviar() } label: { Label("Enviar arquivos", systemImage: "arrow.up.doc") }
                    .buttonStyle(.souvPrimario).disabled(enviando != nil)
                    .help("Manda arquivos do Mac para o Drive do projeto no Journify")
            }
            .padding(12)
            if let enviando {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(enviando).lineLimit(1).truncationMode(.middle)
                }
                .font(.callout).foregroundStyle(Souv.texto2).frame(maxWidth: .infinity, alignment: .leading).padding([.horizontal, .bottom], 12)
            }
            if let erroEnvio {
                Label(erroEnvio, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading).padding([.horizontal, .bottom], 12)
            }
            Divider()
            if let r {
                if filtrados.isEmpty {
                    Text(r.arquivos.isEmpty ? "Nenhum arquivo neste projeto." : "Nenhum arquivo com esse filtro.")
                        .foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filtrados) { a in linha(a) }.listaSouv(Souv.fundo)
                }
                Text(rodape(r)).font(.caption).foregroundStyle(Souv.texto2).padding(8).frame(maxWidth: .infinity, alignment: .leading)
            } else if let aviso {
                Text(aviso).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Souv.fundo)
        .task { await carregar() }
    }

    private func linha(_ a: Arquivo) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icone(a.categoria)).font(.title3).foregroundStyle(Souv.destaque).frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(a.nome).lineLimit(1)
                Text([a.deOnde, a.por, relativo(a.quando)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Souv.texto2).lineLimit(1)
            }
            Spacer()
            if let t = a.tamanho { Text(ByteCountFormatter.string(fromByteCount: Int64(t), countStyle: .file)).font(.caption).foregroundStyle(Souv.texto2) }
        }
        .padding(.vertical, 3)
        .contentShape(Rectangle())
        .onTapGesture { abrir(a) }
        .help("Abrir o arquivo")
        .menuSouv {
            Button("Abrir o arquivo", systemImage: "arrow.up.forward.square") { abrir(a) }
            if let t = a.task { Button("Abrir a task", systemImage: "checklist") { abrirTask(t) } }
            if let u = a.url { MenuContexto(item: .init(tipo: "arquivo", ref: u, titulo: a.nome, origem: a.deOnde, pid: pid)) }
            if let u = a.url { Button("Copiar o link") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(u, forType: .string) } }
        }
    }

    private func rodape(_ r: Resposta) -> String {
        let drive = r.arquivos.filter { $0.origem == "drive" }.count, anexos = r.arquivos.filter { $0.task != nil }.count
        return qtd(r.arquivos.count, "arquivo", "arquivos") + ": \(drive) no Drive do projeto e "
            + qtd(anexos, "anexo", "anexos") + " em " + qtd(r.tasks, "task", "tasks") + "."
    }

    private func icone(_ c: String) -> String {
        switch c {
        case "Imagens": "photo"
        case "Reuniões": "person.2"
        case "Planilhas": "tablecells"
        case "Documentos": "doc.richtext"
        default: "doc"
        }
    }

    private func abrir(_ a: Arquivo) {
        if let u = a.url.flatMap(URL.init(string:)) { NSWorkspace.shared.open(u) }
    }

    private func carregar() async {
        carregando = true
        let (x, msg): (Resposta?, String?) = await JFY.ler(["--arquivos-json", pid])
        carregando = false
        if let x { r = x; aviso = nil } else if r == nil { aviso = msg }
    }

    private func enviar() {
        Task {
            erroEnvio = nil
            let r = await enviarArquivos(para: "projeto", pid) { enviando = $0 }
            enviando = nil
            erroEnvio = r.erro
            if r.enviados > 0 { await carregar() }
        }
    }
}

/// O modal de criar e de editar um documento: o título e o texto em Markdown. Editando, dá para trocar o conteúdo inteiro
/// ou acrescentar ao fim (um decision log, as regras depois de uma reunião); acrescentando, o campo começa vazio.
private struct EditorDoc: View {
    struct Pedido: Identifiable {
        let docId: String?  // nil: documento novo
        let titulo, conteudo: String
        var id: String { docId ?? "novo" }
    }
    let pid: String
    let pedido: Pedido
    let fechar: () -> Void
    let salvou: (_ id: String?, _ titulo: String) -> Void

    @State private var titulo = ""
    @State private var trocar = ""  // o conteúdo inteiro, a partir do atual
    @State private var acrescimo = ""  // o que vai para o fim
    @State private var modo = "substituir"
    @State private var salvando = false
    @State private var aviso: String?

    private var anexar: Bool { modo == "anexar" }
    private var pronto: Bool {
        !titulo.trimmingCharacters(in: .whitespaces).isEmpty && !salvando
            && !(anexar && acrescimo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(pedido.docId == nil ? "Novo documento" : "Editar documento").font(Souv.titulo(22))
            TextField("Título", text: $titulo).campoSouv().font(.title3)
            if pedido.docId != nil {
                Segmentos(selecao: $modo, opcoes: [.init(valor: "substituir", rotulo: "Trocar o conteúdo"),
                                                   .init(valor: "anexar", rotulo: "Acrescentar ao fim")])
            }
            // dois textos: alternar o modo não perde o que já foi escrito em nenhum dos dois
            TextEditor(text: anexar ? $acrescimo : $trocar)
                .font(.system(size: 13, design: .monospaced)).frame(minHeight: 340).campoSouv()
            Text(anexar ? "Vai para o fim do documento, em Markdown. O que já está lá fica como está."
                 : "Em Markdown: # título, **negrito**, - lista, [link](https://…).")
                .font(.caption).foregroundStyle(Souv.texto2)
            if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled) }
            HStack {
                Spacer()
                if salvando { ProgressView().controlSize(.small) }
                Button("Cancelar", action: fechar).keyboardShortcut(.cancelAction)
                // ⌘Enter: o Enter sozinho é quebra de linha no texto
                Button(pedido.docId == nil ? "Criar" : "Salvar") { salvar() }
                    .buttonStyle(.souvPrimario).keyboardShortcut(.return, modifiers: .command).disabled(!pronto)
                    .help("⌘Enter")
            }
        }
        .padding(20)
        .frame(width: 720)
        .background(Souv.fundo)
        .onAppear {
            titulo = pedido.titulo
            trocar = pedido.conteudo
        }
    }

    private func salvar() {
        let t = titulo.trimmingCharacters(in: .whitespaces)
        var d = ["titulo": t]
        if pedido.docId == nil {
            d["conteudo"] = trocar
        } else if anexar {
            d["conteudo"] = acrescimo
            d["modo"] = "anexar"
        } else if trocar != pedido.conteudo {  // só o título mudou: o conteúdo fica como está lá
            d["conteudo"] = trocar
            d["modo"] = "substituir"
        }
        guard let json = try? JSONSerialization.data(withJSONObject: d), let txt = String(data: json, encoding: .utf8) else { return }
        Task {
            salvando = true
            aviso = nil
            let r = await JFY.rodar(pedido.docId.map { ["--doc-salvar", $0] } ?? ["--doc-criar", pid], entrada: txt)
            salvando = false
            let erro = r.erro.trimmingCharacters(in: .whitespacesAndNewlines)
            guard r.status == 0 else { aviso = erro.isEmpty ? "O jfy não conseguiu salvar (código \(r.status))." : erro; return }
            // o id do criado: o formato da resposta do criar_documento não foi visto, então procura nos nomes prováveis
            let o = (try? JSONSerialization.jsonObject(with: Data(r.saida.utf8))) as? [String: Any]
            let criado = (o?["id"] ?? o?["docId"] ?? (o?["documento"] as? [String: Any])?["id"]) as? String
            salvou(pedido.docId ?? criado, t)
        }
    }
}

// ---------- formulários ----------
/// Os formulários do projeto e, escolhido um, os campos e as respostas (as mais novas primeiro, como o Journify manda).
/// ponytail: o formato dos campos e das respostas ainda não foi visto com dados reais (o único formulário estava vazio):
/// tudo é lido com folga, por mais de um nome; ajustar quando aparecer um respondido.
private struct FormulariosProjeto: View {
    let pid: String
    struct Formulario: Decodable, Identifiable {
        let id, titulo, descricao: String
        let campos, respostas: Int
        let publico: Bool
    }
    struct Campo: Identifiable {
        let id: Int
        let chave, rotulo: String
        let tipo: String?
        let obrigatorio: Bool
    }
    struct Resposta: Identifiable {
        let id: Int
        let quando, quem, status: String?
        let pares: [(campo: String, valor: String)]
        let anexos: [(nome: String, url: String?)]
    }
    struct Detalhe {
        let titulo, descricao: String
        let campos: [Campo]
        let respostas: [Resposta]
    }

    @State private var forms: [Formulario]?
    @State private var aviso: String?
    @State private var aberto: String?
    @State private var detalhe: Detalhe?
    @State private var avisoDetalhe: String?

    var body: some View {
        Group {
            if let forms, forms.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "list.bullet.clipboard").font(.largeTitle).foregroundStyle(Souv.texto2)
                    Text(aviso ?? "Nenhum formulário neste projeto.").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let forms {
                HStack(spacing: 0) {
                    List(forms) { f in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(f.titulo).lineLimit(1)
                                if f.publico {
                                    Image(systemName: "globe").font(.caption).foregroundStyle(Souv.texto2).help("Público: responde quem tiver o link")
                                }
                            }
                            Text(qtd(f.campos, "campo", "campos") + " · " + qtd(f.respostas, "resposta", "respostas"))
                                .font(.caption).foregroundStyle(Souv.texto2)
                        }
                        .linhaSouv(aberto == f.id) { aberto = f.id }
                    }
                    .listaSouv()
                    .frame(width: 300)
                    Divider()
                    Group {
                        if let detalhe { leitor(detalhe) }
                        else if let avisoDetalhe { Text(avisoDetalhe).foregroundStyle(.secondary).padding() }
                        else if aberto != nil { ProgressView() }
                        else { Text("Escolha um formulário").foregroundStyle(.secondary) }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            } else {
                Group { if let aviso { Text(aviso).foregroundStyle(.secondary) } else { ProgressView() } }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Souv.fundo)
        .task {
            let (f, msg): ([Formulario]?, String?) = await JFY.ler(["--formularios-json", pid])
            forms = f
            aviso = msg
            aberto = f?.first?.id
        }
        .task(id: aberto) {
            detalhe = nil
            avisoDetalhe = nil
            guard let id = aberto else { return }
            let (d, msg) = await ler(id)
            if aberto == id { detalhe = d; avisoDetalhe = msg }
        }
    }

    private func leitor(_ d: Detalhe) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(d.titulo).font(Souv.titulo(24)).foregroundStyle(Souv.texto)
                if !d.descricao.isEmpty { Text(d.descricao).foregroundStyle(Souv.texto2).textSelection(.enabled) }
                if !d.campos.isEmpty {
                    titulo("Campos (\(d.campos.count))")
                    ForEach(d.campos) { c in
                        HStack(spacing: 6) {
                            Text(c.rotulo)
                            if c.obrigatorio { Text("obrigatório").font(.caption).foregroundStyle(.orange) }
                            if let t = c.tipo { Text(t).font(.caption).foregroundStyle(Souv.texto2) }
                        }
                    }
                }
                Divider().padding(.vertical, 4)
                titulo("Respostas (\(d.respostas.count))")
                if d.respostas.isEmpty { Text("Nenhuma resposta ainda.").foregroundStyle(.secondary) }
                ForEach(d.respostas) { r in resposta(r) }
            }
            .padding(28)
            .frame(maxWidth: 820, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func titulo(_ t: String) -> some View {
        Text(t.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
    }

    private func resposta(_ r: Resposta) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(r.quem ?? "Anônimo").fontWeight(.semibold)
                if let q = r.quando {
                    Text(dataISO(q).map { $0.formatted(date: .abbreviated, time: .shortened) } ?? q).font(.caption).foregroundStyle(Souv.texto2)
                }
                Spacer()
                if let s = r.status {
                    Text(s).font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(Souv.primaria.opacity(0.18))).foregroundStyle(Souv.destaque)
                }
            }
            ForEach(Array(r.pares.enumerated()), id: \.offset) { _, p in
                VStack(alignment: .leading, spacing: 1) {
                    Text(p.campo).font(.caption).foregroundStyle(Souv.texto2)
                    Text(p.valor.isEmpty ? "—" : p.valor).textSelection(.enabled)
                }
            }
            ForEach(Array(r.anexos.enumerated()), id: \.offset) { _, a in
                Button { if let u = a.url.flatMap(URL.init(string:)) { NSWorkspace.shared.open(u) } } label: {
                    Label(a.nome, systemImage: "paperclip")
                }
                .buttonStyle(.souvLink).disabled(a.url == nil)
                .help("O link do Journify vale 60 min: se expirou, abra o formulário de novo")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Souv.superficie))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Souv.borda))
    }

    // ---------- jfy --formulario-json, lido com folga ----------
    private func ler(_ fid: String) async -> (Detalhe?, String?) {
        let r = await JFY.rodar(["--formulario-json", fid])
        let erro = r.erro.trimmingCharacters(in: .whitespacesAndNewlines)
        guard r.status == 0 else { return (nil, erro.isEmpty ? "jfy --formulario-json falhou (código \(r.status))" : erro) }
        guard let o = (try? JSONSerialization.jsonObject(with: Data(r.saida.utf8))) as? [String: Any] else {
            return (nil, "Não entendi a resposta do jfy --formulario-json.")
        }
        let f = o["formulario"] as? [String: Any] ?? [:]
        let campos = (f["fields"] as? [[String: Any]] ?? []).enumerated().map { i, c in
            Campo(id: i, chave: texto(c["id"]), rotulo: primeiro(c, "label", "rotulo", "title", "name", "id") ?? "Campo \(i + 1)",
                  tipo: primeiro(c, "type", "tipo"), obrigatorio: (c["required"] ?? c["obrigatorio"]) as? Bool ?? false)
        }
        let respostas = (o["respostas"] as? [[String: Any]] ?? []).enumerated().map { i, x in resposta(i, x, campos) }
        return (Detalhe(titulo: primeiro(f, "title", "titulo") ?? "Formulário", descricao: primeiro(f, "description", "descricao") ?? "",
                        campos: campos, respostas: respostas), nil)
    }

    /// Uma resposta: os pares campo → valor (no primeiro dicionário entre respostas/valores/answers/campos), na ordem dos
    /// campos do formulário (pelo rótulo ou pelo id), e o que sobrar depois, pelo nome.
    private func resposta(_ i: Int, _ x: [String: Any], _ campos: [Campo]) -> Resposta {
        let valores = ["respostas", "valores", "answers", "campos"].lazy.compactMap { x[$0] as? [String: Any] }.first ?? [:]
        var pares: [(campo: String, valor: String)] = [], usadas = Set<String>()
        for c in campos {
            guard let k = [c.rotulo, c.chave].first(where: { !$0.isEmpty && valores[$0] != nil }) else { continue }
            pares.append((c.rotulo, texto(valores[k])))
            usadas.insert(k)
        }
        for k in valores.keys.sorted() where !usadas.contains(k) { pares.append((k, texto(valores[k]))) }
        let anexos = ((x["anexos"] ?? x["attachments"]) as? [[String: Any]] ?? []).map {
            (nome: primeiro($0, "nome", "name") ?? "anexo", url: primeiro($0, "url", "link"))
        }
        return Resposta(id: i, quando: primeiro(x, "data", "quando", "em", "enviadaEm", "criadaEm", "createdAt", "submittedAt"),
                        quem: primeiro(x, "quem", "respondente", "nome", "autor", "por", "email", "respondentName", "submittedBy"),
                        status: primeiro(x, "status"), pares: pares, anexos: anexos)
    }

    private func primeiro(_ d: [String: Any], _ ks: String...) -> String? {
        ks.lazy.map { texto(d[$0]) }.first { !$0.isEmpty }
    }

    /// Um valor do JSON como texto: lista vira "a, b"; sim/não; um objeto, pelo nome ou valor dele.
    private func texto(_ v: Any?) -> String {
        switch v {
        case let s as String: s
        case let n as NSNumber: CFGetTypeID(n) == CFBooleanGetTypeID() ? (n.boolValue ? "Sim" : "Não") : n.stringValue
        case let a as [Any]: a.map { texto($0) }.filter { !$0.isEmpty }.joined(separator: ", ")
        case let d as [String: Any]: texto(d["nome"] ?? d["name"] ?? d["label"] ?? d["valor"] ?? d["value"] ?? d["email"])
        default: ""
        }
    }
}
