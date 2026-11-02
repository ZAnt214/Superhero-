// =====================================================================================
// MAPA — "Distrito das Cinzas": cidade em ruínas à noite, toda gerada por código em pixel art.
// Zonas (da esquerda para a direita):
//   1 Rua de partida (carro a arder, candeeiros)   2 Praça elevada   3 Viaduto partido
//   4 Telhados (néon "HOTEL" e "CINZAS")           5 Zona industrial (caixotes, torre com farol)
//   6 Terra queimada (fendas de lava, fogueiras)
// Camadas: céu + lua + nuvens → 3 skylines em parallax → nível (colisão) → emissivo aditivo
// (janelas, néon, lava) → luzes dinâmicas → personagens → primeiro plano escuro.
// O nível e os fundos são pré-desenhados uma vez em canvases; por frame só se copiam regiões.
// =====================================================================================
const WORLD_W = 5200, WORLD_H = 1000, FLOOR_Y = 900;

// gerador pseudo-aleatório com semente: o mapa é sempre igual
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- geometria (colisão)
const solids = [];
function solid(x, y, w, h, kind) { const s = { x, y, w, h, kind }; solids.push(s); return s; }
solid(-100, -600, 100, 1700, "wall");
solid(WORLD_W, -600, 100, 1700, "wall");
solid(-100, FLOOR_Y, WORLD_W + 200, 300, "street");
solid(1000, 840, 420, 60, "plaza");                        // 2 praça (salto chega)
solid(1650, 700, 620, 28, "bridge");                        // 3 viaduto (voo)
solid(2380, 640, 380, 260, "building");                     // 4 prédio A
solid(2880, 560, 360, 340, "building");                     //   prédio B
solid(3320, 840, 64, 60, "crate"); solid(3384, 840, 64, 60, "crate"); solid(3352, 780, 64, 60, "crate");
solid(3560, 400, 110, 500, "tower");                        // 5 torre
solid(3820, 760, 220, 24, "catwalk");
solid(4300, 862, 300, 38, "rubble");                        // 6 terra queimada
solid(4720, 828, 260, 72, "rubble");
function surfaceY(x) { let best = Infinity; for (const s of solids) if (s.kind !== "wall" && x >= s.x && x <= s.x + s.w && s.y < best) best = s.y; return best; }

// ---------------------------------------------------------------- adereços com luz/animação
const LAMPS = [240, 760, 1560, 2300, 3260, 4150].map(x => ({ x, y: FLOOR_Y, broken: x === 1560 }));
const FIRES = [{ x: 540, y: FLOOR_Y - 18, s: 1.2 }, { x: 1890, y: FLOOR_Y, s: 0.9 }, { x: 4420, y: 862, s: 1 }, { x: 4860, y: 828, s: 1.3 }, { x: 5080, y: FLOOR_Y, s: 0.8 }];
const NEONS = [
  { text: "HOTEL", x: 2392, y: 660, vertical: true, hex: "#ff3fa4" },
  { text: "CINZAS", x: 2930, y: 586, vertical: false, hex: "#3fe6ff" },
  { text: "24H", x: 1110, y: 800, vertical: false, hex: "#ffcf6b" },
];
const BEACON = { x: 3615, y: 392 };

// ---------------------------------------------------------------- texturas do nível
let levelCanvas = null, emissiveCanvas = null, bgLayers = null;

