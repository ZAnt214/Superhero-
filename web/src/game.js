"use strict";
// =====================================================================================
// Kane — playtest web com VFX.
// Jogabilidade: porta de scripts/kane/kane_player.gd (mesmos valores e regras).
// VFX: texturas de brilho pré-geradas desenhadas em modo aditivo (bloom barato e
// compatível com Safari), partículas com rampas de cor e rastos de movimento,
// luz dinâmica no cenário, ondas de choque, marcas de queimado, câmara com trauma/zoom.
// Build: python3 web/build.py  (junta shell.html + este ficheiro + atlas → kane-teste.html)
// =====================================================================================

// ---------------------------------------------------------------- configuração
const C = {
  maxHp: 100, maxFury: 100, furyRegen: 8, invuln: 0.6,
  runSpeed: 220, groundAccel: 1800, groundFriction: 2400, airAccel: 1100,
  gravity: 1400, fallMult: 1.5, maxFall: 900, jumpVel: -480, jumpCut: 0.45,
  coyote: 0.1, jumpBuffer: 0.12,
  flightSpeed: 320, flightAccel: 1600,
  laserRange: 640, laserWindup: 0.16, laserDps: 45, laserTick: 0.1,
  laserFuryPerSec: 30, laserMinFury: 10, laserMoveMult: 0.35, laserKnock: 60,
  punchDmg: 18, punchKnock: 320, punchWindup: 0.08, punchActive: 0.1, punchRecovery: 0.2,
  punchLunge: 180, punchSize: { w: 44, h: 52 }, punchOff: { x: 28, y: -72 }, furyOnHit: 6,
  chargeTime: 0.4, energyCost: 25, energyDmgMult: 2.5, energyKnockMult: 2.2, energySizeMult: 1.6,
  bodyW: 28, bodyH: 108,
};
// Pontos medidos nos frames (assets/kane/kane_points.json), relativos aos pés, a olhar para a direita.
const PT = {
  eyeGuard: { x: 12, y: -97 }, eyeIdle: { x: 10, y: -114 },
  fistGuard: { x: 34, y: -64 }, fistPunch: { x: 56, y: -72 },
  fistIdle: { x: 27, y: -68 }, handBack: { x: -25, y: -70 },
  hoverFeet: [{ x: -10, y: 0 }, { x: 15, y: -4 }],
  pivotFly: { x: -35, y: -90 }, pivotBody: { x: 0, y: -65 },   // centros de rotação do corpo
  flightFeet: [{ x: -70, y: -58 }, { x: -42, y: -55 }],
};
const PAL = {
  red: "#ff2b3d", redHot: "#ff6a5c", pink: "#ffc2c8", cyan: "#3fe6ff", cyanSoft: "#9ff3ff",
  blue: "#2a6bff", white: "#ffffff", ember: "#ff8a3d", gold: "#ffcf6b",
};

// ---------------------------------------------------------------- utilidades
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
// Rampa de cor pré-calculada (evita criar strings por partícula).
function ramp(stops, n = 24) {
  const rgb = stops.map(hexRgb), out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * (rgb.length - 1), j = Math.min(Math.floor(t), rgb.length - 2), f = t - j;
    const c = rgb[j].map((v, q) => Math.round(lerp(v, rgb[j + 1][q], f)));
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  return out;
}

// ---------------------------------------------------------------- canvas
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
let viewW = 960, viewH = 540, scale = 1, dpr = 1, safeTop = 0, safeLeft = 0, vignette = null;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  scale = Math.min(innerWidth / 640, innerHeight / 540) * dpr;
  viewW = cv.width / scale; viewH = cv.height / scale;
  ctx.imageSmoothingEnabled = false;
  safeTop = (parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0) * dpr / scale;
  safeLeft = (parseFloat(getComputedStyle(document.querySelector(".pad.left")).left) - 16 || 0) * dpr / scale;
  // vinheta em cache (escurece os cantos e faz a luz dos poderes sobressair)
  vignette = makeCanvas(cv.width, cv.height);
  const g = vignette.getContext("2d"), r = Math.hypot(cv.width, cv.height) / 2;
  const grd = g.createRadialGradient(cv.width / 2, cv.height * 0.55, r * 0.35, cv.width / 2, cv.height * 0.55, r);
  grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(2,3,10,0.6)");
  g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);
}
addEventListener("resize", resize); resize();

// ---------------------------------------------------------------- texturas de VFX
const texCache = new Map();
// Brilho radial: núcleo intenso e cauda suave. Desenhado em "lighter" faz de bloom.
function glowTex(hex, hard = false) {
  const key = hex + (hard ? "h" : "s");
  let c = texCache.get(key);
  if (c) return c;
  c = makeCanvas(128, 128);
  const g = c.getContext("2d"), [r, gg, b] = hexRgb(hex);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (hard) {
    grd.addColorStop(0, `rgba(${r},${gg},${b},1)`); grd.addColorStop(0.35, `rgba(${r},${gg},${b},0.9)`);
    grd.addColorStop(0.6, `rgba(${r},${gg},${b},0.25)`); grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  } else {
    grd.addColorStop(0, `rgba(${r},${gg},${b},1)`); grd.addColorStop(0.15, `rgba(${r},${gg},${b},0.6)`);
    grd.addColorStop(0.45, `rgba(${r},${gg},${b},0.15)`); grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  }
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  texCache.set(key, c);
  return c;
}
// Fumo / pó: mancha macia com bordo irregular.
function smokeTex(hex) {
  const key = "smoke" + hex;
  let c = texCache.get(key);
  if (c) return c;
  c = makeCanvas(64, 64);
  const g = c.getContext("2d"), [r, gg, b] = hexRgb(hex);
  for (let i = 0; i < 7; i++) {
    const x = 32 + rand(-10, 10), y = 32 + rand(-10, 10), rr = rand(12, 22);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, `rgba(${r},${gg},${b},0.5)`); grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }
  texCache.set(key, c);
  return c;
}
function glow(x, y, rad, hex, a = 1, hard = false) {
  if (a <= 0.01 || rad < 0.5) return;
  ctx.globalAlpha = Math.min(a, 1);
  ctx.drawImage(glowTex(hex, hard), x - rad, y - rad, rad * 2, rad * 2);
}
// brilho esticado (para feixes e clarões de lente)
function glowStretch(x, y, w, h, hex, a = 1) {
  if (a <= 0.01) return;
  ctx.globalAlpha = Math.min(a, 1);
  ctx.drawImage(glowTex(hex), x - w / 2, y - h / 2, w, h);
}
const ADD = () => { ctx.globalCompositeOperation = "lighter"; };
const NORMAL = () => { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; };

// ---------------------------------------------------------------- sprites
const FW = 224, FH = 144, OX = 112, OY = 140;
const ATLAS = new Image();
ATLAS.src = "__ATLAS__";
const ROW = { idle: 0, move: 1, punch: 2 };
const tintCache = {};
// Versão do atlas pintada de uma cor (para aura de contorno, fantasmas, clarões de dano).
function tinted(hex) {
  if (tintCache[hex]) return tintCache[hex];
  const c = makeCanvas(ATLAS.width, ATLAS.height), g = c.getContext("2d");
  g.drawImage(ATLAS, 0, 0);
  g.globalCompositeOperation = "source-atop"; g.fillStyle = hex; g.fillRect(0, 0, c.width, c.height);
  return (tintCache[hex] = c);
}

// ---------------------------------------------------------------- mundo
const WORLD_W = 2200, FLOOR_Y = 500;
const solids = [
  { x: -100, y: FLOOR_Y, w: WORLD_W + 200, h: 200 },
  { x: -100, y: -400, w: 100, h: 1100 },
  { x: WORLD_W, y: -400, w: 100, h: 1100 },
  { x: 760, y: 360, w: 200, h: 20 },
  { x: 1100, y: 270, w: 160, h: 20 },
  { x: 1300, y: 360, w: 240, h: 20 },
];
const enemies = [];
function spawnEnemy(x) { enemies.push({ x, y: FLOOR_Y, vx: 0, vy: 0, w: 34, h: 130, hp: 120, maxHp: 120, flash: 0, dead: 0, dissolve: 0, squash: 0, home: x }); }
[620, 1000, 1500, 1900].forEach(spawnEnemy);

const k = {
  x: 320, y: FLOOR_Y, vx: 0, vy: 0, facing: 1, hp: C.maxHp, fury: C.maxFury,
  flying: false, onFloor: false, action: "none", t: 0, coyote: 0, jumpBuf: 0, invuln: 0,
  laserTick: 0, energy: false, hitIds: new Set(), beam: null, beamFade: 0, lastBeam: null, aim: null,
  anim: 0, dead: false, moveAnim: false, squash: 0, stretch: 0, turnT: 0, rot: 0, flyPose: false, laserSound: false,
  hurtFlash: 0, whiteFlash: 0, chargedPing: false, stepT: 0, ghostT: 0, scorchT: 0,
};
let floats = [], time = 0, hitstop = 0;

// ---------------------------------------------------------------- câmara (trauma + zoom)
const cam = { x: 320, trauma: 0, zoom: 1, kick: 0, dirX: 0, dirY: 0, seed: Math.random() * 100 };
function addTrauma(a, dx = 0, dy = 0) { cam.trauma = Math.min(1, cam.trauma + a); cam.dirX += dx; cam.dirY += dy; }
function zoomKick(a) { cam.kick = Math.max(cam.kick, a); }


