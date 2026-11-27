import AppKit
import SwiftUI

/// A identidade visual da Souv (manual "Identidade Visual Souv" v1, GLV Brands, 2024): a paleta do manual nos dois modos
/// do macOS, as fontes (Lexend fina nos títulos, Roboto no texto, embutidas no app) e o select. No escuro, como os
/// produtos da Souv: fundo Midnight Blue, destaque Eletric Cyan. No claro, fundo Cloud White e destaque Vivid Blue (o
/// ciano some no branco). Os botões principais são Vivid Blue nos dois.
enum Souv {
    static let fundo = Color(claro: 0xF7F7F7, escuro: 0x0A0E2D)        // Cloud White / Midnight Blue
    static let superficie = Color(claro: 0xFFFFFF, escuro: 0x12183A)   // cartões
    static let superficie2 = Color(claro: 0xEEF0F7, escuro: 0x1C244A)  // campos, selects
    static let borda = Color(claro: 0xDCE0EC, escuro: 0x272F53)
    static let texto = Color(claro: 0x0A0E2D, escuro: 0xF7F7F7)
    static let texto2 = Color(claro: 0x616161, escuro: 0xB0B0B0)       // Slate Gray / Silver Gray
    static let primaria = Color(claro: 0x2054E1, escuro: 0x2054E1)     // Vivid Blue
    static let destaque = Color(claro: 0x2054E1, escuro: 0x61FAFA)     // foco e seleção: Vivid Blue / Eletric Cyan
    static let indigo = Color(claro: 0x0D2369, escuro: 0x0D2369)       // Indigo Blue
    static let perigo = Color(claro: 0xD93A3F, escuro: 0xF2555A)        // apagar, encerrar: fora da paleta, só para o alerta
    /// A barra lateral: o fundo da Souv um pouco transparente, sobre o material do macOS (ou a mesa, em tela cheia).
    static let barraLateral = Color(nsColor: NSColor(name: nil) { ap in
        ap.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(srgbRed: 10 / 255, green: 14 / 255, blue: 45 / 255, alpha: 0.82)
            : NSColor(srgbRed: 238 / 255, green: 240 / 255, blue: 247 / 255, alpha: 0.85)
    })

    /// Títulos: Lexend fina, como no manual.
    static func titulo(_ tamanho: CGFloat = 28) -> Font { .custom("Lexend", size: tamanho).weight(.light) }
    /// Texto: Roboto.
    static func corpo(_ tamanho: CGFloat = 13) -> Font { .custom("Roboto", size: tamanho) }

    /// O símbolo da Souv, que vem dentro do app. Vai como molde: pinte com Souv.destaque (ciano no escuro, Vivid Blue no
    /// claro, onde o ciano some no branco).
    static let simbolo = molde("souv-simbolo")
    /// O nome "souv." do logotipo, também como molde (pinte com Souv.texto).
    static let nome = molde("souv-nome")

    private static func molde(_ nome: String) -> NSImage? {
        let img = Bundle.main.url(forResource: nome, withExtension: "svg").flatMap(NSImage.init(contentsOf:))
        img?.isTemplate = true
        return img
    }
}