function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function noise(g, R, x, y, w, h, cols, density) {
  const n = Math.floor(w * h * density);
  for (let i = 0; i < n; i++) px(g, x + R() * w, y + R() * h, 1, 1, cols[Math.floor(R() * cols.length)]);
}
function windows(g, e, R, x, y, w, h, cw = 14, ch = 18, lit = 0.28) {
  for (let wy = y + 10; wy < y + h - 14; wy += ch) for (let wx = x + 8; wx < x + w - 10; wx += cw) {
    const r = R();
    if (r < lit) {
      const warm = R() < 0.8 ? "#ffc773" : "#9fd6ff";
      px(g, wx, wy, 7, 10, warm); px(g, wx, wy + 8, 7, 2, "#c4873a");
      e.globalAlpha = 0.35; px(e, wx - 3, wy - 3, 13, 16, warm); e.globalAlpha = 1;
    } else if (r < lit + 0.12) {                                   // janela partida
      px(g, wx, wy, 7, 10, "#07080c"); px(g, wx + 2, wy + 3, 3, 1, "#2a2f3a"); px(g, wx + 1, wy + 6, 1, 3, "#2a2f3a");
    } else { px(g, wx, wy, 7, 10, "#141823"); px(g, wx, wy, 7, 1, "#252b38"); }
  }
}
function hazard(g, x, y, w, h) {
  px(g, x, y, w, h, "#d9a521");
  for (let i = -h; i < w; i += 10) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = "#1a1a1a"; g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + 5, y + h); g.lineTo(x + i + 5 + h, y); g.lineTo(x + i + h, y); g.fill(); g.restore(); }
}