// ---------------------------------------------------------------- som (sintetizado com Web Audio, sem ficheiros)
// O browser só deixa tocar som depois de um toque/tecla: o primeiro input inicializa o áudio.
const SFX = (() => {
  let ac = null, master = null, verb = null, noiseBuf = null, on = true;
  const loops = {};
  function init() {
    if (ac) { if (ac.state !== "running") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // iPhone: tocar mesmo em modo silencioso
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = on ? 0.8 : 0;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // reverb curto (cauda de ruído a decair) para dar espaço aos impactos
    verb = ac.createConvolver();
    const len = Math.floor(ac.sampleRate * 1.3), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    const vg = ac.createGain(); vg.gain.value = 0.3; verb.connect(vg); vg.connect(master);
    const sil = ac.createBufferSource(); sil.buffer = ac.createBuffer(1, 1, 22050); sil.connect(ac.destination); sil.start(0);   // desbloqueio iOS
  }
  const T = () => ac.currentTime;
  function bus(wet = 0, vol = 1) {
    const g = ac.createGain(); g.gain.value = vol; g.connect(master);
    if (wet) { const w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
    return g;
  }
  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(type, f0, f1, t0, dur, peak, dest, attack = 0.004) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, attack, peak, dur); o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + attack + dur + 0.05);
  }
  function hiss(t0, dur, peak, dest, { type = "bandpass", f0 = 1000, f1 = f0, q = 1, attack = 0.004 } = {}) {
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, attack, peak, dur); src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + attack + dur + 0.05);
  }
  const S = {
    step() { const t = T(), o = bus(0, 0.5); hiss(t, 0.05, 0.25, o, { type: "lowpass", f0: 700 }); tone("sine", 110, 55, t, 0.06, 0.25, o); },
    jump() { const t = T(), o = bus(0.05); hiss(t, 0.18, 0.18, o, { f0: 350, f1: 1600, q: 1.5, attack: 0.02 }); },
    land(h) { const t = T(), o = bus(0.1); tone("sine", 150, 42, t, 0.22 + h * 0.2, 0.3 + h * 0.5, o); hiss(t, 0.12 + h * 0.15, 0.2 + h * 0.3, o, { type: "lowpass", f0: 900, f1: 300 }); },
    takeoff() {
      const t = T(), o = bus(0.25);
      hiss(t, 0.5, 0.35, o, { f0: 250, f1: 2600, q: 1.2, attack: 0.03 });
      tone("sawtooth", 90, 360, t, 0.45, 0.06, o, 0.03); tone("sine", 220, 880, t, 0.4, 0.12, o, 0.02);
    },
    land_fly() { const t = T(), o = bus(0.1); hiss(t, 0.25, 0.2, o, { f0: 1800, f1: 300, q: 1 }); },
    whoosh(e) { const t = T(), o = bus(0.1); hiss(t, e ? 0.2 : 0.13, e ? 0.5 : 0.32, o, { f0: 400, f1: e ? 3500 : 2400, q: 2.2, attack: 0.01 }); },
    impact(e) {
      const t = T(), o = bus(e ? 0.55 : 0.2);
      tone("sine", e ? 170 : 210, 36, t, e ? 0.55 : 0.25, e ? 1 : 0.6, o);
      hiss(t, 0.09, e ? 0.7 : 0.45, o, { type: "lowpass", f0: 5000, f1: 500 });
      if (e) {
        tone("square", 95, 28, t, 0.4, 0.16, o);
        hiss(t + 0.01, 0.8, 0.3, o, { f0: 1400, f1: 120, q: 0.6 });
        tone("sine", 1600, 2600, t, 0.3, 0.05, o);
      }
    },
    hit(e) { const t = T(), o = bus(0.15); hiss(t, 0.07, e ? 0.5 : 0.35, o, { type: "highpass", f0: 1800 }); tone("triangle", 320, 80, t, 0.14, e ? 0.4 : 0.28, o); },
    chargeReady() { const t = T(), o = bus(0.5); tone("sine", 1320, 1320, t, 0.7, 0.14, o); tone("sine", 1980, 1980, t, 0.45, 0.07, o); tone("triangle", 660, 660, t, 0.3, 0.06, o); },
    laserStart() { const t = T(), o = bus(0.1); tone("sawtooth", 160, 1500, t, 0.16, 0.08, o, 0.01); hiss(t, 0.16, 0.12, o, { f0: 1500, f1: 6000, q: 3, attack: 0.03 }); },
    laserEnd() { const t = T(), o = bus(0.15); tone("sawtooth", 1000, 110, t, 0.2, 0.08, o); hiss(t, 0.5, 0.1, o, { type: "highpass", f0: 3500, attack: 0.02 }); },
    hurt() { const t = T(), o = bus(0.1); tone("square", 240, 60, t, 0.28, 0.18, o); hiss(t, 0.18, 0.3, o, { type: "lowpass", f0: 1400 }); },
    dissolve() {
      const t = T(), o = bus(0.35);
      hiss(t, 1.1, 0.28, o, { f0: 900, f1: 250, q: 0.8, attack: 0.05 });
      for (let i = 0; i < 14; i++) hiss(t + Math.random() * 0.9, 0.02, 0.1 + Math.random() * 0.2, o, { type: "highpass", f0: 2500 + Math.random() * 3000 });
    },
  };
  function play(name, ...a) { if (ac && on && S[name]) S[name](...a); }
  // sons contínuos: feixe laser, zumbido da carga, jatos de voo
  function loopStart(name) {
    if (!ac || loops[name]) return;
    const t = T(), out = ac.createGain(); out.gain.setValueAtTime(0.0001, t); out.connect(master);
    const nodes = [], L = { out, nodes };
    const osc = (type, f, dest) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t); nodes.push(o); return o; };
    const noise = (dest) => { const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.connect(dest); n.start(t, Math.random()); nodes.push(n); return n; };
    if (name === "laser") {
      // zumbido elétrico: serras desafinadas → filtro → tremolo rápido; chiado extra quando o feixe acerta
      const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 0.9;
      const trem = ac.createGain(); trem.gain.value = 0.7; f.connect(trem); trem.connect(out);
      osc("sawtooth", 110, f); osc("sawtooth", 167, f); osc("square", 55, f);
      const lfo = osc("sine", 31, ac.createGain()); const lg = ac.createGain(); lg.gain.value = 0.35; lfo.disconnect(); lfo.connect(lg); lg.connect(trem.gain);
      const hf = ac.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 3500;
      L.sizzle = ac.createGain(); L.sizzle.gain.value = 0.05; noise(hf); hf.connect(L.sizzle); L.sizzle.connect(out);
      out.gain.exponentialRampToValueAtTime(0.28, t + 0.05);
    } else if (name === "charge") {
      L.f = ac.createBiquadFilter(); L.f.type = "lowpass"; L.f.frequency.value = 500; L.f.connect(out);
      L.o1 = osc("sawtooth", 70, L.f); L.o2 = osc("triangle", 140, L.f);
      out.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
    } else if (name === "flight") {
      L.f = ac.createBiquadFilter(); L.f.type = "bandpass"; L.f.frequency.value = 700; L.f.Q.value = 0.7; L.f.connect(out);
      noise(L.f); L.rumble = osc("sine", 48, out);
      out.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
    }
    loops[name] = L;
  }
  function loopStop(name, rel = 0.15) {
    const L = loops[name]; if (!L) return;
    const t = T();
    L.out.gain.cancelScheduledValues(t); L.out.gain.setValueAtTime(Math.max(L.out.gain.value, 0.0002), t);
    L.out.gain.exponentialRampToValueAtTime(0.0001, t + rel);
    for (const n of L.nodes) { try { n.stop(t + rel + 0.05); } catch (e) {} }
    delete loops[name];
  }
  function loopSet(name, fn) { const L = loops[name]; if (L && ac) fn(L, T()); }
  function toggle() { on = !on; if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.02); return on; }
  return { init, play, loopStart, loopStop, loopSet, toggle, get on() { return on; } };
})();
// qualquer toque/tecla desbloqueia o áudio
for (const ev of ["pointerdown", "touchstart", "keydown"]) addEventListener(ev, () => SFX.init(), { capture: true, passive: true });
const sndBtn = document.getElementById("snd");
if (sndBtn) sndBtn.addEventListener("click", e => { e.stopPropagation(); SFX.init(); sndBtn.textContent = SFX.toggle() ? "SOM: ON" : "SOM: OFF"; });

