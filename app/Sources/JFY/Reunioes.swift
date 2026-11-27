import AppKit
import SwiftUI

/// A agenda (Google Agenda principal) em dia, semana e mês: ver, criar, editar e apagar eventos, e o projeto e o
/// contexto de cada reunião para as horas. Quem fala com o Google é o jfy (--agenda-json, --evento-salvar,
/// --evento-apagar, --reuniao-ajuste, --reuniao-preparar).
struct ReunioesTela: View {
    let ativa: Bool
    @ObservedObject var nav: Navegacao
    let irParaJFY: () -> Void

    struct Evento: Decodable, Identifiable, Equatable {
        struct Convidado: Decodable, Equatable {
            let email: String
            let nome, resposta, foto: String?
            let eu: Bool
        }
        let id, titulo, descricao: String
        let ini, fim: Double
        let diaInteiro, euOrganizo, podeEditar, recorrente, palpite: Bool
        let local, link, url, organizador, minhaResposta, p, projeto, cor, contexto: String?
        let convidados: [Convidado]
        let pessoa: String?  // evento da agenda de outra pessoa (o "Reunião com…")
        let pessoaFoto: String?  // a foto dela, no bloco
        /// Os outros convidados (sem você), para as fotos no bloco.
        var outros: [Convidado] { convidados.filter { !$0.eu } }
        var inicio: Date { Date(timeIntervalSince1970: ini) }
        var termino: Date { Date(timeIntervalSince1970: fim) }
        var recusado: Bool { minhaResposta == "declined" }
    }

    struct Projeto: Decodable, Identifiable, Equatable {
        let id, nome: String
        let cor: String?
    }

    struct Agenda: Decodable {
        let eventos: [Evento]
        let projetos: [Projeto]
        let pessoas: [Pessoa]?
    }

    struct Pessoa: Decodable {
        let email: String
        let nome, erro, foto: String?
        let eventos: [Evento]
    }

    /// As cores das pessoas, na ordem em que entram (as mesmas do jfy, CORES_PESSOAS).
    static let coresPessoas = ["#14b8a6", "#f97316", "#ec4899", "#a855f7", "#84cc16", "#eab308", "#06b6d4", "#f43f5e"]

    enum Modo: String, CaseIterable { case dia = "Dia", semana = "Semana", mes = "Mês" }

    @State private var modo = Modo.semana
    @State private var ref = Date()
    @State private var agenda: Agenda?
    @State private var aviso: String?
    @State private var carregando = false
    @State private var aberto: Evento?
    @State private var formulario: FormEvento?
    @AppStorage("agenda.pessoas") private var pessoasTxt = ""  // emails de quem aparece junto (vírgula)
    @State private var buscaPessoa = ""

