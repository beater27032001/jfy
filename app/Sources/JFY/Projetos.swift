import AppKit
import SwiftUI

/// Gestão das tasks: projetos, as tasks em seções (a mesma ordem da tela do projeto no jfy) e a task inteira, com
/// status, prioridade e prazo por clique, anexos (ver e anexar) e comentários. Quem fala com o Journify é o jfy
/// (--projetos-json, --tasks-json, --task-json, --task-mudar, --task-abrir, --arquivo-enviar).
struct ProjetosTela: View {
    let ativa: Bool
    @ObservedObject var nav: Navegacao
    let irParaJFY: () -> Void

    struct Resumo: Decodable, Identifiable, Hashable {
        let id, titulo, status, etapa, pid: String
        let prioridade, prazo, prazoTxt, projeto, cor: String?
        let dias: Int?
        let pontos: Double?
        let etapaN: Int
        let resp: Int?  // quantos responsáveis
        let eu: Bool?  // você é um deles
    }

    struct Projetos: Decodable {
        struct Projeto: Decodable, Identifiable {
            let id: String
            let nome, cor, exemplo: String?
            let tasks: Int
            let pastas: [String]?
        }
        let foco: [Resumo]
        let projetos: [Projeto]
        let statusLote: [String]
    }

    struct Lote: Decodable {
        struct Erro: Decodable { let id, erro: String }
        let ok: Int
        let erros: [Erro]
    }

    static let foco = "foco"  // o item "Foco" da lista de projetos

    @State private var dados: Projetos?
    @State private var projeto: String?
    @State private var todas = false
    @State private var tasks: [Resumo] = []
    @State private var task: String?
    @State private var deFora = false  // a task veio de outra aba (um PR): trocar de projeto não a fecha
    @State private var carregando = false
    @State private var aviso: String?
    // seleção (botão direito › Selecionar): bolinhas em todas as tasks para mudar status ou prazo de várias de uma vez
    @State private var selecionando = false
    @State private var marcadas: Set<String> = []
    @State private var resultadoLote: String?
    @AppStorage("projetos.tabela") private var modoTabela = false  // a tabela agrupada, como no ClickUp
    @State private var pontos: [String: Double] = [:]  // carregam depois da lista (o MCP só dá na task inteira)
    @State private var configurando: PedidoProjeto?  // novo projeto, ou configurar/editar um que já existe
    @State private var secao = SecaoProjeto.tasks  // Tasks, Documentos, Reuniões, Arquivos ou Formulários

    /// O projeto escolhido de verdade (não o Foco): só ele tem as outras seções.
    private var projetoReal: String? { projeto == Self.foco ? nil : projeto }