// ---------------------------------------------------------------- partículas
// render: "streak" (rasto de faísca), "glow" (bolha de energia), "smoke", "dot", "chunk" (detrito)
const FX = {
  sparkHot:  { render: "streak", add: true, ramp: ramp(["#ffffff", "#fff2b8", "#ffab3d", "#ff3a2a", "#4a0800"]), grav: 900, drag: 0.97, stretch: 0.03 },
  sparkRed:  { render: "streak", add: true, ramp: ramp(["#ffffff", "#ffc2c8", "#ff2b3d", "#7a0010"]), grav: 500, drag: 0.96, stretch: 0.035 },
  sparkCyan: { render: "streak", add: true, ramp: ramp(["#ffffff", "#c8fbff", "#3fe6ff", "#2a6bff", "#08205a"]), grav: 120, drag: 0.94, stretch: 0.04 },
  windLine:  { render: "streak", add: true, ramp: ramp(["#ffffff", "#9ff3ff"]), grav: 0, drag: 1, stretch: 0.06, alpha: 0.35 },
  orbRed:    { render: "glow", add: true, hex: "#ff2b3d", grav: 0, drag: 0.92 },
  orbCyan:   { render: "glow", add: true, hex: "#3fe6ff", grav: 0, drag: 0.92 },
  orbWhite:  { render: "glow", add: true, hex: "#ffffff", grav: 0, drag: 0.92 },
  ember:     { render: "dot", add: true, ramp: ramp(["#fff2b8", "#ffab3d", "#ff3a2a", "#3a0500"]), grav: -40, drag: 0.98, turb: 60 },
  ash:       { render: "dot", add: false, ramp: ramp(["#9a9ca3", "#55575e", "#2a2b30"]), grav: -25, drag: 0.98, turb: 50 },
  smoke:     { render: "smoke", add: false, hex: "#3d404a", grav: -40, drag: 0.95, alpha: 0.55 },
  steam:     { render: "smoke", add: false, hex: "#8a8f9c", grav: -60, drag: 0.94, alpha: 0.35 },
  dust:      { render: "smoke", add: false, hex: "#5b5a5f", grav: -15, drag: 0.9, alpha: 0.6 },
  debris:    { render: "chunk", add: false, ramp: ramp(["#3a3f4c", "#232833"]), grav: 1500, drag: 0.99, bounce: 0.35 },
};
const POOL = Array.from({ length: 700 }, () => ({ live: 0 }));
let poolCursor = 0;
function emit(type, x, y, vx, vy, life, size0, size1 = size0 * 0.3, layer = "front", extra) {
  // procura um slot livre a partir do cursor; se não houver, reutiliza o mais antigo
  let p = null;
  for (let i = 0; i < POOL.length; i++) {
    const q = POOL[(poolCursor + i) % POOL.length];
    if (q.live <= 0) { p = q; poolCursor = (poolCursor + i + 1) % POOL.length; break; }
  }
  if (!p) { p = POOL[poolCursor]; poolCursor = (poolCursor + 1) % POOL.length; }
  const d = FX[type];
  p.d = d; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.live = p.max = life; p.s0 = size0; p.s1 = size1;
  p.layer = layer; p.seed = Math.random() * 100; p.orbit = null; p.rot = Math.random() * 6;
  if (extra) Object.assign(p, extra);
  return p;
}
function spray(type, x, y, n, { speed = 200, dir = 0, spread = Math.PI * 2, life = 0.4, size = 2, size1, layer = "front", inherit = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() - 0.5) * spread, v = speed * rand(0.35, 1.15);
    emit(type, x, y, Math.cos(a) * v + k.vx * inherit, Math.sin(a) * v + k.vy * inherit, life * rand(0.6, 1.3), size * rand(0.7, 1.3), size1, layer);
  }
}
// partículas em espiral que convergem para um ponto que se move (punho/visor)
function orbitIn(type, getCenter, n, radius, life, size) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    emit(type, 0, 0, 0, 0, life, size, size * 0.4, "front", { orbit: { get: getCenter, ang, rad: radius * rand(0.7, 1.2), r0: 0, av: rand(5, 9) * (Math.random() < 0.5 ? -1 : 1) } });
  }
}
function groundBelow(x, y) {
  let best = Infinity;
  for (const s of solids) if (x >= s.x && x <= s.x + s.w && s.y >= y - 2 && s.y < best) best = s.y;
  return best;
}
function updateParticles(dt) {
  for (const p of POOL) {
    if (p.live <= 0) continue;
    p.live -= dt;
    const d = p.d;
    if (p.orbit) {
      const o = p.orbit, c = o.get(), t = 1 - p.live / p.max;
      o.ang += o.av * dt;
      const r = o.rad * (1 - easeOut(t));
      const nx = c.x + Math.cos(o.ang) * r, ny = c.y + Math.sin(o.ang) * r * 0.7;
      p.vx = (nx - p.x) / dt; p.vy = (ny - p.y) / dt;   // velocidade real → rasto correto
      if (p.x === 0 && p.y === 0) p.vx = p.vy = 0;
      p.x = nx; p.y = ny;
      continue;
    }
    const drag = Math.pow(d.drag, dt * 60);
    p.vx *= drag; p.vy *= drag;
    p.vy += d.grav * dt;
    if (d.turb) { p.vx += Math.sin(p.seed + time * 3.1) * d.turb * dt; p.vy += Math.cos(p.seed * 1.7 + time * 2.3) * d.turb * dt * 0.5; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (d.bounce && p.vy > 0) {
      const gy = groundBelow(p.x, p.y - 8);
      if (p.y > gy) { p.y = gy; p.vy *= -d.bounce; p.vx *= 0.6; }
    }
    p.rot += p.vx * dt * 0.05;
  }
}
function drawParticles(layer) {
  for (let pass = 0; pass < 2; pass++) {       // primeiro normais (fumo/pó), depois aditivos (luz)
    pass === 0 ? NORMAL() : ADD();
    for (const p of POOL) {
      if (p.live <= 0 || p.layer !== layer || (pass === 1) !== p.d.add) continue;
      const d = p.d, t = 1 - p.live / p.max, size = lerp(p.s0, p.s1, t);
      const a = (d.alpha ?? 1) * (d.render === "smoke" ? Math.sin(Math.PI * Math.min(1, t * 1.3 + 0.08)) : Math.pow(1 - t, 0.8));
      if (d.render === "glow") { glow(p.x, p.y, size, d.hex, a); continue; }
      if (d.render === "smoke") {
        ctx.globalAlpha = a;
        ctx.drawImage(smokeTex(d.hex), p.x - size, p.y - size, size * 2, size * 2);
        continue;
      }
      ctx.globalAlpha = a;
      const col = d.ramp[Math.min(d.ramp.length - 1, (t * d.ramp.length) | 0)];
      if (d.render === "streak") {
        ctx.strokeStyle = col; ctx.lineWidth = size; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * d.stretch, p.y - p.vy * d.stretch); ctx.stroke();
      } else {
        ctx.fillStyle = col;
        const s = Math.max(1, size);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
  }
  NORMAL();
}

// ---------------------------------------------------------------- anéis, decalques, luzes, ecrã
const rings = [], decals = [], lights = [], screenLines = [];
let screenFlash = 0, screenFlashHex = "#ffffff";
function ring(o) { rings.push(Object.assign({ t: 0, dur: 0.3, r0: 6, r1: 60, hex: PAL.cyan, width: 6, arc: Math.PI * 2, facing: 1, rot: 0, flat: 1 }, o)); }
function light(x, y, r, hex, a = 1) { lights.push({ x, y, r, hex, a }); }
function speedLines(x, y, dur = 0.18) { screenLines.push({ x, y, t: 0, dur, seed: Math.random() * 100 }); }
function flash(a, hex = "#ffffff") { screenFlash = Math.max(screenFlash, a); screenFlashHex = hex; }
function scorch(x, y, nx, ny) {
  const last = decals[decals.length - 1];
  if (last && Math.hypot(last.x - x, last.y - y) < 5) { last.life = last.max; return; }
  decals.push({ x, y, nx, ny, life: 4, max: 4, r: rand(5, 8) });
  if (decals.length > 60) decals.shift();
}
function updateWorldFx(dt) {
  for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].t += dt) >= rings[i].dur) rings.splice(i, 1);
  for (let i = decals.length - 1; i >= 0; i--) if ((decals[i].life -= dt) <= 0) decals.splice(i, 1);
  for (let i = screenLines.length - 1; i >= 0; i--) if ((screenLines[i].t += dt) >= screenLines[i].dur) screenLines.splice(i, 1);
  screenFlash = Math.max(0, screenFlash - dt * 4);
}
function drawRings() {
  ADD();
  for (const r of rings) {
    const t = r.t / r.dur, e = easeOut(t), rad = lerp(r.r0, r.r1, e), fade = 1 - t;
    ctx.save(); ctx.translate(r.x, r.y); ctx.scale(r.facing, r.flat); ctx.rotate(r.rot);
    ctx.lineCap = "round";
    const layers = [[2.6, 0.22, r.hex], [1, 0.9, r.hex], [0.35, 1, "#ffffff"]];
    for (const [wk, ak, col] of layers) {
      ctx.globalAlpha = ak * fade; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, r.width * wk * (1 - t * 0.7));
      ctx.beginPath(); ctx.arc(0, 0, rad, -r.arc / 2, r.arc / 2); ctx.stroke();
    }
    ctx.restore();
  }
  NORMAL();
}
function drawDecals() {
  for (const d of decals) {
    const t = d.life / d.max;
    NORMAL(); ctx.globalAlpha = 0.55 * Math.min(1, t * 2);
    ctx.fillStyle = "#0a0a0d";
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.ny ? d.r * 1.6 : d.r * 0.6, d.ny ? d.r * 0.6 : d.r * 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ADD(); glow(d.x, d.y, d.r * 1.8, PAL.ember, Math.pow(t, 3) * 0.9);   // metal ainda incandescente
  }
  NORMAL();
}
// Luz dinâmica: brilho aditivo amplo + reflexo achatado no chão/plataforma por baixo.
function drawLights() {
  ADD();
  for (const l of lights) {
    glow(l.x, l.y, l.r, l.hex, l.a * 0.35);
    const gy = groundBelow(l.x, l.y);
    const dist = gy - l.y;
    if (dist < 220) {
      const f = (1 - dist / 220) * l.a;
      ctx.save(); ctx.translate(l.x, gy); ctx.scale(1, 0.16);
      glow(0, 0, l.r * 1.4, l.hex, f * 0.7);
      ctx.restore();
    }
  }
  NORMAL();
}

// ---------------------------------------------------------------- input
const held = {}, prev = {};
const pressed = n => held[n] && !prev[n];
const released = n => !held[n] && prev[n];
const KEYMAP = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down", Space: "jump", ShiftLeft: "fly", ShiftRight: "fly", KeyF: "fly", KeyJ: "laser", KeyK: "punch" };
addEventListener("keydown", e => { if (KEYMAP[e.code]) { held[KEYMAP[e.code]] = true; e.preventDefault(); } });
addEventListener("keyup", e => { if (KEYMAP[e.code]) held[KEYMAP[e.code]] = false; });
document.querySelectorAll(".btn").forEach(b => {
  const n = b.dataset.k;
  const on = e => { e.preventDefault(); held[n] = true; b.classList.add("on"); try { b.setPointerCapture(e.pointerId); } catch {} };
  const off = () => { held[n] = false; b.classList.remove("on"); };
  b.addEventListener("pointerdown", on);
  b.addEventListener("pointerup", off);
  b.addEventListener("pointercancel", off);
  b.addEventListener("lostpointercapture", off);
  b.addEventListener("contextmenu", e => e.preventDefault());
});
document.addEventListener("gesturestart", e => e.preventDefault());

// ---------------------------------------------------------------- física
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const bodyRect = (o, w, h) => ({ x: o.x - w / 2, y: o.y - h, w, h });
function moveAndSlide(o, w, h, dt) {
  o.onFloor = false;
  o.x += o.vx * dt;
  for (const s of solids) if (overlap(bodyRect(o, w, h), s)) { o.x = o.vx > 0 ? s.x - w / 2 : s.x + s.w + w / 2; o.vx = 0; }
  o.y += o.vy * dt;
  for (const s of solids) if (overlap(bodyRect(o, w, h), s)) {
    if (o.vy > 0) { o.y = s.y; o.onFloor = true; } else o.y = s.y + s.h + h;
    o.vy = 0;
  }
  if (!o.onFloor) { const pr = bodyRect(o, w, h); pr.y += 1; o.onFloor = o.vy >= 0 && solids.some(s => overlap(pr, s)); }
}
// raio contra retângulo: distância e normal da face atingida
function rayHit(ox, oy, dx, dy, r) {
  let tmin = 0, tmax = Infinity, nx = 0, ny = 0;
  const axes = [[ox, dx, r.x, r.x + r.w, 0], [oy, dy, r.y, r.y + r.h, 1]];
  for (const [o, d, lo, hi, ax] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = ax === 0 ? s : 0; ny = ax === 1 ? s : 0; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return { t: tmin, nx, ny };
}

// ---------------------------------------------------------------- inimigos
function hitEnemy(e, dmg, kx, ky) {
  e.hp -= dmg; e.vx += kx; e.vy += ky; e.flash = 0.1; e.squash = 0.15;
  floats.push({ x: e.x + rand(-10, 10), y: e.y - e.h - 10, v: Math.round(dmg), t: 0.8, big: dmg > 30 });
  if (e.hp <= 0) { e.dead = 2.8; e.dissolve = 0.75; addTrauma(0.25); SFX.play("dissolve"); }
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dissolve > 0) {
      e.dissolve -= dt;
      // frente de dissolução a subir: cinzas e brasas a soltar-se
      const cut = e.y - e.h * (1 - Math.max(e.dissolve, 0) / 0.75);
      for (let i = 0; i < 3; i++) {
        const x = e.x + rand(-e.w / 2, e.w / 2);
        emit(Math.random() < 0.35 ? "ember" : "ash", x, cut, rand(-20, 20), rand(-90, -30), rand(0.7, 1.4), rand(2, 3.5), 1);
      }
      light(e.x, cut, 70, PAL.ember, 0.8);
    }
    if (e.dead > 0) {
      e.dead -= dt;
      if (e.dead <= 0) Object.assign(e, { dead: 0, dissolve: 0, hp: e.maxHp, x: e.home, y: FLOOR_Y, vx: 0, vy: 0 });
      continue;
    }
    e.vy = Math.min(e.vy + 1400 * dt, 900);
    e.vx = approach(e.vx, 0, 1200 * dt);
    moveAndSlide(e, e.w, e.h, dt);
    e.flash = Math.max(e.flash - dt, 0);
    e.squash = Math.max(e.squash - dt, 0);
  }
  floats = floats.filter(f => (f.t -= dt) > 0);
}
const enemyAlive = e => e.dead <= 0;