    private var pessoas: [String] { pessoasTxt.split(separator: ",").map(String.init).filter { $0.contains("@") } }
    private var todos: [Evento] { (agenda?.eventos ?? []) + (agenda?.pessoas ?? []).flatMap(\.eventos) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("Agenda").font(Souv.titulo(24))
                Text(titulo).font(.title3).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail).layoutPriority(-1)
                Spacer()
                if carregando { ProgressView().controlSize(.small) }
                HStack(spacing: 4) {
                    Button { mover(-1) } label: { Image(systemName: "chevron.left") }
                    Button("Hoje") { ref = Date() }
                    Button { mover(1) } label: { Image(systemName: "chevron.right") }
                }
                Segmentos(selecao: $modo, opcoes: Modo.allCases.map { .init(valor: $0, rotulo: $0.rawValue) })
                Button { formulario = FormEvento(inicio: proximaMeiaHora(no: ref)) } label: { Label("Novo evento", systemImage: "plus") }
                    .buttonStyle(.souvPrimario)
                Button { Task { await carregar() } } label: { Image(systemName: "arrow.clockwise") }.help("Atualizar")
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
            if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).padding(.horizontal, 20).padding(.bottom, 8).textSelection(.enabled) }
            reuniaoCom.padding(.horizontal, 20).padding(.bottom, 10)
            Divider()
            switch modo {
            case .mes:
                MesView(ref: ref, eventos: todos, abrir: { aberto = $0 }, irDia: { ref = $0; modo = .dia })
            case .semana:
                GradeHoras(dias: diasDaSemana, eventos: todos, abrir: { aberto = $0 },
                           novo: { formulario = FormEvento(inicio: $0) })
            case .dia:
                GradeHoras(dias: [cal.startOfDay(for: ref)], eventos: todos, abrir: { aberto = $0 },
                           novo: { formulario = FormEvento(inicio: $0) })
            }
        }
        .task(id: "\(ativa)|\(intervalo.0)|\(intervalo.1)|\(pessoasTxt)") { if ativa { await carregar() } }
        .onChange(of: buscaPessoa) {  // a sugestão escolhida (ou a vírgula digitada) fecha o email: vira uma pessoa
            guard buscaPessoa.contains(",") else { return }
            let partes = buscaPessoa.split(separator: ",", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
            let novas = partes.dropLast().compactMap { p -> String? in
                let e = p.components(separatedBy: "<").last?.replacingOccurrences(of: ">", with: "").lowercased() ?? p
                return e.contains("@") ? e : nil
            }
            buscaPessoa = partes.last ?? ""
            let lista = pessoas + novas.filter { !pessoas.contains($0) }
            pessoasTxt = lista.prefix(8).joined(separator: ",")
        }
        .task(id: nav.abrirEvento) {  // o clique na notificação de evento adicionado ou remarcado
            guard let id = nav.abrirEvento else { return }
            nav.abrirEvento = nil
            let (e, msg): (Evento?, String?) = await JFY.ler(["--evento-json", id])
            if let e {
                ref = e.inicio
                aberto = e
            } else {
                aviso = msg
            }
        }
        .sheet(item: $aberto) { e in
            EventoDetalhe(evento: e, projetos: agenda?.projetos ?? [], fechar: { aberto = nil },
                          editar: { aberto = nil; formulario = FormEvento(e) },
                          mudou: { Task { await carregar() } }, irParaJFY: { aberto = nil; irParaJFY() })
                .identidadeSouv()
        }
        .sheet(item: $formulario) { f in
            EventoForm(form: f, fechar: { formulario = nil }, salvou: { formulario = nil; Task { await carregar() } })
                .identidadeSouv()
        }
    }

    // ---------- datas ----------
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "pt_BR")
        c.firstWeekday = 2  // a semana começa na segunda
        return c
    }

    private var diasDaSemana: [Date] {
        let ini = cal.dateInterval(of: .weekOfYear, for: ref)!.start
        return (0..<7).map { cal.date(byAdding: .day, value: $0, to: ini)! }
    }

    /// O período carregado (AAAA-MM-DD, os dois inclusive): no mês, a grade inteira, com as pontas das semanas.
    private var intervalo: (String, String) {
        let iso = { (d: Date) -> String in  // o dia local (o .iso8601 do Swift formataria em UTC)
            let c = cal.dateComponents([.year, .month, .day], from: d)
            return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
        }
        switch modo {
        case .dia: return (iso(ref), iso(ref))
        case .semana: return (iso(diasDaSemana[0]), iso(diasDaSemana[6]))
        case .mes:
            let mes = cal.dateInterval(of: .month, for: ref)!
            let ini = cal.dateInterval(of: .weekOfYear, for: mes.start)!.start
            let fim = cal.dateInterval(of: .weekOfYear, for: mes.end.addingTimeInterval(-1))!.end.addingTimeInterval(-1)
            return (iso(ini), iso(fim))
        }
    }

    private var titulo: String {
        let br = Locale(identifier: "pt_BR")
        switch modo {
        case .dia: return ref.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(br))
        case .semana:
            let d = diasDaSemana
            return "\(d[0].formatted(.dateTime.day().month(.abbreviated).locale(br))) – \(d[6].formatted(.dateTime.day().month(.abbreviated).year().locale(br)))"
        case .mes: return ref.formatted(.dateTime.month(.wide).year().locale(br))
        }
    }

    private func mover(_ n: Int) {
        let unidade: Calendar.Component = modo == .dia ? .day : modo == .semana ? .weekOfYear : .month
        ref = cal.date(byAdding: unidade, value: n, to: ref) ?? ref
    }

    private func proximaMeiaHora(no dia: Date) -> Date {
        let agora = Date()
        let base = cal.isDate(dia, inSameDayAs: agora) ? agora : cal.date(bySettingHour: 9, minute: 0, second: 0, of: dia)!
        let m = cal.component(.minute, from: base)
        return cal.date(byAdding: .minute, value: (30 - m % 30) % 30, to: cal.date(bySetting: .second, value: 0, of: base) ?? base) ?? base
    }

    // ---------- reunião com… ----------
    /// Como o "Reunião com…" do Google: as pessoas escolhidas aparecem junto na agenda, cada uma com a sua cor.
    private var reuniaoCom: some View {
        HStack(spacing: 8) {
            Image(systemName: "person.2").foregroundStyle(Souv.texto2)
            CampoEmails(rotulo: "Reunião com…", texto: $buscaPessoa).frame(width: 320)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(pessoas.enumerated()), id: \.element) { i, email in
                        let info = agenda?.pessoas?.first { $0.email == email }
                        HStack(spacing: 5) {
                            // a foto com o anel na cor da pessoa: a cor é a dos eventos dela na agenda
                            AvatarPessoa(nome: info?.nome, email: email, foto: info?.foto,
                                         cor: Color(hex: Self.coresPessoas[i % Self.coresPessoas.count]), tamanho: 18)
                            Text(info?.nome ?? email.components(separatedBy: "@")[0]).lineLimit(1)
                            if let erro = info?.erro {
                                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange).help(erro)
                            }
                            Button { pessoasTxt = pessoas.filter { $0 != email }.joined(separator: ",") } label: {
                                Image(systemName: "xmark").font(.caption2.weight(.bold))
                            }
                            .buttonStyle(.plain).foregroundStyle(Souv.texto2).help("Tirar da agenda")
                        }
                        .font(.caption)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(Souv.superficie2)).overlay(Capsule().strokeBorder(Souv.borda))
                        .help(email)
                    }
                }
            }
            if pessoas.count > 1 { Button("Limpar") { pessoasTxt = "" }.buttonStyle(.souvLink) }
        }
    }

    // ---------- jfy ----------
    private func carregar() async {
        carregando = true
        defer { carregando = false }
        let (a, msg): (Agenda?, String?) = await JFY.ler(["--agenda-json", intervalo.0, intervalo.1] + (pessoasTxt.isEmpty ? [] : [pessoasTxt]))
        if let a { agenda = a }
        aviso = msg
    }
}

