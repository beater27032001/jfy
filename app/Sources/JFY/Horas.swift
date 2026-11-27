import SwiftUI

/// As horas do dia para o minhas-horas, a mesma tabela do `h` do jfy: o que foi medido (tasks, terminal livre,
/// reuniões), com os seus ajustes, e o que você registra à mão. Quem lê e grava é o jfy (`--horas-json`,
/// `--horas-ajuste`, `--horas-nova`, `--horas-lancar`, este direto pelo MCP do Journify).
struct HorasTela: View {
    let ativa: Bool

    struct Horas: Decodable {
        struct Item: Decodable, Identifiable {
            let kid: String
            let pid, projeto, cor: String?
            let cat, desc: String
            let med, lanc, trabalhado: Int
            let fixo: Int?
            let fora, reuniao, palpite: Bool
            let estado: String?  // com o dia no Journify: "lancada", "mudou" ou "nova"
            var id: String { kid }
        }
        /// O dia como está no Journify (lido de lá): quantos lançamentos, quantas horas e quantos não são de linha nenhuma.
        struct Lancado: Decodable {
            let lancamentos, removidas: Int
            let horas: Double
        }
        struct Projeto: Decodable, Identifiable {
            let id, nome: String
            let cor: String?
        }
        let medido, pelaRegra, total, corrigidas: Int
        let fator: Double
        let itens: [Item]
        let projetos: [Projeto]
        let categorias: [String]
        let lancado: Lancado?
    }

    /// Projeto ou categoria fora da lista: o nome é digitado num alerta. Sem item: é a linha nova.
    private struct PedidoOutro {
        let item: Horas.Item?
        let campo: String
    }

    /// O registro à mão: projeto, categoria, horas e descrição, como as linhas que o jfy mede sozinho.
    private struct Nova {
        var p = "", cat = "", min = "", desc = ""
        var valida: Bool {
            !p.isEmpty && !cat.isEmpty && !min.trimmingCharacters(in: .whitespaces).isEmpty && !desc.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    @State private var dia = Calendar.current.startOfDay(for: Date())
    @State private var horas: Horas?
    @State private var aviso: String?
    @State private var rascunho: [String: String] = [:]  // o que está sendo digitado, por "linha|campo"
    @FocusState private var focado: String?
    @State private var salvando: Set<String> = []  // "linha|campo" gravando agora
    @State private var movendo: String?  // a linha (kid) com o seletor de dia aberto
    @State private var novoDia = Date()
    @State private var levou: (texto: String, dia: Date)?
    @State private var outro: PedidoOutro?
    @State private var textoOutro = ""
    @State private var confirmar = false
    @State private var nova: Nova?
    @State private var gravandoNova = false
    @State private var lancando = false
    @State private var lancou: (feito: String, sobrou: String?)?  // o que o último lançamento fez

    private var hoje: Date { Calendar.current.startOfDay(for: Date()) }
    /// O dia local (AAAA-MM-DD). O .iso8601 do Swift formata em UTC: num fuso adiantado sairia o dia anterior.
    private var iso: String { diaLocal(dia) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            cabecalho
            if let horas { conteudo(horas) } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .padding(24)
        .task(id: "\(ativa)|\(iso)") { if ativa { await carregar() } }
        .onChange(of: iso) { levou = nil; nova = nil; lancou = nil }
        .onChange(of: focado) { antigo, _ in if let antigo { salvar(antigo) } }  // saiu do campo: salva o que ficou
        .dialogoSouv(outro?.campo == "p" ? "Projeto no Journify" : "Categoria", isPresented: Binding(
            get: { outro != nil }, set: { if !$0 { outro = nil } })) {
            Button("OK") {
                if let o = outro, !textoOutro.isEmpty {
                    if let it = o.item { ajustar(it, o.campo, textoOutro) } else if o.campo == "p" { nova?.p = textoOutro } else { nova?.cat = textoOutro }
                }
                outro = nil
            }
        } message: {
            TextField(outro?.campo == "p" ? "ex.: Souv" : "ex.: Pesquisa", text: $textoOutro).foregroundStyle(Souv.texto).campoSouv()
        }
        .dialogoSouv(horas?.lancado == nil
                            ? "Lançar \(fmt(horas?.total ?? 0)) de \(dia.formatted(.dateTime.day().month(.twoDigits))) no Journify?"
                            : "Este dia já tem lançamentos no Journify. Lançar de novo?", isPresented: $confirmar) {
            Button(horas?.lancado == nil ? "Lançar" : "Lançar de novo") { lancar() }
        } message: {
            Text(horas?.lancado == nil
                 ? "Vai direto para o Journify, em segundos: cada linha vira um lançamento no Minhas Horas, ligado à task quando você escolheu isso ao encerrar a task."
                 : "O que já está lá e mudou é editado, e só as linhas novas são criadas, sem duplicar.")
        }
    }

    // ---------- topo: o dia ----------
    private var cabecalho: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Horas").font(Souv.titulo(30))
                Text(dia.formatted(.dateTime.weekday(.wide).day().month(.wide).year().locale(Locale(identifier: "pt_BR"))))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button { mudar(-1) } label: { Image(systemName: "chevron.left") }.help("Dia anterior")
            CampoDataSouv(data: $dia, ate: hoje)
            Button { mudar(1) } label: { Image(systemName: "chevron.right") }.help("Próximo dia").disabled(dia >= hoje)
            Button("Hoje") { dia = hoje }.disabled(dia == hoje)
        }
    }