// ---------------------------------------------------------------- Kane: pontos no mundo
// ponto do sprite → mundo, com a mesma rotação do corpo usada no desenho
function pivotFor(pose) { return pose === "fly" ? PT.pivotFly : pose === "run" || pose === "ground" ? { x: 0, y: 0 } : PT.pivotBody; }
function local(p) {
  const pv = pivotFor(kaneFrame()[2]), c = Math.cos(k.rot), sn = Math.sin(k.rot);
  const dx = p.x - pv.x, dy = p.y - pv.y;
  return { x: k.x + (pv.x + dx * c - dy * sn) * k.facing, y: k.y + pv.y + dx * sn + dy * c };
}
function eyeWorld() { const [row] = kaneFrame(); return local(row === ROW.punch ? PT.eyeGuard : PT.eyeIdle); }
const fistGuardWorld = () => local(PT.fistGuard);

function setFlying(on) {
  if (on === k.flying) return;
  k.flying = on;
  if (!on) { SFX.loopStop("flight", 0.3); SFX.play("land_fly"); return; }
  SFX.play("takeoff"); SFX.loopStart("flight");
  k.vy = Math.min(k.vy, -60);
  // descolagem: onda no chão, pó em leque, jatos para baixo e um clarão
  const gy = groundBelow(k.x, k.y);
  if (gy - k.y < 60) {
    ring({ x: k.x, y: gy, r0: 10, r1: 90, flat: 0.22, hex: PAL.cyan, width: 6, dur: 0.4 });
    for (let i = 0; i < 14; i++) { const s = Math.random() < 0.5 ? -1 : 1; emit("dust", k.x + s * rand(4, 20), gy - 4, s * rand(120, 260), rand(-40, -10), rand(0.5, 0.8), rand(8, 12), 20, "back"); }
  }
  spray("sparkCyan", k.x, k.y, 16, { speed: 380, dir: Math.PI / 2, spread: 1.2, life: 0.3, size: 2 });
  spray("orbCyan", k.x, k.y, 6, { speed: 120, dir: Math.PI / 2, spread: 1.6, life: 0.3, size: 14, size1: 2 });
  light(k.x, k.y, 160, PAL.cyan, 1);
  addTrauma(0.15);
}
function start(a) { k.action = a; k.t = 0; }
function setFury(v) { k.fury = clamp(v, 0, C.maxFury); }
function inputVec() {
  let x = (held.right ? 1 : 0) - (held.left ? 1 : 0), y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  return { x, y };
}
function aimDir(inp) {
  if (inp.y < -0.5) return { dx: k.facing * Math.SQRT1_2, dy: -Math.SQRT1_2 };
  if (inp.y > 0.5 && !k.onFloor) return { dx: k.facing * Math.SQRT1_2, dy: Math.SQRT1_2 };
  return { dx: k.facing, dy: 0 };
}
function castLaser(ox, oy, dx, dy) {
  let best = C.laserRange, target = null, nx = 0, ny = 0;
  for (const s of solids) { const h = rayHit(ox, oy, dx, dy, s); if (h && h.t < best) { best = h.t; target = null; nx = h.nx; ny = h.ny; } }
  for (const e of enemies) if (enemyAlive(e)) { const h = rayHit(ox, oy, dx, dy, bodyRect(e, e.w, e.h)); if (h && h.t < best) { best = h.t; target = e; nx = h.nx; ny = h.ny; } }
  return { ox, oy, dx, dy, len: best, ex: ox + dx * best, ey: oy + dy * best, hit: best < C.laserRange, target, nx, ny };
}

function updateKane(dt) {
  if (k.dead) { k.vy = Math.min(k.vy + C.gravity * dt, C.maxFall); k.vx = approach(k.vx, 0, C.groundFriction * dt); moveAndSlide(k, C.bodyW, C.bodyH, dt); return; }
  const inp = inputVec();
  if (pressed("jump")) k.jumpBuf = C.jumpBuffer;
  if (pressed("fly")) setFlying(!k.flying);
  if (k.action === "none" || k.action === "charge") {
    const f = inp.x > 0.1 ? 1 : inp.x < -0.1 ? -1 : k.facing;
    if (f !== k.facing) {
      k.facing = f; k.turnT = 0.09;
      if (k.onFloor && Math.abs(k.vx) > 120) {   // derrapagem ao virar a correr
        for (let i = 0; i < 5; i++) emit("dust", k.x, k.y - 3, -f * rand(60, 140), rand(-30, -5), rand(0.4, 0.6), rand(6, 9), 16, "back");
      }
    }
  }
  k.jumpBuf = Math.max(k.jumpBuf - dt, 0);
  k.invuln = Math.max(k.invuln - dt, 0);
  k.coyote = k.onFloor ? C.coyote : Math.max(k.coyote - dt, 0);

  const wasFloor = k.onFloor, fallSpeed = k.vy;
  k.t += dt; k.beam = null;
  if (k.action === "none") {
    if (pressed("laser") && k.fury >= C.laserMinFury) { start("laser"); k.laserTick = 0; k.lastBeam = null; k.laserSound = false; SFX.play("laserStart"); }
    else if (pressed("punch")) { start("charge"); SFX.loopStart("charge"); }
  } else if (k.action === "charge") {
    chargeFx(dt);
    if (!held.punch) {
      k.chargedPing = false;
      SFX.loopStop("charge", 0.06);
      k.energy = k.t >= C.chargeTime && k.fury >= C.energyCost;
      if (k.energy) setFury(k.fury - C.energyCost);
      k.hitIds.clear(); start("punch");
      k.vx += k.facing * C.punchLunge * (k.energy ? 1.5 : 1);
      SFX.play("whoosh", k.energy);
    }
  } else if (k.action === "punch") {
    if (k.t >= C.punchWindup && k.t - dt < C.punchWindup) punchImpactFx();
    if (k.t >= C.punchWindup && k.t < C.punchWindup + C.punchActive) punchQuery();
    else if (k.t >= C.punchWindup + C.punchActive + C.punchRecovery) start("none");
  } else if (k.action === "laser") {
    const eye = eyeWorld(), dir = aimDir(inp);
    k.aim = castLaser(eye.x, eye.y, dir.dx, dir.dy);
    if (!held.laser || k.fury <= 0) {
      start("none");
      if (k.lastBeam) { laserEndFx(eye); SFX.loopStop("laser", 0.08); SFX.play("laserEnd"); }
    } else if (k.t >= C.laserWindup) fireLaser(dt);
    else laserWindupFx(eye, dt);
  }
  if (k.action !== "laser") k.aim = null;

  // locomoção
  const mult = { laser: C.laserMoveMult, punch: 0, charge: 0.5 }[k.action] ?? 1;
  let jumped = false;
  if (k.flying) {
    const tx = inp.x * C.flightSpeed * mult, ty = inp.y * C.flightSpeed * mult;
    const dx = tx - k.vx, dy = ty - k.vy, d = Math.hypot(dx, dy), step = C.flightAccel * dt;
    if (d <= step) { k.vx = tx; k.vy = ty; } else { k.vx += dx / d * step; k.vy += dy / d * step; }
    if (k.onFloor && inp.y > 0.5) setFlying(false);
  } else {
    const tx = inp.x * C.runSpeed * mult;
    const acc = k.onFloor ? (tx === 0 ? C.groundFriction : C.groundAccel) : C.airAccel;
    k.vx = approach(k.vx, tx, acc * dt);
    k.vy = Math.min(k.vy + C.gravity * (k.vy > 0 ? C.fallMult : 1) * dt, C.maxFall);
    const canJump = k.action !== "punch" && k.action !== "laser";
    if (k.jumpBuf > 0 && canJump) {
      if (k.coyote > 0) { k.vy = C.jumpVel; k.jumpBuf = 0; k.coyote = 0; jumped = true; }
      else if (pressed("jump")) { setFlying(true); k.jumpBuf = 0; }
    }
    if (released("jump") && k.vy < 0) k.vy *= C.jumpCut;
  }
  moveAndSlide(k, C.bodyW, C.bodyH, dt);
  if (k.y < 70) { k.y = 70; k.vy = Math.max(k.vy, 0); }

  if (k.action !== "laser") setFury(k.fury + C.furyRegen * dt);
  k.anim += dt;
  updateAnimState();
  movementFx(dt, wasFloor, fallSpeed, jumped);
  ambientFx(dt);

  const kr = bodyRect(k, C.bodyW, C.bodyH);
  for (const e of enemies) if (enemyAlive(e) && k.invuln <= 0 && overlap(kr, bodyRect(e, e.w, e.h))) {
    k.hp = Math.max(0, k.hp - 10); k.invuln = C.invuln; k.hurtFlash = 0.25;
    k.vx = Math.sign(k.x - e.x || 1) * 260; k.vy = -220;
    start("none"); addTrauma(0.35, Math.sign(k.x - e.x) * 6, 0); flash(0.25, PAL.red);
    SFX.play("hurt"); SFX.loopStop("charge", 0.05); SFX.loopStop("laser", 0.05);
    spray("sparkHot", k.x, k.y - 60, 14, { speed: 300, life: 0.35, size: 2 });
    if (k.hp <= 0) { k.dead = true; k.flying = false; SFX.loopStop("flight"); setTimeout(respawn, 1500); }
  }
}
function respawn() { Object.assign(k, { x: 320, y: FLOOR_Y, vx: 0, vy: 0, hp: C.maxHp, fury: C.maxFury, dead: false, invuln: 1, action: "none" }); }