/// A marca na barra superior: o símbolo e o nome da Souv, e JFY.
struct MarcaJFY: View {
    var body: some View {
        HStack(spacing: 8) {
            if let s = Souv.simbolo {
                Image(nsImage: s).resizable().interpolation(.high).foregroundStyle(Souv.destaque).frame(width: 20, height: 20)
            }
            if let n = Souv.nome {  // 458 × 124 no desenho
                Image(nsImage: n).resizable().interpolation(.high).foregroundStyle(Souv.texto).frame(width: 52, height: 14)
            }
            Rectangle().fill(Souv.borda).frame(width: 1, height: 16)
            Text("JFY").font(.custom("Lexend", size: 15).weight(.medium)).tracking(2).foregroundStyle(Souv.texto)
        }
        .padding(.horizontal, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("souv JFY")
    }
}

extension Color {
    /// Uma cor para o modo claro e outra para o escuro, que troca sozinha com o macOS.
    init(claro: UInt32, escuro: UInt32) {
        self.init(nsColor: NSColor(name: nil) { ap in
            let h = ap.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? escuro : claro
            return NSColor(srgbRed: CGFloat(h >> 16 & 255) / 255, green: CGFloat(h >> 8 & 255) / 255,
                           blue: CGFloat(h & 255) / 255, alpha: 1)
        })
    }
}

/// O select da Souv: o valor escolhido (com a bolinha de cor, quando tem) num campo arredondado; o clique abre a lista,
/// com a marca no escolhido. `extra` é uma ação no fim da lista ("Outro nome…"); `rotuloLivre` aparece quando o valor
/// atual não está entre as opções (um nome livre, por exemplo).
struct SouvSelect<Valor: Hashable>: View {
    struct Opcao: Identifiable {
        let valor: Valor
        let rotulo: String
        var cor: Color?
        var foto: URL?  // a foto da conta (GitHub), redonda, no lugar da bolinha
        var id: Valor { valor }
    }

    let opcoes: [Opcao]
    let selecionado: Valor?
    var vazio = "Escolher"
    var rotuloLivre: String?
    var corLivre: Color?
    var extra: (String, () -> Void)?
    var semBusca = false  // lista curta de números (as horas): sem a busca
    let escolher: (Valor) -> Void

    @State private var aberto = false
    @State private var busca = ""

    private var atual: Opcao? { opcoes.first { $0.valor == selecionado } }
    /// Lista longa (os 36 projetos do Journify) ganha a busca; sem acento e sem maiúscula.
    private var comBusca: Bool { opcoes.count > 12 && !semBusca }
    private var visiveis: [Opcao] {
        let b = busca.trimmingCharacters(in: .whitespaces)
        return b.isEmpty ? opcoes : opcoes.filter { $0.rotulo.range(of: b, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
    }

    private func pegar(_ o: Opcao) {
        aberto = false
        if o.valor != selecionado { escolher(o.valor) }
    }

    var body: some View {
        Button { busca = ""; aberto.toggle() } label: {
            HStack(spacing: 6) {
                if let c = atual?.cor ?? (atual == nil && rotuloLivre != nil ? corLivre : nil) { Circle().fill(c).frame(width: 8, height: 8) }
                if let f = atual?.foto { FotoConta(url: f) }
                Text(atual?.rotulo ?? rotuloLivre ?? vazio)
                    .foregroundStyle(atual == nil && rotuloLivre == nil ? Souv.texto2 : Souv.texto).lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).foregroundStyle(Souv.texto2)
            }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 8).fill(Souv.superficie2))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(aberto ? Souv.destaque : Souv.borda, lineWidth: aberto ? 1.5 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .popover(isPresented: $aberto, arrowEdge: .bottom) {
            VStack(spacing: 0) {
                if comBusca {
                    TextField("Buscar", text: $busca).campoSouv()
                        .onSubmit { if let o = visiveis.first { pegar(o) } }  // Enter escolhe o primeiro
                        .padding([.horizontal, .top], 8)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(visiveis) { o in
                            LinhaSelect(cor: o.cor, rotulo: o.rotulo, marcado: o.valor == selecionado, foto: o.foto) { pegar(o) }
                        }
                        if visiveis.isEmpty { Text("Nada com \"\(busca)\"").foregroundStyle(Souv.texto2).padding(10) }
                        if let extra {
                            Divider().padding(.vertical, 3)
                            LinhaSelect(cor: nil, rotulo: extra.0, marcado: false, apagado: true) {
                                aberto = false
                                extra.1()
                            }
                        }
                    }
                    .padding(6)
                }
            }
            .frame(minWidth: 240, maxHeight: 380)
            .background(Souv.superficie)
        }
    }
}

/// Uma linha da lista do select, com o realce da Souv ao passar o mouse.
struct LinhaSelect: View {
    let cor: Color?
    let rotulo: String
    let marcado: Bool
    var apagado = false
    var foto: URL?
    var icone: String?
    let acao: () -> Void
    @State private var sobre = false