    private func mudar(_ n: Int) {
        if let d = Calendar.current.date(byAdding: .day, value: n, to: dia), d <= hoje { dia = d }
    }

    // ---------- a tabela ----------
    @ViewBuilder private func conteudo(_ h: Horas) -> some View {
        let vivos = h.itens.filter { !$0.fora }, fora = h.itens.filter(\.fora)
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Lançar").font(.subheadline).foregroundStyle(.secondary)
                Text(fmt(h.total)).font(.title.weight(.semibold)).monospacedDigit()
            }
            if !h.itens.isEmpty {
                Text("trabalhado \(fmt(h.medido))" + (h.corrigidas > 0 ? " (\(h.corrigidas) corrigida\(h.corrigidas == 1 ? "" : "s") à mão)" : "")
                     + " · fator ×\(h.fator.formatted(.number.locale(Locale(identifier: "pt_BR")))) → \(fmt(h.pelaRegra))")
                    .font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
            Button { confirmar = true } label: {
                if lancando {
                    HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Lançando…") }
                } else {
                    Text(h.lancado == nil ? "Lançar no Journify…" : "Lançar de novo…")
                }
            }
            .buttonStyle(.souvPrimario).disabled(vivos.isEmpty || lancando)
        }
        if let l = h.lancado { avisoLancado(l) }
        if let lancou {
            Label(lancou.feito, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            if let s = lancou.sobrou {
                Label(s, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).textSelection(.enabled)
            }
        }
        let semProjeto = vivos.filter { $0.pid == nil }.count
        if semProjeto > 0 {
            Label("\(semProjeto) linha(s) sem projeto: escolha na coluna Projeto antes de lançar.",
                  systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        }
        if let aviso { Label(aviso, systemImage: "info.circle").foregroundStyle(.secondary).textSelection(.enabled) }
        if let levou {
            HStack {
                Label(levou.texto, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                Button("Ver \(levou.dia.formatted(.dateTime.day().month(.twoDigits)))") { dia = levou.dia; self.levou = nil }.buttonStyle(.souvLink)
            }
        }
        if h.itens.isEmpty {
            Text("Nada medido nesse dia: nenhuma task ou terminal livre pelo jfy e nenhuma reunião na agenda.")
                .foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 24)
            linhaNova(h)
            Spacer(minLength: 0)
        } else {
            // linhas próprias, não Table: dentro da Table do macOS (uma NSTableView) o Enter dos campos não chega a eles
            ScrollView {
                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        Text("Projeto").frame(width: 190, alignment: .leading)
                        Text("Categoria").frame(width: 150, alignment: .leading)
                        Text("Trabalhado").frame(width: 140, alignment: .leading)
                        Text("Lança").frame(width: 84, alignment: .leading)
                        Text("Descrição").frame(maxWidth: .infinity, alignment: .leading)
                        Color.clear.frame(width: 52, height: 1)
                    }
                    .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    Divider()
                    ForEach(Array(vivos.enumerated()), id: \.element.id) { i, it in
                        HStack(spacing: 12) {
                            projeto(h, it).frame(width: 190, alignment: .leading)
                            categoria(h, it).frame(width: 150, alignment: .leading)
                            HStack(spacing: 4) {
                                campo(it, "min", atual: hm(it.trabalhado), dica: "1:20").frame(width: 92)
                                if it.fixo != nil {
                                    Image(systemName: "hand.raised").foregroundStyle(.secondary)
                                        .help("Corrigida à mão (o medido era \(hm(it.med))). Apague e salve para voltar ao medido.")
                                }
                            }
                            .frame(width: 140, alignment: .leading)
                            .help("O tempo trabalhado (medido: \(hm(it.med))). Corrija se o medido estiver errado: o fator vale em cima. Enter, clicar fora ou o ✓ salva; vazio volta ao medido; Esc desfaz.")
                            HStack(spacing: 4) {
                                Text(hm(it.lanc)).monospacedDigit().fontWeight(.semibold)
                                    .help("O que vai para o Journify: o trabalhado com a regra (fator, múltiplos de 5)")
                                marcaLancada(it.estado)
                            }
                            .frame(width: 84, alignment: .leading)
                            campo(it, "desc", atual: it.desc, dica: "descrição").frame(maxWidth: .infinity, alignment: .leading)
                            Button { novoDia = dia; movendo = it.kid } label: { Image(systemName: "calendar") }
                                .buttonStyle(.souvIcone).frame(width: 22)
                                .disabled(it.reuniao)
                                .help(it.reuniao ? "Reunião fica no dia em que aconteceu, pela agenda" : "Levar esta linha para outro dia")
                                .popover(isPresented: Binding(get: { movendo == it.kid }, set: { if !$0 { movendo = nil } })) { mudarDia(it) }
                            Button { ajustar(it, "fora", "1") } label: { Image(systemName: "trash") }
                                .buttonStyle(.souvIcone).help("Remover desse dia").frame(width: 22)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(i % 2 == 1 ? Color.secondary.opacity(0.05) : Color.clear)
                    }
                }
                .background(RoundedRectangle(cornerRadius: 10).fill(Souv.superficie))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Souv.borda))
            }
            if !fora.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Removidas desse dia").font(.caption).foregroundStyle(.secondary)
                    ForEach(fora) { it in
                        HStack {
                            Text("\(it.projeto ?? "?") · \(it.desc)").foregroundStyle(.secondary).lineLimit(1)
                            Button("Restaurar") { ajustar(it, "fora", "") }.buttonStyle(.souvLink)
                        }
                    }
                }
            }
            linhaNova(h)
        }
    }

    // ---------- registrar à mão ----------
    /// O botão embaixo da tabela e, aberto, a linha nova com as mesmas colunas. Ela vai para o mesmo registro do dia
    /// que o jfy usa para as tasks: depois dá para editar, levar para outro dia, remover e lançar, como qualquer linha.
    @ViewBuilder private func linhaNova(_ h: Horas) -> some View {
        if let n = nova {
            HStack(spacing: 12) {
                SouvSelect(opcoes: h.projetos.map { .init(valor: $0.id, rotulo: $0.nome, cor: Color(hex: $0.cor)) },
                           selecionado: n.p.isEmpty ? nil : n.p, vazio: "projeto",
                           rotuloLivre: n.p.isEmpty || h.projetos.contains { $0.id == n.p } ? nil : n.p,
                           extra: ("Outro nome no Journify…", { textoOutro = ""; outro = PedidoOutro(item: nil, campo: "p") })) { nova?.p = $0 }
                    .frame(width: 190, alignment: .leading)
                SouvSelect(opcoes: Array(Set(h.categorias + [n.cat])).filter { !$0.isEmpty }.sorted().map { .init(valor: $0, rotulo: $0) },
                           selecionado: n.cat) { nova?.cat = $0 }
                    .frame(width: 150, alignment: .leading)
                TextField("1:20", text: Binding(get: { nova?.min ?? "" }, set: { nova?.min = $0 }))
                    .onSubmit { registrar() }.onExitCommand { nova = nil }
                    .campoSouv().frame(width: 92)
                    .help("1:20, 1h20, 80 (minutos) ou 1,5 (horas). O fator vale em cima, como nas outras linhas.")
                    .frame(width: 140, alignment: .leading)
                Color.clear.frame(width: 84, height: 1)
                TextField("o que você fez", text: Binding(get: { nova?.desc ?? "" }, set: { nova?.desc = $0 }))
                    .onSubmit { registrar() }.onExitCommand { nova = nil }
                    .campoSouv().frame(maxWidth: .infinity)
                if gravandoNova {
                    ProgressView().controlSize(.small).frame(width: 22)
                } else {
                    Button { registrar() } label: { Image(systemName: "checkmark.circle.fill").foregroundStyle(n.valida ? .green : .secondary) }
                        .buttonStyle(.souvIcone).disabled(!n.valida).help("Registrar (Enter)").frame(width: 22)
                }
                Button { nova = nil } label: { Image(systemName: "xmark") }
                    .buttonStyle(.souvIcone).help("Cancelar (Esc)").frame(width: 22)
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 10).fill(Souv.superficie))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Souv.destaque.opacity(0.45)))
        } else {
            Button { nova = Nova(cat: h.categorias.contains("Funcionalidade") ? "Funcionalidade" : h.categorias.first ?? "") } label: {
                Label("Registrar horas à mão", systemImage: "plus.circle")
            }
            .buttonStyle(.souvLink)
            .help("Um trabalho que o jfy não mediu (uma ligação, um trabalho fora do Claude): entra na tabela como as outras linhas")
        }
    }

    private func registrar() {
        guard let n = nova, n.valida, !gravandoNova else { return }
        gravandoNova = true
        Task {
            let r = await JFY.rodar(["--horas-nova", iso, n.p, n.cat, n.min, n.desc])
            gravandoNova = false
            if r.status == 0 {
                nova = nil
                aviso = nil
                await carregar()
            } else {
                aviso = r.erro.trimmingCharacters(in: .whitespacesAndNewlines)  // o que foi digitado fica para corrigir
            }
        }
    }

    private func projeto(_ h: Horas, _ it: Horas.Item) -> some View {
        HStack(spacing: 6) {
            SouvSelect(opcoes: h.projetos.map { .init(valor: $0.id, rotulo: $0.nome, cor: Color(hex: $0.cor)) },
                       selecionado: it.pid, vazio: "sem projeto", rotuloLivre: it.projeto, corLivre: Color(hex: it.cor),
                       extra: ("Outro nome no Journify…", { textoOutro = ""; outro = PedidoOutro(item: it, campo: "p") })) { ajustar(it, "p", $0) }
            if it.palpite { Text("pelo título").font(.caption).foregroundStyle(.secondary).fixedSize() }
        }
    }

    private func categoria(_ h: Horas, _ it: Horas.Item) -> some View {
        SouvSelect(opcoes: Array(Set(h.categorias + [it.cat])).sorted().map { .init(valor: $0, rotulo: $0) }, selecionado: it.cat) { ajustar(it, "cat", $0) }
    }

    /// O seletor de dia de uma linha: o trabalhado vai junto e, se o outro dia já tem a mesma linha, soma. O jfy
    /// confere a soma dos dois dias depois de mexer e, se não fechar, volta tudo como estava.
    private func mudarDia(_ it: Horas.Item) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Levar para outro dia").font(.headline)
            Text(it.desc).foregroundStyle(.secondary).lineLimit(2)
            CalendarioSouv(data: $novoDia, ate: hoje)
            Text("O trabalhado (\(hm(it.trabalhado))) vai junto. Se lá já existe esta mesma linha, os dois somam.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer()
                Button("Cancelar") { movendo = nil }
                Button("Levar para \(novoDia.formatted(.dateTime.day().month(.twoDigits)))") { mover(it, para: novoDia) }
                    .buttonStyle(.souvPrimario)
                    .disabled(Calendar.current.isDate(novoDia, inSameDayAs: dia))
            }
        }
        .padding(16).frame(width: 300)
        .background(Souv.superficie).identidadeSouv()
    }

    private func mover(_ it: Horas.Item, para d: Date) {
        movendo = nil
        let destino = diaLocal(d)
        Task {
            struct Feito: Decodable { let trabalhado: Int; let juntou: Bool }
            let (r, msg): (Feito?, String?) = await JFY.ler(["--horas-mover", iso, it.kid, destino])
            await carregar()
            if let r {
                aviso = nil
                levou = ("Levei \(hm(r.trabalhado)) para \(d.formatted(.dateTime.day().month(.twoDigits)))" + (r.juntou ? ", somando com a mesma linha de lá." : "."),
                         Calendar.current.startOfDay(for: d))
            } else {
                aviso = msg
            }
        }
    }

    /// Campo editável da tabela. Salva com Enter, ao sair do campo ou no ✓ que aparece enquanto há algo não salvo; Esc
    /// desfaz. Antes só o Enter salvava, e dentro da tabela do macOS ele nem sempre chega ao campo.
    private func campo(_ it: Horas.Item, _ campo: String, atual: String, dica: String) -> some View {
        let k = it.kid + "|" + campo
        let pendente = rascunho[k].map { $0 != atual } ?? false
        return HStack(spacing: 4) {
            TextField(dica, text: Binding(get: { rascunho[k] ?? atual }, set: { rascunho[k] = $0 }))
                .focused($focado, equals: k)
                .onSubmit { salvar(k) }
                .onExitCommand {
                    rascunho[k] = nil
                    focado = nil
                }
                .campoSouv(foco: focado == k)
            if salvando.contains(k) {
                ProgressView().controlSize(.small).help("Salvando…")
            } else if pendente {
                Button { salvar(k) } label: { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                    .buttonStyle(.souvIcone).help("Salvar (Enter). Esc desfaz.")
            }
        }
    }

    /// Grava o que foi digitado num campo ("linha|campo"), se mudou. O campo segue mostrando o que você digitou até o
    /// jfy devolver o dia recarregado (antes voltava ao valor antigo nesse meio-tempo e parecia que não tinha salvo);
    /// se o jfy recusar, o texto fica para você corrigir, com o aviso.
    private func salvar(_ k: String) {
        guard !salvando.contains(k), let v = rascunho[k], let i = k.lastIndex(of: "|"),
              let it = horas?.itens.first(where: { $0.kid == String(k[..<i]) }) else { return }
        let campo = String(k[k.index(after: i)...])
        guard v != (campo == "min" ? hm(it.trabalhado) : it.desc) else {
            rascunho[k] = nil
            return
        }
        salvando.insert(k)
        Task {
            let r = await JFY.rodar(["--horas-ajuste", iso, it.kid, campo, v])
            await carregar()
            salvando.remove(k)
            if r.status == 0 {
                if rascunho[k] == v { rascunho[k] = nil }  // agora o valor vem do jfy
            } else {
                aviso = r.erro.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
    }

    // ---------- jfy ----------
    private func carregar() async {
        let r = await JFY.rodar(["--horas-json", iso])
        let erro = r.erro.trimmingCharacters(in: .whitespacesAndNewlines)
        guard r.status == 0 else {
            aviso = erro.isEmpty ? "jfy --horas-json falhou (código \(r.status))" : erro
            return
        }
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        do {
            horas = try d.decode(Horas.self, from: Data(r.saida.utf8))
            aviso = erro.isEmpty ? nil : erro  // ex.: agenda fora, as reuniões não entraram
        } catch {
            aviso = "Não entendi a resposta do jfy --horas-json: \(error)"
        }
    }

    private func ajustar(_ it: Horas.Item, _ campo: String, _ valor: String) {
        Task {
            let r = await JFY.rodar(["--horas-ajuste", iso, it.kid, campo, valor])
            await carregar()
            if r.status != 0 { aviso = r.erro.trimmingCharacters(in: .whitespacesAndNewlines) }
        }
    }

    /// Lança o dia pelo MCP (o jfy edita o que já está lá e mudou e cria o resto) e diz o que fez. O que está no
    /// Journify sem ser linha da tabela o jfy não apaga: vira o aviso laranja.
    private func lancar() {
        struct Feito: Decodable {
            struct Sobra: Decodable { let atividade: String?; let horas: Double }
            let novas, editadas, iguais: Int
            let sobrando: [Sobra]
        }
        lancando = true
        lancou = nil
        Task {
            let (r, msg): (Feito?, String?) = await JFY.ler(["--horas-lancar", iso])
            await carregar()  // antes do aviso: o carregar limpa o aviso
            lancando = false
            if let r {
                let feito = "Lançado no Journify: " + qtd(r.novas, "nova", "novas") + ", " + qtd(r.editadas, "editada", "editadas")
                    + (r.iguais > 0 ? ", " + qtd(r.iguais, "já estava igual", "já estavam iguais") : "") + "."
                let sobrou = r.sobrando.isEmpty ? nil
                    : "No Journify há " + qtd(r.sobrando.count, "lançamento", "lançamentos") + " desse dia que não "
                    + (r.sobrando.count == 1 ? "está" : "estão") + " na tabela: "
                    + r.sobrando.map { "\($0.atividade ?? "sem descrição") (\(num($0.horas)) h)" }.joined(separator: "; ")
                    + ". O jfy não apaga: tire pelo Minhas Horas se não deviam estar lá."
                lancou = (feito, sobrou)
            } else {
                aviso = msg
            }
        }
    }

    // ---------- já lançado ----------
    /// O dia já tem lançamentos no Journify: avisa antes de alguém lançar de novo (as marcas da coluna Lança dizem o quê).
    private func avisoLancado(_ l: Horas.Lancado) -> some View {
        Label {
            Text("Este dia já tem " + qtd(l.lancamentos, "lançamento", "lançamentos") + " no Journify (\(num(l.horas)) h). "
                 + "✓ igual, ✎ mudou, + nova: lançar de novo edita o que mudou, sem duplicar."
                 + (l.removidas > 0 ? " " + qtd(l.removidas, "lançamento de lá não está", "lançamentos de lá não estão") + " na tabela." : ""))
        } icon: { Image(systemName: "checkmark.seal.fill").foregroundStyle(Souv.destaque) }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Souv.primaria.opacity(0.12)))
    }

    @ViewBuilder private func marcaLancada(_ estado: String?) -> some View {
        switch estado {
        case "lancada": Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).help("Já está no Journify assim")
        case "mudou": Image(systemName: "pencil.circle.fill").foregroundStyle(.orange)
            .help("No Journify com outras horas ou outra categoria: lançar de novo edita o que está lá")
        case "nova": Image(systemName: "plus.circle.fill").foregroundStyle(Souv.primaria).help("Nova: ainda não está no Journify")
        default: EmptyView()
        }
    }

    // ---------- formatos ----------
    /// Horas do Journify (decimais) com vírgula: 6,5.
    private func num(_ h: Double) -> String { h.formatted(.number.precision(.fractionLength(0...2)).locale(Locale(identifier: "pt_BR"))) }
    private func hm(_ m: Int) -> String { "\(m / 60):" + String(format: "%02d", m % 60) }
    private func fmt(_ m: Int) -> String { m >= 60 ? "\(m / 60)h " + String(format: "%02d", m % 60) + "min" : "\(m)min" }
}

/// "1 nova", "2 novas".
func qtd(_ n: Int, _ um: String, _ varios: String) -> String { "\(n) " + (n == 1 ? um : varios) }
