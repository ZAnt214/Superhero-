#!/usr/bin/env python3
"""Extrai as animações de luta do Kane das sheets "Postura de combate".

Uso: python3 tools/extract_kane_fight.py
Entradas: assets/kane/source/kane_fight_sheet1.jpg (entrada, andar, agachar, salto, vitória)
          assets/kane/source/kane_fight_sheet2.jpg (defesas, socos, rasteira, aéreos, especial)
Saída:    web/kane_fight_atlas.png + assets/kane/kane_fight_atlas.png (frames 224x144, origem 112,140)
          assets/kane/kane_fight_points.json (punho/pé mais à frente de cada frame, para FX e hitboxes)

Mesmo processo das outras sheets (tools/extract_kane_sprites.py): fundo fora, FX pintados
fora (rastos brancos, faíscas, pó — são desenhados em código), escala igualada pela largura do
capacete, pés no chão e cabeça sempre no mesmo x.
"""
import importlib.util, json, pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("kx", ROOT / "tools/extract_kane_sprites.py")
kx = importlib.util.module_from_spec(spec); spec.loader.exec_module(kx)
FW, FH, OX, OY, HEAD_X = 224, 144, 112, 140, 118
REF_W = 1998
S1, S2 = ROOT / "assets/kane/source/kane_fight_sheet1.jpg", ROOT / "assets/kane/source/kane_fight_sheet2.jpg"

R1, R2, R3, R4 = (72, 336), (397, 578), (636, 806), (866, 1088)
# (nome, sheet, faixa y, [x0, x1] por célula) — medido numa imagem de 1998 px de largura
ROWS = [
    ("intro",  [(S1, R1, c) for c in [(736, 1027), (1039, 1330), (1343, 1630), (1643, 1934)]]),
    ("walk",   [(S1, R2, c) for c in [(736, 965), (976, 1205), (1217, 1447), (1459, 1689), (1701, 1934)]]),
    ("crouchjump", [(S1, R3, c) for c in [(736, 928), (938, 1130), (1142, 1311), (1334, 1525), (1537, 1730), (1741, 1934)]]),
    ("victoryguard", [(S1, R4, c) for c in [(1233, 1452), (1464, 1693), (1704, 1934)]] +
                     [(S2, R1, c) for c in [(736, 1027), (1343, 1630), (1643, 1934)]]),
    ("punches", [(S2, R2, c) for c in [(736, 1023), (1033, 1325), (1336, 1630), (1641, 1934)]] +
                [(S2, R3, c) for c in [(736, 1023), (1033, 1325), (1336, 1630), (1641, 1934)]]),
    ("air",    [(S2, R4, c) for c in [(722, 951), (961, 1200), (1211, 1452), (1462, 1693), (1703, 1934)]]),
]
# índices no atlas (linha, coluna) — usados em web/src/game.js (KF)
NAMES = {
    "intro": ["intro0", "intro1", "intro2", "intro3"],
    "walk": ["walk0", "walk1", "walk2", "walk3", "walk4"],
    "crouchjump": ["crouch0", "crouch1", "crouch2", "jumpPrep", "jumpAir", "jumpLand"],
    "victoryguard": ["win0", "win1", "win2", "blockHigh", "crouchBlock", "crouchHit"],
    "punches": ["jab0", "jab1", "heavy0", "heavy1", "lowJab0", "lowJab1", "sweep0", "sweep1"],
    "air": ["air0", "air1", "airKick", "special0", "special1"],
}


def strip_extra(a):
    """Além do strip_fx: pó bege e faíscas muito claras (rasteira)."""
    a = a.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    al = a[..., 3] > 0
    lum = (r + g + b) / 3
    beige = al & (r > g) & (g > b) & (r - b > 12) & (r - b < 60) & (lum > 120) & (lum < 215) & (np.abs(r - g) < 30)
    spark = al & (lum > 205) & (r > 220) & (g > 180)
    # rastos de movimento (smears): cinzento/branco claro sem cor; a armadura é saturada
    smear = al & (lum > 120) & ((np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) < 34)
    ys = np.nonzero(al.any(1))[0]
    yellow = al & (((r > 210) & (g > 150) & (b < 130) & (lum > 160)) | ((r > 232) & (g > 90) & (b < 110)))   # faíscas: mais vivas que o dourado
    if len(ys):                                             # faíscas amarelas só junto ao chão (rasteira)
        yellow[: ys[-1] - int((ys[-1] - ys[0]) * 0.3)] = False
    keep = al & ~(beige | spark | smear | yellow)
    lab, sizes = kx.label(keep)
    if sizes:
        big = max(sizes)
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(80, big * 0.05)])
    a[..., 3] = np.where(keep, 255, 0)
    return a.astype(np.uint8)