function buildLevel() {
  const R = mulberry(7);
  levelCanvas = makeCanvas(WORLD_W, WORLD_H); emissiveCanvas = makeCanvas(WORLD_W, WORLD_H);
  const g = levelCanvas.getContext("2d"), e = emissiveCanvas.getContext("2d");

  // pilares do viaduto (atrás de tudo, só decoração)
  for (const x of [1700, 1960, 2210]) {
    px(g, x, 728, 26, FLOOR_Y - 728, "#262b36"); px(g, x, 728, 4, FLOOR_Y - 728, "#323946"); px(g, x + 22, 728, 4, FLOOR_Y - 728, "#1a1e27");
    for (let y = 760; y < FLOOR_Y; y += 40) px(g, x + 6, y, 14, 2, "#1d212a");
  }
  // pedaço do viaduto caído no chão + vergalhões
  g.fillStyle = "#2a2f3a"; g.beginPath(); g.moveTo(2270, 700); g.lineTo(2330, 735); g.lineTo(2312, 900); g.lineTo(2262, 900); g.closePath(); g.fill();
  g.strokeStyle = "#5a4a3a"; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(2270, 706 + i * 4); g.lineTo(2290 + i * 6, 690 - i * 3); g.stroke(); }

  for (const s of solids) {
    const { x, y, w, h } = s;
    if (s.kind === "street") {
      px(g, x, y, w, h, "#16181e");
      for (let i = 0; i < 40; i++) { const yy = y + 24 + R() * (h - 30); px(g, x, yy, w, 1, "#1b1e25"); }   // estratos do subsolo
      noise(g, R, x, y + 18, w, h - 18, ["#20232b", "#121419", "#262a33"], 0.012);
      px(g, x, y, w, 6, "#3a3f4b"); px(g, x, y, w, 1, "#5b6170"); px(g, x, y + 6, w, 12, "#24272f");   // passeio + asfalto
      noise(g, R, x, y + 6, w, 12, ["#2c3039", "#1c1f26"], 0.08);
      for (let dx = 40; dx < w; dx += 90) px(g, x + dx, y + 11, 36, 2, "#8a7432");                     // marcas da estrada gastas
      for (let i = 0; i < 70; i++) {                                                                      // fendas
        let cx = x + R() * w, cy = y + 6; g.strokeStyle = "#0c0d11"; g.beginPath(); g.moveTo(cx, cy);
        for (let j = 0; j < 4; j++) { cx += (R() - 0.5) * 14; cy += R() * 6; g.lineTo(cx, cy); } g.stroke();
      }
      // terra queimada: chão mais escuro com fendas de lava (emissivas)
      const bx0 = 4180;
      g.fillStyle = "#1a1210"; g.fillRect(bx0, y, WORLD_W - bx0 + 100, 18);
      for (let i = 0; i < 28; i++) {
        let cx = bx0 + R() * (WORLD_W - bx0), cy = y + 2 + R() * 6;
        g.strokeStyle = "#ff6a2a"; e.strokeStyle = "#ff8a3d"; e.lineWidth = 4; g.lineWidth = 1;
        g.beginPath(); e.beginPath(); g.moveTo(cx, cy); e.moveTo(cx, cy);
        for (let j = 0; j < 5; j++) { cx += (R() - 0.3) * 16; cy += (R() - 0.4) * 5; g.lineTo(cx, cy); e.lineTo(cx, cy); }
        g.stroke(); e.globalAlpha = 0.5; e.stroke(); e.globalAlpha = 1;
      }
    } else if (s.kind === "plaza") {
      px(g, x, y, w, h, "#2d2a2a");
      for (let yy = y + 6; yy < y + h; yy += 12) for (let xx = x + ((yy / 12) % 2) * 12; xx < x + w; xx += 24) { px(g, xx, yy, 23, 11, "#353131"); px(g, xx, yy, 23, 1, "#423c3b"); }
      px(g, x, y, w, 5, "#4e4846"); px(g, x, y, w, 1, "#6a625e");
      px(g, x + 60, y - 28, 8, 28, "#3a3534"); px(g, x + 52, y - 32, 24, 6, "#4a4442");          // bancos/postes partidos
      px(g, x + 300, y - 18, 40, 18, "#2c2829"); px(g, x + 300, y - 18, 40, 2, "#4a4442");
    } else if (s.kind === "bridge") {
      px(g, x, y, w, h, "#323846"); px(g, x, y, w, 2, "#566075"); px(g, x, y + h - 4, w, 4, "#1d212a");
      hazard(g, x, y + 4, w, 5);
      for (let xx = x + 6; xx < x + w; xx += 28) { px(g, xx, y - 18, 3, 18, "#4a5262"); }               // guarda
      px(g, x, y - 18, w, 2, "#4a5262"); px(g, x, y - 10, w, 1, "#3a4150");
      for (let i = 0; i < 10; i++) px(g, x + w - 4 - R() * 30, y + R() * h, 6, 2, "#1a1d24");          // ponta partida
      g.clearRect(x + w - 6, y + 10, 6, 18);
    } else if (s.kind === "building") {
      px(g, x, y, w, h, "#1d2230"); px(g, x, y, 3, h, "#2a3142"); px(g, x + w - 3, y, 3, h, "#141823");
      for (let yy = y + 30; yy < y + h; yy += 36) px(g, x, yy, w, 2, "#171b26");
      windows(g, e, R, x, y + 12, w, h - 12);
      px(g, x - 4, y, w + 8, 8, "#3a4152"); px(g, x - 4, y, w + 8, 2, "#5a6377");                         // cornija
      px(g, x + 30, y - 22, 46, 22, "#2c3240"); px(g, x + 34, y - 18, 38, 3, "#3c4456");                   // ar condicionado
      for (let i = 0; i < 4; i++) px(g, x + 36 + i * 9, y - 12, 5, 8, "#141823");
      px(g, x + w - 90, y - 54, 50, 40, "#2a2620"); px(g, x + w - 92, y - 58, 54, 6, "#3a342c");           // depósito de água
      for (let i = 0; i < 3; i++) px(g, x + w - 86 + i * 20, y - 14, 3, 14, "#2a2620");
      px(g, x + w * 0.55, y - 70, 2, 70, "#3a4152");                                                         // antena
    } else if (s.kind === "crate") {
      px(g, x, y, w, h, "#3a3328"); px(g, x + 3, y + 3, w - 6, h - 6, "#4a4132");
      g.strokeStyle = "#2a241b"; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + w - 4, y + h - 4); g.moveTo(x + w - 4, y + 4); g.lineTo(x + 4, y + h - 4); g.stroke();
      hazard(g, x, y, w, 6); px(g, x, y + h - 2, w, 2, "#1d1912");
    } else if (s.kind === "tower") {
      g.strokeStyle = "#3d4454"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 6, y + h); g.lineTo(x + 30, y + 20); g.moveTo(x + w - 6, y + h); g.lineTo(x + w - 30, y + 20); g.stroke();
      g.lineWidth = 2; g.strokeStyle = "#2c3240";
      for (let yy = y + 30; yy < y + h; yy += 40) { const t = (yy - y) / h, i0 = 30 - 24 * t; g.beginPath(); g.moveTo(x + i0, yy); g.lineTo(x + w - i0, yy + 40); g.moveTo(x + w - i0, yy); g.lineTo(x + i0, yy + 40); g.stroke(); px(g, x + i0, yy, w - i0 * 2, 2, "#3d4454"); }
      px(g, x, y, w, 20, "#3a4152"); px(g, x, y, w, 3, "#5a6377"); hazard(g, x, y + 14, w, 6);
      px(g, x + w / 2 - 2, y - 24, 4, 24, "#5a6377");
    } else if (s.kind === "catwalk") {
      px(g, x, y, w, h, "#2c3240"); for (let xx = x + 2; xx < x + w; xx += 6) px(g, xx, y + 4, 3, h - 8, "#151922");
      px(g, x, y, w, 3, "#5a6377"); px(g, x + 10, y + h, 4, FLOOR_Y - y - h, "#232836"); px(g, x + w - 14, y + h, 4, FLOOR_Y - y - h, "#232836");
      for (let xx = x; xx < x + w; xx += 24) px(g, xx, y - 16, 2, 16, "#4a5262"); px(g, x, y - 16, w, 2, "#4a5262");
    } else if (s.kind === "rubble") {
      g.fillStyle = "#231a17"; g.beginPath(); g.moveTo(x, y + h);
      for (let xx = x; xx <= x + w; xx += 10) g.lineTo(xx, y + (R() * 8) * (xx > x && xx < x + w ? 1 : 0) + (xx === x || xx >= x + w ? h * 0.6 : 0));
      g.lineTo(x + w, y + h); g.closePath(); g.fill();
      noise(g, R, x, y, w, h, ["#33261f", "#1a1310", "#4a2a1a"], 0.06);
      for (let i = 0; i < 6; i++) { const cx = x + R() * w; e.globalAlpha = 0.6; px(e, cx, y + 4 + R() * (h - 8), 8 + R() * 10, 2, "#ff6a2a"); e.globalAlpha = 1; px(g, cx, y + 6, 6, 1, "#ff8a3d"); }
    }
  }

  // carro queimado na rua de partida
  g.fillStyle = "#1f1b1a"; g.beginPath(); g.moveTo(470, 900); g.lineTo(478, 870); g.lineTo(505, 864); g.lineTo(520, 845); g.lineTo(575, 843); g.lineTo(596, 864); g.lineTo(615, 868); g.lineTo(618, 900); g.closePath(); g.fill();
  px(g, 526, 849, 22, 12, "#0a0a0c"); px(g, 552, 849, 20, 12, "#0a0a0c");
  for (const wx of [490, 595]) { g.fillStyle = "#0d0d10"; g.beginPath(); g.arc(wx, 896, 11, 0, Math.PI * 2); g.fill(); px(g, wx - 3, 893, 6, 6, "#2a2a2e"); }
  noise(g, R, 472, 846, 144, 50, ["#3a2a20", "#120f0e", "#5a3a22"], 0.05);
  // barreiras e entulho espalhados
  for (const bx of [860, 1460, 2620, 3120, 4060]) {
    const gy = surfaceY(bx + 20);
    px(g, bx, gy - 20, 44, 20, "#3a3f4b"); px(g, bx + 4, gy - 16, 36, 5, "#c94d3a"); px(g, bx + 4, gy - 16, 36, 1, "#e07a63");
  }
  for (let i = 0; i < 120; i++) {
    const rx = R() * WORLD_W, gy = surfaceY(rx);
    if (gy > WORLD_H) continue;
    const s2 = 2 + Math.floor(R() * 5); px(g, rx, gy - s2, s2 + 2, s2, R() < 0.5 ? "#2c3039" : "#3a3533");
  }
  // postes dos candeeiros
  for (const l of LAMPS) {
    const gy = surfaceY(l.x);
    px(g, l.x - 2, gy - 150, 4, 150, "#2c3240"); px(g, l.x - 6, gy - 6, 12, 6, "#2c3240");
    px(g, l.x - 2, gy - 150, 26, 4, "#2c3240"); px(g, l.x + 16, gy - 148, 14, 6, "#3a4152");
    if (!l.broken) { px(g, l.x + 18, gy - 142, 10, 2, "#fff0c8"); }
    l.y = gy;
  }
}

