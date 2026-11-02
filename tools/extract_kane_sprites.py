#!/usr/bin/env python3
"""Extrai os frames do Kane da sheet de referência e gera sprites limpos para o jogo.

Uso: python3 tools/extract_kane_sprites.py [assets/kane/source/kane_sheet_source.jpg]

Passos:
 1. recorta as células da sheet de apresentação;
 2. remove o fundo cinzento com grelha (flood fill a partir das bordas);
 3. remove os FX pintados nos frames (rastos de energia, ondas de choque) — vinham
    cortados a direito pela margem das células e passam a ser desenhados em código;
 4. dá pontas irregulares à capa onde a margem da célula a cortou;
 5. escala cada fila para o capacete ter o mesmo tamanho em todas;
 6. alinha: no chão pelos pés (y) e cabeça (x); em voo pela cabeça (x e y), à mesma
    altura que a pose de pairar — trocar de animação não faz o personagem saltar.

Saída (frames 224x144, origem 112,140 = pés):
  assets/kane/idle_sheet.png        4 frames  parado / pairar (também base da corrida)
  assets/kane/run_flight_sheet.png  4 frames  deslocação em voo
  assets/kane/attack_sheet.png      4 frames  guarda, braço esticado, recuo, regresso
  assets/kane/kane_points.json      olho, punho e pés de cada frame (para FX e hitboxes)
  web/kane_atlas.png                atlas com as 3 filas (para a versão web)
Requer Pillow e numpy.
"""
import json
import sys
from collections import deque

import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/kane/source/kane_sheet_source.jpg"
FW, FH, OX, OY = 224, 144, 112, 140
HEAD_X = OX + 6          # x da cabeça em todos os frames (ligeiramente à frente dos pés)
INSET = 8

# células medidas numa imagem de 1998 px de largura (escaladas para o tamanho real)
REF_W = 1998
C4 = [(736, 1023), (1032, 1325), (1335, 1630), (1640, 1934)]
CELLS = {
    "idle": ((72, 336), C4),
    "move": ((396, 578), C4),
    "punch": ((866, 1088), [(722, 951), (961, 1200), (1211, 1452), (1462, 1693), (1703, 1934)]),
}
SCALE = {"idle": 0.40, "move": 0.35, "punch": 0.42}   # capacete com o mesmo tamanho
PUNCH_KEEP = [0, 1, 3, 4]   # o frame 2 (impacto) tem o punho fundido com o FX: o impacto é desenhado em código


# ---------------------------------------------------------------- utilitários de máscara
def flood(seed, allowed):
    h, w = allowed.shape
    out = np.zeros_like(allowed)
    dq = deque()
    for y, x in zip(*np.nonzero(seed & allowed)):
        out[y, x] = True
        dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and allowed[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True
                dq.append((ny, nx))
    return out


def label(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), int)
    sizes = []
    for y, x in zip(*np.nonzero(mask)):
        if lab[y, x]:
            continue
        n = len(sizes) + 1
        lab[y, x] = n
        dq, c = deque([(y, x)]), 0
        while dq:
            cy, cx = dq.popleft()
            c += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        dq.append((ny, nx))
        sizes.append(c)
    return lab, sizes


def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def erode(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out &= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


# ---------------------------------------------------------------- limpeza
def remove_background(img):
    """Fundo = cinzento frio (r 49-104, g≈r+7, b≈r+16) com grelha mais clara."""
    a = np.array(img).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    cand = (r >= 49) & (r <= 104) & (g - r >= 2) & (g - r <= 13) & (b - r >= 9) & (b - r <= 24)
    h, w = cand.shape
    edge = np.zeros((h, w), bool)
    edge[0] = edge[-1] = True
    edge[:, 0] = edge[:, -1] = True
    bg = flood(edge, cand)
    lab, sizes = label(cand & ~bg)
    big = [i + 1 for i, s in enumerate(sizes) if s >= 40]
    bg |= np.isin(lab, big)
    return np.dstack([a.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)])


def strip_fx(a, open_r=1, head_band=0.22):
    """Remove energia ciano, brancos e vermelhos saturados (exceto o visor), os contornos
    escuros desses FX e traços finos que sobrem; fica só a silhueta principal."""
    a = a.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    al = a[..., 3] > 0
    ys = np.nonzero(al.any(1))[0]
    top, bot = ys[0], ys[-1]
    head = np.arange(a.shape[0])[:, None] < top + (bot - top) * head_band
    cyan = (b > 140) & (g > 110) & (b > r + 35)
    white = (r > 195) & (g > 195) & (b > 195)
    red = (r > 150) & (g < 120) & (r > g + 70) & (r > b + 25)
    core = al & (cyan | white | (red & ~head))
    teal = (g > r + 14) & (b > r + 14) & (np.abs(g - b) < 40) & (g > 55)
    dred = (r > g + 35) & (r > b + 15) & (g < 95) & (r > 70)
    zone = dilate(core, 6)
    keep = al & ~(core | (zone & (teal | (dred & ~head))))
    opened = dilate(erode(keep, open_r), open_r) & keep
    keep = np.where(dilate(zone, 2), opened, keep)
    lab, sizes = label(keep)
    if sizes:
        big = max(sizes)
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(80, big * 0.05)])
    a[..., 3] = np.where(keep, 255, 0)
    return a.astype(np.uint8)