    var body: some View {
        Button(action: acao) {
            HStack(spacing: 8) {
                if let cor { Circle().fill(cor).frame(width: 8, height: 8) }
                if let foto { FotoConta(url: foto) }
                if let icone { Image(systemName: icone).foregroundStyle(Souv.destaque).frame(width: 16) }
                Text(rotulo).foregroundStyle(apagado ? Souv.texto2 : Souv.texto).lineLimit(1)
                Spacer(minLength: 12)
                if marcado { Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(Souv.destaque) }
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 6).fill(sobre ? Souv.primaria.opacity(0.14) : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { sobre = $0 }
    }
}

/// A foto redonda de uma conta (github.com/<login>.png), com um círculo vazio enquanto carrega.
struct FotoConta: View {
    let url: URL
    var tamanho: CGFloat = 18

    var body: some View {
        AsyncImage(url: url) { $0.resizable() } placeholder: { Circle().fill(Souv.superficie2) }
            .frame(width: tamanho, height: tamanho).clipShape(Circle())
    }
}

/// O menu do clique direito na identidade da Souv: o mesmo conteúdo do .contextMenu (botões, Divider), num popover
/// aberto onde você clicou, com as linhas do select. O .contextMenu do SwiftUI é o menu do macOS, que não segue as cores
/// do app. `se` falso: sem menu (o .contextMenu vazio também não abria nada).
struct MenuSouv<Itens: View>: ViewModifier {
    var se = true
    @ViewBuilder let itens: () -> Itens
    @State private var onde: UnitPoint?

    func body(content: Content) -> some View {
        if se {
            content
                .overlay(CliqueDireito { onde = $0 })
                .popover(isPresented: Binding(get: { onde != nil }, set: { if !$0 { onde = nil } }),
                         attachmentAnchor: .point(onde ?? .center), arrowEdge: .trailing) {
                    ListaMenuSouv(itens: itens(), fechar: { onde = nil })
                }
        } else {
            content
        }
    }
}

/// Um botão que abre um menu da Souv (no lugar do Menu do SwiftUI, que é o do macOS): o rótulo com a setinha e, no
/// clique, a lista num popover.
struct MenuBotaoSouv<Rotulo: View, Itens: View>: View {
    @ViewBuilder let itens: () -> Itens
    @ViewBuilder let label: () -> Rotulo
    @State private var aberto = false

    var body: some View {
        Button { aberto.toggle() } label: {
            HStack(spacing: 5) {
                label()
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold)).foregroundStyle(Souv.texto2)
            }
        }
        .popover(isPresented: $aberto, arrowEdge: .bottom) { ListaMenuSouv(itens: itens(), fechar: { aberto = false }) }
    }
}

extension MenuBotaoSouv where Rotulo == Text {
    init(_ titulo: String, @ViewBuilder itens: @escaping () -> Itens) {
        self.init(itens: itens) { Text(titulo) }
    }
}

/// O corpo dos menus da Souv: cada botão vira uma linha com o realce ao passar o mouse, e o clique fecha o menu.
private struct ListaMenuSouv<Itens: View>: View {
    let itens: Itens
    let fechar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 1) { itens }
            .buttonStyle(ItemMenuSouv())
            .environment(\.fecharMenuSouv, fechar)
            .padding(6).frame(minWidth: 210, alignment: .leading)
            .background(Souv.superficie)
    }
}

private struct FecharMenuSouv: EnvironmentKey { static let defaultValue: (() -> Void)? = nil }
extension EnvironmentValues {
    var fecharMenuSouv: (() -> Void)? {
        get { self[FecharMenuSouv.self] }
        set { self[FecharMenuSouv.self] = newValue }
    }
}

