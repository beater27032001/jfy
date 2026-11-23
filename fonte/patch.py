# Gera a JFY Mono: Maple Mono (variável) + os ícones em pixel art do icones.txt, cada um no seu codepoint.
# Rode depois de mexer no icones.txt e reinstale a fonte (o terminal só relê a fonte depois de reiniciado):
#   uv run --no-project --with fonttools python fonte/patch.py "$HOME/Library/Fonts/MapleMono[wght].ttf" fonte/icones.txt fonte/JFYMono.ttf
#   cp fonte/JFYMono.ttf ~/Library/Fonts/
import re, sys
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
base, arq_icones, saida = sys.argv[1:4]
PX, BASE = 75, -150  # pixel de 75 unidades: célula de 600 = 8 pixels; grade presa na linha de base (y=0)
icones = []  # (nome, codepoint, linhas de 8 pixels); desenho de 16 colunas vira 2 glifos: metade esquerda e direita
for nome, cps, desenho in re.findall(r"^== (\S+) ([0-9A-F]{4}(?: [0-9A-F]{4})*)\n((?:[.#]+\n?)+)", open(arq_icones).read(), re.M):
    g, cps = desenho.split(), cps.split()
    w, larg = max(map(len, g)), 8 * len(cps)
    assert w <= larg and len(g) <= 13, nome
    g = [("." * ((larg - w) // 2) + l).ljust(larg, ".") for l in g]  # centraliza na largura
    icones += [(nome, cp, [l[8 * k:8 * k + 8] for l in g]) for k, cp in enumerate(cps)]
f = TTFont(base)
f.ensureDecompiled()
livres = set(range(0xE000, 0xF900)) - set(f.getBestCmap())
assert len({cp for _, cp, _ in icones}) == len(icones) and all(int(cp, 16) in livres for _, cp, _ in icones), "codepoint repetido ou ocupado"
f.setGlyphOrder(f.getGlyphOrder() + ["uni" + cp for _, cp, _ in icones])  # "lambda", "check"... já existem na Maple
for nome, cp, g in icones:
    glifo_nome, topo = "uni" + cp, 6 + len(g) // 2  # centraliza na altura das maiúsculas (0 a 730)
    x0, pen = 0, TTGlyphPen(None)
    for i, linha in enumerate(g):
        y = BASE + (topo - i) * PX
        for m in re.finditer("#+", linha):  # pixels vizinhos da linha viram um retângulo só
            a, b = x0 + m.start() * PX, x0 + m.end() * PX
            pen.moveTo((a, y)); pen.lineTo((a, y + PX)); pen.lineTo((b, y + PX)); pen.lineTo((b, y)); pen.closePath()
    glifo = f["glyf"][glifo_nome] = pen.glyph()
    glifo.recalcBounds(f["glyf"])
    f["hmtx"][glifo_nome] = (600, glifo.xMin)
    f["gvar"].variations[glifo_nome] = []  # não varia com o peso
    f["HVAR"].table.AdvWidthMap.mapping[glifo_nome] = f["HVAR"].table.AdvWidthMap.mapping["A"]  # largura fixa igual ao "A"
    for t in f["cmap"].tables:
        if t.isUnicode():
            t.cmap[int(cp, 16)] = glifo_nome
# a licença (OFL) da Maple Mono pede nome novo em versão modificada; a licença segue no name 0/13/14
for i, s in ((1, "JFY Mono"), (3, "JFYMono-Regular"), (4, "JFY Mono Regular"), (6, "JFYMono-Regular"), (25, "JFYMono")):
    f["name"].setName(s, i, 3, 1, 0x409)
f["name"].removeNames(nameID=16); f["name"].removeNames(nameID=17)
f.save(saida)
cmap = TTFont(saida).getBestCmap()
assert all(cmap[int(cp, 16)] == "uni" + cp for _, cp, _ in icones)
print(f"ok {saida}: {len(icones)} ícones")