// ---------------------------------------------------------------- estado de animação
function updateAnimState() {
  const sp = Math.abs(k.vx);
  if (k.moveAnim && sp < 18) k.moveAnim = false;
  else if (!k.moveAnim && sp > 45) k.moveAnim = true;
  // pose de voo horizontal só com deslocação horizontal real; a subir/descer na vertical paira
  if (!k.flying) k.flyPose = false;
  else if (k.flyPose && sp < 35) k.flyPose = false;
  else if (!k.flyPose && sp > 70) k.flyPose = true;
}
// [linha, coluna, pose]
function kaneFrame() {
  if (k.action === "laser" || k.action === "charge") return [ROW.punch, 0, "attack"];
  if (k.action === "punch") {
    const t = k.t, w = C.punchWindup, a = C.punchActive, r = C.punchRecovery;
    if (t < w) return [ROW.punch, 0, "attack"];
    if (t < w + a + r * 0.4) return [ROW.punch, 1, "attack"];
    if (t < w + a + r * 0.75) return [ROW.punch, 2, "attack"];
    return [ROW.punch, 3, "attack"];
  }
  if (k.flying) {
    // voo: frames 1-2-3-2 (pernas estendidas, só a capa ondula). Nada de ciclo de pernas = não "anda" no ar.
    if (k.flyPose) return [ROW.move, [1, 2, 3, 2][Math.floor(k.anim * 8) % 4], "fly"];
    // pairar: só os dois frames com as pernas juntas, devagar
    return [ROW.idle, Math.floor(k.anim * 3) % 2, "hover"];
  }
  if (!k.onFloor) return [ROW.idle, k.vy < 0 ? 2 : 3, "air"];
  if (k.moveAnim) return [ROW.idle, Math.floor(k.anim * 12) % 4, "run"];
  return [ROW.idle, Math.floor(k.anim * 8) % 4, "ground"];
}

// ---------------------------------------------------------------- VFX: movimento
function movementFx(dt, wasFloor, fallSpeed, jumped) {
  k.squash = Math.max(0, k.squash - dt);
  k.stretch = Math.max(0, k.stretch - dt);
  k.turnT = Math.max(0, k.turnT - dt);
  k.hurtFlash = Math.max(0, k.hurtFlash - dt);
  k.whiteFlash = Math.max(0, k.whiteFlash - dt);
  const [, , pose] = kaneFrame();
  // rotação do corpo (positivo = inclina para a frente / mergulha), suavizada
  let rotTarget = 0;
  if (pose === "fly") rotTarget = clamp(Math.atan2(k.vy, Math.abs(k.vx)) * 0.85, -0.75, 0.75);   // aponta para onde voa
  else if (pose === "hover") rotTarget = clamp(k.vx * k.facing / C.flightSpeed * 0.35, -0.2, 0.3) + clamp(-k.vy / C.flightSpeed, -1, 1) * 0.05;
  else if (pose === "run") rotTarget = 0.1 * Math.min(Math.abs(k.vx) / C.runSpeed, 1);
  else if (pose === "air") rotTarget = clamp(k.vx * k.facing / C.runSpeed * 0.08, -0.08, 0.08);
  k.rot += (rotTarget - k.rot) * Math.min(1, dt * (pose === "fly" ? 7 : 10));

  if (jumped) {
    k.stretch = 0.14; SFX.play("jump");
    for (let i = 0; i < 8; i++) { const s = i % 2 ? -1 : 1; emit("dust", k.x + s * 6, k.y - 2, s * rand(40, 120), rand(-60, -20), rand(0.4, 0.6), rand(6, 9), 16, "back"); }
  }
  if (k.onFloor && !wasFloor && fallSpeed > 250) {
    const heavy = clamp((fallSpeed - 250) / 600, 0, 1);
    SFX.play("land", heavy);
    k.squash = 0.12 + heavy * 0.06;
    for (let i = 0; i < 10 + heavy * 12; i++) { const s = i % 2 ? -1 : 1; emit("dust", k.x + s * rand(4, 16), k.y - 3, s * rand(100, 240) * (0.6 + heavy), rand(-50, -10), rand(0.45, 0.8), rand(7, 11), 22, "back"); }
    if (heavy > 0.3) {
      ring({ x: k.x, y: k.y, r0: 10, r1: 70 + heavy * 50, flat: 0.2, hex: "#c8973f", width: 4, dur: 0.35 });
      spray("debris", k.x, k.y - 4, 6 + heavy * 8, { speed: 260, dir: -Math.PI / 2, spread: 2.2, life: 0.9, size: 3 });
      addTrauma(0.2 + heavy * 0.25, 0, 4);
    }
  }
  if (pose === "run") {   // pó nos passos
    k.stepT += dt;
    if (k.stepT > 1 / 6) { k.stepT = 0; SFX.play("step"); for (let i = 0; i < 2; i++) emit("dust", k.x - 10 * k.facing, k.y - 3, -k.facing * rand(30, 80), rand(-35, -10), rand(0.35, 0.55), rand(5, 7), 12, "back"); }
  }
  if (k.flying) flightFx(dt, pose);
}

function flightFx(dt, pose) {
  const speed = Math.hypot(k.vx, k.vy);
  SFX.loopStart("flight");
  SFX.loopSet("flight", (L, t) => {
    const v = Math.min(speed / C.flightSpeed, 1);
    L.f.frequency.setTargetAtTime(500 + v * 1400, t, 0.08);
    L.out.gain.setTargetAtTime(0.08 + v * 0.22, t, 0.1);
    L.rumble.frequency.setTargetAtTime(45 + v * 25, t, 0.1);
  });
  if (pose === "fly") {
    for (const f of PT.flightFeet) {     // rasto contínuo dos jatos
      const p = local(f);
      emit(Math.random() < 0.75 ? "sparkCyan" : "sparkRed", p.x, p.y, -k.facing * rand(260, 420) + k.vx * 0.3, rand(-30, 30) + k.vy * 0.3, rand(0.15, 0.3), rand(1.5, 2.5), 0.5, "back");
      if (Math.random() < 0.5) emit("orbCyan", p.x, p.y, -k.facing * rand(120, 200), rand(-15, 15), 0.22, rand(8, 12), 2, "back");
    }
    light(k.x - 50 * k.facing, k.y - 56, 120, PAL.cyan, 0.8);
    if (speed > 200) {                    // linhas de vento à volta do corpo
      if (Math.random() < 0.7) emit("windLine", k.x + rand(-60, 80) * k.facing, k.y - rand(20, 130), -k.vx * 1.6, -k.vy * 1.6, 0.14, 1.2, 1.2, "front");
      k.ghostT += dt;
      if (k.ghostT > 0.075 && k.action === "none") { k.ghostT = 0; const [row, col] = kaneFrame(); ghosts.push({ x: k.x, y: k.y, row, col, facing: k.facing, rot: k.rot, pv: pivotFor("fly"), t: 0.25 }); }
    }
  } else {
    // pairar: jatos para baixo, faúlhas e "lavagem" de ar no chão
    for (const f of PT.hoverFeet) {
      const p = local(f);
      if (Math.random() < 0.6) emit(Math.random() < 0.7 ? "sparkCyan" : "sparkRed", p.x + rand(-3, 3), p.y + 6, rand(-20, 20), rand(220, 360), rand(0.12, 0.22), rand(1.2, 2), 0.5, "back");
    }
    light(k.x, k.y + 10, 110, PAL.cyan, 0.7);
    const gy = groundBelow(k.x, k.y), h = gy - k.y;
    if (h < 170 && Math.random() < 0.5 * (1 - h / 170)) {
      const s = Math.random() < 0.5 ? -1 : 1;
      emit("dust", k.x + s * rand(4, 18), gy - 3, s * rand(90, 180), rand(-20, -5), rand(0.4, 0.7), rand(6, 9), 16, "back");
    }
  }
}

// partículas ambientes de poder: brasas vermelhas na mão de trás, faíscas ciano no punho
function ambientFx(dt) {
  const [row, , pose] = kaneFrame();
  if (row !== ROW.idle || k.dead) return;
  if (Math.random() < 0.18) { const h = local(PT.handBack); emit("ember", h.x + rand(-4, 4), h.y + rand(-4, 4), rand(-15, 15), rand(-50, -20), rand(0.5, 0.9), rand(1.5, 2.5), 1, "front"); }
  if (Math.random() < 0.12) { const f = local(PT.fistIdle); emit("sparkCyan", f.x + rand(-3, 3), f.y + rand(-3, 3), rand(-40, 40), rand(-60, 10), rand(0.12, 0.2), 1.2, 0.5, "front"); }
}