/// Uma linha de menu: o realce da Souv por cima, vermelho no que apaga. Fecha o menu antes de rodar a ação, para a ação
/// poder abrir um modal.
struct ItemMenuSouv: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Corpo(configuration: configuration) }

    private struct Corpo: View {
        let configuration: PrimitiveButtonStyleConfiguration
        @Environment(\.fecharMenuSouv) private var fechar
        @Environment(\.isEnabled) private var ativo
        @State private var sobre = false

        var body: some View {
            Button {
                fechar?()
                DispatchQueue.main.async { configuration.trigger() }
            } label: {
                HStack(spacing: 8) {
                    configuration.label.lineLimit(1)
                    Spacer(minLength: 12)
                }
                .foregroundStyle(configuration.role == .destructive ? Souv.perigo : Souv.texto)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 6).fill(sobre && ativo ? Souv.primaria.opacity(0.14) : .clear))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(ativo ? 1 : 0.4)
            .onHover { sobre = $0 }
        }
    }
}

/// Pega só o clique direito (e o Control-clique) e diz onde foi, de 0 a 1 na view; o clique normal passa por baixo.
struct CliqueDireito: NSViewRepresentable {
    let acao: (UnitPoint) -> Void

    func makeNSView(context: Context) -> Alvo { Alvo() }
    func updateNSView(_ v: Alvo, context: Context) { v.acao = acao }

    final class Alvo: NSView {
        var acao: ((UnitPoint) -> Void)?

        private func direito(_ e: NSEvent?) -> Bool {
            e?.type == .rightMouseDown || (e?.type == .leftMouseDown && e?.modifierFlags.contains(.control) == true)
        }
        override func hitTest(_ p: NSPoint) -> NSView? { direito(NSApp.currentEvent) ? super.hitTest(p) : nil }
        override func rightMouseDown(with e: NSEvent) { abrir(e) }
        override func mouseDown(with e: NSEvent) { if direito(e) { abrir(e) } }

        private func abrir(_ e: NSEvent) {
            let p = convert(e.locationInWindow, from: nil)
            guard bounds.width > 0, bounds.height > 0 else { return }
            acao?(UnitPoint(x: p.x / bounds.width, y: isFlipped ? p.y / bounds.height : 1 - p.y / bounds.height))
        }
    }
}

extension View {
    /// O clique direito abre o menu da Souv com estes itens (veja MenuSouv).
    func menuSouv<I: View>(se: Bool = true, @ViewBuilder _ itens: @escaping () -> I) -> some View {
        modifier(MenuSouv(se: se, itens: itens))
    }

    /// As interações da Souv em tudo que está dentro: o botão padrão, a caixa de marcar e a cor de destaque. Vai na raiz
    /// do app e em cada sheet e popover (o que abre por cima nem sempre herda o estilo).
    func identidadeSouv() -> some View {
        buttonStyle(BotaoSouv()).toggleStyle(CaixaSouv()).tint(Souv.primaria)
    }

    /// Campo de texto (TextField, SecureField, TextEditor) da Souv: superfície, borda e, no foco, a borda de destaque
    /// no lugar do anel de foco do macOS (que vem na cor de destaque do sistema, não na do app).
    /// `foco`: quem já tem o .focused no campo diz se ele está em foco (dois .focused no mesmo campo brigam).
    func campoSouv(foco: Bool? = nil) -> some View { modifier(CampoSouv(foco: foco)) }

    /// Um modal de confirmação da Souv no lugar do .confirmationDialog e do .alert do macOS, com a mesma chamada: os
    /// botões (o que apaga em vermelho, com role: .destructive) e a mensagem, que também pode ter um campo de texto.
    /// Todo botão fecha o modal; Cancelar (Esc) vem sozinho.
    func dialogoSouv<A: View, M: View>(_ titulo: String, isPresented: Binding<Bool>, @ViewBuilder actions: @escaping () -> A,
                                       @ViewBuilder message: @escaping () -> M) -> some View {
        sheet(isPresented: isPresented) { DialogoSouv(titulo: titulo, acoes: actions(), mensagem: message()) }
    }