// ---------- grade de horas (dia e semana) ----------
private struct GradeHoras: View {
    let dias: [Date]
    let eventos: [ReunioesTela.Evento]
    let abrir: (ReunioesTela.Evento) -> Void
    let novo: (Date) -> Void

    private let alturaHora: CGFloat = 46
    private let colHora: CGFloat = 48
    private var cal: Calendar { Calendar.current }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Color.clear.frame(width: colHora, height: 1)
                ForEach(dias, id: \.self) { d in
                    let hoje = cal.isDateInToday(d)
                    VStack(spacing: 2) {
                        Text(d.formatted(.dateTime.weekday(.abbreviated).locale(Locale(identifier: "pt_BR")))).font(.caption).foregroundStyle(.secondary)
                        Text("\(cal.component(.day, from: d))").font(.title3.weight(hoje ? .bold : .regular))
                            .foregroundStyle(hoje ? Color.white : .primary)
                            .frame(width: 30, height: 30).background(Circle().fill(hoje ? Souv.primaria : .clear))
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
                }
            }
            let inteiros = dias.map { d in eventos.filter { $0.diaInteiro && cobre($0, d) } }
            if inteiros.contains(where: { !$0.isEmpty }) {
                HStack(alignment: .top, spacing: 0) {
                    Text("dia todo").font(.caption2).foregroundStyle(.secondary).frame(width: colHora)
                    ForEach(Array(dias.enumerated()), id: \.offset) { i, _ in
                        VStack(spacing: 2) { ForEach(inteiros[i]) { e in Chip(evento: e, abrir: abrir) } }
                            .frame(maxWidth: .infinity).padding(.horizontal, 2)
                    }
                }
                .padding(.bottom, 4)
            }
            Divider()
            ScrollViewReader { proxy in
                ScrollView {
                    HStack(alignment: .top, spacing: 0) {
                        VStack(spacing: 0) {
                            ForEach(0..<24, id: \.self) { h in
                                Text(String(format: "%02d:00", h)).font(.caption2).foregroundStyle(.secondary)
                                    .frame(width: colHora, height: alturaHora, alignment: .topTrailing).padding(.trailing, 6).id(h)
                            }
                        }
                        ForEach(dias, id: \.self) { d in coluna(d) }
                    }
                }
                .onAppear { proxy.scrollTo(7, anchor: .top) }
            }
        }
    }

    private func cobre(_ e: ReunioesTela.Evento, _ d: Date) -> Bool {
        let ini = cal.startOfDay(for: d), fim = cal.date(byAdding: .day, value: 1, to: ini)!
        return e.inicio < fim && e.termino > ini
    }

    private func coluna(_ d: Date) -> some View {
        let ini = cal.startOfDay(for: d)
        let doDia = eventos.filter { !$0.diaInteiro && cobre($0, d) }.sorted { $0.ini < $1.ini }
        // faixas para os que se sobrepõem: cada evento na primeira faixa livre
        var fins: [Double] = [], faixa: [String: Int] = [:]
        for e in doDia {
            if let i = fins.firstIndex(where: { $0 <= e.ini }) { fins[i] = e.fim; faixa[e.id] = i } else { faixa[e.id] = fins.count; fins.append(e.fim) }
        }
        let faixas = max(1, fins.count)
        return GeometryReader { g in
            ZStack(alignment: .topLeading) {
                VStack(spacing: 0) {
                    ForEach(0..<24, id: \.self) { _ in
                        Rectangle().fill(Color.clear).frame(height: alturaHora).overlay(alignment: .top) { Divider() }
                    }
                }
                .contentShape(Rectangle())
                .gesture(SpatialTapGesture().onEnded { v in
                    let minutos = Int(v.location.y / alturaHora * 60) / 30 * 30  // meia hora em que clicou
                    novo(cal.date(byAdding: .minute, value: minutos, to: ini)!)
                })
                ForEach(doDia) { e in
                    let topo = max(0, (e.ini - ini.timeIntervalSince1970) / 3600) * Double(alturaHora)
                    let fundo = min(24, (e.fim - ini.timeIntervalSince1970) / 3600) * Double(alturaHora)
                    let w = g.size.width / CGFloat(faixas)
                    Bloco(evento: e, abrir: abrir)
                        .frame(width: max(10, w - 3), height: max(18, CGFloat(fundo - topo) - 2))
                        .offset(x: CGFloat(faixa[e.id] ?? 0) * w + 1, y: CGFloat(topo) + 1)
                }
                if cal.isDateInToday(d) {  // a linha de agora
                    let y = CGFloat(Date().timeIntervalSince(ini) / 3600) * alturaHora
                    Rectangle().fill(Color.red).frame(height: 1.5).offset(y: y)
                    Circle().fill(Color.red).frame(width: 8, height: 8).offset(x: -4, y: y - 3.5)
                }
            }
        }
        .frame(height: alturaHora * 24)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .leading) { Divider() }
    }
}

