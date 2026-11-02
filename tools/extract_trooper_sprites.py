#!/usr/bin/env python3
"""Extrai os frames do inimigo "Soldado de Choque" da sheet de referência.

Uso: python3 tools/extract_trooper_sprites.py [assets/trooper/source/trooper_sheet_source.jpg]
Mesma grelha da sheet do Kane. A armadura cinzenta tem quase a cor do fundo, por isso
aqui o fundo só sai por flood fill a partir das bordas (o contorno escuro trava-o) e em
bolsas fechadas lisas (variação baixa, como entre as pernas) — painéis da armadura têm
textura e ficam. Os FX pintados (clarão do cano, rajada, pó, fumo) saem e são feitos em código.

Saída (frames 224x144, origem 112,140 = pés):
  assets/trooper/trooper_atlas.png   linhas: [parado, ajoelhado a apontar], corrida(4), derrota(5)
  web/trooper_atlas.png
  assets/trooper/trooper_points.json (cano da arma por frame)
"""
import importlib.util, json, pathlib, sys
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("kx", ROOT / "tools/extract_kane_sprites.py")
kx = importlib.util.module_from_spec(spec); spec.loader.exec_module(kx)

SRC = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "assets/trooper/source/trooper_sheet_source.jpg")
FW, FH, OX, OY = 224, 144, 112, 140
SCALE = 0.42
CELLS = {
    "idle": ((72, 336), kx.C4),
    "run": ((396, 578), kx.C4),
    "attack": ((636, 806), kx.C4),
    "death": ((866, 1088), [(722, 951), (961, 1200), (1211, 1452), (1462, 1693), (1703, 1934)]),
}
# Frames usados. Os de disparo e de arma levantada têm a rajada fundida com o cano:
# usamos as poses limpas (parado; ajoelhado a apontar) e o tiro é desenhado em código.
KEEP = {"idle": [0], "attack": [0], "run": [0, 1, 2, 3], "death": [0, 1, 2, 3, 4]}
LAYOUT = [("idle", "attack"), ("run",), ("death",)]   # linha 0: parado + ajoelhado; 1: corrida; 2: derrota


def remove_background(img):
    a = np.array(img).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    cand = (r >= 49) & (r <= 104) & (g - r >= 2) & (g - r <= 13) & (b - r >= 9) & (b - r <= 24)
    h, w = cand.shape
    edge = np.zeros((h, w), bool); edge[0] = edge[-1] = True; edge[:, 0] = edge[:, -1] = True
    bg = kx.flood(edge, cand)
    lum = a[..., :3].mean(2)
    bgl = np.median(lum[bg]) if bg.any() else 64
    lab, sizes = kx.label(cand & ~bg)
    for i, sz in enumerate(sizes):
        if sz < 250:          # buracos pequenos são da armadura, não do fundo
            continue
        m = lab == i + 1
        if abs(lum[m].mean() - bgl) < 9 and lum[m].std() < 9:   # bolsa de fundo liso
            bg |= m
    return np.dstack([a.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)])