    func dialogoSouv<A: View>(_ titulo: String, isPresented: Binding<Bool>, @ViewBuilder actions: @escaping () -> A) -> some View {
        dialogoSouv(titulo, isPresented: isPresented, actions: actions) { EmptyView() }
    }

    func dialogoSouv<T, A: View, M: View>(_ titulo: String, isPresented: Binding<Bool>, presenting dado: T?,
                                          @ViewBuilder actions: @escaping (T) -> A, @ViewBuilder message: @escaping (T) -> M) -> some View {
        sheet(isPresented: isPresented) {
            if let dado { DialogoSouv(titulo: titulo, acoes: actions(dado), mensagem: message(dado)) }
        }
    }

    /// Uma linha de lista na identidade da Souv: o clique escolhe; a escolhida ganha o fundo Vivid Blue suave e a
    /// barrinha de destaque, e o mouse por cima, um realce leve. Fica no lugar da seleção do List, que pinta com a cor
    /// de destaque do macOS (e cinza fora de foco), não com a do app.
    func linhaSouv(_ marcada: Bool, _ escolher: @escaping () -> Void) -> some View {
        modifier(LinhaSouv(marcada: marcada, escolher: escolher))
    }

    /// Lista sem o fundo do sistema, sobre uma cor da Souv (as colunas laterais na superfície; o meio da tela no fundo).
    func listaSouv(_ fundo: Color = Souv.superficie) -> some View {
        scrollContentBackground(.hidden).background(fundo)
    }
}

struct LinhaSouv: ViewModifier {
    let marcada: Bool
    let escolher: () -> Void
    @State private var sobre = false

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture(perform: escolher)
            .onHover { sobre = $0 }
            .listRowBackground(
                RoundedRectangle(cornerRadius: 8)
                    .fill(marcada ? Souv.primaria.opacity(0.22) : sobre ? Souv.texto.opacity(0.05) : .clear)
                    .overlay(alignment: .leading) {
                        if marcada { Capsule().fill(Souv.destaque).frame(width: 3).padding(.vertical, 7) }
                    }
                    .padding(.horizontal, 6).padding(.vertical, 1))
    }
}


// ---------- botões, campos, caixas, segmentos, modal e calendário da Souv ----------
/// Os botões da Souv: secundário (superfície com borda, o padrão do app), primário (Vivid Blue cheio), perigo
/// (vermelho, para apagar; o role: .destructive já vira perigo), link (texto na cor de destaque, sublinha ao passar o
/// mouse) e ícone (sem fundo, acende ao passar o mouse).
struct BotaoSouv: ButtonStyle {
    enum Tipo { case secundario, primario, perigo, link, icone }
    var tipo = Tipo.secundario

    func makeBody(configuration: Configuration) -> some View {
        Corpo(tipo: configuration.role == .destructive && tipo == .secundario ? .perigo : tipo, configuration: configuration)
    }

    private struct Corpo: View {
        let tipo: Tipo
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var ativo
        @Environment(\.controlSize) private var tamanho
        @State private var sobre = false

        private var pequeno: Bool { tamanho == .small || tamanho == .mini }
        private var fundo: Color {
            switch tipo {
            case .primario: Souv.primaria
            case .perigo: Souv.perigo
            default: sobre && ativo ? Souv.primaria.opacity(0.12) : Souv.superficie2
            }
        }