// ---------------------------------------------------------------- fundos em parallax
function buildBackgrounds() {
  const R = mulberry(21);
  const layer = (w, h, draw) => { const c = makeCanvas(w, h), g = c.getContext("2d"); draw(g, w, h); return c; };
  const sky = (g, w, h, col, minH, maxH, step, winCol, winP, extra) => {
    let x = 0;
    while (x < w) {
      const bw = step * (0.6 + R() * 0.9), bh = minH + R() * (maxH - minH);
      g.fillStyle = col; g.fillRect(x, h - bh, bw, bh);
      if (R() < 0.35) g.fillRect(x + bw * 0.4, h - bh - 30 - R() * 40, 2, 70);               // antenas
      if (R() < 0.25) { g.fillRect(x + bw * 0.2, h - bh - 14, bw * 0.6, 14); }                  // topo escalonado
      if (winCol) for (let wy = h - bh + 10; wy < h - 8; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (R() < winP) { g.fillStyle = winCol; g.fillRect(wx, wy, 2, 3); g.fillStyle = col; }
      if (extra) extra(g, x, h - bh, bw, bh);
      x += bw + R() * 6;
    }
  };
  bgLayers = {
    clouds: layer(2048, 260, (g, w, h) => {
      for (let i = 0; i < 26; i++) {
        const cx = R() * w, cy = 40 + R() * 170, r = 40 + R() * 90;
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r); grd.addColorStop(0, "rgba(60,40,60,0.35)"); grd.addColorStop(1, "rgba(60,40,60,0)");
        g.fillStyle = grd; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        if (cx + r > w) { g.save(); g.translate(-w, 0); g.fillRect(cx - r, cy - r, r * 2, r * 2); g.restore(); }
      }
    }),
    far: layer(2400, 520, (g, w, h) => sky(g, w, h, "#0d111d", 160, 440, 46, "rgba(255,190,120,0.22)", 0.06)),
    mid: layer(2400, 600, (g, w, h) => sky(g, w, h, "#121827", 120, 360, 70, "rgba(255,200,130,0.35)", 0.1, (gg, x, y, bw) => {
      if (R() < 0.18) { gg.fillStyle = R() < 0.5 ? "rgba(255,63,164,0.55)" : "rgba(63,230,255,0.5)"; gg.fillRect(x + 6, y + 20, 3, 40 + R() * 40); gg.fillStyle = "#121827"; }
    })),
    near: layer(2400, 700, (g, w, h) => {
      sky(g, w, h, "#171d2b", 60, 300, 110, null, 0, (gg, x, y, bw, bh) => {
        // ruínas: buracos e vigas partidas
        gg.fillStyle = "#0e1119";
        for (let i = 0; i < 3; i++) if (R() < 0.6) gg.fillRect(x + R() * bw * 0.7, y + R() * bh * 0.6, 10 + R() * 20, 8 + R() * 16);
        gg.fillStyle = "#171d2b";
        if (R() < 0.3) { gg.save(); gg.translate(x + bw / 2, y); gg.rotate((R() - 0.5) * 0.8); gg.fillRect(-2, -50, 4, 60); gg.restore(); }
      });
      // grua
      g.fillStyle = "#171d2b"; g.fillRect(1500, h - 520, 8, 520); g.fillRect(1380, h - 520, 260, 6);
      g.strokeStyle = "#171d2b"; g.lineWidth = 1; g.beginPath(); g.moveTo(1504, h - 560); g.lineTo(1390, h - 518); g.moveTo(1504, h - 560); g.lineTo(1630, h - 518); g.stroke();
      g.fillRect(1504, h - 560, 2, 40); g.fillRect(1600, h - 514, 1, 120); g.fillRect(1592, h - 394, 16, 10);
    }),
  };
}