private func corEvento(_ e: ReunioesTela.Evento) -> Color { e.cor == nil ? Souv.primaria : Color(hex: e.cor) }

private struct Bloco: View {
    let evento: ReunioesTela.Evento
    let abrir: (ReunioesTela.Evento) -> Void
    var body: some View {
        let cor = corEvento(evento)
        Button { abrir(evento) } label: {
            HStack(spacing: 0) {
                Rectangle().fill(cor).frame(width: 3)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(alignment: .top, spacing: 4) {
                        // evento da agenda de outra pessoa ("Reunião com…"): a foto dela na frente, como no Google
                        if let p = evento.pessoa { AvatarPessoa(nome: nil, email: p, foto: evento.pessoaFoto, tamanho: 14) }
                        Text(evento.titulo).font(.caption.weight(.semibold)).lineLimit(2).strikethrough(evento.recusado)
                    }
                    Text("\(evento.inicio.formatted(.dateTime.hour().minute())) – \(evento.termino.formatted(.dateTime.hour().minute()))")
                        .font(.caption2).foregroundStyle(.secondary)
                    // quem vai junto, nas reuniões de 1 h ou mais (nas curtas não cabe): até 4 fotos e o resto em número
                    if evento.pessoa == nil, evento.fim - evento.ini >= 3600, !evento.outros.isEmpty {
                        HStack(spacing: -4) {
                            ForEach(evento.outros.prefix(4), id: \.email) { c in
                                AvatarPessoa(nome: c.nome, email: c.email, foto: c.foto, tamanho: 16)
                                    .overlay(Circle().strokeBorder(Souv.fundo, lineWidth: 1))
                            }
                            if evento.outros.count > 4 {
                                Text("+\(evento.outros.count - 4)").font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary).padding(.leading, 6)
                            }
                        }
                        .padding(.top, 2)
                    }
                }
                .padding(.horizontal, 4).padding(.vertical, 2)
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity, alignment: .top)
            .background(RoundedRectangle(cornerRadius: 5).fill(cor.opacity(0.18)))
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .opacity(evento.recusado ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .help(evento.titulo)
    }
}