def visor_depth(a):
    """Distância do topo do capacete ao visor vermelho: igual em todas as poses, serve de escala."""
    al = a[..., 3] > 0
    ys = np.nonzero(al.any(1))[0]
    top, h = ys[0], ys[-1] - ys[0]
    reg = a[top: top + max(12, int(h * 0.45))].astype(int)
    red = (reg[..., 3] > 0) & (reg[..., 0] > 170) & (reg[..., 1] < 100) & (reg[..., 2] < 120)
    ry = np.nonzero(red.any(1))[0]
    return float(ry.mean()) if len(ry) else None


def helmet_width(a):
    al = a[..., 3] > 0
    ys = np.nonzero(al.any(1))[0]
    top, h = ys[0], ys[-1] - ys[0]
    band = a[top: top + max(10, int(h * 0.16))].astype(int)
    gold = (band[..., 3] > 0) & (band[..., 0] > 100) & (band[..., 0] - band[..., 2] > 30)
    widths = [np.ptp(np.nonzero(r)[0]) for r in gold if r.sum() > 3]
    return float(np.percentile(widths, 80)) if widths else 30.0


def main():
    imgs = {S1: Image.open(S1).convert("RGB"), S2: Image.open(S2).convert("RGB")}
    # referência: largura do capacete no frame de guarda atual (atlas antigo, linha 2 coluna 0)
    # escala base: o Kane em pé (frames de entrada) fica com 129 px de altura, como nos sprites antigos;
    # as outras filas igualam-se pela distância topo→visor (o capacete é igual em todas as poses)
    rows, pts, keyed_all = [], {}, {}
    for name, cells in ROWS:
        keyed = []
        for src, (y0, y1), (x0, x1) in cells:
            im = imgs[src]; Sx = im.width / REF_W
            cell = im.crop((int(x0 * Sx) + 8, int(y0 * Sx) + 8, int(x1 * Sx) - 8, int(y1 * Sx) - 8))
            a = kx.remove_background(cell)
            a = kx.strip_fx(a, open_r=1)
            a = strip_extra(a)
            keyed.append(a)
        keyed_all[name] = keyed
    intro = keyed_all["intro"]
    heights = [np.ptp(np.nonzero((a[..., 3] > 0).any(1))[0]) for a in intro]
    base_sc = 129 / float(np.median(heights))
    base_vd = float(np.median([visor_depth(a) for a in intro]))
    for name, cells in ROWS:
        keyed = keyed_all[name]
        # escala por frame, suavizada pela mediana da fila (evita saltos de tamanho entre frames)
        vd = [d for d in (visor_depth(a) for a in keyed) if d]
        row_sc = base_sc * base_vd / float(np.median(vd))
        out = []
        for a, nm in zip(keyed, NAMES[name]):
            img = Image.fromarray(a, "RGBA")
            s = img.resize((max(1, round(img.width * row_sc)), max(1, round(img.height * row_sc))), Image.LANCZOS)
            sa = np.array(s); sa[..., 3] = np.where(sa[..., 3] >= 110, 255, 0)
            hx, _ = kx.head_box(sa)
            bottom = int(np.nonzero((sa[..., 3] > 0).any(1))[0][-1])
            c = Image.new("RGBA", (FW, FH)); si = Image.fromarray(sa)
            c.paste(si, (round(HEAD_X - hx), OY - bottom), si)
            out.append(c)
            ca = np.array(c)[..., 3] > 0
            ys = np.nonzero(ca.any(1))[0]
            arm = ca[ys[0] + 15: ys[0] + 70]                # altura dos braços
            low = ca[OY - 40: OY + 1]                         # altura das pernas (pontapés/rasteira)
            ax = np.nonzero(arm.any(0))[0]; lx = np.nonzero(low.any(0))[0]
            pts[nm] = {"fist": [int(ax[-1] - OX), int(ys[0] + 15 + np.nonzero(arm[:, ax[-1]])[0].mean() - OY)] if len(ax) else None,
                       "foot": [int(lx[-1] - OX), int(OY - 40 + np.nonzero(low[:, lx[-1]])[0].mean() - OY)] if len(lx) else None,
                       "top": int(ys[0] - OY)}
        rows.append(out)
    atlas = Image.new("RGBA", (FW * max(len(r) for r in rows), FH * len(rows)))
    for r, fs in enumerate(rows):
        for c, f in enumerate(fs):
            atlas.paste(f, (c * FW, r * FH))
    atlas.save(ROOT / "web/kane_fight_atlas.png", optimize=True)
    atlas.save(ROOT / "assets/kane/kane_fight_atlas.png", optimize=True)
    index = {nm: [r, c] for r, (name, _) in enumerate(ROWS) for c, nm in enumerate(NAMES[name])}
    json.dump({"frame": [FW, FH, OX, OY], "index": index, "points": pts}, open(ROOT / "assets/kane/kane_fight_points.json", "w"), indent=1)
    print(json.dumps(index)); print(json.dumps({k: v["fist"] for k, v in pts.items()}))


if __name__ == "__main__":
    main()