        var body: some View {
            switch tipo {
            case .link:
                configuration.label.foregroundStyle(Souv.destaque).underline(sobre && ativo)
                    .opacity(ativo ? (configuration.isPressed ? 0.6 : 1) : 0.4)
                    .contentShape(Rectangle()).onHover { sobre = $0 }.pointerStyle(.link)
            case .icone:
                configuration.label.foregroundStyle(sobre && ativo ? Souv.destaque : Souv.texto2)
                    .opacity(ativo ? (configuration.isPressed ? 0.6 : 1) : 0.35)
                    .contentShape(Rectangle()).onHover { sobre = $0 }
            default:
                configuration.label
                    .lineLimit(1)
                    .padding(.horizontal, pequeno ? 8 : 12).padding(.vertical, pequeno ? 3 : 5)
                    .foregroundStyle(tipo == .secundario ? Souv.texto : .white)
                    .background(RoundedRectangle(cornerRadius: 8).fill(fundo))
                    .overlay(RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(tipo == .secundario ? (sobre && ativo ? Souv.destaque.opacity(0.5) : Souv.borda) : .white.opacity(sobre && ativo ? 0.25 : 0)))
                    .brightness(configuration.isPressed ? -0.08 : 0)
                    .opacity(ativo ? 1 : 0.45)
                    .contentShape(RoundedRectangle(cornerRadius: 8))
                    .onHover { sobre = $0 }
            }
        }
    }
}

extension ButtonStyle where Self == BotaoSouv {
    static var souvPrimario: BotaoSouv { .init(tipo: .primario) }
    static var souvPerigo: BotaoSouv { .init(tipo: .perigo) }
    static var souvLink: BotaoSouv { .init(tipo: .link) }
    static var souvIcone: BotaoSouv { .init(tipo: .icone) }
}

struct CampoSouv: ViewModifier {
    var foco: Bool?
    @FocusState private var focado: Bool

    func body(content: Content) -> some View {
        let aceso = foco ?? focado
        Group {
            if foco == nil { content.focused($focado) } else { content }
        }
        .textFieldStyle(.plain)
        .scrollContentBackground(.hidden)
        .focusEffectDisabled()
        .padding(.horizontal, 8).padding(.vertical, 5)
        .background(RoundedRectangle(cornerRadius: 8).fill(Souv.superficie2))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(aceso ? Souv.destaque : Souv.borda, lineWidth: aceso ? 1.5 : 1))
    }
}

/// A caixa de marcar da Souv: quadradinho com a borda; marcado, Vivid Blue com o visto branco.
struct CaixaSouv: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(configuration.isOn ? Souv.primaria : Souv.superficie2)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(configuration.isOn ? .clear : Souv.borda))
                    .overlay {
                        if configuration.isOn { Image(systemName: "checkmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(.white) }
                    }
                    .frame(width: 15, height: 15)
                configuration.label
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// O seletor segmentado da Souv (o .segmented do macOS pinta com a cor do sistema): as opções numa faixa, a escolhida
/// em Vivid Blue. `cheio` divide a largura toda entre as opções.
struct Segmentos<Valor: Hashable>: View {
    struct Opcao {
        let valor: Valor
        var rotulo = ""
        var icone: String?
        var ajuda: String?
    }

    @Binding var selecao: Valor
    let opcoes: [Opcao]
    var cheio = false
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 2) {
            ForEach(opcoes.indices, id: \.self) { i in
                let o = opcoes[i], marcado = o.valor == selecao
                Button { withAnimation(.snappy(duration: 0.18)) { selecao = o.valor } } label: {
                    HStack(spacing: 5) {
                        if let ic = o.icone { Image(systemName: ic) }
                        if !o.rotulo.isEmpty { Text(o.rotulo).lineLimit(1) }
                    }
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .frame(maxWidth: cheio ? .infinity : nil)
                    .foregroundStyle(marcado ? Color.white : Souv.texto2)
                    .background {
                        if marcado { RoundedRectangle(cornerRadius: 6).fill(Souv.primaria).matchedGeometryEffect(id: "escolhido", in: ns) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(o.ajuda ?? o.rotulo)
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 8).fill(Souv.superficie2))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Souv.borda))
        .fixedSize(horizontal: !cheio, vertical: true)
    }
}

/// O modal de confirmação (veja dialogoSouv): título em Lexend, a mensagem, Cancelar e os botões do pedido.
struct DialogoSouv<Acoes: View, Mensagem: View>: View {
    let titulo: String
    let acoes: Acoes
    let mensagem: Mensagem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(titulo).font(Souv.titulo(20)).foregroundStyle(Souv.texto).fixedSize(horizontal: false, vertical: true)
            mensagem.font(.callout).foregroundStyle(Souv.texto2).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Spacer()
                Button("Cancelar") { dismiss() }.keyboardShortcut(.cancelAction)
                acoes.buttonStyle(BotaoDialogo())
            }
            .padding(.top, 4)
        }
        .padding(22)
        .frame(width: 440, alignment: .leading)
        .background(Souv.fundo)
        .identidadeSouv()
    }
}