def tatter_cut_edges(a, seed, min_run=25, depth=14):
    """Onde a margem da célula cortou a capa a direito, recorta em dentes irregulares."""
    a = a.copy()
    al = a[..., 3] > 0
    h, w = al.shape
    rng = np.random.default_rng(seed)
    for side in ("left", "right", "bottom"):
        line = al[-1] if side == "bottom" else al[:, 0] if side == "left" else al[:, -1]
        if line.sum() < min_run:
            continue
        n = w if side == "bottom" else h
        prof = np.zeros(n)
        i = 0
        while i < n:
            t, d = int(rng.integers(6, 11)), int(rng.integers(depth // 2, depth + 1))
            tooth = np.concatenate([np.linspace(2, d, (t + 1) // 2), np.linspace(d, 2, t - (t + 1) // 2)])
            prof[i:i + t] = tooth[:len(prof[i:i + t])]
            i += t
        for k in range(n):
            d = int(prof[k])
            if side == "left":
                a[k, :d, 3] = 0
            elif side == "right":
                a[k, w - d:, 3] = 0
            else:
                a[h - d:, k, 3] = 0
    return a


# ---------------------------------------------------------------- medidas
def head_box(a):
    """Centro x e topo y do capacete (pixels dourados na faixa de cima)."""
    al = a[..., 3] > 0
    ys = np.nonzero(al.any(1))[0]
    band = a[ys[0]:ys[0] + max(8, int((ys[-1] - ys[0]) * 0.18))].astype(int)
    gold = (band[..., 3] > 0) & (band[..., 0] > 90) & (band[..., 0] - band[..., 2] > 25)
    xs = np.nonzero(gold)[1] if gold.any() else np.nonzero(band[..., 3] > 0)[1]
    return float(np.median(xs)), int(ys[0])


def points(frame):
    a = np.array(frame).astype(int)
    al = a[..., 3] > 0
    red = al & (a[..., 0] > 180) & (a[..., 1] < 100) & (a[..., 2] < 120)
    red[FH // 2 + 10:] = False
    ry, rx = np.nonzero(red)
    eye = [round(rx.mean() - OX), round(ry.mean() - OY)] if len(rx) else None
    ys = np.nonzero(al.any(1))[0]
    band = al[ys[0] + 20: ys[0] + 60]                       # altura dos braços
    xs = np.nonzero(band.any(0))[0]
    fist = [int(xs[-1] - OX), int(ys[0] + 20 + np.nonzero(band[:, xs[-1]])[0].mean() - OY)] if len(xs) else None
    return {"eye": eye, "fist": fist, "top": int(ys[0] - OY)}


# ---------------------------------------------------------------- pipeline
def main():
    src = Image.open(SRC).convert("RGB")
    S = src.width / REF_W
    frames, pts = {}, {}
    idle_head_top = None
    for name in ("idle", "punch", "move"):
        (y0, y1), cols = CELLS[name]
        idx = range(len(cols)) if name != "punch" else PUNCH_KEEP
        out = []
        for i in idx:
            x0, x1 = cols[i]
            cell = src.crop((int(x0 * S) + INSET, int(y0 * S) + INSET, int(x1 * S) - INSET, int(y1 * S) - INSET))
            a = remove_background(cell)
            a = strip_fx(a, open_r=2 if (name == "move" or (name == "punch" and i == 3)) else 1)
            if name == "punch" and i in (1, 3):
                a = tatter_cut_edges(a, seed=i)
            img = Image.fromarray(a, "RGBA")
            sc = SCALE[name]
            s = img.resize((round(img.width * sc), round(img.height * sc)), Image.LANCZOS)
            sa = np.array(s)
            sa[..., 3] = np.where(sa[..., 3] >= 110, 255, 0)
            hx, htop = head_box(sa)
            bottom = int(np.nonzero((sa[..., 3] > 0).any(1))[0][-1])
            dx = round(HEAD_X - hx)
            if name == "move":
                dy = idle_head_top - htop          # cabeça à mesma altura do pairar
            else:
                dy = OY - bottom                   # pés no chão
            canvas = Image.new("RGBA", (FW, FH))
            canvas.paste(Image.fromarray(sa), (dx, dy), Image.fromarray(sa))
            if name == "idle" and idle_head_top is None:
                idle_head_top = htop + dy
            out.append(canvas)
        frames[name] = out
        pts[name] = [points(f) for f in out]

    def strip(fs):
        st = Image.new("RGBA", (FW * len(fs), FH))
        for i, f in enumerate(fs):
            st.paste(f, (i * FW, 0))
        return st

    strip(frames["idle"]).save("assets/kane/idle_sheet.png", optimize=True)
    strip(frames["move"]).save("assets/kane/run_flight_sheet.png", optimize=True)
    strip(frames["punch"]).save("assets/kane/attack_sheet.png", optimize=True)
    atlas = Image.new("RGBA", (FW * 4, FH * 3))
    for r, k in enumerate(("idle", "move", "punch")):
        for c, f in enumerate(frames[k]):
            atlas.paste(f, (c * FW, r * FH))
    atlas.save("web/kane_atlas.png", optimize=True)
    meta = {"frame": {"w": FW, "h": FH, "origin_x": OX, "origin_y": OY}, "points": pts}
    json.dump(meta, open("assets/kane/kane_points.json", "w"), indent=1)
    print(json.dumps(pts))


if __name__ == "__main__":
    main()