    var body: some View {
        GeometryReader { g in
        // as colunas encolhem com a janela (e o detalhe nunca fica espremido)
        let largProjetos = min(210, max(160, g.size.width * 0.17)), largTasks = min(340, max(250, g.size.width * 0.29))
        HStack(spacing: 0) {
            listaProjetos.frame(width: largProjetos)
            Divider()
            VStack(spacing: 0) {
                if projetoReal != nil { barraSecoes; Divider() }
                if secao != .tasks, let p = projetoReal {
                    ProjetoConteudo(secao: secao, pid: p) { tid in secao = .tasks; task = tid }.id("\(p)|\(secao)")
                } else if modoTabela {
                    areaTabela
                } else {
                    HStack(spacing: 0) {
                        listaTasks.frame(width: largTasks)
                        Divider()
                        if let task {
                            detalhe(task)
                        } else {
                            Text(projeto == nil ? "Escolha um projeto" : "Escolha uma task").foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }
                }
            }
        }
        }
        .overlay(alignment: .bottom) {
            if secao == .tasks || projetoReal == nil, selecionando || modoTabela && !marcadas.isEmpty {
                BarraLote(quantas: marcadas.count, total: tasks.count,
                          statusOrdem: (dados?.statusLote ?? []) + ["finalizado_validacao", "fechado"],
                          pedeVideo: ["finalizado_validacao", "fechado"], ocupado: carregando,
                          aplicar: aplicarLote, todas: { marcadas = Set(tasks.map(\.id)) }, limpar: sairDaSelecao)
                    .padding(.bottom, 22)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.25), value: selecionando || modoTabela && !marcadas.isEmpty)
        // na tabela, a task abre ao lado, num painel que fecha
        .inspector(isPresented: Binding(get: { modoTabela && task != nil && (secao == .tasks || projetoReal == nil) },
                                        set: { if !$0 { task = nil } })) {
            if let task { detalhe(task).inspectorColumnWidth(min: 380, ideal: 480, max: 720) }
        }
        .onChange(of: modoTabela) { sairDaSelecao() }
        .onChange(of: secao) { sairDaSelecao() }
        .task(id: ativa) { if ativa, dados == nil { await carregarProjetos() } }
        .task(id: "\(projeto ?? "")|\(todas)") { await carregarTasks() }
        .onChange(of: projeto) {
            if !deFora { task = nil }
            deFora = false
            sairDaSelecao()
        }

        .onChange(of: nav.abrirProjeto) {
            guard let p = nav.abrirProjeto, dados != nil else { return }  // sem dados ainda: o carregarProjetos abre
            projeto = p
            nav.abrirProjeto = nil
        }
        .onChange(of: nav.abrirTask) {
            guard let ref = nav.abrirTask else { return }
            deFora = projeto != ref.pid
            projeto = ref.pid
            secao = .tasks
            task = ref.tid
            nav.abrirTask = nil
        }
    }

    /// As seções do projeto, como as abas do projeto no Journify.
    private var barraSecoes: some View {
        HStack(spacing: 4) {
            ForEach(SecaoProjeto.allCases, id: \.self) { s in
                Button { secao = s } label: {
                    Label(s.rawValue, systemImage: s.icone)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .foregroundStyle(secao == s ? Souv.texto : Souv.texto2)
                        .background(RoundedRectangle(cornerRadius: 7).fill(secao == s ? Souv.primaria.opacity(0.2) : .clear))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Souv.superficie)
    }

    // ---------- projetos ----------
    private var listaProjetos: some View {
        List {
            if let d = dados {
                if !d.foco.isEmpty {
                    Label("Foco (\(d.foco.count))", systemImage: "flame").linhaSouv(projeto == Self.foco) { projeto = Self.foco }
                }
                Section("Projetos") {
                    ForEach(d.projetos.filter { $0.tasks > 0 }) { linhaProjeto($0) }
                }
                Section("Sem task sua") {
                    ForEach(d.projetos.filter { $0.tasks == 0 }) { linhaProjeto($0) }
                }
            } else if let aviso {
                Text(aviso).foregroundStyle(.secondary)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .listStyle(.sidebar)
        .listaSouv()
        .safeAreaInset(edge: .bottom) {
            HStack {
                Button { configurando = PedidoProjeto() } label: { Label("Novo projeto", systemImage: "plus") }
                    .help("Ligar um projeto do Journify a uma pasta deste Mac")
                Spacer()
                Button { Task { await carregarProjetos() } } label: { Image(systemName: "arrow.clockwise") }.help("Atualizar")
            }
            .buttonStyle(.souvIcone).padding(8)
        }
        .sheet(item: $configurando) { pedido in
            NovoProjeto(pedido: pedido, semPasta: (dados?.projetos ?? []).filter { $0.nome == nil },
                        fechar: { configurando = nil },
                        salvou: { pid in
                            configurando = nil
                            Task { await carregarProjetos(); projeto = pid; await carregarTasks() }
                        })
                .identidadeSouv()
        }
    }

    private func linhaProjeto(_ p: Projetos.Projeto) -> some View {
        HStack(spacing: 8) {
            Circle().fill(Color(hex: p.cor)).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(p.nome ?? "sem nome").lineLimit(1).foregroundStyle(p.nome == nil ? .secondary : .primary)
                if let ex = p.exemplo { Text("ex.: \(ex)").font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
            Spacer()
            if p.nome == nil {
                Button("Configurar") { configurando = PedidoProjeto(pid: p.id, nome: nil, pastas: []) }
                    .controlSize(.small).help("Escolher a pasta e o nome deste projeto no jfy")
            }
            if p.tasks > 0 { Text("\(p.tasks)").font(.caption).foregroundStyle(.secondary).monospacedDigit() }
            let fav = nav.favoritos.contains { $0.id == p.id }
            Button {
                if !nav.alternarFavorito(.init(id: p.id, nome: p.nome ?? "sem nome", cor: p.cor)) {
                    aviso = "Até \(Navegacao.maxFavoritos) favoritos: tire a estrela de um antes."
                }
            } label: { Image(systemName: fav ? "star.fill" : "star").foregroundStyle(fav ? Color.yellow : .secondary) }
            .buttonStyle(.souvIcone)
            .help(fav ? "Tirar dos favoritos da barra lateral" : "Favoritar: aparece na barra lateral (até \(Navegacao.maxFavoritos))")
        }
        .linhaSouv(projeto == p.id) { projeto = p.id }
        .menuSouv {
            Button(p.nome == nil ? "Configurar projeto…" : "Editar projeto…", systemImage: "pencil") {
                configurando = PedidoProjeto(pid: p.id, nome: p.nome, pastas: p.pastas ?? [])
            }
        }
    }

    // ---------- tasks ----------
    private func detalhe(_ tid: String) -> some View {
        TaskDetalhe(tid: tid, irParaJFY: irParaJFY, mudou: { Task { await carregarTasks() } },
                    abrirPR: { nav.abrirPR = $0; nav.tela = .github }, fechar: { task = nil }).id(tid)
    }

    /// Mudança feita na tabela (status, prioridade, vencimento): vai para o Journify e a lista relê.
    private func mudarTask(_ tid: String, _ campo: String, _ valor: String, _ extra: String) {
        Task {
            carregando = true
            if let e = await JFY.fazer(["--task-mudar", tid, campo, valor] + (extra.isEmpty ? [] : [extra])) { resultadoLote = e }
            await carregarTasks()
        }
    }

    /// O topo das tasks (nas duas formas): o projeto, Minhas/Todas, Lista/Tabela e a barra de lote.
    @ViewBuilder private var cabecalhoTasks: some View {
        HStack {
            Text(tituloProjeto).font(.headline).lineLimit(1)
            Spacer()
            if projeto != Self.foco && projeto != nil {
                Segmentos(selecao: $todas, opcoes: [.init(valor: false, rotulo: "Minhas"), .init(valor: true, rotulo: "Todas")])
            }
            Segmentos(selecao: $modoTabela, opcoes: [.init(valor: false, icone: "list.bullet", ajuda: "Lista"),
                                                    .init(valor: true, icone: "tablecells", ajuda: "Tabela: agrupada, com filtros")])
        }
        .padding(12)
        if let resultadoLote {
            Label(resultadoLote, systemImage: "info.circle").font(.caption).foregroundStyle(Souv.texto2)
                .textSelection(.enabled).padding(.horizontal, 12).padding(.bottom, 8)
        }
    }

    private var areaTabela: some View {
        VStack(spacing: 0) {
            cabecalhoTasks
            if carregando && tasks.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if tasks.isEmpty {
                Text(projeto == nil ? "Escolha um projeto" : aviso ?? "Nenhuma task aqui.").foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                TabelaTasks(tasks: tasks, statusOrdem: (dados?.statusLote ?? []) + ["finalizado_validacao", "fechado"],
                            comProjeto: projeto == Self.foco, pontos: pontos, marcadas: $marcadas, aberta: $task, mudar: mudarTask)
                    .opacity(carregando ? 0.5 : 1)
            }
        }
        .background(Souv.fundo)
    }

    private var listaTasks: some View {
        VStack(spacing: 0) {
            cabecalhoTasks
            Divider()
            if carregando && tasks.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if tasks.isEmpty {
                Text(projeto == nil ? "" : aviso ?? "Nenhuma task aqui.").foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).padding()
            } else {
                List {
                    ForEach(secoes, id: \.0) { nome, itens in
                        Section(nome) {
                            ForEach(itens) { linhaTask($0) }
                        }
                    }
                }
                .listaSouv(Souv.fundo)
                .opacity(carregando ? 0.5 : 1)
            }
        }
    }

    private var tituloProjeto: String {
        projeto == Self.foco ? "Foco: prazo perto ou crítica" : dados?.projetos.first { $0.id == projeto }?.nome ?? ""
    }

    private var secoes: [(String, [Resumo])] {
        var out: [(String, [Resumo])] = []
        for t in tasks {
            if out.last?.0 == t.etapa { out[out.count - 1].1.append(t) } else { out.append((t.etapa, [t])) }
        }
        return out
    }

    private func linhaTask(_ t: Resumo) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if selecionando { bolinha(t.id) }
            VStack(alignment: .leading, spacing: 3) {
                Text(t.titulo).lineLimit(2)
            HStack(spacing: 6) {
                if projeto == Self.foco { Circle().fill(Color(hex: t.cor)).frame(width: 6, height: 6); Text(t.projeto ?? "") }
                StatusChip(status: t.status, dias: t.dias)
                if let p = t.prazoTxt, !p.isEmpty { Text(p).foregroundStyle((t.dias ?? 99) <= 0 ? .red : .secondary) }
                if let pts = pontos[t.id] ?? t.pontos { Text("\(pts.formatted()) pts") }
            }
            .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
        .linhaSouv(selecionando ? marcadas.contains(t.id) : task == t.id) {
            if selecionando { marcar(t.id) } else { task = t.id }
        }
        .menuSouv { menuSelecao(t.id) }
    }

    // ---------- seleção em lote ----------
    private func bolinha(_ id: String) -> some View {
        Image(systemName: marcadas.contains(id) ? "checkmark.circle.fill" : "circle")
            .foregroundStyle(marcadas.contains(id) ? Souv.destaque : Souv.texto2)
    }

    @ViewBuilder private func menuSelecao(_ id: String) -> some View {
        if selecionando {
            Button(marcadas.contains(id) ? "Desmarcar" : "Marcar") { marcar(id) }
            Button("Sair da seleção") { sairDaSelecao() }
        } else {
            Button("Selecionar") { selecionando = true; marcadas = [id]; resultadoLote = nil }
        }
    }

    private func marcar(_ id: String) {
        if marcadas.contains(id) { marcadas.remove(id) } else { marcadas.insert(id) }
    }

    private func sairDaSelecao() {
        selecionando = false
        marcadas = []
    }

    private func aplicarLote(_ campo: String, _ valor: String, _ extra: String) {
        let ids = tasks.map(\.id).filter(marcadas.contains)  // na ordem da lista
        guard !ids.isEmpty else { return }
        Task {
            carregando = true
            let (r, msg): (Lote?, String?) = await JFY.ler(["--tasks-mudar", campo, valor] + (extra.isEmpty ? [] : ["--extra=" + extra]) + ids)
            if let r {
                let titulo = { (id: String) in tasks.first { $0.id == id }?.titulo ?? id }
                resultadoLote = "\(r.ok) de \(ids.count) mudada\(r.ok == 1 ? "" : "s") no Journify."
                    + (r.erros.isEmpty ? "" : " Não mudaram: " + r.erros.map { "\(titulo($0.id)) (\($0.erro))" }.joined(separator: "; "))
                if r.erros.isEmpty { sairDaSelecao() } else { marcadas = Set(r.erros.map(\.id)) }  // ficam marcadas as que falharam
            } else {
                resultadoLote = msg
            }
            await carregarTasks()
        }
    }

    // ---------- jfy ----------
    private func carregarProjetos() async {
        let (d, msg): (Projetos?, String?) = await JFY.ler(["--projetos-json"])
        if let d {
            dados = d
            // favorito renomeado no jfy: a barra lateral acompanha o nome e a cor
            let novos = nav.favoritos.map { f in d.projetos.first { $0.id == f.id }.map { .init(id: f.id, nome: $0.nome ?? f.nome, cor: $0.cor) } ?? f }
            if novos != nav.favoritos { nav.favoritos = novos }
        }
        aviso = msg
        if let p = nav.abrirProjeto {  // veio de um favorito da barra lateral
            projeto = p
            nav.abrirProjeto = nil
        } else if projeto == nil {
            projeto = d?.foco.isEmpty == false ? Self.foco : d?.projetos.first?.id
        }
    }

    private func carregarTasks() async {
        guard let projeto else { return }
        carregando = true
        defer { carregando = false }
        if projeto == Self.foco {
            let (d, msg): (Projetos?, String?) = await JFY.ler(["--projetos-json"])
            tasks = d?.foco ?? []
            aviso = msg
        } else {
            let (d, msg): ([Resumo]?, String?) = await JFY.ler(["--tasks-json", projeto] + (todas ? ["todas"] : []))
            tasks = d ?? []
            aviso = msg
        }
        let faltam = tasks.map(\.id).filter { pontos[$0] == nil }
        if !faltam.isEmpty {  // depois da lista, sem segurar a tela (o jfy guarda por 15 min)
            Task {
                let (p, _): ([String: Double]?, String?) = await JFY.ler(["--tasks-pontos"] + faltam)
                if let p { pontos.merge(p) { $1 } }
            }
        }
    }
}

// ---------- a task ----------
struct TaskDetalhe: View {
    let tid: String
    let irParaJFY: () -> Void
    let mudou: () -> Void
    let abrirPR: (String) -> Void
    var fechar: (() -> Void)?  // o × do painel (Esc também fecha)

    struct Detalhe: Decodable {
        struct Anexo: Decodable, Identifiable {
            let n: Int
            let nome, tipo: String
            let url: String?
            let imagem: Bool
            var id: Int { n }
        }
        struct Comentario: Decodable, Identifiable {
            let autor: String?
            let texto: String
            let quando: String?
            var id: String { (quando ?? "") + texto.prefix(20) }
        }
        let titulo, status, pid, url, descricao: String
        let prioridade, prazo, projeto, cor, epico: String?
        let dias: Int?
        let pontos: Double?
        let configurado: Bool
        let foco: Bool?  // marcada como foco (só sua, no config do jfy)
        let statusApp, pedeVideo: [String]
        let anexos: [Anexo]
        let comentarios: [Comentario]
    }

    @State private var d: Detalhe?
    @State private var aviso: String?
    @State private var ocupado = false
    @State private var comentario = ""
    @State private var fechandoEm: String?  // status que pede o vídeo do teste
    @State private var video = ""
    @State private var anexando: String?  // o arquivo que está indo para a task agora

    var body: some View {
        Group {
            if let d { conteudo(d) } else if let aviso { Text(aviso).foregroundStyle(.secondary).padding() } else { ProgressView() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await carregar() }
        .dialogoSouv("Vídeo do teste", isPresented: Binding(get: { fechandoEm != nil }, set: { if !$0 { fechandoEm = nil } })) {
            Button("Mover") {
                if let s = fechandoEm, video.trimmingCharacters(in: .whitespaces).count >= 3 { mudar("status", s, video) }
                fechandoEm = nil
            }
        } message: {
            VStack(alignment: .leading, spacing: 8) {
                Text("O Journify só move a task para \(rotulo(fechandoEm ?? "")) com o link do vídeo do teste ou o motivo de não ter vídeo.")
                TextField("link do vídeo, ou por que não tem", text: $video).foregroundStyle(Souv.texto).campoSouv()
            }
        }
    }

    private func conteudo(_ d: Detalhe) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 8) {
                    Circle().fill(Color(hex: d.cor)).frame(width: 9, height: 9)
                    Text(d.projeto ?? "projeto sem nome").foregroundStyle(.secondary)
                    if let e = d.epico { Text("· \(e)").foregroundStyle(.secondary) }
                    Spacer()
                    BotaoContexto(item: .init(tipo: "task", ref: tid, titulo: d.titulo, origem: d.projeto, pid: d.pid))
                    Link(destination: URL(string: d.url)!) { Label("Abrir no Journify", systemImage: "arrow.up.right.square") }.buttonStyle(.souvLink)
                    if let fechar {
                        Button(action: fechar) { Image(systemName: "xmark").font(.body.weight(.semibold)) }
                            .buttonStyle(.souvIcone).keyboardShortcut(.cancelAction).help("Fechar os detalhes (Esc)")
                    }
                }
                .lineLimit(1)
                .font(.callout)
                Text(d.titulo).font(.title2.weight(.semibold)).textSelection(.enabled)
                controles(d)
                if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled) }
                HStack {
                    HStack {
                        Button { abrir("pipeline") } label: { Label("Implementar (/pipeline)", systemImage: "hammer") }
                            .buttonStyle(.souvPrimario)
                        Button { abrir("livre") } label: { Label("Conversar com o Claude", systemImage: "bubble.left") }
                    }
                    .disabled(!d.configurado)
                    .help(d.configurado ? "Abre numa aba do jfy" : "Configure o projeto no menu do jfy antes")
                    let noFoco = d.foco == true
                    Button { focar(!noFoco) } label: { Label(noFoco ? "Tirar do foco" : "Marcar como foco", systemImage: "scope") }
                        .disabled(ocupado)
                        .help(noFoco ? "Sai do Foco (volta a entrar sozinha se o prazo chegar perto)"
                              : "Entra no topo do Foco e da Meu dia, mesmo sem prazo. Só para você: o Journify não muda")
                }

                Secao("O que fazer") {
                    if d.descricao.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("(sem descrição)").foregroundStyle(.secondary)
                    } else {
                        Markdown(texto: d.descricao)
                    }
                }
                Secao(d.anexos.isEmpty ? "Anexos" : "Anexos (\(d.anexos.count))") {
                    if !d.anexos.isEmpty { anexos(d.anexos) }
                    HStack(spacing: 8) {
                        Button { anexar() } label: { Label("Anexar arquivo", systemImage: "paperclip") }
                            .disabled(anexando != nil)
                            .help("Um print ou o vídeo do teste: vai para a task no Journify (até 20 MB; vídeo, até 100 MB)")
                        if let anexando {
                            ProgressView().controlSize(.small)
                            Text(anexando).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                        }
                    }
                }
                let links = linksCitados(d)
                if !links.isEmpty {
                    Secao("Links (\(links.count))") {
                        ForEach(links, id: \.url) { l in
                            Button { abrirURL(l.url) } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: l.icone).foregroundStyle(Souv.destaque).frame(width: 20)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(l.nome).lineLimit(1).truncationMode(.middle)
                                        Text("\(l.tipo) · \(l.origem)").font(.caption).foregroundStyle(Souv.texto2).lineLimit(1)
                                    }
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain).help(l.url)
                            .menuSouv {
                                Button("Copiar o link", systemImage: "link") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(l.url, forType: .string) }
                                MenuContexto(item: .init(tipo: "link", ref: l.url, titulo: l.nome, origem: d.titulo, pid: d.pid))
                            }
                        }
                    }
                }
                let prs = prsCitados(d)
                if !prs.isEmpty {
                    Secao("Pull requests (\(prs.count))") {
                        ForEach(prs, id: \.self) { pr in
                            Button { abrirPR(pr) } label: { Label(pr, systemImage: "arrow.triangle.pull") }
                                .buttonStyle(.souvLink).help("Abrir na aba GitHub")
                        }
                    }
                }
                Secao("Comentários (\(d.comentarios.count))") { comentarios(d.comentarios) }
            }
            .padding(24)
            .frame(maxWidth: 860, alignment: .leading)
        }
        .opacity(ocupado ? 0.6 : 1)
    }

    /// Status, prioridade, prazo e pontos: numa linha quando cabe; no painel estreito, em duas.
    private func controles(_ d: Detalhe) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) {
                statusEPrioridade(d)
                prazoEPontos(d)
            }
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) { statusEPrioridade(d) }
                HStack(spacing: 10) { prazoEPontos(d) }
            }
        }
    }

    @ViewBuilder private func statusEPrioridade(_ d: Detalhe) -> some View {
        SouvSelect(opcoes: d.statusApp.map { .init(valor: $0, rotulo: rotulo($0), cor: CORES_STATUS[$0] ?? .gray) }, selecionado: d.status) { s in
            if d.pedeVideo.contains(s) { video = ""; fechandoEm = s } else { mudar("status", s) }
        }
        .frame(width: 190)
        .help((d.dias ?? 0) < 0 && !["fechado", "finalizado_validacao"].contains(d.status) ? "Atrasada: o prazo já passou" : "Status")
        SouvSelect(opcoes: [("baixa", Color.gray), ("media", Souv.primaria), ("alta", Color.orange), ("critica", Color.red)]
                    .map { .init(valor: $0.0, rotulo: rotuloPrioridade($0.0), cor: $0.1) },
                   selecionado: d.prioridade, vazio: "sem prioridade") { mudar("prioridade", $0) }
            .frame(width: 140)
    }

    @ViewBuilder private func prazoEPontos(_ d: Detalhe) -> some View {
        CampoDataSouv(data: Binding(get: { d.prazo.flatMap(dataLocal) ?? Date() }, set: { mudar("prazo", diaLocal($0)) }))
        if d.prazo == nil { Text("sem prazo").font(.caption).foregroundStyle(.secondary) }
        if let pts = d.pontos {
            Text("\(pts.formatted()) pts").foregroundStyle(pts > 8 ? .red : .secondary)
                .help(pts > 8 ? "Acima de 8 pontos: não cabe num PR, divida a task" : "")
        }
    }

    private func anexos(_ lista: [Detalhe.Anexo]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            let imgs = lista.filter(\.imagem), docs = lista.filter { !$0.imagem }
            if !imgs.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                    ForEach(imgs) { a in
                        Button { abrirURL(a.url) } label: {
                            AsyncImage(url: a.url.flatMap(URL.init(string:))) { img in
                                img.resizable().scaledToFill()
                            } placeholder: { Color.secondary.opacity(0.1).overlay(ProgressView().controlSize(.small)) }
                            .frame(height: 110).clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(alignment: .bottomLeading) {
                                Text("a\(a.n)").font(.caption2.bold()).padding(4).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 4)).padding(4)
                            }
                        }
                        .buttonStyle(.plain).help(a.nome)
                        .menuSouv(se: a.url != nil) { menuAnexo(a) }
                    }
                }
            }
            ForEach(docs) { a in
                Button { abrirURL(a.url) } label: {
                    Label { Text("a\(a.n)  \(a.nome)") } icon: { Image(systemName: icone(a.tipo)) }
                }
                .buttonStyle(.souvLink).help("Abrir \(a.nome)")
                .menuSouv(se: a.url != nil) { menuAnexo(a) }
            }
        }
    }

    @ViewBuilder private func menuAnexo(_ a: Detalhe.Anexo) -> some View {
        if let u = a.url { MenuContexto(item: .init(tipo: "arquivo", ref: u, titulo: a.nome, origem: d?.titulo, pid: d?.pid)) }
    }

    private func comentarios(_ lista: [Detalhe.Comentario]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(lista) { c in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(c.autor ?? "?").font(.callout.weight(.semibold))
                        Text(quando(c.quando)).font(.caption).foregroundStyle(.secondary)
                    }
                    Markdown(texto: c.texto)
                }
            }
            HStack(alignment: .bottom) {
                TextField("Comentar", text: $comentario, axis: .vertical).lineLimit(1...5).campoSouv()
                Button("Enviar") { mudar("comentario", comentario); comentario = "" }
                    .disabled(comentario.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || ocupado)
            }
        }
    }

    // ---------- jfy ----------
    private func carregar() async {
        let (r, msg): (Detalhe?, String?) = await JFY.ler(["--task-json", tid])
        if let r { d = r }
        aviso = msg
    }

    private func mudar(_ campo: String, _ valor: String, _ extra: String = "") {
        Task {
            ocupado = true
            let erro = await JFY.fazer(["--task-mudar", tid, campo, valor] + (extra.isEmpty ? [] : [extra]))
            await carregar()
            ocupado = false
            aviso = erro
            if erro == nil, campo != "comentario" { mudou() }
        }
    }

    private func anexar() {
        Task {
            let r = await enviarArquivos(para: "task", tid) { anexando = $0 }
            if r.enviados > 0 { await carregar() }
            anexando = nil
            if let e = r.erro { aviso = e }  // depois do carregar, que troca o aviso
        }
    }

    private func focar(_ sim: Bool) {
        Task {
            ocupado = true
            let erro = await JFY.fazer(["--foco-marcar", tid, sim ? "sim" : "nao"])
            await carregar()
            ocupado = false
            aviso = erro
            if erro == nil { mudou() }
        }
    }

    private func abrir(_ modo: String) {
        Task {
            if let erro = await JFY.fazer(["--task-abrir", tid, modo]) { aviso = erro } else { irParaJFY() }
        }
    }

    /// Os PRs citados na task (o pr-creator da pipeline comenta o link do PR nela), como "dono/repo#n".
    private func prsCitados(_ d: Detalhe) -> [String] {
        let txt = ([d.descricao] + d.comentarios.map(\.texto)).joined(separator: "\n")
        var vistos: [String] = []
        for m in txt.matches(of: #/github\.com/([\w.-]+/[\w.-]+)/pull/(\d+)/#) where !vistos.contains("\(m.1)#\(m.2)") {
            vistos.append("\(m.1)#\(m.2)")
        }
        return vistos
    }

    struct LinkCitado { let url, nome, tipo, icone, origem: String }

    /// Os links citados na descrição e nos comentários (Figma, Google Docs, Drive…), sem repetir, sem as imagens que a
    /// descrição já mostra, sem os anexos e sem os PRs (que têm a seção deles).
    private func linksCitados(_ d: Detalhe) -> [LinkCitado] {
        let fontes = [("descrição", d.descricao)] + d.comentarios.map { ("comentário de \($0.autor ?? "alguém")", $0.texto) }
        var vistos = Set(d.anexos.compactMap(\.url)), out: [LinkCitado] = []
        for (origem, texto) in fontes {
            let semImagens = texto.replacing(#/!\[[^\]]*\]\([^)]*\)/#, with: "")
            for m in semImagens.matches(of: #/https?://[^\s<>"'()\[\]]+/#) {
                var u = String(m.0)
                while let c = u.last, ".,;:!?".contains(c) { u.removeLast() }
                guard !vistos.contains(u), u.firstMatch(of: #/github\.com/[\w.-]+/[\w.-]+/pull/\d+/#) == nil else { continue }
                vistos.insert(u)
                // o rótulo do link: o texto antes dele na linha ("Regras de Negócio: <link>") ou o de [texto](<link>)
                let linha = String(semImagens[..<m.range.lowerBound].split(separator: "\n", omittingEmptySubsequences: false).last ?? "")
                let rotulo = (linha.firstMatch(of: #/\[([^\]]+)\]\($/#).map { String($0.1) } ?? linha)
                    .replacing("**", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "-*•:([ \t"))
                out.append(linkCitado(u, origem, rotulo: (2...50).contains(rotulo.count) ? rotulo : nil))
            }
        }
        return out
    }

    private func linkCitado(_ u: String, _ origem: String, rotulo: String?) -> LinkCitado {
        let url = URL(string: u), host = (url?.host() ?? "").replacing(#/^www\./#, with: ""), caminho = url?.path(percentEncoded: false) ?? ""
        let (tipo, icone): (String, String) =
            host.hasSuffix("figma.com") ? ("Figma", "paintpalette")
            : host == "docs.google.com" && caminho.hasPrefix("/spreadsheets") ? ("Planilha Google", "tablecells")
            : host == "docs.google.com" && caminho.hasPrefix("/presentation") ? ("Apresentação Google", "rectangle.on.rectangle")
            : host == "docs.google.com" ? ("Documento Google", "doc.text")
            : host == "drive.google.com" ? ("Google Drive", "externaldrive")
            : host.hasSuffix("github.com") ? ("GitHub", "chevron.left.forwardslash.chevron.right")
            : host.contains("loom.com") || host.contains("youtu") ? ("Vídeo", "play.rectangle")
            : (host, "link")
        // o Figma traz o nome do arquivo no link: figma.com/design/<chave>/<Nome-do-arquivo>
        let partes = caminho.split(separator: "/")
        let rotulo = rotulo?.lowercased() == tipo.lowercased() ? nil : rotulo  // "Figma: <link>" não diz mais que o tipo
        let nome = rotulo ?? (host.hasSuffix("figma.com") && partes.count >= 3 ? partes[2].replacingOccurrences(of: "-", with: " ").split(separator: " ").joined(separator: " ")
            : String((host + caminho).prefix(80)))
        return LinkCitado(url: u, nome: nome, tipo: tipo, icone: icone, origem: origem)
    }

    private func abrirURL(_ s: String?) {
        if let s, let u = URL(string: s) { NSWorkspace.shared.open(u) }  // só o link, como no jfy: nada é baixado
    }

    private func icone(_ tipo: String) -> String {
        tipo.contains("pdf") ? "doc.richtext" : tipo.contains("sheet") || tipo.contains("excel") || tipo.contains("csv") ? "tablecells"
            : tipo.hasPrefix("video/") ? "film" : tipo.contains("zip") ? "doc.zipper" : "doc"
    }

    private func quando(_ iso: String?) -> String {
        guard let iso, let d = try? Date(iso, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true))
        else { return "" }
        return d.formatted(.dateTime.day().month(.twoDigits).hour().minute().locale(Locale(identifier: "pt_BR")))
    }
}

// ---------- peças ----------
func rotulo(_ status: String) -> String {
    ["em_revisao": "em revisão", "pendente_validacao": "pendente validação", "finalizado_validacao": "finalizado validação"][status]
        ?? status.replacingOccurrences(of: "_", with: " ")
}
func rotuloPrioridade(_ p: String) -> String {
    ["media": "média", "critica": "crítica"][p] ?? p
}

/// Cor da bolinha de cada status: uma para cada, para bater o olho na lista.
let CORES_STATUS: [String: Color] = [
    "em_aberto": .gray,
    "criando_escopo": .teal,
    "priorizado": Color(red: 0.0, green: 0.3, blue: 1.0),  // azul bem forte
    "em_progresso": .green,
    "em_revisao": .yellow,
    "em_teste": .purple,
    "pendente_validacao": Color(red: 1.0, green: 0.48, blue: 0.78),  // rosa claro: longe do vermelho de atrasada
    "bloqueado": .orange,
    "finalizado_validacao": .brown,
    "fechado": Color(claro: 0x3A3A3C, escuro: 0xC7C7CC),  // grafite: não some no fundo escuro
]

/// A bolinha do status, sempre com o nome escrito. Prazo vencido numa task ainda aberta pinta de vermelho e
/// escreve "atrasada": atrasada não é um status do Journify, é o prazo.
struct StatusChip: View {
    let status: String
    var dias: Int?

    var body: some View {
        let atrasada = (dias ?? 0) < 0 && !["fechado", "finalizado_validacao"].contains(status)
        HStack(spacing: 4) {
            Group {
                if status == "em_aberto" && !atrasada {
                    Circle().strokeBorder(Color.gray, lineWidth: 1.5)  // vazada: ainda não começou
                } else {
                    Circle().fill(atrasada ? .red : CORES_STATUS[status] ?? .gray)
                }
            }
            .frame(width: 8, height: 8)
            Text(rotulo(status) + (atrasada ? " · atrasada" : ""))
        }
    }
}

private struct Secao<C: View>: View {
    let titulo: String
    @ViewBuilder let conteudo: C
    init(_ titulo: String, @ViewBuilder _ conteudo: () -> C) {
        self.titulo = titulo
        self.conteudo = conteudo()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(titulo.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            conteudo
        }
    }
}

/// O markdown que o jfy devolve (doc_texto: títulos, listas, **negrito**, ![](imagem), ``` código), bloco a bloco:
/// o Text do SwiftUI só entende o markdown de dentro da linha.
struct Markdown: View {
    let texto: String

    private enum Bloco: Hashable {
        case titulo(Int, String), item(Int, String), imagem(String), codigo(String), paragrafo(String), espaco
    }

    private var blocos: [Bloco] {
        var out: [Bloco] = [], codigo: [String]?
        for linha in texto.components(separatedBy: "\n") {
            if linha.hasPrefix("```") {
                if let c = codigo { out.append(.codigo(c.joined(separator: "\n"))); codigo = nil } else { codigo = [] }
                continue
            }
            if codigo != nil { codigo!.append(linha); continue }
            let limpa = linha.trimmingCharacters(in: .whitespaces)
            let recuo = (linha.count - linha.drop { $0 == " " }.count) / 2
            if limpa.isEmpty {
                if out.last != .espaco { out.append(.espaco) }
            } else if let m = limpa.wholeMatch(of: #/!\[[^\]]*\]\(([^)]+)\)/#) {
                out.append(.imagem(String(m.1)))
            } else if let m = limpa.firstMatch(of: #/^(#{1,6})\s+(.*)/#) {
                out.append(.titulo(m.1.count, String(m.2)))
            } else if let m = limpa.firstMatch(of: #/^[-*•]\s+(.*)/#) {
                out.append(.item(recuo, String(m.1)))
            } else {
                out.append(.paragrafo(limpa))
            }
        }
        if let c = codigo { out.append(.codigo(c.joined(separator: "\n"))) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocos.enumerated()), id: \.offset) { _, b in
                switch b {
                case let .titulo(n, t): linha(t).font(n <= 1 ? .title3.bold() : n == 2 ? .headline : .subheadline.bold()).padding(.top, 4)
                case let .item(recuo, t):
                    HStack(alignment: .firstTextBaseline, spacing: 6) { Text("•"); linha(t) }.padding(.leading, CGFloat(recuo) * 16)
                case let .imagem(u):
                    AsyncImage(url: URL(string: u)) { $0.resizable().scaledToFit() } placeholder: { ProgressView().controlSize(.small) }
                        .frame(maxHeight: 320).onTapGesture { if let url = URL(string: u) { NSWorkspace.shared.open(url) } }
                case let .codigo(c):
                    Text(c).font(.system(.callout, design: .monospaced)).padding(8).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                case let .paragrafo(t): linha(t)
                case .espaco: Spacer().frame(height: 2)
                }
            }
        }
        .textSelection(.enabled)
    }

    private func linha(_ t: String) -> some View {
        Text((try? AttributedString(markdown: t, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(t))
            .fixedSize(horizontal: false, vertical: true)  // parágrafo longo quebra linha, não corta com "…"
    }
}

/// O painel das tasks marcadas, como no ClickUp: "Definir [status, prioridade ou prazo] para [o valor]" e Aplicar;
/// Limpar desmarca. O valor muda conforme o campo: todos os status (os que pedem o vídeo do teste perguntam o link, que
/// vale para todas), as prioridades ou um dia no calendário.
struct BarraLote: View {
    let quantas, total: Int
    let statusOrdem: [String]
    let pedeVideo: Set<String>
    let ocupado: Bool
    let aplicar: (String, String, String) -> Void  // campo, valor, link do vídeo (ou motivo)
    let todas: () -> Void
    let limpar: () -> Void

    @State private var campo = "status"
    @State private var valor: String?
    @State private var data = Date()
    @State private var escolhendoData = false
    @State private var pedindoVideo = false
    @State private var video = ""

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Text("\(quantas) selecionada\(quantas == 1 ? "" : "s")").fontWeight(.semibold).foregroundStyle(Souv.texto)
                    .monospacedDigit().fixedSize()
                Text("Definir").foregroundStyle(Souv.texto2).fixedSize()
                SouvSelect(opcoes: [.init(valor: "status", rotulo: "Status"), .init(valor: "prioridade", rotulo: "Prioridade"),
                                    .init(valor: "prazo", rotulo: "Prazo")], selecionado: campo) { campo = $0; valor = nil }
                    .frame(width: 150)
                Text("para").foregroundStyle(Souv.texto2).fixedSize()
                escolhaDoValor.frame(width: 200)
                Button(action: aplicarAgora) {
                    Label("Aplicar", systemImage: "checkmark").fontWeight(.semibold).foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Souv.primaria))
                        .opacity(valor == nil || quantas == 0 || ocupado ? 0.45 : 1)
                }
                .buttonStyle(.plain)
                .disabled(valor == nil || quantas == 0 || ocupado)
                .keyboardShortcut(.defaultAction)
            }
            HStack(spacing: 18) {
                if quantas < total {
                    Button(action: todas) { Label("Selecionar todas (\(total))", systemImage: "checklist") }.buttonStyle(.plain)
                }
                Button(action: limpar) { Label("Limpar", systemImage: "xmark") }.buttonStyle(.plain)
            }
            .font(.callout).foregroundStyle(Souv.texto2)
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Souv.superficie))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Souv.primaria.opacity(0.55)))
        .shadow(color: Color(claro: 0x8C93AD, escuro: 0x000000).opacity(0.35), radius: 18, y: 8)  // no claro, uma sombra leve
        .onExitCommand(perform: limpar)
        .dialogoSouv("Vídeo do teste", isPresented: $pedindoVideo) {
            Button("Aplicar") {
                if let v = valor, video.trimmingCharacters(in: .whitespaces).count >= 3 { aplicar(campo, v, video); valor = nil }
            }
        } message: {
            VStack(alignment: .leading, spacing: 8) {
                Text("O Journify só move para \(rotulo(valor ?? "")) com o link do vídeo do teste ou o motivo de não ter vídeo. Ele vale para as \(quantas) tasks.")
                TextField("link do vídeo, ou por que não tem", text: $video).foregroundStyle(Souv.texto).campoSouv()
            }
        }
    }

    /// O segundo seletor segue o primeiro: status, prioridade ou o calendário do prazo.
    @ViewBuilder private var escolhaDoValor: some View {
        switch campo {
        case "status":
            SouvSelect(opcoes: statusOrdem.map { .init(valor: $0, rotulo: rotulo($0), cor: CORES_STATUS[$0] ?? .gray) },
                       selecionado: valor, vazio: "Selecione…") { valor = $0 }
        case "prioridade":
            SouvSelect(opcoes: ["critica", "alta", "media", "baixa"].map { .init(valor: $0, rotulo: rotuloPrioridade($0), cor: corPrioridade($0)) },
                       selecionado: valor, vazio: "Selecione…") { valor = $0 }
        default:
            Button { data = valor.flatMap(dataLocal) ?? Date(); escolhendoData = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "calendar").foregroundStyle(Souv.texto2)
                    Text(valor.flatMap(dataLocal)?.formatted(.dateTime.day(.twoDigits).month(.twoDigits).year()) ?? "Selecione…")
                        .foregroundStyle(valor == nil ? Souv.texto2 : Souv.texto)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).foregroundStyle(Souv.texto2)
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 8).fill(Souv.superficie2))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(escolhendoData ? Souv.destaque : Souv.borda))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $escolhendoData, arrowEdge: .top) {
                VStack(alignment: .trailing, spacing: 8) {
                    CalendarioSouv(data: $data)
                    Button("Usar este dia") { valor = diaLocal(data); escolhendoData = false }.buttonStyle(.souvPrimario)
                }
                .padding(12)
                .background(Souv.superficie).identidadeSouv()
            }
        }
    }

    private func aplicarAgora() {
        guard let v = valor else { return }
        if campo == "status", pedeVideo.contains(v) { video = ""; pedindoVideo = true } else { aplicar(campo, v, ""); valor = nil }
    }
}