/// Botão do modal: primário (Enter) ou, se apaga, perigo (sem Enter, para não apagar sem querer); o clique fecha o modal.
private struct BotaoDialogo: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Corpo(configuration: configuration) }

    private struct Corpo: View {
        let configuration: PrimitiveButtonStyleConfiguration
        @Environment(\.dismiss) private var dismiss

        var body: some View {
            let apaga = configuration.role == .destructive
            Button { configuration.trigger(); dismiss() } label: { configuration.label }
                .buttonStyle(BotaoSouv(tipo: apaga ? .perigo : .primario))
                .keyboardShortcut(apaga ? nil : .defaultAction)
        }
    }
}

/// O calendário da Souv: o mês com a semana começando no domingo, o dia escolhido em Vivid Blue e hoje com o anel de
/// destaque. Mantém a hora da data. `ate` bloqueia os dias depois dele (as horas não vão para o futuro); `desde`, os de
/// antes (a mensagem programada não vai para o passado).
struct CalendarioSouv: View {
    @Binding var data: Date
    var ate: Date?
    var desde: Date?
    var escolheu: (() -> Void)?
    @State private var mes: Date?

    private static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "pt_BR")
        return c
    }()
    private var cal: Calendar { Self.cal }
    private var mostrado: Date { mes ?? inicioDoMes(data) }

    private func inicioDoMes(_ d: Date) -> Date { cal.date(from: cal.dateComponents([.year, .month], from: d)) ?? d }

    var body: some View {
        let primeiro = mostrado
        let vazios = (cal.component(.weekday, from: primeiro) - cal.firstWeekday + 7) % 7
        let dias = cal.range(of: .day, in: .month, for: primeiro)?.count ?? 30
        let limite = ate.map { cal.startOfDay(for: $0) }, inicio = desde.map { cal.startOfDay(for: $0) }
        let proximo = cal.date(byAdding: .month, value: 1, to: primeiro) ?? primeiro
        VStack(spacing: 8) {
            HStack {
                Button { mes = cal.date(byAdding: .month, value: -1, to: primeiro) } label: { Image(systemName: "chevron.left") }
                    .buttonStyle(.souvIcone).disabled(inicio.map { primeiro <= $0 } ?? false)
                Spacer()
                let titulo = primeiro.formatted(.dateTime.month(.wide).year().locale(Locale(identifier: "pt_BR")))
                Text(titulo.prefix(1).uppercased() + titulo.dropFirst())
                    .font(.callout.weight(.semibold)).foregroundStyle(Souv.texto)
                Spacer()
                Button { mes = proximo } label: { Image(systemName: "chevron.right") }
                    .buttonStyle(.souvIcone).disabled(limite.map { proximo > $0 } ?? false)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(28), spacing: 3), count: 7), spacing: 3) {
                ForEach(0..<7, id: \.self) { i in
                    Text(cal.veryShortStandaloneWeekdaySymbols[(i + cal.firstWeekday - 1) % 7])
                        .font(.caption2.weight(.semibold)).foregroundStyle(Souv.texto2)
                }
                ForEach(0..<(vazios + dias), id: \.self) { i in
                    if i < vazios {
                        Color.clear.frame(height: 26)
                    } else if let d = cal.date(byAdding: .day, value: i - vazios, to: primeiro) {
                        celula(d, bloqueado: (limite.map { d > $0 } ?? false) || (inicio.map { d < $0 } ?? false))
                    }
                }
            }
        }
        .padding(12)
        .frame(width: 236)
    }

    private func celula(_ d: Date, bloqueado: Bool) -> some View {
        let escolhido = cal.isDate(d, inSameDayAs: data), hoje = cal.isDateInToday(d)
        return Button {
            let h = cal.dateComponents([.hour, .minute], from: data)
            data = cal.date(bySettingHour: h.hour ?? 0, minute: h.minute ?? 0, second: 0, of: d) ?? d
            escolheu?()
        } label: {
            Text("\(cal.component(.day, from: d))").font(.callout.monospacedDigit())
                .frame(width: 28, height: 26)
                .foregroundStyle(escolhido ? Color.white : Souv.texto)
                .background(RoundedRectangle(cornerRadius: 6).fill(escolhido ? Souv.primaria : .clear))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(hoje && !escolhido ? Souv.destaque : .clear))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(bloqueado)
        .opacity(bloqueado ? 0.3 : 1)
    }
}