// ---------------------------------------------------------------- VFX: soco
function chargeFx(dt) {
  const charged = k.t >= C.chargeTime && k.fury >= C.energyCost, grow = Math.min(k.t / C.chargeTime, 1);
  // energia em espiral a entrar no punho
  if (Math.random() < 0.6 + grow * 0.4) orbitIn(charged ? "sparkCyan" : "sparkRed", fistGuardWorld, 1, 46 + grow * 20, 0.28, 1.8);
  if (Math.random() < 0.35) orbitIn(charged ? "orbCyan" : "orbRed", fistGuardWorld, 1, 40, 0.3, 7);
  const f = fistGuardWorld();
  light(f.x, f.y, 90 + grow * 90, charged ? PAL.cyan : PAL.red, 0.6 + grow * 0.5);
  if (charged && k.onFloor && Math.random() < 0.4) {   // pó a ser puxado para o Kane
    const s = Math.random() < 0.5 ? -1 : 1;
    emit("dust", k.x + s * rand(60, 90), k.y - 3, -s * rand(80, 140), rand(-20, -5), 0.45, 6, 10, "back");
  }
  SFX.loopSet("charge", (L, t) => {
    L.o1.frequency.setTargetAtTime(70 + grow * 110, t, 0.05); L.o2.frequency.setTargetAtTime(140 + grow * 220, t, 0.05);
    L.f.frequency.setTargetAtTime(400 + grow * 1600, t, 0.05);
  });
  if (charged && !k.chargedPing) {
    k.chargedPing = true;
    SFX.play("chargeReady");
    ring({ x: f.x, y: f.y, r0: 4, r1: 50, hex: PAL.white, width: 4, dur: 0.25 });
    spray("sparkCyan", f.x, f.y, 18, { speed: 320, life: 0.3, size: 2 });
    k.whiteFlash = 0.08; zoomKick(0.03); addTrauma(0.12);
  }
}
function punchImpactFx() {
  const E = k.energy, s = E ? 1.5 : 1;
  SFX.play("impact", E);
  const f = local({ x: PT.fistPunch.x + 8, y: PT.fistPunch.y });
  const dir = k.facing > 0 ? 0 : Math.PI;
  ring({ x: f.x, y: f.y, r0: 8, r1: 54 * s, arc: Math.PI * 0.95, facing: k.facing, hex: PAL.cyan, width: 8 * s, dur: 0.24 });
  ring({ x: f.x, y: f.y, r0: 4, r1: 30 * s, hex: PAL.white, width: 4, dur: 0.14 });
  if (E) {
    ring({ x: f.x, y: f.y, r0: 18, r1: 120, arc: Math.PI * 0.8, facing: k.facing, hex: PAL.red, width: 7, dur: 0.38 });
    ring({ x: f.x + 30 * k.facing, y: f.y, r0: 10, r1: 160, arc: Math.PI * 0.5, facing: k.facing, hex: PAL.cyan, width: 4, dur: 0.45 });
    speedLines(f.x, f.y, 0.2); flash(0.35);
    zoomKick(0.07); addTrauma(0.45, k.facing * 10, 0);
    if (k.onFloor) {                                    // onda de choque pelo chão
      ring({ x: k.x + 40 * k.facing, y: k.y, r0: 10, r1: 160, flat: 0.18, hex: PAL.cyan, width: 5, dur: 0.45 });
      spray("debris", k.x + 50 * k.facing, k.y - 4, 10, { speed: 320, dir: -Math.PI / 2 + 0.6 * k.facing, spread: 1.4, life: 1, size: 3 });
      for (let i = 0; i < 12; i++) emit("dust", k.x + k.facing * rand(20, 80), k.y - 3, k.facing * rand(120, 320), rand(-60, -10), rand(0.5, 0.8), rand(8, 12), 22, "back");
    }
  } else { zoomKick(0.025); addTrauma(0.18, k.facing * 4, 0); }
  spray("sparkCyan", f.x, f.y, E ? 34 : 16, { speed: E ? 620 : 420, dir, spread: 1.3, life: 0.32, size: E ? 2.6 : 2 });
  spray("sparkRed", f.x, f.y, E ? 16 : 6, { speed: 480, dir, spread: 1.6, life: 0.3, size: 2 });
  spray("orbCyan", f.x, f.y, E ? 8 : 4, { speed: 160, dir, spread: 1.4, life: 0.25, size: E ? 22 : 14, size1: 2 });
  light(f.x, f.y, E ? 300 : 170, PAL.cyan, 1.2);
  // rasto do braço (linhas de velocidade)
  for (let i = 0; i < 6; i++) emit("windLine", k.x + rand(-30, 10) * k.facing, k.y - rand(60, 85), k.facing * 900, 0, 0.1, 1.5, 1.5, "back");
}
function punchQuery() {
  const s = k.energy ? C.energySizeMult : 1;
  const w = C.punchSize.w * s, h = C.punchSize.h * s;
  const cx = k.x + C.punchOff.x * s * k.facing, cy = k.y + C.punchOff.y;
  const box = { x: cx - w / 2, y: cy - h / 2, w, h };
  const dmg = C.punchDmg * (k.energy ? C.energyDmgMult : 1), kb = C.punchKnock * (k.energy ? C.energyKnockMult : 1);
  enemies.forEach((e, i) => {
    if (!enemyAlive(e) || k.hitIds.has(i) || !overlap(box, bodyRect(e, e.w, e.h))) return;
    k.hitIds.add(i);
    const n = Math.hypot(1, 0.35);
    hitEnemy(e, dmg, k.facing / n * kb, -0.35 / n * kb);
    setFury(k.fury + C.furyOnHit);
    hitstop = k.energy ? 0.14 : 0.07;
    SFX.play("hit", k.energy);
    k.whiteFlash = 0.06;
    const hx = e.x - k.facing * e.w / 2, hy = k.y + PT.fistPunch.y;
    ring({ x: hx, y: hy, r0: 4, r1: k.energy ? 70 : 40, hex: PAL.white, width: 5, dur: 0.2 });
    spray("sparkHot", hx, hy, k.energy ? 40 : 18, { speed: k.energy ? 650 : 420, dir: k.facing > 0 ? 0 : Math.PI, spread: 2.4, life: 0.4, size: 2.2 });
    light(hx, hy, k.energy ? 260 : 160, PAL.gold, 1.2);
    addTrauma(k.energy ? 0.5 : 0.28, k.facing * 8, 0);
  });
}

// ---------------------------------------------------------------- VFX: laser
function laserWindupFx(eye, dt) {
  const t = k.t / C.laserWindup;
  if (Math.random() < 0.9) orbitIn("sparkRed", eyeWorld, 1, 34, 0.14, 1.5);
  if (Math.random() < 0.4) orbitIn("orbRed", eyeWorld, 1, 26, 0.14, 5);
  light(eye.x, eye.y, 60 + t * 80, PAL.red, 0.5 + t * 0.6);
}
function fireLaser(dt) {
  const b = k.aim;
  k.beam = b; k.lastBeam = b; k.beamFade = 0.14;
  if (!k.laserSound) { k.laserSound = true; SFX.loopStart("laser"); }
  SFX.loopSet("laser", (L, t) => {
    L.sizzle.gain.setTargetAtTime(b.hit ? 0.55 : 0.05, t, 0.03);
    L.nodes[0].frequency.setTargetAtTime(110 + Math.random() * 8, t, 0.02);
  });
  if (b.target) {
    k.laserTick += dt;
    if (k.laserTick >= C.laserTick) {
      k.laserTick -= C.laserTick;
      hitEnemy(b.target, C.laserDps * C.laserTick, b.dx * C.laserKnock, b.dy * C.laserKnock);
      b.target.flash = 0.035;   // pisca em vez de ficar branco o tempo todo
    }
  }
  setFury(k.fury - C.laserFuryPerSec * dt);
  // impacto: faíscas refletidas pela normal, metal derretido, fumo, marca de queimado
  if (b.hit) {
    const rx = b.dx - 2 * (b.dx * b.nx + b.dy * b.ny) * b.nx, ry = b.dy - 2 * (b.dx * b.nx + b.dy * b.ny) * b.ny;
    const refl = Math.atan2(ry, rx);
    spray("sparkHot", b.ex, b.ey, 3, { speed: 520, dir: refl, spread: 1.6, life: 0.4, size: 2 });
    spray("sparkRed", b.ex, b.ey, 2, { speed: 360, dir: refl, spread: 2.2, life: 0.3, size: 1.6 });
    if (Math.random() < 0.25) emit("smoke", b.ex + b.nx * 6, b.ey + b.ny * 6, rand(-20, 20) + b.nx * 30, rand(-60, -30), rand(0.8, 1.3), rand(6, 10), 26, "front");
    if (Math.random() < 0.3) emit("ember", b.ex, b.ey, rand(-80, 80), rand(-160, -40), rand(0.4, 0.8), 2, 1, "front");
    if (!b.target) scorch(b.ex, b.ey, b.nx, b.ny);
    light(b.ex, b.ey, 150, PAL.red, 1.1);
  }
  const eye = { x: b.ox, y: b.oy };
  light(eye.x, eye.y, 110, PAL.red, 0.9);
  // energia a escorrer ao longo do feixe
  if (Math.random() < 0.6) {
    const u = Math.random() * b.len;
    emit("sparkRed", b.ox + b.dx * u, b.oy + b.dy * u, b.dx * 300 + rand(-40, 40), b.dy * 300 + rand(-40, 40), 0.15, 1.2, 0.4, "front");
  }
  addTrauma(0.02);
}
function laserEndFx(eye) {
  spray("sparkRed", eye.x, eye.y, 10, { speed: 160, life: 0.3, size: 1.5 });
  for (let i = 0; i < 4; i++) emit("steam", eye.x + rand(-4, 4), eye.y, rand(-15, 15) + k.facing * 20, rand(-50, -25), rand(0.7, 1.1), 5, 18, "front");
}