/// O pedido do formulário de projeto: novo (sem id) ou um que já existe (configurar ou editar).
struct PedidoProjeto: Identifiable {
    let id = UUID()
    var pid: String?
    var nome: String?
    var pastas: [String] = []
}

/// Ligar um projeto do Journify a uma pasta deste Mac, como o terminal faz: o projeto (um dos seus sem pasta, ou o link
/// dele no Journify, conferido pelo MCP), a pasta do código (escolher ou criar; mais de uma para front e back) ou "sem
/// repositório", e o nome curto com que ele aparece no jfy.
struct NovoProjeto: View {
    let pedido: PedidoProjeto
    let semPasta: [ProjetosTela.Projetos.Projeto]
    let fechar: () -> Void
    let salvou: (String) -> Void

    struct Conferido: Decodable {
        let id: String
        let tasks: Int
        let exemplo, nome, journify, github: String?
        let pastas: [String]
        let contasGithub: [String]
    }

    @State private var link = ""
    @State private var conferido: Conferido?
    @State private var conferindo = false
    @State private var pastas: [String] = []
    @State private var semRepo = false
    @State private var nome = ""
    @State private var conta = ""  // conta do GitHub do projeto; "" = a ativa do gh
    @State private var aviso: String?
    @State private var salvando = false