// ---------------------------------------------------------------- desenho por frame
const ashMotes = Array.from({ length: 90 }, () => ({ x: Math.random() * 2000, y: Math.random() * 1000, s: Math.random() * 1.5 + 1, v: 6 + Math.random() * 14, ph: Math.random() * 6 }));
function drawParallax(img, f, fy, left, top, visW, visH, bottomY, alpha = 1) {
  // camada que se move a uma fração "f" da câmara; tile horizontal; assenta em bottomY (com parallax vertical fy).
  // Só copia a fatia visível de cada tile (muito mais barato do que desenhar a imagem inteira).
  const ox = left * (1 - f), w = img.width, h = img.height;
  const by = Math.floor(bottomY + (top + visH / 2 - 690) * (1 - fy) - h);
  const y0 = Math.max(by, top - 2), y1 = Math.min(by + h, top + visH + 2);
  if (y1 <= y0) return;
  ctx.globalAlpha = alpha;
  const start = Math.floor((left - ox) / w);
  for (let i = start; ox + i * w < left + visW; i++) {
    const tx = Math.floor(ox + i * w), x0 = Math.max(tx, left - 2), x1 = Math.min(tx + w, left + visW + 2);
    if (x1 <= x0) continue;
    ctx.drawImage(img, x0 - tx, y0 - by, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  }
  ctx.globalAlpha = 1;
}
// gradientes pré-gerados (criar gradientes a cada frame é caro em telemóveis)
const gradCache = {};
function gradStrip(key, stops) {
  if (gradCache[key]) return gradCache[key];
  const c = makeCanvas(1, 256), g = c.getContext("2d"), grd = g.createLinearGradient(0, 0, 0, 256);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd; g.fillRect(0, 0, 1, 256);
  return (gradCache[key] = c);
}
function drawGrad(key, stops, x, y, w, h) { ctx.drawImage(gradStrip(key, stops), 0, 0, 1, 256, x, y, w, h); }
function drawBackground(left, top, w, h) {
  if (!levelCanvas) { buildLevel(); buildBackgrounds(); }
  // céu: gradiente de fumo avermelhado no horizonte
  drawGrad("sky", [[0, "#05060c"], [0.55, "#120d1a"], [0.85, "#2a1418"], [1, "#1a0f12"]], left - 20, top - 20, w + 40, h + 40);
  // estrelas ténues
  ctx.fillStyle = "#c8c8d8";
  for (let i = 0; i < 40; i++) { const sx = left + ((i * 397.3 - left * 0.02) % w + w) % w, sy = top + (i * 73.7 % (h * 0.45)); ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 1.3 + i); ctx.fillRect(sx, sy, 1, 1); }
  ctx.globalAlpha = 1;
  // lua grande com halo
  const mx = left + w * 0.72 - left * 0.02, my = top + h * 0.22;
  ADD(); glow(mx, my, 190, "#ff5a4a", 0.16); glow(mx, my, 70, "#ffb09a", 0.25); NORMAL();
  ctx.fillStyle = "#e8c8b8"; ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c9a898"; for (const [cx, cy, r] of [[-8, -6, 6], [9, 5, 4], [-2, 12, 3], [12, -10, 3]]) { ctx.beginPath(); ctx.arc(mx + cx, my + cy, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "rgba(20,8,12,0.35)"; ctx.beginPath(); ctx.arc(mx + 10, my - 4, 30, 0, Math.PI * 2); ctx.fill();
  // nuvens de fumo a passar à frente da lua
  drawParallax(bgLayers.clouds, 0.04, 0.02, left - time * 6, top, w, h, top + h * 0.5 + 80);
  drawParallax(bgLayers.far, 0.12, 0.1, left, top, w, h, FLOOR_Y - 40);
  // névoa do horizonte
  drawGrad("fog", [[0, "rgba(60,25,35,0)"], [1, "rgba(60,25,35,0.45)"]], left, FLOOR_Y - 360, w, 360);
  ctx.fillStyle = "rgba(60,25,35,0.45)"; ctx.fillRect(left, FLOOR_Y, w, 400);
  drawParallax(bgLayers.mid, 0.28, 0.25, left, top, w, h, FLOOR_Y - 10);
  // colunas de fumo a subir ao longe
  for (let i = 0; i < 4; i++) {
    const sx = left + ((i * 911 - left * 0.28) % (w + 400) + w + 400) % (w + 400) - 200;
    for (let j = 0; j < 4; j++) { const yy = FLOOR_Y - 120 - j * 60 - (time * 12 % 60); ctx.globalAlpha = 0.1 * (1 - j / 6); ctx.drawImage(smokeTex("#3a2e36"), sx + Math.sin(time * 0.5 + j + i) * 12 - 40 - j * 6, yy - 40, 80 + j * 12, 80 + j * 12); }
  }
  ctx.globalAlpha = 1;
  drawParallax(bgLayers.near, 0.5, 0.45, left, top, w, h, FLOOR_Y + 10);
  drawGrad("fog2", [[0, "rgba(40,20,30,0)"], [1, "rgba(40,20,30,0.5)"]], left, FLOOR_Y - 200, w, 200);
  // cinzas a cair (camada de fundo)
  for (const m of ashMotes) {
    const x = left + ((m.x - left * 0.6) % (w + 40) + w + 40) % (w + 40) - 20, y = top + ((m.y + time * m.v) % (h + 20));
    ctx.globalAlpha = 0.3; ctx.fillStyle = m.ph > 5 ? "#ff8a3d" : "#6f717a"; ctx.fillRect(x + Math.sin(time + m.ph) * 6, y, m.s, m.s);
  }
  ctx.globalAlpha = 1;
}
function drawSolids(left, top, w, h) {
  const sx = Math.max(0, Math.floor(left) - 2), sy = Math.max(0, Math.floor(top) - 2);
  const sw = Math.min(WORLD_W - sx, Math.ceil(w) + 4), sh = Math.min(WORLD_H - sy, Math.ceil(h) + 4);
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(levelCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
  // emissivo: janelas, lava e néon base, com pulsação lenta
  ADD(); ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 1.7);
  ctx.drawImage(emissiveCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
  NORMAL();
}
let coneCanvas = null;
function lampCone() {           // cone de luz do candeeiro, pré-desenhado
  if (coneCanvas) return coneCanvas;
  coneCanvas = makeCanvas(120, 140);
  const g = coneCanvas.getContext("2d"), grd = g.createLinearGradient(0, 0, 0, 140);
  grd.addColorStop(0, "rgba(255,200,120,0.28)"); grd.addColorStop(1, "rgba(255,200,120,0.02)");
  g.fillStyle = grd; g.beginPath(); g.moveTo(54, 0); g.lineTo(66, 0); g.lineTo(120, 140); g.lineTo(0, 140); g.closePath(); g.fill();
  return coneCanvas;
}
// adereços animados: chamas, cones de luz, néon, farol (desenhados depois do nível)
function drawProps(left, w) {
  const vis = x => x > left - 200 && x < left + w + 200;
  ADD();
  for (const l of LAMPS) {
    if (!vis(l.x)) continue;
    const on = l.broken ? (Math.sin(time * 23) > 0.2 && Math.sin(time * 3.1) > -0.6) : true;
    if (!on) continue;
    const hx = l.x + 23, hy = l.y - 140;
    glow(hx, hy, 18, "#ffe0a0", 0.9); glow(hx, hy, 60, "#ffb35c", 0.35);
    // cone de luz até ao chão
    ctx.globalAlpha = 1; ctx.drawImage(lampCone(), hx - 60, hy, 120, l.y - hy);
    light(hx, l.y - 20, 120, "#ffb35c", 0.6);
  }
  for (const n of NEONS) {
    if (!vis(n.x)) continue;
    const flick = Math.sin(time * 17 + n.x) > -0.85 ? 1 : 0.2;
    ctx.font = "14px Silkscreen, monospace"; ctx.textBaseline = "top";
    const chars = n.text.split("");
    chars.forEach((c, i) => {
      const cx = n.vertical ? n.x : n.x + i * 14, cy = n.vertical ? n.y + i * 16 : n.y;
      glow(cx + 5, cy + 7, 16, n.hex, 0.5 * flick);
      ctx.globalAlpha = flick; ctx.fillStyle = n.hex; ctx.fillText(c, cx, cy);
    });
    ctx.textBaseline = "alphabetic";
    light(n.x + (n.vertical ? 5 : chars.length * 7), n.y + (n.vertical ? chars.length * 8 : 7), 140, n.hex, 0.5 * flick);
  }
  const bOn = Math.sin(time * 3) > 0.3;
  if (bOn) { glow(BEACON.x, BEACON.y, 30, "#ff2b3d", 1); glow(BEACON.x, BEACON.y, 8, "#ffffff", 1, true); light(BEACON.x, BEACON.y, 160, "#ff2b3d", 0.6); }
  for (const f of FIRES) {
    if (!vis(f.x)) continue;
    const s = f.s, fl = Math.sin(time * 9 + f.x) * 0.15 + Math.sin(time * 23 + f.x * 2) * 0.1;
    glow(f.x, f.y - 14 * s, 70 * s * (1 + fl), "#ff5a1a", 0.45);
    for (let i = 0; i < 5; i++) {                                     // línguas de fogo
      const ph = time * (5 + i) + i * 1.7 + f.x, hgt = (26 + 14 * Math.sin(ph)) * s, ox = (i - 2) * 6 * s + Math.sin(ph * 1.3) * 3;
      glowStretch(f.x + ox, f.y - hgt / 2, 12 * s, hgt, i % 2 ? "#ff8a3d" : "#ffcf6b", 0.8);
    }
    glow(f.x, f.y - 6 * s, 14 * s, "#fff2b8", 0.8);
    light(f.x, f.y - 20, 160 * s, "#ff7a2a", 0.9 + fl);
  }
  NORMAL();
}
// partículas dos adereços (fumo e brasas das fogueiras)
function updateProps(dt) {
  for (const f of FIRES) {
    if (Math.abs(f.x - k.x) > 900) continue;
    if (Math.random() < 0.35 * f.s) emit("ember", f.x + rand(-10, 10) * f.s, f.y - 20 * f.s, rand(-20, 20), rand(-140, -60), rand(0.6, 1.2), 2, 1, "back");
    if (Math.random() < 0.18 * f.s) emit("smoke", f.x + rand(-8, 8), f.y - 34 * f.s, rand(-10, 10), rand(-60, -30), rand(1.4, 2.2), 8 * f.s, 30 * f.s, "back");
  }
}
// primeiro plano: silhuetas escuras à frente da ação (parallax > 1), discretas para não tapar o jogo
function drawForeground(left, top, w, h) {
  const f = 1.35, ox = left * (1 - f);
  ctx.fillStyle = "#05060a";
  for (let i = 0; i < 14; i++) {
    const x = ox + i * 520 + 140;
    if (x < left - 120 || x > left + w + 120) continue;
    const pw = 26 + (i % 3) * 10;
    ctx.globalAlpha = 0.85;
    if (i % 2 === 0) { ctx.fillRect(x, top + h - 46, pw * 3, 46); ctx.fillRect(x + 20, top + h - 70, 18, 24); }   // entulho em baixo
    else { ctx.fillRect(x, top - 10, pw, 60); ctx.fillRect(x - 30, top + 40, pw + 60, 8); }                         // viga em cima
  }
  ctx.globalAlpha = 1;
}