def strip_fx(a, row, idx):
    """Remove rajada/clarão (amarelo-branco muito claro + halo laranja à volta), pó bege e fumo claro."""
    a = a.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    al = a[..., 3] > 0
    lum = (r + g + b) / 3
    hot = al & (lum > 200) & (r > 200) & (g > 170)
    orange = (r > 170) & (r > b + 90) & (g > 70)
    zone = kx.dilate(hot, 7)
    fx = hot | (al & zone & orange)
    if row == "attack":                       # tudo à frente do cano é rajada
        cols = np.nonzero(hot.any(0))[0]
        if len(cols) > 10:
            x0 = max(0, cols.min() - 2)
            fx[:, x0:] |= al[:, x0:] & (orange | (lum > 120))[:, x0:]
    beige = al & (r > g) & (g > b) & (r - b > 12) & (r - b < 70) & (lum > 120) & (lum < 215)
    smoke = al & (np.abs(r - g) < 14) & (np.abs(g - b) < 16) & (lum > 108)
    ys = np.nonzero(al.any(1))[0]
    top = ys[0] if len(ys) else 0
    if row in ("idle", "run"):
        fx |= beige
        smoke_zone = np.zeros_like(al); smoke_zone[: top + int(a.shape[0] * 0.12)] = True   # fumo sai do topo da mochila
        fx |= smoke & smoke_zone
    keep = al & ~fx
    r_open = 2 if row == "run" else 1
    opened = kx.dilate(kx.erode(keep, r_open), r_open) & keep
    keep = np.where(kx.dilate(fx, 4), opened, keep)
    if row == "run":   # pó agarrado ao pé de trás: tira o que fica abaixo dos joelhos e atrás do corpo
        ys2, xs2 = np.nonzero(keep)
        if len(xs2):
            ybot = ys2.max(); low = ys2 > ybot - (ybot - ys2.min()) * 0.12
            foot_x = np.percentile(xs2[low], 25) if low.any() else xs2.min()
            mask = np.zeros_like(keep); mask[int(ybot - (ybot - ys2.min()) * 0.12):, :int(foot_x - 6)] = True
            keep &= ~(mask & (beige | (lum > 95)))
    if row != "death":                        # na derrota os destroços soltos fazem parte da animação
        lab, sizes = kx.label(keep)
        if sizes:
            big = max(sizes)
            keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(80, big * 0.04)])
    a[..., 3] = np.where(keep, 255, 0)
    return a.astype(np.uint8)


def main():
    src = Image.open(SRC).convert("RGB")
    S = src.width / kx.REF_W
    got, points = {}, {}
    for name, ((y0, y1), cols) in CELLS.items():
        frames, pts = [], []
        for i, (x0, x1) in enumerate(cols):
            if i not in KEEP[name]:
                continue
            cell = src.crop((int(x0 * S) + 8, int(y0 * S) + 8, int(x1 * S) - 8, int(y1 * S) - 8))
            a = strip_fx(remove_background(cell), name, i)
            img = Image.fromarray(a, "RGBA")
            s = img.resize((round(img.width * SCALE), round(img.height * SCALE)), Image.LANCZOS)
            sa = np.array(s); sa[..., 3] = np.where(sa[..., 3] >= 110, 255, 0)
            al = sa[..., 3] > 0
            if not al.any():
                frames.append(Image.new("RGBA", (FW, FH))); pts.append(None); continue
            hx, _ = kx.head_box(sa) if name != "death" or i < 3 else (np.nonzero(al.any(0))[0].mean(), 0)
            bottom = int(np.nonzero(al.any(1))[0][-1])
            dx, dy = round(OX + 4 - hx), OY - bottom
            c = Image.new("RGBA", (FW, FH)); si = Image.fromarray(sa); c.paste(si, (dx, dy), si)
            frames.append(c)
            ca = np.array(c)[..., 3] > 0
            # cano = pixel opaco mais à direita na metade de cima do corpo
            ys2 = np.nonzero(ca.any(1))[0]
            band = ca[ys2[0]: ys2[0] + int((ys2[-1] - ys2[0]) * 0.7)]
            xs = np.nonzero(band.any(0))[0]
            yy = np.nonzero(band[:, xs[-1]])[0].mean() + ys2[0]
            pts.append([int(xs[-1] - OX), int(yy - OY)])
        got[name] = frames; points[name] = pts
    rows = [sum((got[n] for n in group), []) for group in LAYOUT]
    atlas = Image.new("RGBA", (FW * 5, FH * len(rows)))
    for r, fs in enumerate(rows):
        for c, f in enumerate(fs):
            atlas.paste(f, (c * FW, r * FH))
    (ROOT / "assets/trooper").mkdir(exist_ok=True)
    atlas.save(ROOT / "assets/trooper/trooper_atlas.png", optimize=True)
    atlas.save(ROOT / "web/trooper_atlas.png", optimize=True)
    json.dump({"frame": [FW, FH, OX, OY], "muzzle": points}, open(ROOT / "assets/trooper/trooper_points.json", "w"), indent=1)
    print(json.dumps(points))


if __name__ == "__main__":
    main()