// ---------------------------------------------------------------- desenho: fundo e cenário
let bgGrad = null;
const ashMotes = Array.from({ length: 50 }, () => ({ x: Math.random() * WORLD_W, y: Math.random() * 480, s: rand(1, 2.5), v: rand(6, 18), ph: Math.random() * 6 }));
function drawBackground(left, top, w, h) {
  if (!bgGrad) {
    bgGrad = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
    bgGrad.addColorStop(0, "#07090f"); bgGrad.addColorStop(0.65, "#0f1420"); bgGrad.addColorStop(1, "#1a1418");
  }
  ctx.fillStyle = bgGrad; ctx.fillRect(left - 20, top - 20, w + 40, h + 40);
  // lua avermelhada atrás da névoa
  ADD(); glow(left + w * 0.78 - (left * 0.05), 120, 140, "#ff5a4a", 0.18); glow(left + w * 0.78 - (left * 0.05), 120, 30, "#ffd0c0", 0.35); NORMAL();
  // duas camadas de prédios em parallax com janelas
  const layers = [[0.25, "#121826", 210, 70, 200, 50], [0.5, "#161d2c", 140, 110, 120, 40]];
  for (const [par, col, step, bw, base, var_] of layers) {
    const off = left * par;
    for (let i = Math.floor((left - off) / step) - 1; i < (left - off + w) / step + 1; i++) {
      const bx = i * step + off, bh = base + (((i * 73) % 8 + 8) % 8) * var_ / 2;
      ctx.fillStyle = col; ctx.fillRect(bx, FLOOR_Y - bh, bw, bh);
      ctx.fillStyle = "rgba(255,190,120,0.18)";
      let ri = 0;
      for (let wy = FLOOR_Y - bh + 12; wy < FLOOR_Y - 20; wy += 18, ri++) {
        let ci = 0;
        for (let wx = bx + 8; wx < bx + bw - 8; wx += 14, ci++) if (srand(i * 7.31 + ri * 1.7 + ci * 3.3 + par) > 0.86) ctx.fillRect(wx, wy, 4, 6);
      }
    }
  }
  // cinzas a pairar no ar (ambiente do "Colecionador de Cinzas")
  for (const m of ashMotes) {
    const x = ((m.x - left * 0.6) % (w + 40) + w + 40) % (w + 40) + left - 20;
    const y = (m.y + time * m.v) % 480;
    ctx.globalAlpha = 0.35; ctx.fillStyle = (m.ph > 5) ? "#ff8a3d" : "#6f717a";
    ctx.fillRect(x + Math.sin(time + m.ph) * 6, y, m.s, m.s);
  }
  ctx.globalAlpha = 1;
}
function drawSolids() {
  for (const s of solids) {
    ctx.fillStyle = "#1c2230"; ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = "#2c3446"; ctx.fillRect(s.x, s.y, s.w, 3);
    ctx.fillStyle = "rgba(200,151,63,0.25)"; ctx.fillRect(s.x, s.y, s.w, 1);
  }
}
function drawEnemy(e) {
  if (e.dead > 0 && e.dissolve <= 0) return;
  ctx.save(); ctx.translate(e.x, e.y);
  const sq = e.squash / 0.15;
  ctx.scale(1 + sq * 0.15, 1 - sq * 0.12);
  const h = e.h, w = e.w;
  let visTop = -h;
  if (e.dissolve > 0) {                   // corta a parte já dissolvida (de baixo para cima)
    const cut = -h * (1 - Math.max(e.dissolve, 0) / 0.75);
    ctx.beginPath(); ctx.rect(-w, -h - 20, w * 2, h + 20 + cut); ctx.clip();
    visTop = cut;
  }
  const fl = e.flash > 0;
  ctx.fillStyle = fl ? "#fff" : "#4e3426"; ctx.fillRect(-w / 2, -h, w, h);
  ctx.fillStyle = fl ? "#fff" : "#7a4b2a"; ctx.fillRect(-w / 2, -h, 4, h);
  ctx.fillStyle = fl ? "#fff" : "#a8682f"; ctx.fillRect(-w / 2 + 4, -h + 4, w - 8, 22);
  ctx.fillStyle = "#1a1d26"; ctx.fillRect(-8, -h + 12, 16, 4);
  ctx.fillStyle = "#e2333f"; ctx.fillRect(-6, -h + 12, 4, 4);
  ctx.fillStyle = "#2a1c14"; ctx.fillRect(-w / 2, -h / 2, w, 4);
  ctx.restore();
  if (e.dissolve > 0) {                   // linha incandescente na frente de dissolução
    const cy = e.y - h * (1 - Math.max(e.dissolve, 0) / 0.75);
    ADD(); glowStretch(e.x, cy, w * 2.4, 16, PAL.ember, 1); glowStretch(e.x, cy, w * 1.4, 4, "#fff2b8", 1); NORMAL();
  } else {
    ctx.fillStyle = "#000a"; ctx.fillRect(e.x - 20, e.y - h - 12, 40, 5);
    ctx.fillStyle = "#e2333f"; ctx.fillRect(e.x - 20, e.y - h - 12, 40 * Math.max(e.hp, 0) / e.maxHp, 5);
  }
}

// ---------------------------------------------------------------- desenho: Kane
const ghosts = [];
function kaneTransform(pose) {
  const hover = pose === "hover" ? Math.sin(k.anim * 3) * 3 : 0;
  const runBob = pose === "run" ? -Math.abs(Math.sin(k.anim * Math.PI * 6)) * 3 : 0;
  const breath = pose === "ground" ? Math.sin(k.anim * 2.2) * 0.012 : 0;
  const sq = k.squash / 0.12, st = k.stretch / 0.14;
  const turn = k.turnT > 0 ? 0.35 + 0.65 * (1 - k.turnT / 0.09) : 1;   // vira com um "achatar" rápido
  ctx.translate(k.x, k.y + hover + runBob);
  const climb = pose === "hover" ? clamp(-k.vy / C.flightSpeed, -1, 1) * 0.05 : 0;   // estica a subir
  ctx.scale(k.facing * turn * (1 + sq * 0.14 - st * 0.07 - climb * 0.5), 1 - sq * 0.11 + st * 0.09 + breath + climb);
  if (k.rot) { const pv = pivotFor(pose); ctx.translate(pv.x, pv.y); ctx.rotate(k.rot); ctx.translate(-pv.x, -pv.y); }
  if (k.action === "punch") {
    const t = k.t;
    ctx.translate(t < C.punchWindup ? -6 * easeOut(t / C.punchWindup) : t < C.punchWindup + C.punchActive ? 6 : 6 * (1 - Math.min(1, (t - C.punchWindup - C.punchActive) / C.punchRecovery)), 0);
  }
  if (k.dead) ctx.rotate(-1.3);
}
function drawSprite(img, row, col, x = -OX, y = -OY) { ctx.drawImage(img, col * FW, row * FH, FW, FH, x, y, FW, FH); }

function drawGhosts() {
  if (!ATLAS.naturalWidth) return;
  const tex = tinted(PAL.cyan);
  ADD();
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i];
    ctx.save(); ctx.globalAlpha = Math.pow(g.t / 0.25, 1.5) * 0.16;
    ctx.translate(g.x, g.y); ctx.scale(g.facing, 1);
    if (g.rot) { ctx.translate(g.pv.x, g.pv.y); ctx.rotate(g.rot); ctx.translate(-g.pv.x, -g.pv.y); }
    drawSprite(tex, g.row, g.col);
    ctx.restore();
  }
  NORMAL();
}
// jato: chama em camadas com textura de brilho esticada (local, a olhar para a direita)
function jet(x, y, ang, len, wid, flick) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const L = len * (0.85 + flick * 0.3);
  glowStretch(-L * 0.45, 0, L * 1.3, wid * 3.2, PAL.red, 0.55);
  glowStretch(-L * 0.4, 0, L * 1.0, wid * 1.8, PAL.cyan, 0.9);
  glowStretch(-L * 0.25, 0, L * 0.6, wid * 0.8, PAL.white, 1);
  glow(0, 0, wid * 1.6, PAL.cyanSoft, 0.9);
  ctx.restore();
}
function drawKaneBack(row, col, pose) {
  ctx.save(); kaneTransform(pose);
  ADD();
  glow(0, -70, 95, "#2c4a8a", 0.28);   // contraluz fria: separa a silhueta escura do fundo
  const fl = Math.sin(time * 47) * 0.5 + Math.sin(time * 31) * 0.5;
  if (pose === "fly") {
    const sp = Math.min(Math.hypot(k.vx, k.vy) / C.flightSpeed, 1);
    for (const f of PT.flightFeet) jet(f.x, f.y, -0.2, 40 + sp * 40, 7, fl);
  } else if (pose === "hover") {
    for (const f of PT.hoverFeet) jet(f.x, f.y + 2, -Math.PI / 2, 26, 6, fl);
  }
  // aura de contorno na carga do soco (silhueta pintada, desfocada por desvios)
  if (k.action === "charge" && ATLAS.naturalWidth) {
    const grow = Math.min(k.t / C.chargeTime, 1), charged = grow >= 1 && k.fury >= C.energyCost;
    const tex = tinted(charged ? PAL.cyan : PAL.red), a = (0.18 + grow * 0.3) * (0.8 + 0.2 * Math.sin(time * 30));
    ctx.globalAlpha = a;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2]]) drawSprite(tex, row, col, -OX + dx, -OY + dy);
    glow(PT.fistGuard.x, PT.fistGuard.y, 30 + grow * 40, charged ? PAL.cyan : PAL.red, 0.5 + grow * 0.4);
  }
  ctx.restore(); NORMAL();
}
function drawKaneSprite(row, col, pose) {
  ctx.save(); kaneTransform(pose);
  const blink = k.invuln > 0 && Math.floor(k.invuln * 20) % 2;
  ctx.globalAlpha = blink ? 0.45 : 1;
  drawSprite(ATLAS, row, col);
  // clarões de cor por cima do sprite (dano = vermelho, impacto = branco)
  ADD();
  if (k.hurtFlash > 0) { ctx.globalAlpha = k.hurtFlash / 0.25 * 0.45; drawSprite(tinted(PAL.red), row, col); }
  if (k.whiteFlash > 0) { ctx.globalAlpha = 0.9; drawSprite(tinted("#ffffff"), row, col); }
  ctx.restore(); NORMAL();
}
function drawKaneFront(row, col, pose) {
  ctx.save(); kaneTransform(pose);
  ADD();
  const eye = row === ROW.punch ? PT.eyeGuard : PT.eyeIdle;
  // visor sempre aceso (pulsa devagar), muito mais forte no laser
  const pulse = 0.75 + 0.25 * Math.sin(time * 3);
  let vis = 0.35 * pulse;
  if (k.action === "laser") vis = k.beam ? 1.3 : 0.5 + k.t / C.laserWindup;
  glow(eye.x, eye.y, 10 + vis * 16, PAL.red, vis);
  glowStretch(eye.x, eye.y, 26 + vis * 30, 4, PAL.pink, vis * 0.8);
  if (row === ROW.idle && !k.dead) {                    // mãos: aura vermelha atrás, energia ciano no punho
    glow(PT.handBack.x, PT.handBack.y, 16, PAL.red, 0.35 + 0.15 * Math.sin(time * 5));
    glow(PT.fistIdle.x, PT.fistIdle.y, 12, PAL.cyan, 0.3 + 0.15 * Math.sin(time * 7 + 1));
  }
  if (k.action === "charge") {
    const grow = Math.min(k.t / C.chargeTime, 1), charged = grow >= 1 && k.fury >= C.energyCost;
    const p = 0.85 + 0.15 * Math.sin(time * 40);
    glow(PT.fistGuard.x, PT.fistGuard.y, (8 + grow * 18) * p, charged ? PAL.cyan : PAL.red, 1, true);
    glow(PT.fistGuard.x, PT.fistGuard.y, (3 + grow * 6) * p, PAL.white, 1, true);
  }
  if (k.action === "punch" && k.t >= C.punchWindup * 0.5) {
    const t = (k.t - C.punchWindup * 0.5) / (C.punchActive + C.punchRecovery * 0.6), E = k.energy;
    if (t < 1) {
      // arco de "smear" do braço + clarão do punho
      const a = 1 - t;
      ctx.lineCap = "round";
      for (const [lw, col, al] of [[14, PAL.cyan, 0.25], [6, PAL.cyanSoft, 0.6], [2, PAL.white, 0.9]]) {
        ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = lw * (E ? 1.4 : 1);
        ctx.beginPath(); ctx.arc(10, -40, 52, -Math.PI * 0.62, -Math.PI * 0.62 + Math.PI * 0.5 * easeOut(Math.min(1, t * 3))); ctx.stroke();
      }
      const fx = PT.fistPunch.x + 6, fy = PT.fistPunch.y, s = E ? 1.6 : 1;
      glow(fx, fy, (40 + 30 * t) * s, PAL.cyan, 0.9 * a);
      glow(fx, fy, (16 + 10 * t) * s, PAL.white, a, true);
      glowStretch(fx + 10, fy, 110 * s * (0.6 + t), 6 * s, PAL.cyanSoft, 0.8 * a);   // clarão horizontal
      if (E) glow(fx, fy, 70 * s, PAL.red, 0.35 * a);
    }
  }
  ctx.restore(); NORMAL();
}