private struct Chip: View {
    let evento: ReunioesTela.Evento
    let abrir: (ReunioesTela.Evento) -> Void
    var body: some View {
        Button { abrir(evento) } label: {
            HStack(spacing: 4) {
                if evento.diaInteiro {
                    Text(evento.titulo).lineLimit(1)
                } else {
                    Circle().fill(corEvento(evento)).frame(width: 6, height: 6)
                    Text(evento.inicio.formatted(.dateTime.hour().minute())).foregroundStyle(.secondary)
                    Text(evento.titulo).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .font(.caption)
            .padding(.horizontal, 4).padding(.vertical, 1)
            .background(RoundedRectangle(cornerRadius: 4).fill(evento.diaInteiro ? corEvento(evento).opacity(0.25) : Color.clear))
            .strikethrough(evento.recusado)
            .opacity(evento.recusado ? 0.5 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(evento.titulo)
    }
}

// ---------- mês ----------
private struct MesView: View {
    let ref: Date
    let eventos: [ReunioesTela.Evento]
    let abrir: (ReunioesTela.Evento) -> Void
    let irDia: (Date) -> Void

    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "pt_BR")
        c.firstWeekday = 2
        return c
    }

    var body: some View {
        let mes = cal.dateInterval(of: .month, for: ref)!
        let ini = cal.dateInterval(of: .weekOfYear, for: mes.start)!.start
        let dias = (0..<42).map { cal.date(byAdding: .day, value: $0, to: ini)! }
        let semanas = (0..<6).filter { cal.isDate(dias[$0 * 7], equalTo: ref, toGranularity: .month) || cal.isDate(dias[$0 * 7 + 6], equalTo: ref, toGranularity: .month) }
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(["seg", "ter", "qua", "qui", "sex", "sáb", "dom"], id: \.self) {
                    Text($0).font(.caption.weight(.semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
            }
            Divider()
            ForEach(semanas, id: \.self) { s in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { k in celula(dias[s * 7 + k]) }
                }
                .frame(maxHeight: .infinity)
                Divider()
            }
        }
    }

    private func celula(_ d: Date) -> some View {
        let ini = cal.startOfDay(for: d), fim = cal.date(byAdding: .day, value: 1, to: ini)!
        let doDia = eventos.filter { $0.inicio < fim && $0.termino > ini }.sorted { ($0.diaInteiro ? 0 : 1, $0.ini) < ($1.diaInteiro ? 0 : 1, $1.ini) }
        let noMes = cal.isDate(d, equalTo: ref, toGranularity: .month), hoje = cal.isDateInToday(d)
        return VStack(alignment: .leading, spacing: 2) {
            Button { irDia(d) } label: {
                Text("\(cal.component(.day, from: d))").font(.callout.weight(hoje ? .bold : .regular))
                    .foregroundStyle(hoje ? Color.white : noMes ? .primary : .secondary)
                    .frame(width: 24, height: 24).background(Circle().fill(hoje ? Souv.primaria : .clear))
            }
            .buttonStyle(.plain).help("Abrir o dia")
            ForEach(doDia.prefix(3)) { e in Chip(evento: e, abrir: abrir) }
            if doDia.count > 3 {
                Button("+\(doDia.count - 3)") { irDia(d) }.buttonStyle(.plain).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(noMes ? Color.clear : Color.secondary.opacity(0.05))
        .overlay(alignment: .leading) { Divider() }
    }
}

// ---------- um evento ----------
private struct EventoDetalhe: View {
    let evento: ReunioesTela.Evento
    let projetos: [ReunioesTela.Projeto]
    let fechar: () -> Void
    let editar: () -> Void
    let mudou: () -> Void
    let irParaJFY: () -> Void

    @State private var contexto: String
    @State private var aviso: String?
    @State private var confirmarApagar = false
    @State private var avisarApagar = true
    @State private var outroNome = false
    @State private var textoOutro = ""

    init(evento: ReunioesTela.Evento, projetos: [ReunioesTela.Projeto], fechar: @escaping () -> Void, editar: @escaping () -> Void,
         mudou: @escaping () -> Void, irParaJFY: @escaping () -> Void) {
        (self.evento, self.projetos, self.fechar, self.editar, self.mudou, self.irParaJFY) = (evento, projetos, fechar, editar, mudou, irParaJFY)
        _contexto = State(initialValue: evento.contexto ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Circle().fill(corEvento(evento)).frame(width: 12, height: 12).padding(.top, 6)
                VStack(alignment: .leading, spacing: 4) {
                    Text(evento.titulo).font(.title2.weight(.semibold)).textSelection(.enabled)
                    Text(quando).foregroundStyle(.secondary)
                    if evento.recorrente { Text("Evento recorrente: editar ou apagar vale só para esta ocorrência.").font(.caption).foregroundStyle(.secondary) }
                }
            }
            if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled) }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let l = evento.link, let u = URL(string: l) {
                        Button { NSWorkspace.shared.open(u) } label: { Label("Entrar na chamada", systemImage: "video") }.buttonStyle(.souvPrimario)
                    }
                    if let local = evento.local, !local.hasPrefix("http") { Label(local, systemImage: "mappin.and.ellipse").textSelection(.enabled) }
                    if let org = evento.organizador { Label("Organizado por \(evento.euOrganizo ? "você" : org)", systemImage: "person") }
                    if !evento.convidados.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("CONVIDADOS (\(evento.convidados.count))").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            ForEach(evento.convidados, id: \.email) { c in
                                let r = resposta(c.resposta)
                                HStack(spacing: 8) {
                                    AvatarPessoa(nome: c.nome, email: c.email, foto: c.foto, tamanho: 22)
                                        .overlay(alignment: .bottomTrailing) {  // a resposta no cantinho da foto, como no Google
                                            Image(systemName: r.0).font(.system(size: 9, weight: .bold)).foregroundStyle(r.1)
                                                .background(Circle().fill(Souv.fundo).padding(-1)).offset(x: 3, y: 3)
                                        }
                                    Text((c.nome ?? c.email) + (c.eu ? " (você)" : ""))
                                }
                                .help(c.email)
                            }
                        }
                    }
                    let desc = textoDaDescricao
                    if !desc.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("DESCRIÇÃO").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            Text(desc).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if !evento.diaInteiro && evento.pessoa == nil { paraAsHoras }  // agenda de outra pessoa: não vai para as suas horas
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack {
                if let u = evento.url.flatMap(URL.init(string:)) { Link("Abrir no Google Agenda", destination: u).buttonStyle(.souvLink) }
                Spacer()
                if evento.podeEditar {
                    Button("Apagar", role: .destructive) { confirmarApagar = true }
                    Button("Editar") { editar() }
                }
                Button("Fechar") { fechar() }.keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .frame(width: 560, height: 560)
        .dialogoSouv("Apagar \"\(evento.titulo)\"?", isPresented: $confirmarApagar) {
            Button("Apagar" + (avisarApagar && !semConvidados ? " e avisar os convidados" : ""), role: .destructive) { apagar() }
            if !semConvidados { Button(avisarApagar ? "Apagar sem avisar" : "Apagar e avisar", role: .destructive) { avisarApagar.toggle(); apagar() } }
        } message: {
            Text(evento.recorrente ? "Só esta ocorrência sai da agenda." : "O evento sai da agenda.")
        }
        .dialogoSouv("Projeto no Journify", isPresented: $outroNome) {
            Button("OK") { if !textoOutro.isEmpty { horas(p: textoOutro) } }
        } message: {
            TextField("ex.: Souv", text: $textoOutro).foregroundStyle(Souv.texto).campoSouv()
        }
    }

    /// O projeto e o contexto que vão para as horas (o mesmo registro da aba Horas).
    private var paraAsHoras: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PARA AS HORAS").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            HStack {
                SouvSelect(opcoes: projetos.map { .init(valor: $0.id, rotulo: $0.nome, cor: Color(hex: $0.cor)) }, selecionado: evento.p,
                           vazio: "sem projeto", rotuloLivre: evento.projeto, corLivre: Color(hex: evento.cor),
                           extra: ("Outro nome no Journify…", { textoOutro = ""; outroNome = true })) { horas(p: $0) }
                    .frame(width: 180)
                if evento.palpite { Text("pelo título").font(.caption).foregroundStyle(.secondary).fixedSize() }
                TextField("contexto (vira a descrição nas horas)", text: $contexto).campoSouv()
                    .onSubmit { if let p = evento.p { horas(p: p) } }
                    .disabled(evento.p == nil)
                Button("Preparar com o Claude") { preparar() }.disabled(evento.p == nil).help("Abre numa aba do jfy")
            }
        }
    }

    private var semConvidados: Bool { evento.convidados.filter { !$0.eu }.isEmpty }

    private var quando: String {
        let br = Locale(identifier: "pt_BR")
        if evento.diaInteiro { return evento.inicio.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(br)) + " · dia todo" }
        return evento.inicio.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(br)) + " · "
            + evento.inicio.formatted(.dateTime.hour().minute()) + " – " + evento.termino.formatted(.dateTime.hour().minute())
    }

    /// A descrição do Google vem às vezes em HTML: vira texto.
    private var textoDaDescricao: String {
        var t = evento.descricao.replacingOccurrences(of: "<br>", with: "\n", options: .caseInsensitive)
        t = t.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        return t.replacingOccurrences(of: "&nbsp;", with: " ").replacingOccurrences(of: "&amp;", with: "&").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func resposta(_ r: String?) -> (String, Color) {
        switch r {
        case "accepted": ("checkmark.circle.fill", .green)
        case "declined": ("xmark.circle.fill", .red)
        case "tentative": ("questionmark.circle.fill", .orange)
        default: ("circle", .secondary)
        }
    }

    private func horas(p: String) {
        Task {
            aviso = await JFY.fazer(["--reuniao-ajuste", String(evento.ini), evento.titulo, p, contexto])
            if aviso == nil { mudou() }
        }
    }

    private func preparar() {
        Task { if let e = await JFY.fazer(["--reuniao-preparar", String(evento.ini), evento.titulo]) { aviso = e } else { irParaJFY() } }
    }

    private func apagar() {
        Task {
            if let e = await JFY.fazer(["--evento-apagar", evento.id] + (avisarApagar && !semConvidados ? ["1"] : [])) {
                aviso = e
            } else {
                mudou()
                fechar()
            }
        }
    }
}

