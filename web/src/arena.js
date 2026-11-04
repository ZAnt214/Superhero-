// =====================================================================================
// ARENA — palco de luta 1 contra 1 no "Distrito das Cinzas", vista lateral.
// Largura de combate 1400 (entre paredes invisíveis em x=200 e x=1600); o cenário continua
// para lá das paredes para a câmara poder abrir. Chão com perspetiva (estilo jogos de luta),
// prédios com néon atrás, carro a arder e barricadas a marcar os limites.
// Reaproveita os fundos em parallax, céu, luzes e cinzas do mapa (level.js).
// =====================================================================================
const WORLD_W = 1800, WORLD_H = 1000, FLOOR_Y = 900;
const ARENA_L = 200, ARENA_R = 1600;
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const solids = [];
function solid(x, y, w, h, kind) { const s = { x, y, w, h, kind }; solids.push(s); return s; }
solid(ARENA_L - 100, -600, 100, 1700, "wall");
solid(ARENA_R, -600, 100, 1700, "wall");
solid(-100, FLOOR_Y, WORLD_W + 200, 300, "stage");
function surfaceY(x) { return FLOOR_Y; }

const LAMPS = [480, 1320].map(x => ({ x, y: FLOOR_Y, broken: x === 1320 }));
const FIRES = [{ x: 150, y: FLOOR_Y - 18, s: 1.3 }, { x: 1690, y: FLOOR_Y - 6, s: 1.1 }, { x: 760, y: 632, s: 0.6 }];
const NEONS = [
  { text: "CINZAS", x: 858, y: 662, vertical: false, hex: "#3fe6ff" },
  { text: "HOTEL", x: 372, y: 690, vertical: true, hex: "#ff3fa4" },
  { text: "24H", x: 1450, y: 760, vertical: false, hex: "#ffcf6b" },
];
const BEACON = { x: -9999, y: 0 };

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
  // prédios atrás do palco (decoração): a parede do fundo do "ringue"
  // baixos o suficiente para se ver o céu, a lua e a cidade em parallax por cima
  const backs = [[0, 700, 330], [330, 660, 200], [530, 730, 260], [790, 640, 240], [1030, 715, 230], [1260, 680, 170], [1430, 740, 200], [1630, 670, 170]];
  for (const [x, top, w] of backs) {
    const h = FLOOR_Y - top;
    px(g, x, top, w, h, "#181c29"); px(g, x, top, 3, h, "#232838"); px(g, x + w - 3, top, 3, h, "#10131c");
    windows(g, e, R, x, top + 14, w, h - 40, 16, 20, 0.1);
    px(g, x - 3, top, w + 6, 7, "#323a4a"); px(g, x - 3, top, w + 6, 2, "#4e586c");
    if (R() < 0.6) { px(g, x + w * 0.3, top - 40, 2, 40, "#323a4a"); }
  }
  // néon "CINZAS" com moldura
  px(g, 846, 654, 104, 30, "#0c0e14"); px(g, 846, 654, 104, 2, "#2a3040"); px(g, 846, 682, 104, 2, "#2a3040");
  // fogo de um telhado ao fundo
  px(g, 720, 640, 80, 6, "#2a2620");
  // chão do palco em perspetiva: horizonte no topo do chão, linhas a convergir para o centro
  const fy = FLOOR_Y, fh = WORLD_H - FLOOR_Y, cx = (ARENA_L + ARENA_R) / 2;
  px(g, 0, fy, WORLD_W, fh, "#1b1d24");
  noise(g, R, 0, fy, WORLD_W, fh, ["#22252d", "#15171c", "#262a33"], 0.03);
  g.strokeStyle = "#2a2e38"; g.lineWidth = 1;
  for (let i = -24; i <= 24; i++) {                              // linhas de fuga
    g.beginPath(); g.moveTo(cx + i * 40, fy); g.lineTo(cx + i * 150, WORLD_H); g.stroke();
  }
  for (let j = 1; j < 8; j++) {                                   // linhas horizontais mais espaçadas à frente
    const y = fy + Math.pow(j / 8, 1.8) * fh;
    g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD_W, y); g.stroke();
  }
  // círculo pintado no centro do ringue (achatado pela perspetiva)
  g.strokeStyle = "#5a1e26"; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, fy + 34, 260, 22, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "#5a1a20"; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, fy + 34, 200, 16, 0, 0, Math.PI * 2); g.stroke();
  px(g, cx - 1, fy + 10, 2, 50, "#5a1a20");
  e.globalAlpha = 0.12; e.strokeStyle = "#ff2b3d"; e.lineWidth = 6; e.beginPath(); e.ellipse(cx, fy + 34, 260, 22, 0, 0, Math.PI * 2); e.stroke(); e.globalAlpha = 1;
  px(g, 0, fy, WORLD_W, 3, "#3a3f4b"); px(g, 0, fy, WORLD_W, 1, "#5b6170");
  // fendas no chão
  for (let i = 0; i < 40; i++) { let x = R() * WORLD_W, y = fy + 4 + R() * 30; g.strokeStyle = "#0c0d11"; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (R() - .5) * 18; y += R() * 8; g.lineTo(x, y); } g.stroke(); }
  // limites: carro queimado à esquerda, barricadas e bidões à direita
  g.fillStyle = "#1f1b1a"; g.beginPath(); g.moveTo(60, fy); g.lineTo(68, fy - 30); g.lineTo(95, fy - 36); g.lineTo(110, fy - 55); g.lineTo(165, fy - 57); g.lineTo(186, fy - 36); g.lineTo(205, fy - 32); g.lineTo(208, fy); g.closePath(); g.fill();
  px(g, 116, fy - 51, 22, 12, "#0a0a0c"); px(g, 142, fy - 51, 20, 12, "#0a0a0c");
  for (const wx of [80, 185]) { g.fillStyle = "#0d0d10"; g.beginPath(); g.arc(wx, fy - 4, 11, 0, Math.PI * 2); g.fill(); }
  for (const bx of [1610, 1660]) { px(g, bx, fy - 22, 44, 22, "#3a3f4b"); px(g, bx + 4, fy - 18, 36, 5, "#c94d3a"); }
  for (const bx of [1600, 1740]) { px(g, bx, fy - 34, 24, 34, "#3a2a22"); px(g, bx, fy - 30, 24, 3, "#5a3a2a"); px(g, bx, fy - 12, 24, 3, "#5a3a2a"); }
  // postes dos candeeiros
  for (const l of LAMPS) {
    px(g, l.x - 2, FLOOR_Y - 150, 4, 150, "#2c3240"); px(g, l.x - 6, FLOOR_Y - 6, 12, 6, "#2c3240");
    px(g, l.x - 2, FLOOR_Y - 150, 26, 4, "#2c3240"); px(g, l.x + 16, FLOOR_Y - 148, 14, 6, "#3a4152");
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
// primeiro plano: só entulho escuro nos cantos de baixo, fora da zona de combate (não tapa os lutadores)
function drawForeground(left, top, w, h) {
  ctx.fillStyle = "#05060a"; ctx.globalAlpha = 0.9;
  const f = 1.3, ox = left * (1 - f);
  for (const [x, bw, bh] of [[60, 140, 34], [1660, 160, 40], [-120, 120, 26], [1880, 130, 30]]) {
    const X = ox + x; if (X > left + w + 50 || X + bw < left - 50) continue;
    ctx.beginPath(); ctx.moveTo(X, top + h); ctx.lineTo(X + 10, top + h - bh); ctx.lineTo(X + bw * 0.4, top + h - bh - 8); ctx.lineTo(X + bw * 0.7, top + h - bh + 4); ctx.lineTo(X + bw, top + h); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