// ---------------------------------------------------------------- desenho: laser
function drawLaser() {
  ADD();
  // mira do visor durante a antecipação (Advanced Visor: targeting)
  if (k.action === "laser" && !k.beam && k.aim) {
    const a = k.aim, t = k.t / C.laserWindup;
    ctx.globalAlpha = 0.25 + 0.4 * t; ctx.strokeStyle = PAL.red; ctx.lineWidth = 1; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -time * 80;
    ctx.beginPath(); ctx.moveTo(a.ox, a.oy); ctx.lineTo(a.ex, a.ey); ctx.stroke(); ctx.setLineDash([]);
    if (a.hit) { glow(a.ex, a.ey, 8 + 6 * t, PAL.red, 0.6 + 0.3 * t); }
  }
  const b = k.beam || (k.beamFade > 0 ? k.lastBeam : null);
  if (b) {
    const w = k.beam ? Math.min(1, (k.t - C.laserWindup) / 0.06 + 0.2) : k.beamFade / 0.14;   // abre e fecha
    const ang = Math.atan2(b.dy, b.dx), L = b.len;
    const pulse = 1 + 0.12 * Math.sin(time * 70) + rand(-0.06, 0.06);
    ctx.save(); ctx.translate(b.ox, b.oy); ctx.rotate(ang);
    // brilho largo, corpo vermelho, núcleo rosa e branco
    ctx.globalAlpha = 0.55 * w; ctx.drawImage(glowTex(PAL.red), -24, -44 * w * pulse, L + 48, 88 * w * pulse);
    ctx.globalAlpha = 1 * w; ctx.drawImage(glowTex(PAL.red, true), -8, -16 * w * pulse, L + 16, 32 * w * pulse);
    ctx.globalAlpha = 1 * w; ctx.drawImage(glowTex(PAL.pink, true), -5, -7.5 * w * pulse, L + 10, 15 * w * pulse);
    ctx.globalAlpha = w; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, -2.2 * w, L, 4.4 * w);
    // hélice de energia a correr ao longo do feixe
    ctx.lineWidth = 1.4; ctx.lineCap = "round";
    for (let strand = 0; strand < 2; strand++) {
      ctx.strokeStyle = strand ? PAL.pink : "#ffffff"; ctx.globalAlpha = 0.75 * w;
      ctx.beginPath();
      for (let x = 0; x <= L; x += 6) {
        const y = Math.sin(x * 0.07 - time * 45 + strand * Math.PI) * 7 * w * (1 - Math.exp(-x / 30));
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // pulsos de energia a viajar no feixe
    for (let i = 0; i < 4; i++) {
      const px = ((time * 1100 + i * 170) % (L + 1));
      ctx.globalAlpha = 0.8 * w; ctx.drawImage(glowTex(PAL.white), px - 14, -6 * w, 28, 12 * w);
    }
    ctx.restore();
    // visor: clarão de lente
    glow(b.ox, b.oy, 30 * w * pulse, PAL.red, 1); glow(b.ox, b.oy, 11 * w, PAL.white, 1, true);
    glowStretch(b.ox, b.oy, 150 * w, 5, PAL.pink, 0.9 * w); glowStretch(b.ox, b.oy, 5, 40 * w, PAL.pink, 0.5 * w);
    // impacto
    if (b.hit) {
      const r = 26 * pulse * w;
      glow(b.ex, b.ey, r * 2.4, PAL.red, 0.9); glow(b.ex, b.ey, r, PAL.redHot, 1, true); glow(b.ex, b.ey, r * 0.45, PAL.white, 1, true);
      ctx.save(); ctx.translate(b.ex, b.ey); ctx.rotate(time * 3);
      glowStretch(0, 0, r * 5, 4, PAL.pink, 0.8 * w); glowStretch(0, 0, 4, r * 5, PAL.pink, 0.8 * w);
      ctx.restore();
    }
  }
  NORMAL();
}

// ---------------------------------------------------------------- HUD e ecrã
function drawHud() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const x = 16 + safeLeft, y = 16 + safeTop;
  const bar = (label, v, max, col, yy, glowHex) => {
    ctx.fillStyle = "#e8e3d6"; ctx.font = "12px Silkscreen, monospace"; ctx.fillText(label, x, yy + 11);
    ctx.fillStyle = "#000a"; ctx.fillRect(x + 50, yy, 160, 12);
    ctx.fillStyle = col; ctx.fillRect(x + 50, yy, 160 * v / max, 12);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x + 50, yy, 160 * v / max, 3);
    ctx.strokeStyle = "#e8e3d655"; ctx.strokeRect(x + 50.5, yy + 0.5, 159, 11);
    if (glowHex) { ADD(); glow(x + 50 + 160 * v / max, yy + 6, 14, glowHex, 0.6); NORMAL(); }
  };
  bar("HP", k.hp, C.maxHp, "#3fbf5a", y);
  bar("FURY", k.fury, C.maxFury, "#d8323c", y + 20, k.action === "laser" || k.action === "charge" ? PAL.red : null);
  ctx.fillStyle = "#8a8f9c"; ctx.font = "10px Silkscreen, monospace";
  ctx.fillText(k.flying ? "MODO: VOO" : "MODO: SOLO", x, y + 52);
}
function drawScreenFx() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.drawImage(vignette, 0, 0);
  // linhas de velocidade estilo anime, a convergir para o impacto
  for (const s of screenLines) {
    const c = worldToScreen(s.x, s.y), t = s.t / s.dur;
    // cunhas brancas do bordo do ecrã para o impacto (mais largas fora, finas dentro)
    ADD(); ctx.fillStyle = "#ffffff";
    const R = Math.hypot(cv.width, cv.height);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + srand(s.seed + i) * 0.12;
      const r1 = R * (0.18 + srand(s.seed * 3 + i) * 0.22) * (1 + t * 0.6), half = (0.004 + srand(s.seed * 5 + i) * 0.01);
      ctx.globalAlpha = (1 - t) * (0.35 + srand(s.seed * 7 + i) * 0.4);
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(a - half) * R, c.y + Math.sin(a - half) * R);
      ctx.lineTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
      ctx.lineTo(c.x + Math.cos(a + half) * R, c.y + Math.sin(a + half) * R);
      ctx.fill();
    }
    NORMAL();
  }
  if (screenFlash > 0) {
    ADD(); ctx.globalAlpha = screenFlash * 0.6; ctx.fillStyle = screenFlashHex; ctx.fillRect(0, 0, cv.width, cv.height); NORMAL();
  }
}
function srand(seed) { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); }

// ---------------------------------------------------------------- render
let camView = { S: 1, cx: 0, cy: 0 };
function worldToScreen(x, y) { return { x: (x - camView.cx) * camView.S + cv.width / 2, y: (y - camView.cy) * camView.S + cv.height / 2 }; }
function render() {
  // câmara: segue com antecipação na direção do olhar, zoom nos impactos, tremor por trauma
  const zoom = 1 + cam.kick;
  const visW = viewW / zoom, visH = viewH / zoom;
  const lookX = k.x + k.facing * 50 + k.vx * 0.15;
  cam.x += (clamp(lookX, visW / 2, WORLD_W - visW / 2) - cam.x) * 0.12;
  const tr = cam.trauma * cam.trauma, n = time * 30 + cam.seed;
  const shx = tr * 16 * (Math.sin(n * 1.7) + Math.sin(n * 3.1) * 0.5) + cam.dirX * tr;
  const shy = tr * 12 * (Math.sin(n * 2.3 + 1) + Math.sin(n * 4.3) * 0.5) + cam.dirY * tr;
  const S = scale * zoom;
  camView = { S, cx: cam.x + shx, cy: 540 - visH / 2 + shy };   // chão sempre perto do fundo do ecrã
  ctx.setTransform(S, 0, 0, S, cv.width / 2 - camView.cx * S, cv.height / 2 - camView.cy * S);
  const left = camView.cx - visW / 2, top = camView.cy - visH / 2;

  drawBackground(left, top, visW, visH);
  drawSolids();
  drawLights();                  // luz dos poderes no cenário e reflexo no chão (atrás das personagens)
  drawDecals();
  drawParticles("back");
  enemies.forEach(drawEnemy);
  const ready = ATLAS.complete && ATLAS.naturalWidth;
  let fr = null;
  if (ready) {
    fr = kaneFrame();
    drawGhosts();
    drawKaneBack(...fr);
    drawKaneSprite(...fr);
  }
  drawLaser();
  if (ready) drawKaneFront(...fr);
  drawRings();
  drawParticles("front");
  // números de dano
  ctx.textAlign = "center";
  for (const f of floats) {
    const age = 0.8 - f.t, pop = age < 0.08 ? 1 + (0.08 - age) * 8 : 1;
    ctx.globalAlpha = Math.min(f.t * 2, 1);
    ctx.font = Math.round((f.big ? 18 : 12) * pop) + "px Silkscreen, monospace";
    ctx.fillStyle = "#000"; ctx.fillText(f.v, f.x + 1, f.y - Math.min(age, 0.25) * 120 - age * 20 + 1);
    ctx.fillStyle = f.big ? PAL.cyanSoft : "#fff"; ctx.fillText(f.v, f.x, f.y - Math.min(age, 0.25) * 120 - age * 20);
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";
  drawScreenFx();
  drawHud();
}

// ---------------------------------------------------------------- loop (passo fixo 60 Hz)
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  acc += Math.min((now - last) / 1000, 0.1); last = now;
  while (acc >= STEP) {
    time += STEP;
    if (hitstop > 0) { hitstop -= STEP; updateParticles(STEP * 0.2); }      // hit-stop: o mundo quase para
    else {
      lights.length = 0;
      updateKane(STEP); updateEnemies(STEP); Object.assign(prev, held);
      updateParticles(STEP);
      k.beamFade = Math.max(0, k.beamFade - (k.beam ? 0 : STEP));
      for (let i = ghosts.length - 1; i >= 0; i--) if ((ghosts[i].t -= STEP) <= 0) ghosts.splice(i, 1);
    }
    updateWorldFx(STEP);
    cam.trauma = Math.max(0, cam.trauma - STEP * 1.8);
    cam.dirX *= 0.85; cam.dirY *= 0.85;
    cam.kick = Math.max(0, cam.kick - STEP * 0.35);
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