/// Um campo de data: o dia (e a hora, com `comHora`) e o clique abre o calendário da Souv.
struct CampoDataSouv: View {
    @Binding var data: Date
    var ate: Date?
    var desde: Date?
    var comHora = false
    @State private var aberto = false

    var body: some View {
        HStack(spacing: 6) {
            Button { aberto.toggle() } label: {
                Label(data.formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: "pt_BR"))), systemImage: "calendar")
            }
            .popover(isPresented: $aberto, arrowEdge: .bottom) {
                CalendarioSouv(data: $data, ate: ate, desde: desde) { aberto = false }.background(Souv.superficie).identidadeSouv()
            }
            if comHora {
                let c = Calendar.current.dateComponents([.hour, .minute], from: data)
                SouvSelect(opcoes: (0..<24).map { .init(valor: $0, rotulo: String(format: "%02d", $0)) }, selecionado: c.hour,
                           semBusca: true) { hora(h: $0) }
                    .frame(width: 64)
                Text(":").foregroundStyle(Souv.texto2)
                SouvSelect(opcoes: stride(from: 0, to: 60, by: 5).map { .init(valor: $0, rotulo: String(format: "%02d", $0)) },
                           selecionado: c.minute, rotuloLivre: String(format: "%02d", c.minute ?? 0)) { hora(m: $0) }
                    .frame(width: 64)
            }
        }
        .fixedSize()
    }

    private func hora(h: Int? = nil, m: Int? = nil) {
        let c = Calendar.current.dateComponents([.hour, .minute], from: data)
        data = Calendar.current.date(bySettingHour: h ?? c.hour ?? 0, minute: m ?? c.minute ?? 0, second: 0, of: data) ?? data
    }
}


/// Dica que aparece na hora, em cima do botão de ícone. A do sistema (.help) demora 1 a 2 s e não aparece com o botão
/// desativado: no ícone sozinho, parecia não existir. `alinhamento`: .topTrailing no último botão da linha (não sai da janela).
struct DicaSouv: ViewModifier {
    let texto: String
    var alinhamento: Alignment = .top
    @State private var aberta = false

    func body(content: Content) -> some View {
        content
            .onHover { aberta = $0 }
            .overlay(alignment: alinhamento) {
                if aberta {
                    Text(texto).font(.caption).foregroundStyle(Souv.texto).fixedSize()
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Souv.superficie, in: RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Souv.borda))
                        .shadow(color: .black.opacity(0.12), radius: 4, y: 2)
                        .offset(y: -32)
                        .allowsHitTesting(false)
                }
            }
    }
}

extension View {
    func dicaSouv(_ texto: String, alinhamento: Alignment = .top) -> some View { modifier(DicaSouv(texto: texto, alinhamento: alinhamento)) }
}