// ---------- novo e editar ----------
struct FormEvento: Identifiable {
    let id = UUID()
    var eventoId: String?
    var titulo = ""
    var diaInteiro = false
    var inicio: Date
    var fim: Date
    var local = ""
    var descricao = ""
    var convidados = ""
    var temChamada = false
    var meet = true
    var avisar = true

    init(inicio: Date) {
        self.inicio = inicio
        fim = inicio.addingTimeInterval(1800)
    }

    init(_ e: ReunioesTela.Evento) {
        eventoId = e.id
        titulo = e.titulo
        diaInteiro = e.diaInteiro
        inicio = e.inicio
        fim = e.diaInteiro ? e.termino.addingTimeInterval(-86400) : e.termino  // no dia inteiro, o Google guarda o dia seguinte
        local = e.local ?? ""
        descricao = e.descricao
        convidados = e.convidados.filter { !$0.eu }.map(\.email).joined(separator: ", ")
        temChamada = e.link != nil
        meet = false
    }
}

private struct EventoForm: View {
    @State var form: FormEvento
    let fechar: () -> Void
    let salvou: () -> Void
    @State private var aviso: String?
    @State private var salvando = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(form.eventoId == nil ? "Novo evento" : "Editar evento").font(Souv.titulo(22))
            TextField("Título", text: $form.titulo).campoSouv().font(.title3)
            Toggle("Dia inteiro", isOn: $form.diaInteiro)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) { Text("Início").foregroundStyle(Souv.texto2).frame(width: 44, alignment: .leading); CampoDataSouv(data: $form.inicio, comHora: !form.diaInteiro) }
                HStack(spacing: 8) { Text("Fim").foregroundStyle(Souv.texto2).frame(width: 44, alignment: .leading); CampoDataSouv(data: $form.fim, comHora: !form.diaInteiro) }
            }
            .onChange(of: form.inicio) { antes, depois in form.fim = form.fim.addingTimeInterval(depois.timeIntervalSince(antes)) }  // mantém a duração
            TextField("Local", text: $form.local).campoSouv()
            CampoEmails(rotulo: "Convidados", texto: $form.convidados)
            Text("Descrição").font(.caption).foregroundStyle(.secondary)
            TextEditor(text: $form.descricao).frame(height: 90).campoSouv()
            if !form.temChamada { Toggle("Criar chamada do Google Meet", isOn: $form.meet) }
            if !listaConvidados.isEmpty { Toggle("Mandar o convite (ou a atualização) por email aos convidados", isOn: $form.avisar) }
            if let aviso { Label(aviso, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled) }
            HStack {
                Spacer()
                if salvando { ProgressView().controlSize(.small) }
                Button("Cancelar") { fechar() }.keyboardShortcut(.cancelAction)
                Button(form.eventoId == nil ? "Criar" : "Salvar") { salvar() }
                    .buttonStyle(.souvPrimario).keyboardShortcut(.defaultAction)
                    .disabled(form.titulo.trimmingCharacters(in: .whitespaces).isEmpty || salvando || (!form.diaInteiro && form.fim <= form.inicio))
            }
        }
        .padding(20)
        .frame(width: 560)
    }

    private var listaConvidados: [String] {
        form.convidados.split(whereSeparator: { ",; \n".contains($0) }).map(String.init).filter { $0.contains("@") }
    }

    private func dia(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    private func salvar() {
        var d: [String: Any] = ["titulo": form.titulo, "dia_inteiro": form.diaInteiro, "local": form.local, "descricao": form.descricao,
                                "convidados": listaConvidados, "meet": form.meet, "avisar": form.avisar && !listaConvidados.isEmpty]
        if let id = form.eventoId { d["id"] = id }
        if form.diaInteiro {
            d["ini"] = dia(form.inicio)
            d["fim"] = dia(max(form.fim, form.inicio))
        } else {
            d["ini"] = form.inicio.timeIntervalSince1970
            d["fim"] = form.fim.timeIntervalSince1970
        }
        guard let json = try? JSONSerialization.data(withJSONObject: d), let txt = String(data: json, encoding: .utf8) else { return }
        Task {
            salvando = true
            let (r, msg): (ReunioesTela.Evento?, String?) = await JFY.ler(["--evento-salvar", txt])
            salvando = false
            if r != nil { salvou() } else { aviso = msg }
        }
    }
}