    private var pronto: Bool {
        conferido != nil && !nome.trimmingCharacters(in: .whitespaces).isEmpty && (semRepo || !pastas.isEmpty) && !salvando
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(pedido.pid == nil ? "Novo projeto" : pedido.nome == nil ? "Configurar projeto" : "Editar projeto")
                .font(Souv.titulo(24))
            secao("1", "Projeto no Journify") {
                if let c = conferido {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        Text(c.journify ?? c.nome ?? c.id).fontWeight(.semibold)
                        Text("· \(c.tasks) task\(c.tasks == 1 ? "" : "s")").foregroundStyle(Souv.texto2)
                        Spacer()
                        if pedido.pid == nil { Button("Trocar") { conferido = nil; link = "" }.buttonStyle(.souvLink) }
                    }
                    if let ex = c.exemplo { Text("ex.: \(ex)").font(.caption).foregroundStyle(Souv.texto2).lineLimit(1) }
                } else if pedido.pid != nil {
                    ProgressView().controlSize(.small)
                } else {
                    if !semPasta.isEmpty {
                        Text("Seus projetos que ainda não têm pasta:").font(.caption).foregroundStyle(Souv.texto2)
                        ForEach(semPasta) { p in
                            Button { conferir(p.id) } label: {
                                HStack(spacing: 8) {
                                    Circle().fill(Color(hex: p.cor)).frame(width: 8, height: 8)
                                    Text(p.exemplo.map { "ex.: \($0)" } ?? p.id).lineLimit(1)
                                    Spacer()
                                    Text("\(p.tasks) task\(p.tasks == 1 ? "" : "s")").font(.caption).foregroundStyle(Souv.texto2)
                                }
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(RoundedRectangle(cornerRadius: 8).fill(Souv.superficie2))
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    HStack {
                        TextField("Cole o link do projeto no Journify (…/projects/…)", text: $link)
                            .campoSouv().onSubmit { conferir(link) }
                        Button("Conferir") { conferir(link) }.disabled(link.trimmingCharacters(in: .whitespaces).isEmpty || conferindo)
                        if conferindo { ProgressView().controlSize(.small) }
                    }
                    Text("O jfy confere no Journify se você tem acesso ao projeto.").font(.caption).foregroundStyle(Souv.texto2)
                }
            }
            secao("2", "Pasta do código") {
                Toggle("Sem repositório (estudo, documentos): o Claude abre numa pasta só deste projeto", isOn: $semRepo)
                if !semRepo {
                    ForEach(pastas, id: \.self) { pasta in
                        HStack(spacing: 8) {
                            Image(systemName: "folder.fill").foregroundStyle(Souv.destaque)
                            Text(pasta.replacingOccurrences(of: NSHomeDirectory(), with: "~")).lineLimit(1).truncationMode(.middle)
                            Spacer()
                            Button { pastas.removeAll { $0 == pasta } } label: { Image(systemName: "xmark") }
                                .buttonStyle(.souvIcone).help("Tirar esta pasta")
                        }
                    }
                    HStack {
                        Button { escolherPasta() } label: {
                            Label(pastas.isEmpty ? "Escolher ou criar a pasta…" : "Outra pasta (front e back, por exemplo)…",
                                  systemImage: "folder.badge.plus")
                        }
                    }
                }
            }
            secao("3", "Nome no jfy") {
                TextField("curto, como aparece no menu e na barra (ex.: portal)", text: $nome).campoSouv()
            }
            if !semRepo, let contas = conferido?.contasGithub, !contas.isEmpty {
                secao("4", "Conta do GitHub") {
                    SouvSelect(opcoes: [.init(valor: "", rotulo: "A ativa do gh (sem conta fixa)")]
                               + contas.map { .init(valor: $0, rotulo: $0, foto: URL(string: "https://github.com/\($0).png?size=48")) },
                               selecionado: conta) { conta = $0 }
                        .frame(maxWidth: 320)
                    Text("Os commits destas pastas saem com o nome e o email dessa conta, e o push e o gh do Claude usam ela, seja qual for a conta ativa.")
                        .font(.caption).foregroundStyle(Souv.texto2)
                }
            }
            if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled) }
            HStack {
                Spacer()
                Button("Cancelar", action: fechar).keyboardShortcut(.cancelAction)
                Button(salvando ? "Salvando…" : "Salvar") { salvar() }.buttonStyle(.souvPrimario)
                    .keyboardShortcut(.defaultAction).disabled(!pronto)
            }
        }
        .padding(22)
        .frame(width: 600)
        .background(Souv.fundo)
        .task {
            pastas = pedido.pastas
            nome = pedido.nome ?? ""
            semRepo = pedido.pastas.first?.contains("/.jfy/sem-repo/") == true
            if semRepo { pastas = [] }
            if let pid = pedido.pid { conferir(pid) }
        }
    }

    private func secao(_ n: String, _ titulo: String, @ViewBuilder _ conteudo: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(n).font(.caption.weight(.bold)).foregroundStyle(.white)
                    .frame(width: 20, height: 20).background(Circle().fill(Souv.primaria))
                Text(titulo).fontWeight(.semibold)
            }
            conteudo()
        }
    }

    private func conferir(_ ref: String) {
        Task {
            conferindo = true
            aviso = nil
            let (c, msg): (Conferido?, String?) = await JFY.ler(["--projeto-validar", ref])
            conferindo = false
            if let c {
                conferido = c
                if nome.isEmpty { nome = c.nome ?? "" }
                if conta.isEmpty { conta = c.github ?? "" }
                if pastas.isEmpty && pedido.pid == nil { pastas = c.pastas.filter { !$0.contains("/.jfy/sem-repo/") } }
            } else {
                aviso = msg
            }
        }
    }

    /// O painel do macOS: escolhe uma pasta, ou cria uma nova pelo botão Nova Pasta dele.
    private func escolherPasta() {
        let painel = NSOpenPanel()
        painel.canChooseDirectories = true
        painel.canChooseFiles = false
        painel.canCreateDirectories = true
        painel.allowsMultipleSelection = false
        painel.prompt = "Usar esta pasta"
        painel.message = "Escolha a pasta do código do projeto, ou crie uma nova (botão Nova Pasta)."
        if let ultima = pastas.last { painel.directoryURL = URL(fileURLWithPath: ultima).deletingLastPathComponent() }
        guard painel.runModal() == .OK, let url = painel.url else { return }
        if !pastas.contains(url.path) { pastas.append(url.path) }
        if nome.isEmpty { nome = url.lastPathComponent.lowercased() }
    }

    private func salvar() {
        guard let c = conferido else { return }
        Task {
            salvando = true
            aviso = nil
            struct Salvo: Decodable { let id: String }
            let d: [String: Any] = ["id": c.id, "nome": nome.trimmingCharacters(in: .whitespaces), "pastas": semRepo ? [] : pastas,
                                    "github": semRepo ? "" : conta]
            guard let json = try? JSONSerialization.data(withJSONObject: d), let txt = String(data: json, encoding: .utf8) else { return }
            let (r, msg): (Salvo?, String?) = await JFY.ler(["--projeto-salvar", txt])
            salvando = false
            if let r { salvou(r.id) } else { aviso = msg }
        }
    }
}
