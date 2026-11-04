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
  maxHp: 300, maxFury: 100, furyRegen: 8, invuln: 0.6,
  runSpeed: 220, groundAccel: 2600, groundFriction: 3200, airAccel: 1300,
  gravity: 1400, fallMult: 1.5, maxFall: 900, jumpVel: -480, jumpCut: 0.45,
  coyote: 0.1, jumpBuffer: 0.12,
  flightSpeed: 320, flightAccel: 1600,
  laserRange: 900, laserWindup: 0.16, laserDps: 30, laserTick: 0.1,
  laserFuryPerSec: 30, laserMinFury: 10, laserMoveMult: 0.35, laserKnock: 60,
  punchDmg: 18, punchKnock: 320, punchWindup: 0.08, punchActive: 0.1, punchRecovery: 0.2,
  punchLunge: 180, punchSize: { w: 64, h: 56 }, punchOff: { x: 42, y: -72 }, furyOnHit: 6,
  chargeTime: 0.4, energyCost: 25, energyDmgMult: 2.5, energyKnockMult: 2.2, energySizeMult: 1.6,
  bodyW: 28, bodyH: 108,
  // laser em níveis: quanto mais tempo seguras, mais forte (e mais gasta)
  laserLevels: [
    { at: 0.0, dmg: 1.0, width: 1.0, drain: 22, knock: 1.0, pierce: false, outer: "#ff2b3d", mid: "#ff2b3d", core: "#ffc2c8" },
    { at: 0.9, dmg: 1.9, width: 1.65, drain: 30, knock: 2.0, pierce: false, outer: "#ff3a1a", mid: "#ff7a2a", core: "#ffe0a0" },
    { at: 2.0, dmg: 3.2, width: 2.5, drain: 40, knock: 3.5, pierce: true, outer: "#ff1a5a", mid: "#ffb347", core: "#ffffff" },
  ],
  // Energia infinita. A barra LASER mostra a POTÊNCIA acumulada: enche enquanto o feixe está ligado
  // (nível 2 aos 0,9 s, máximo aos 2 s, cheia aos 2,9 s) e esvazia depois de largar.
  powerFull: 2.9, powerDecay: 1.6,
  // Disparar no máximo cansa o corpo: ao largar, ajoelha-se para recuperar (mais tempo no máximo = mais tempo de joelhos).
  overloadMin: 0.6, kneelBase: 0.9, kneelPerSec: 0.35, kneelMax: 2.4,
  // luta: andar para trás é mais lento e defende; dash no lugar do voo
  backMult: 0.65, blockChip: 0.15, dashSpeed: 720, dashTime: 0.18, dashCd: 0.45, roundTime: 99,
};
// Pontos medidos nos frames (assets/kane/kane_points.json), relativos aos pés, a olhar para a direita.
// tempos do soco (s): jab sai logo ao carregar; o de energia tem mais preparação e recuperação
// tipos de golpe: tempos (s), caixa de acerto (relativa aos pés), dano, ponto do FX e frames [preparação, ativo, recuperação]
const PUNCH_JAB = { w: 0.05, a: 0.08, r: 0.15, dmg: 18, box: { x: 42, y: -72, w: 64, h: 56 }, fx: { x: 58, y: -70 }, frames: ["walk2", "jab0", "jab1"], lunge: 0.6 };
const PUNCH_HEAVY = { w: 0.09, a: 0.1, r: 0.26, dmg: 18, box: { x: 42, y: -72, w: 64, h: 56 }, fx: { x: 64, y: -74 }, frames: ["special0", "special1", "special1"], lunge: 1.5 };
const PUNCH_LOW = { w: 0.05, a: 0.08, r: 0.16, dmg: 14, box: { x: 44, y: -52, w: 70, h: 40 }, fx: { x: 52, y: -57 }, frames: ["lowJab0", "lowJab1", "lowJab0"], lunge: 0.3 };
const PUNCH_SWEEP = { w: 0.08, a: 0.12, r: 0.3, dmg: 24, box: { x: 62, y: -22, w: 110, h: 36 }, fx: { x: 104, y: -26 }, frames: ["sweep0", "sweep0", "sweep1"], lunge: 1.1, stagger: true, low: true };
const PUNCH_AIR = { w: 0.06, a: 0.16, r: 0.1, dmg: 22, box: { x: 30, y: -45, w: 74, h: 62 }, fx: { x: 40, y: -42 }, frames: ["air1", "airKick", "airKick"], lunge: 0.4 };
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
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  const probe = document.getElementById("safe-probe");
  safeLeft = (probe ? parseFloat(getComputedStyle(probe).paddingLeft) || 0 : 0) * dpr / scale;
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
// Animações de luta (tools/extract_kane_fight.py). Linhas >= 10 nos frames do Kane referem-se a este atlas.
const KFA = new Image();
KFA.src = "__KANEFIGHT__";
const KF_INDEX = {"intro0": [0, 0], "intro1": [0, 1], "intro2": [0, 2], "intro3": [0, 3], "walk0": [1, 0], "walk1": [1, 1], "walk2": [1, 2], "walk3": [1, 3], "walk4": [1, 4], "crouch0": [2, 0], "crouch1": [2, 1], "crouch2": [2, 2], "jumpPrep": [2, 3], "jumpAir": [2, 4], "jumpLand": [2, 5], "win0": [3, 0], "win1": [3, 1], "win2": [3, 2], "blockHigh": [3, 3], "crouchBlock": [3, 4], "crouchHit": [3, 5], "jab0": [4, 0], "jab1": [4, 1], "heavy0": [4, 2], "heavy1": [4, 3], "lowJab0": [4, 4], "lowJab1": [4, 5], "sweep0": [4, 6], "sweep1": [4, 7], "air0": [5, 0], "air1": [5, 1], "airKick": [5, 2], "special0": [5, 3], "special1": [5, 4]};
const KF_TOP = {"intro0": -129, "intro1": -129, "intro2": -126, "intro3": -128, "walk0": -109, "walk1": -109, "walk2": -109, "walk3": -109, "walk4": -109, "crouch0": -107, "crouch1": -91, "crouch2": -96, "jumpPrep": -103, "jumpAir": -101, "jumpLand": -91, "win0": -130, "win1": -130, "win2": -130, "blockHigh": -140, "crouchBlock": -105, "crouchHit": -98, "jab0": -107, "jab1": -107, "heavy0": -107, "heavy1": -107, "lowJab0": -98, "lowJab1": -99, "sweep0": -100, "sweep1": -93, "air0": -116, "air1": -113, "airKick": -87, "special0": -115, "special1": -117};
const F = name => [KF_INDEX[name][0] + 10, KF_INDEX[name][1]];
const kSrc = row => row >= 10 ? KFA : ATLAS;
const kTint = (hex, row) => tinted(hex, kSrc(row));
// Soldado de Choque (tools/extract_trooper_sprites.py): linha 0 [parado, ajoelhado a apontar], 1 corrida (4), 2 derrota (5)
const TROOPER = new Image();
TROOPER.src = "__TROOPER__";
const TR = { muzzleAim: { x: 56, y: -44 }, visorStand: { x: 3, y: -115 }, visorAim: { x: 5, y: -66 }, exhaust: { x: -22, y: -126 } };
const tintCache = {};
// Versão do atlas pintada de uma cor (para aura de contorno, fantasmas, clarões de dano).
function tinted(hex, img = ATLAS) {
  const key = hex + (img === ATLAS ? "" : img === TROOPER ? "T" : "F");
  if (tintCache[key]) return tintCache[key];
  const c = makeCanvas(img.width, img.height), g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-atop"; g.fillStyle = hex; g.fillRect(0, 0, c.width, c.height);
  return (tintCache[key] = c);
}

// ---------------------------------------------------------------- mundo
/*__LEVEL__*/
const enemies = [];
function spawnEnemy(x) { enemies.push({ type: "dummy", x, y: surfaceY(x), homeY: surfaceY(x), vx: 0, vy: 0, w: 34, h: 130, hp: 120, maxHp: 120, flash: 0, dead: 0, dissolve: 0, squash: 0, home: x }); }
function spawnTrooper(x) {
  enemies.push({ type: "trooper", x, y: surfaceY(x), homeY: surfaceY(x), vx: 0, vy: 0, w: 44, h: 124, hp: 280, maxHp: 280, flash: 0, dead: 0, squash: 0, home: x,
    facing: -1, state: "patrol", st: 0, cd: 1.2, shots: 0, recoil: 0, anim: Math.random() * 3, pdir: -1, deathT: 0, stepT: 0, smokeT: 0, onFloor: true });
}
spawnTrooper(1150);                                   // o adversário: Soldado de Choque
const foe = enemies[0];
foe.maxHp = foe.hp = 600; foe.state = "neutral"; foe.stun = 0;

const k = {
  x: 650, y: FLOOR_Y, vx: 0, vy: 0, facing: 1, hp: C.maxHp, fury: C.maxFury,
  flying: false, onFloor: false, action: "none", t: 0, coyote: 0, jumpBuf: 0, invuln: 0,
  laserTick: 0, energy: false, hitIds: new Set(), beam: null, beamFade: 0, lastBeam: null, aim: null,
  anim: 0, dead: false, moveAnim: false, squash: 0, stretch: 0, turnT: 0, rot: 0, flyPose: false, laserSound: false,
  laserPow: 0, laserLevel: 1, maxTime: 0, stun: 0, blocking: false, dashT: 0, dashDir: 1, dashCd: 0, airDash: false, hpTrail: 300, pt: PUNCH_JAB, walkPh: 0, exhausted: false, exhaustT: 0, kneel: 0, kneelLanded: false, pantT: 0, weak: false,
  hurtFlash: 0, whiteFlash: 0, chargedPing: false, stepT: 0, ghostT: 0, scorchT: 0,
};
let floats = [], time = 0, hitstop = 0;
// ---------------------------------------------------------------- luta: rondas, relógio, combos
const fight = { phase: "intro", t: 0, round: 1, kWins: 0, fWins: 0, timer: 99, combo: 0, comboT: 0, foeCombo: 0, foeComboT: 0, winner: null, text: "", foeTrail: 600 };
function resetFighters() {
  Object.assign(k, { x: 650, y: FLOOR_Y, vx: 0, vy: 0, facing: 1, hp: C.maxHp, hpTrail: C.maxHp, dead: false, invuln: 0, action: "none", t: 0,
    stun: 0, blocking: false, dashT: 0, dashCd: 0, kneel: 0, exhausted: false, exhaustT: 0, laserPow: 0, laserLevel: 1, maxTime: 0,
    beam: null, lastBeam: null, beamFade: 0, aim: null, hurtFlash: 0, whiteFlash: 0, rot: 0, squash: 0, stretch: 0, pt: PUNCH_JAB });
  Object.assign(foe, { x: 1150, y: FLOOR_Y, vx: 0, vy: 0, facing: -1, hp: foe.maxHp, dead: 0, deathT: 0, state: "neutral", st: 0, cd: 1.4, recoil: 0, flash: 0 });
  fight.foeTrail = foe.maxHp; bolts.length = 0; decals.length = 0; ghosts.length = 0;
  SFX.loopStop("laser", 0.05); SFX.loopStop("charge", 0.05);
  snapPrev();
}
function startRound(n) {
  resetFighters();
  Object.assign(fight, { phase: "intro", t: 0, round: n, timer: C.roundTime, combo: 0, comboT: 0, foeCombo: 0, winner: null, text: "" });
  SFX.play("round");
}
function endRound(reason) {
  const kp = k.hp / C.maxHp, fp = Math.max(0, foe.hp) / foe.maxHp;
  fight.winner = reason === "time" ? (kp >= fp ? "kane" : "foe") : (k.dead ? "foe" : "kane");
  if (fight.winner === "kane") fight.kWins++; else fight.fWins++;
  fight.phase = "ko"; fight.t = 0; fight.text = reason === "time" ? "TEMPO!" : "K.O.";
  SFX.play("ko"); flash(0.5); zoomKick(0.06); addTrauma(0.4);
  SFX.loopStop("laser", 0.1); SFX.loopStop("charge", 0.1);
}
function updateFight(dt) {
  fight.t += dt; fight.comboT -= dt; fight.foeComboT -= dt;
  // barra "fantasma" do dano recente: espera um pouco e depois desce
  if (k.stun <= 0) k.hpTrail = Math.max(k.hp, k.hpTrail - 160 * dt);
  if (foe.state !== "hitstun" && foe.state !== "stagger") fight.foeTrail = Math.max(Math.max(foe.hp, 0), fight.foeTrail - 320 * dt);
  if (fight.phase === "intro") {
    if (fight.t >= 1.05 && fight.t - dt < 1.05) SFX.play("fight");
    if (fight.t >= 1.7) { fight.phase = "fight"; fight.t = 0; }
  } else if (fight.phase === "fight") {
    fight.timer = Math.max(0, fight.timer - dt);
    if (k.dead) endRound("ko"); else if (foe.dead > 0) endRound("ko"); else if (fight.timer <= 0) endRound("time");
  } else if (fight.phase === "ko") {
    if (fight.t > 3.6) {
      if (fight.kWins >= 2 || fight.fWins >= 2) { fight.phase = "end"; fight.t = 0; SFX.play(fight.kWins >= 2 ? "win" : "lose"); }
      else startRound(fight.round + 1);
    }
  } else if (fight.phase === "end") {
    if (fight.t > 1.5 && ["jump", "punch", "laser", "fly"].some(n => held[n] && !prev[n])) { fight.kWins = fight.fWins = 0; startRound(1); }
  }
}

// ---------------------------------------------------------------- câmara (trauma + zoom)
const cam = { x: 200, y: 690, trauma: 0, zoom: 1, kick: 0, dirX: 0, dirY: 0, seed: Math.random() * 100 };
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
    // --- poder do laser e exaustão
    levelUp(l) {
      const t = T(), o = bus(0.45), base = [0, 330, 440, 587][l];
      [1, 1.25, 1.5].forEach((m, i) => tone("triangle", base * m, base * m * 1.01, t + i * 0.05, 0.4, 0.12, o));
      tone("sawtooth", 80, 80 * (1 + l), t, 0.35, 0.1 + l * 0.04, o, 0.01);
      hiss(t, 0.3, 0.15 + l * 0.05, o, { f0: 2000, f1: 8000, q: 1, attack: 0.02 });
    },
    powerDown() {
      const t = T(), o = bus(0.4);
      tone("sawtooth", 520, 45, t, 1.1, 0.16, o, 0.01); tone("sine", 260, 30, t, 1.2, 0.2, o);
      hiss(t, 0.9, 0.12, o, { f0: 3000, f1: 200, q: 0.8 });
    },
    powerUp() { const t = T(), o = bus(0.3); tone("sawtooth", 60, 300, t, 0.45, 0.1, o, 0.05); tone("sine", 200, 800, t, 0.4, 0.1, o, 0.05); },
    kneelThud() { const t = T(), o = bus(0.25); tone("sine", 120, 38, t, 0.35, 0.7, o); hiss(t, 0.18, 0.35, o, { type: "lowpass", f0: 1200, f1: 200 }); tone("square", 70, 40, t, 0.12, 0.1, o); },
    pant() { const t = T(), o = bus(0.05, 0.6); hiss(t, 0.22, 0.12, o, { f0: 900, f1: 600, q: 1.5, attack: 0.08 }); hiss(t + 0.32, 0.18, 0.08, o, { f0: 700, f1: 500, q: 1.5, attack: 0.06 }); },
    // --- luta
    round() { const t = T(), o = bus(0.6); tone("sine", 220, 110, t, 1.2, 0.35, o); tone("triangle", 440, 220, t, 1, 0.12, o); hiss(t, 0.6, 0.15, o, { f0: 500, f1: 3000, q: 1 }); },
    fight() { const t = T(), o = bus(0.6); tone("sawtooth", 110, 55, t, 0.5, 0.25, o); tone("sine", 90, 30, t, 0.8, 0.8, o); hiss(t, 0.3, 0.6, o, { type: "lowpass", f0: 6000, f1: 400 }); [1, 1.5, 2].forEach((m, i) => tone("triangle", 330 * m, 330 * m, t + i * 0.06, 0.5, 0.1, o)); },
    ko() { const t = T(), o = bus(0.8); tone("sine", 70, 22, t, 2.2, 1, o); tone("sawtooth", 140, 30, t, 1.4, 0.2, o); hiss(t, 1.8, 0.5, o, { type: "lowpass", f0: 2500, f1: 80 }); },
    win() { const t = T(), o = bus(0.5); [523, 659, 784, 1046].forEach((f, i) => tone("triangle", f, f, t + i * 0.14, 0.6, 0.14, o)); },
    lose() { const t = T(), o = bus(0.5); [392, 330, 262, 196].forEach((f, i) => tone("triangle", f, f * 0.98, t + i * 0.2, 0.7, 0.13, o)); },
    block() { const t = T(), o = bus(0.3); tone("square", 1800, 900, t, 0.08, 0.12, o); tone("triangle", 2600, 2400, t, 0.25, 0.08, o); hiss(t, 0.06, 0.3, o, { type: "highpass", f0: 3000 }); },
    dash() { const t = T(), o = bus(0.1); hiss(t, 0.2, 0.35, o, { f0: 600, f1: 3000, q: 1.5, attack: 0.01 }); tone("sine", 300, 900, t, 0.15, 0.06, o); },
    stomp() { const t = T(), o = bus(0.2); tone("sine", 80, 30, t, 0.3, 0.6, o); hiss(t, 0.15, 0.3, o, { type: "lowpass", f0: 700 }); },
    charge() { const t = T(), o = bus(0.2); hiss(t, 0.6, 0.4, o, { f0: 300, f1: 1400, q: 1, attack: 0.03 }); tone("sawtooth", 60, 90, t, 0.6, 0.12, o, 0.03); },
    // --- Soldado de Choque
    heavyStep(v = 1) { const t = T(), o = bus(0.1, v); tone("sine", 90, 35, t, 0.18, 0.5, o); hiss(t, 0.08, 0.25, o, { type: "lowpass", f0: 500 }); hiss(t + 0.02, 0.05, 0.12, o, { type: "highpass", f0: 3000 }); },
    cannonCharge() { const t = T(), o = bus(0.2); tone("sawtooth", 70, 420, t, 0.75, 0.09, o, 0.05); hiss(t, 0.75, 0.1, o, { f0: 600, f1: 4000, q: 4, attack: 0.1 }); },
    cannon() {
      const t = T(), o = bus(0.3);
      tone("square", 220, 55, t, 0.16, 0.22, o); tone("sine", 140, 40, t, 0.25, 0.5, o);
      hiss(t, 0.12, 0.45, o, { type: "lowpass", f0: 6000, f1: 800 });
    },
    boltHit() { const t = T(), o = bus(0.3); tone("sine", 180, 50, t, 0.22, 0.4, o); hiss(t, 0.2, 0.35, o, { type: "lowpass", f0: 3000, f1: 300 }); },
    reflect() { const t = T(), o = bus(0.4); tone("triangle", 1400, 2800, t, 0.18, 0.18, o); tone("sine", 700, 1400, t, 0.25, 0.12, o); hiss(t, 0.1, 0.2, o, { type: "highpass", f0: 4000 }); },
    zap() { const t = T(), o = bus(0.15); tone("sawtooth", 1800, 300, t, 0.12, 0.1, o); hiss(t, 0.1, 0.25, o, { type: "highpass", f0: 2500 }); },
    explosion() {
      const t = T(), o = bus(0.6);
      tone("sine", 110, 28, t, 1.1, 1, o); tone("square", 70, 25, t, 0.5, 0.18, o);
      hiss(t, 0.25, 0.8, o, { type: "lowpass", f0: 5000, f1: 400 });
      hiss(t + 0.05, 1.6, 0.4, o, { type: "lowpass", f0: 1200, f1: 120, attack: 0.03 });
      for (let i = 0; i < 10; i++) hiss(t + 0.15 + Math.random() * 1.0, 0.02, 0.1 + Math.random() * 0.15, o, { type: "highpass", f0: 2000 + Math.random() * 3000 });
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
      const f = L.f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 0.9;
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
// held = estado combinado por tick (teclado/botões de toque + comando físico); evHeld = só eventos
const held = {}, prev = {}, evHeld = {}, gpHeld = {};
// analógico: virtual (toque) e comando físico; valores -1..1
const stick = { x: 0, y: 0 }, gpStick = { x: 0, y: 0 };
const pressed = n => held[n] && !prev[n];
const released = n => !held[n] && prev[n];
const KEYMAP = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down", Space: "jump", ShiftLeft: "fly", ShiftRight: "fly", KeyF: "fly", KeyJ: "laser", KeyK: "punch" };
addEventListener("keydown", e => { if (KEYMAP[e.code]) { evHeld[KEYMAP[e.code]] = true; e.preventDefault(); } });
addEventListener("keyup", e => { if (KEYMAP[e.code]) evHeld[KEYMAP[e.code]] = false; });
document.querySelectorAll(".btn").forEach(b => {
  const n = b.dataset.k;
  const on = e => { e.preventDefault(); evHeld[n] = true; b.classList.add("on"); try { b.setPointerCapture(e.pointerId); } catch {} };
  const off = () => { evHeld[n] = false; b.classList.remove("on"); };
  b.addEventListener("pointerdown", on);
  b.addEventListener("pointerup", off);
  b.addEventListener("pointercancel", off);
  b.addEventListener("lostpointercapture", off);
  b.addEventListener("contextmenu", e => e.preventDefault());
});
document.addEventListener("gesturestart", e => e.preventDefault());

// Analógico virtual flutuante: a base salta para onde o dedo toca; raio 50 px; zona morta 15%.
(() => {
  const zone = document.getElementById("stick");
  if (!zone) return;
  const base = document.getElementById("stick-base"), knob = document.getElementById("stick-knob");
  const R = 50, DEAD = 0.15;
  let id = null, cx = 0, cy = 0, rest = null;
  const place = (x, y) => { const r = zone.getBoundingClientRect(); base.style.left = (x - r.left) + "px"; base.style.top = (y - r.top) + "px"; };
  const move = (x, y) => {
    let dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(d, R) / R;
    const k01 = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);          // resposta progressiva fora da zona morta
    stick.x = d > 0 ? dx / Math.min(d, R) * k01 : 0; stick.y = d > 0 ? dy / Math.min(d, R) * k01 : 0;
  };
  zone.addEventListener("pointerdown", e => {
    if (id !== null) return;
    e.preventDefault(); id = e.pointerId;
    try { zone.setPointerCapture(id); } catch (err) {}
    if (!rest) rest = { left: base.style.left, top: base.style.top };
    cx = e.clientX; cy = e.clientY; place(cx, cy); zone.classList.add("on"); move(cx, cy);
  });
  zone.addEventListener("pointermove", e => { if (e.pointerId === id) { e.preventDefault(); move(e.clientX, e.clientY); } });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null; stick.x = stick.y = 0; knob.style.transform = ""; zone.classList.remove("on");
    base.style.left = rest.left; base.style.top = rest.top;
  };
  zone.addEventListener("pointerup", end); zone.addEventListener("pointercancel", end); zone.addEventListener("lostpointercapture", end);
})();

// Comando físico (Gamepad API, layout padrão): stick esquerdo/D-pad, A salto, X soco, Y ou RT laser, LB/RB voo.
function pollGamepad() {
  gpStick.x = gpStick.y = 0;
  for (const n of ["jump", "punch", "laser", "fly", "left", "right", "up", "down"]) gpHeld[n] = false;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of pads) {
    if (!g || !g.connected) continue;
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0, m = Math.hypot(ax, ay), DEAD = 0.18;
    if (m > DEAD) { const s = (m - DEAD) / (1 - DEAD) / m; gpStick.x = ax * s; gpStick.y = ay * s; }
    const b = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.4));
    gpHeld.jump ||= b(0); gpHeld.punch ||= b(2); gpHeld.laser ||= b(3) || b(7); gpHeld.fly ||= b(4) || b(5);
    gpHeld.up ||= b(12); gpHeld.down ||= b(13); gpHeld.left ||= b(14); gpHeld.right ||= b(15);
  }
}
// Buffer de comandos: um botão carregado até 0,15 s antes de o Kane poder agir não se perde.
const lastPress = { jump: -9, punch: -9, laser: -9, fly: -9 }, bufPrev = {};
function syncInput() {
  pollGamepad();
  for (const n of ["jump", "punch", "laser", "fly", "left", "right", "up", "down"]) held[n] = !!(evHeld[n] || gpHeld[n]);
  for (const n in lastPress) { if (held[n] && !bufPrev[n]) lastPress[n] = time; bufPrev[n] = held[n]; }
}
function want(n, win = 0.15) { if (time - lastPress[n] <= win) { lastPress[n] = -9; return true; } return false; }

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
function hitEnemy(e, dmg, kx, ky, stagger = false) {
  const heavy = e.type === "trooper";
  if (heavy && (e.dead > 0 || fight.phase !== "fight")) return;
  // contador de combos: golpes seguidos enquanto o adversário ainda está atordoado
  const comboOn = fight.comboT > 0 && (e.state === "hitstun" || e.state === "stagger");
  fight.combo = comboOn ? fight.combo + 1 : 1; fight.comboT = 1.0;
  const scaled = dmg * Math.max(0.5, 1 - (fight.combo - 1) * 0.08);   // dano decresce em combos longos
  e.hp -= scaled; e.vx += kx * (heavy ? 0.35 : 1); e.vy += ky * (heavy ? 0.2 : 1); e.flash = 0.1; e.squash = 0.15;
  // tremor no ponto atingido (lado da frente, à altura do golpe) e o tronco dobra para trás
  jiggle(e, 16, -60 - Math.random() * 30, Math.min(7, 2.5 + scaled * 0.08)); e.bendV = (e.bendV || 0) - Math.min(70, 20 + scaled * 1.2);
  floats.push({ x: e.x + rand(-10, 10), y: e.y - e.h - 10, v: Math.round(scaled), t: 0.8, big: scaled > 30 });
  if (heavy) {
    if (e.hp <= 0) { trooperDie(e); return; }
    const armored = e.state === "charge" && !stagger;               // a investida aguenta golpes leves
    if (stagger) { e.state = "stagger"; e.st = 0; }
    else if (!armored && dmg >= 4) { e.state = "hitstun"; e.st = 0; }
    return;
  }
  if (e.hp <= 0) { e.dead = 2.8; e.dissolve = 0.75; addTrauma(0.25); SFX.play("dissolve"); }
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.type === "trooper") { updateTrooper(e, dt); continue; }
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
      if (e.dead <= 0) Object.assign(e, { dead: 0, dissolve: 0, hp: e.maxHp, x: e.home, y: e.homeY, vx: 0, vy: 0 });
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


// ---------------------------------------------------------------- Soldado de Choque (inimigo)
// patrulha → persegue em corrida pesada → ajoelha e aponta (aviso: mira laranja + carga no cano)
// → 3 disparos do canhão de choque → arrefece. O soco de energia devolve os projéteis; o laser
// nível 2+ destrói-os; o soco de energia e o laser máximo atordoam-no.
const bolts = [];
function trooperMuzzle(e) { return { x: e.x + (TR.muzzleAim.x - e.recoil) * e.facing, y: e.y + TR.muzzleAim.y }; }
function updateTrooper(e, dt) {
  e.flash = Math.max(e.flash - dt, 0); e.squash = Math.max(e.squash - dt, 0); e.recoil = Math.max(0, e.recoil - dt * 40);
  if (e.dead > 0) { trooperDeathUpdate(e, dt); return; }
  e.st += dt; e.anim += dt; e.cd -= dt;
  e.walkPh = (e.walkPh || 0) + Math.abs(e.vx) * dt * 0.05; e.turnT = Math.max(0, (e.turnT || 0) - dt);
  const ela = (e.vx - (e.prevVx ?? e.vx)) / Math.max(dt, 1e-4) * e.facing; e.prevVx = e.vx;
  spring(e, "bend", clamp(-ela * 0.004, -6, 6) + (e.state === "charge" ? 4 : e.state === "windup" ? -3 : Math.sin(time * 1.3 + e.home) * 0.8), 70, 8, dt);
  spring(e, "land", e.state === "windup" ? 1 : 0, 120, 9, dt);
  if (e.jig) e.jig.t += dt;
  const dx = k.x - e.x, adx = Math.abs(dx);
  if (e.onFloor && e.state !== "charge" && e.state !== "fire" && e.state !== "aim") {
    const f = Math.sign(dx) || e.facing;
    if (f !== e.facing) { e.facing = f; e.turnT = 0.1; }
  }
  let target = 0;
  const active = fight.phase === "fight" && !k.dead;
  if (!active && e.state !== "hitstun" && e.state !== "stagger") e.state = "neutral";
  switch (e.state) {
    case "neutral":
      if (!active) break;
      // mantém distância média: aproxima-se se longe, recua se encostado, oscila no meio
      if (adx > 460) target = 115 * e.facing;
      else if (adx < 130) target = -85 * e.facing;
      else target = Math.sin(time * 1.4) * 45 * e.facing;
      if (e.cd <= 0 && e.onFloor) {
        const r = Math.random();
        if (adx < 330 && r < 0.6) { e.state = "windup"; e.st = 0; SFX.play("stomp"); }
        else { e.state = "aim"; e.st = 0; SFX.play("cannonCharge"); }
      }
      break;
    case "aim": {                                             // aviso: mira laranja e carga no cano
      const m = trooperMuzzle(e);
      if (Math.random() < 0.8) orbitIn("sparkHot", () => trooperMuzzle(e), 1, 30, 0.16, 1.6);
      light(m.x, m.y, 60 + e.st * 140, PAL.ember, 0.4 + e.st);
      if (e.st >= 0.6) { e.state = "fire"; e.st = 0; e.shots = 0; }
      break;
    }
    case "fire":
      if (e.shots < 3 && e.st >= e.shots * 0.16) { fireBolt(e); e.shots++; }
      if (e.st >= 0.6) { e.state = "cool"; e.st = 0; }
      break;
    case "cool":
      if (Math.random() < 0.3) { const m = trooperMuzzle(e); emit("smoke", m.x, m.y, e.facing * 20, -30, 0.9, 4, 14, "front"); }
      if (e.st >= 0.45) { e.state = "neutral"; e.st = 0; e.cd = 0.9 + Math.random() * 0.8; }
      break;
    case "windup":                                            // aviso da investida: pisa o chão e range a armadura
      if (Math.random() < 0.5) emit("dust", e.x - e.facing * 10, e.y - 3, rand(-80, 80), rand(-50, -10), 0.4, 6, 14, "back");
      if (e.st >= 0.38) { e.state = "charge"; e.st = 0; e.chargeDir = e.facing; e.chargeHit = false; SFX.play("charge"); }
      break;
    case "charge": {                                          // investida de ombro: atravessa o ecrã
      target = 600 * e.chargeDir; e.facing = e.chargeDir;
      if (Math.random() < 0.7) emit("dust", e.x - e.facing * 18, e.y - 3, -e.facing * rand(80, 200), rand(-40, -10), 0.5, 7, 18, "back");
      if (Math.random() < 0.5) { ghosts.push({ x: e.x, y: e.y, row: 1, col: Math.floor(e.anim * 12) % 4, facing: e.facing, rot: 0, pv: { x: 0, y: 0 }, t: 0.2, trooper: true }); }
      const hitBox = { x: e.x + e.facing * 10 - 30, y: e.y - 110, w: 60, h: 100 };
      if (!e.chargeHit && overlap(hitBox, bodyRect(k, C.bodyW, C.bodyH))) {
        e.chargeHit = true; hurtKane(26, e.facing, true);
        ring({ x: k.x - e.facing * 10, y: k.y - 60, r0: 8, r1: 60, hex: PAL.gold, width: 6, dur: 0.25 });
        e.state = "recover"; e.st = 0; e.vx = -e.facing * 120;
      }
      const atWall = (e.chargeDir > 0 && e.x > ARENA_R - 40) || (e.chargeDir < 0 && e.x < ARENA_L + 40);
      if (e.st >= 0.65 || atWall) {
        if (atWall) { addTrauma(0.3); spray("debris", e.x + e.facing * 20, e.y - 60, 8, { speed: 260, dir: e.facing > 0 ? Math.PI : 0, spread: 1.4, life: 0.8, size: 3 }); SFX.play("boltHit"); }
        e.state = "recover"; e.st = 0;
      }
      break;
    }
    case "recover":
      if (e.st >= 0.55) { e.state = "neutral"; e.st = 0; e.cd = 1.0 + Math.random() * 0.8; }
      break;
    case "hitstun":
      if (e.st >= 0.24) { e.state = "neutral"; e.st = 0; e.cd = Math.max(e.cd, 0.35); }
      break;
    case "stagger":
      if (Math.random() < 0.4) spray("sparkHot", e.x + rand(-14, 14), e.y - rand(40, 110), 1, { speed: 160, life: 0.3, size: 1.5 });
      if (e.st >= 0.5) { e.state = "neutral"; e.st = 0; e.cd = Math.max(e.cd, 0.5); }
      break;
  }
  e.vx = approach(e.vx, target, (e.state === "charge" ? 2400 : 700) * dt);
  e.vy = Math.min(e.vy + 1400 * dt, 900);
  moveAndSlide(e, e.w, e.h, dt);
  // passos pesados
  if (Math.abs(e.vx) > 40 && e.onFloor) {
    e.stepT += dt;
    if (e.stepT > (Math.abs(e.vx) > 200 ? 0.16 : Math.abs(e.vx) > 80 ? 0.3 : 0.45)) {
      e.stepT = 0;
      for (let i = 0; i < 3; i++) emit("dust", e.x - 12 * e.facing, e.y - 3, -e.facing * rand(30, 90), rand(-30, -8), rand(0.4, 0.6), rand(6, 9), 16, "back");
      SFX.play("heavyStep", clamp(1 - adx / 900, 0.2, 1));
      addTrauma(Math.abs(e.vx) > 200 ? 0.08 : 0.03);
    }
  }
  e.smokeT += dt;
  if (e.smokeT > 0.14) {
    e.smokeT = 0;
    const ex = e.x + TR.exhaust.x * e.facing, ey = e.y + TR.exhaust.y + (e.state === "aim" || e.state === "fire" || e.state === "cool" ? 48 : 0);
    emit("smoke", ex, ey, rand(-10, 10) - e.facing * 10, rand(-50, -30), rand(0.8, 1.3), 4, 16, "back");
    if (Math.random() < 0.25) emit("ember", ex, ey, rand(-30, 30), rand(-90, -40), 0.5, 2, 1, "front");
  }
}
function fireBolt(e) {
  const m = trooperMuzzle(e);
  let ang = Math.atan2((k.y - 60) - m.y, k.x - m.x);
  const base = e.facing > 0 ? 0 : Math.PI;
  let d = Math.atan2(Math.sin(ang - base), Math.cos(ang - base));
  ang = base + clamp(d, -0.5, 0.5);
  bolts.push({ x: m.x, y: m.y, vx: Math.cos(ang) * 560, vy: Math.sin(ang) * 560, owner: "enemy", life: 2.4, dmg: 12 });
  e.recoil = 7;
  ring({ x: m.x, y: m.y, r0: 4, r1: 34, hex: PAL.gold, width: 5, dur: 0.16 });
  spray("sparkHot", m.x, m.y, 12, { speed: 420, dir: ang, spread: 0.9, life: 0.25, size: 2 });
  emit("smoke", m.x, m.y, Math.cos(ang) * 60, -20, 0.8, 6, 18, "front");
  light(m.x, m.y, 200, PAL.ember, 1.2);
  addTrauma(clamp(0.18 - Math.abs(k.x - e.x) / 3000, 0.03, 0.18));
  SFX.play("cannon");
}
function boltExplode(b) {
  const hex = b.owner === "kane" ? PAL.cyan : PAL.ember;
  ring({ x: b.x, y: b.y, r0: 4, r1: 40, hex, width: 5, dur: 0.22 });
  spray(b.owner === "kane" ? "sparkCyan" : "sparkHot", b.x, b.y, 14, { speed: 340, life: 0.35, size: 2 });
  emit("smoke", b.x, b.y, 0, -30, 0.9, 6, 20, "front");
  light(b.x, b.y, 160, hex, 1);
  SFX.play("boltHit");
}
function distToBeam(px, py, bm) {
  const t = clamp((px - bm.ox) * bm.dx + (py - bm.oy) * bm.dy, 0, bm.len);
  return Math.hypot(px - (bm.ox + bm.dx * t), py - (bm.oy + bm.dy * t));
}
function updateBolts(dt) {
  const fist = k.action === "punch" && k.t >= k.pt.w * 0.4 && k.t < k.pt.w + k.pt.a + 0.06 ? local({ x: k.pt.fx.x, y: k.pt.fx.y }) : null;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    const kaneBolt = b.owner === "kane";
    emit(kaneBolt ? "sparkCyan" : "sparkHot", b.x, b.y, -b.vx * 0.2 + rand(-40, 40), -b.vy * 0.2 + rand(-40, 40), 0.18, 1.6, 0.4, "front");
    light(b.x, b.y, 90, kaneBolt ? PAL.cyan : PAL.ember, 0.8);
    let gone = b.life <= 0;
    if (!gone && solids.some(s => b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h)) { boltExplode(b); scorch(b.x, b.y, 0, 1); gone = true; }
    if (!gone && !kaneBolt) {
      // soco (normal ou de energia) na trajetória devolve o projétil
      if (fist && Math.hypot(b.x - fist.x, b.y - fist.y) < (k.energy ? 60 : 40)) {
        b.owner = "kane"; b.vx = k.facing * 760; b.vy = rand(-40, 40); b.dmg = k.energy ? 45 : 28; b.life = 2;
        ring({ x: b.x, y: b.y, r0: 4, r1: 46, hex: PAL.cyan, width: 5, dur: 0.2 }); hitstop = Math.max(hitstop, 0.05);
        SFX.play("reflect"); floats.push({ x: b.x, y: b.y - 20, v: "DEVOLVIDO!", t: 0.8, t0: 0.8, big: true, col: PAL.cyanSoft });
        continue;
      }
      // laser nível 2+ desfaz projéteis no caminho
      if (k.beam && k.laserLevel >= 2 && distToBeam(b.x, b.y, k.beam) < 10 * beamWidth(k.laserPow)) { boltExplode(b); gone = true; }
      else if (!k.dead && k.invuln <= 0 && overlap({ x: b.x - 6, y: b.y - 6, w: 12, h: 12 }, bodyRect(k, C.bodyW + 6, k.kneel > 0.5 || k.crouch ? 72 : C.bodyH))) {
        boltExplode(b); hurtKane(b.dmg, Math.sign(b.vx)); gone = true;
      }
    }
    if (!gone && kaneBolt) {
      for (const e of enemies) if (enemyAlive(e) && overlap({ x: b.x - 8, y: b.y - 8, w: 16, h: 16 }, bodyRect(e, e.w, e.h))) {
        boltExplode(b); hitEnemy(e, b.dmg, Math.sign(b.vx) * 260, -60, true); gone = true; break;
      }
    }
    if (gone) bolts.splice(i, 1);
  }
}
function drawBolts() {
  ADD();
  for (const b of bolts) {
    const a = Math.atan2(b.vy, b.vx), kb = b.owner === "kane";
    const outer = kb ? PAL.cyan : PAL.ember, mid = kb ? PAL.cyanSoft : PAL.gold;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
    ctx.globalAlpha = 0.7; ctx.drawImage(glowTex(outer), -70, -16, 84, 32);
    ctx.globalAlpha = 1; ctx.drawImage(glowTex(mid, true), -36, -7, 48, 14);
    ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 1; ctx.fillRect(-14, -2, 20, 4);
    ctx.restore();
    glow(b.x, b.y, 22, outer, 0.8); glow(b.x, b.y, 7, PAL.white, 1, true);
  }
  // aviso de mira dos soldados a apontar
  for (const e of enemies) if (e.type === "trooper" && e.dead <= 0 && e.state === "aim") {
    const m = trooperMuzzle(e), t = e.st / 0.75;
    let ang = Math.atan2((k.y - 60) - m.y, k.x - m.x);
    const base = e.facing > 0 ? 0 : Math.PI, d = Math.atan2(Math.sin(ang - base), Math.cos(ang - base));
    ang = base + clamp(d, -0.5, 0.5);
    ctx.globalAlpha = 0.25 + 0.5 * t; ctx.strokeStyle = PAL.ember; ctx.lineWidth = 1 + t; ctx.setLineDash([5, 7]); ctx.lineDashOffset = time * 60;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + Math.cos(ang) * 600, m.y + Math.sin(ang) * 600); ctx.stroke(); ctx.setLineDash([]);
    glow(m.x, m.y, 10 + t * 22, PAL.ember, 0.6 + 0.4 * t); glow(m.x, m.y, 4 + t * 6, PAL.white, t, true);
  }
  NORMAL();
}
function trooperDie(e) {
  e.dead = 99; e.deathT = 0; e.vx = Math.sign(e.vx || -e.facing) * 60;
  SFX.play("zap"); addTrauma(0.2);
  spray("sparkHot", e.x, e.y - 80, 20, { speed: 380, life: 0.4, size: 2 });
}
function trooperDeathUpdate(e, dt) {
  const t0 = e.deathT; e.deathT += dt; e.dead -= dt;
  const at = t => t0 < t && e.deathT >= t;
  e.vx = approach(e.vx, 0, 300 * dt); e.vy = Math.min(e.vy + 1400 * dt, 900); moveAndSlide(e, e.w, 40, dt);
  if (at(0.13)) { spray("sparkHot", e.x - 10 * e.facing, e.y - 70, 16, { speed: 320, life: 0.35, size: 2 }); SFX.play("zap"); light(e.x, e.y - 70, 160, PAL.gold, 1); }
  if (at(0.27)) {                                    // explosão principal
    const cx = e.x, cy = e.y - 60;
    ring({ x: cx, y: cy, r0: 10, r1: 170, hex: PAL.ember, width: 9, dur: 0.45 });
    ring({ x: cx, y: cy, r0: 6, r1: 80, hex: PAL.white, width: 6, dur: 0.2 });
    ring({ x: cx, y: e.y, r0: 10, r1: 200, flat: 0.18, hex: PAL.gold, width: 5, dur: 0.5 });
    spray("orbRed", cx, cy, 10, { speed: 200, life: 0.45, size: 40, size1: 6 });
    spray("sparkHot", cx, cy, 50, { speed: 620, life: 0.6, size: 2.4 });
    spray("debris", cx, cy, 22, { speed: 520, dir: -Math.PI / 2, spread: 2.6, life: 1.4, size: 4 });
    for (let i = 0; i < 18; i++) emit("smoke", cx + rand(-30, 30), cy + rand(-30, 30), rand(-120, 120), rand(-160, -20), rand(1.2, 2), rand(10, 16), 40, "front");
    for (let i = 0; i < 20; i++) emit("ember", cx, cy, rand(-260, 260), rand(-320, -60), rand(0.8, 1.6), 2.5, 1, "front");
    light(cx, cy, 420, PAL.ember, 1.6); flash(0.3, PAL.ember); zoomKick(0.05); addTrauma(0.6);
    scorch(e.x, e.y, 0, 1); scorch(e.x - 10, e.y, 0, 1); scorch(e.x + 10, e.y, 0, 1);
    SFX.play("explosion");
  }
  if (at(0.45)) { spray("sparkHot", e.x + 20, e.y - 40, 10, { speed: 260, life: 0.3, size: 2 }); SFX.play("zap"); }
  if (e.deathT > 0.6 && e.dead > 1 && Math.random() < 0.2) {        // destroços a fumegar
    emit("smoke", e.x + rand(-20, 20), e.y - 12, rand(-10, 10), rand(-50, -25), rand(1, 1.6), 5, 20, "back");
    if (Math.random() < 0.3) emit("ember", e.x + rand(-20, 20), e.y - 10, rand(-20, 20), rand(-80, -30), 0.6, 2, 1, "front");
  }
  if (e.deathT > 0.6 && e.dead > 1) light(e.x, e.y - 10, 70, PAL.ember, 0.4 + 0.2 * Math.sin(time * 9));
  if (e.dead <= 0) Object.assign(e, { dead: 0, hp: e.maxHp, x: e.home, y: e.homeY, vx: 0, vy: 0, state: "patrol", st: 0, cd: 1.5 });
}
function trooperFrame(e) {
  if (e.dead > 0) return [2, Math.min(4, Math.floor(e.deathT / 0.13))];
  if (e.state === "aim" || e.state === "fire" || e.state === "cool") return [0, 1];
  if (e.state === "charge") return [1, Math.floor(e.walkPh * 1.3) % 4];
  if (e.state === "windup") return [1, 0];
  if (e.state === "hitstun" || e.state === "stagger") return [2, 0];   // frame do primeiro impacto da derrota = reação ao golpe
  if (Math.abs(e.vx) > 30) return [1, Math.floor(e.walkPh * 1.3) % 4];   // passada acompanha a velocidade real
  return [0, 0];
}
function drawTrooper(e) {
  if (!TROOPER.naturalWidth) return;
  const [row, col] = trooperFrame(e);
  const sq = e.squash / 0.15, breathe = row === 0 && col === 0 ? Math.sin(e.anim * 2) * 0.012 : 0;
  const fade = e.dead > 0 && e.dead < 1 ? e.dead : 1;
  ctx.save();
  const shake = e.state === "stagger" || e.state === "windup" || (e.state === "hitstun" && e.st < 0.1) ? rand(-2, 2) : 0;
  ctx.translate(e.x - e.recoil * e.facing + shake, e.y);
  const turn = e.turnT > 0 ? 0.4 + 0.6 * (1 - e.turnT / 0.1) : 1;
  ctx.scale(e.facing * turn * (1 + sq * 0.1), 1 - sq * 0.08 + breathe);
  ctx.globalAlpha = fade;
  // derrota (destroços) desenha-se rígida; vivo, o corpo deforma-se
  const field = e.dead > 0 ? null : trooperField(e);
  const draw = img => field ? drawWarped(img, TROOPER, "T", row, col, field) : ctx.drawImage(img, col * FW, row * FH, FW, FH, -OX, -OY, FW, FH);
  draw(TROOPER);
  ADD();
  if (e.flash > 0) { ctx.globalAlpha = 0.85 * fade; draw(tinted("#ffffff", TROOPER)); }
  if (e.state === "fire" && e.st < 0.45) { ctx.globalAlpha = 0.25; draw(tinted(PAL.ember, TROOPER)); }   // iluminado pelo disparo
  if (e.dead <= 0) {
    const v = row === 0 && col === 1 ? TR.visorAim : row === 0 ? TR.visorStand : { x: 18, y: -98 };
    glow(v.x, v.y, 12, "#ff7a2a", 0.55 + 0.2 * Math.sin(time * 4 + e.home));
  }
  ctx.restore(); NORMAL();
  if (e.dead <= 0 && e.hp < e.maxHp) {
    ctx.fillStyle = "#000a"; ctx.fillRect(e.x - 26, e.y - e.h - 22, 52, 6);
    ctx.fillStyle = "#ff8a3d"; ctx.fillRect(e.x - 26, e.y - e.h - 22, 52 * Math.max(e.hp, 0) / e.maxHp, 6);
  }
}

// ---------------------------------------------------------------- Kane: pontos no mundo
// ponto do sprite → mundo, com a mesma rotação do corpo usada no desenho
function pivotFor(pose) { return pose === "fly" ? PT.pivotFly : pose === "run" || pose === "ground" || pose === "walk" || pose === "stance" || pose === "crouch" || pose === "land" || pose === "intro" || pose === "win" ? { x: 0, y: 0 } : PT.pivotBody; }
function local(p) {
  const pv = pivotFor(kaneFrame()[2]), c = Math.cos(k.rot), sn = Math.sin(k.rot);
  const dx = p.x - pv.x, dy = p.y - pv.y;
  return { x: k.x + (pv.x + dx * c - dy * sn) * k.facing, y: k.y + pv.y + dx * sn + dy * c };
}
function eyeWorld() { const [row] = kaneFrame(); return local(row === ROW.punch ? PT.eyeGuard : PT.eyeIdle); }
let laserAimDy = 0;
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
// Direção de movimento: o analógico (toque ou comando) é proporcional — empurrar pouco = andar devagar.
// As teclas/D-pad dão o valor máximo. Fica a fonte com maior intensidade.
function inputVec() {
  let x = (held.right ? 1 : 0) - (held.left ? 1 : 0), y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  for (const s of [stick, gpStick]) if (Math.hypot(s.x, s.y) > Math.hypot(x, y)) { x = s.x; y = s.y; }
  return { x, y, analog: Math.hypot(stick.x, stick.y) > 0.01 || Math.hypot(gpStick.x, gpStick.y) > 0.01 };
}
// Mira do laser: com analógico aponta em qualquer ângulo (até ±60°) para o lado para onde o Kane olha;
// com teclas, horizontal ou diagonal. No chão não aponta mais de 20° para baixo (o feixe bateria no chão).
function aimDir(inp) {
  if (inp.analog && Math.hypot(inp.x, inp.y) > 0.3) {
    let a = Math.atan2(inp.y, Math.max(Math.abs(inp.x), 0.001));
    a = clamp(a, -1.05, k.onFloor ? 0.35 : 1.05);
    return { dx: k.facing * Math.cos(a), dy: Math.sin(a) };
  }
  if (inp.y < -0.5) return { dx: k.facing * Math.SQRT1_2, dy: -Math.SQRT1_2 };
  if (inp.y > 0.5 && !k.onFloor) return { dx: k.facing * Math.SQRT1_2, dy: Math.SQRT1_2 };
  return { dx: k.facing, dy: 0 };
}
function castLaser(ox, oy, dx, dy, pierce = false) {
  let best = C.laserRange, nx = 0, ny = 0;
  for (const s of solids) { const h = rayHit(ox, oy, dx, dy, s); if (h && h.t < best) { best = h.t; nx = h.nx; ny = h.ny; } }
  const hits = [];
  for (const e of enemies) if (enemyAlive(e)) { const h = rayHit(ox, oy, dx, dy, bodyRect(e, e.w, e.h)); if (h && h.t < best) hits.push({ e, h }); }
  hits.sort((a, b) => a.h.t - b.h.t);
  let targets = hits.map(q => q.e);
  if (!pierce && hits.length) { best = hits[0].h.t; nx = hits[0].h.nx; ny = hits[0].h.ny; targets = [hits[0].e]; }
  // nível máximo atravessa os inimigos e só para na parede
  return { ox, oy, dx, dy, len: best, ex: ox + dx * best, ey: oy + dy * best, hit: best < C.laserRange, target: targets[0] || null, targets, nx, ny, pierce };
}

function updateKane(dt) {
  if (k.dead) { k.vy = Math.min(k.vy + C.gravity * dt, C.maxFall); k.vx = approach(k.vx, 0, C.groundFriction * dt); moveAndSlide(k, C.bodyW, C.bodyH, dt); return; }
  updateExhaustion(dt);
  k.stun = Math.max(0, k.stun - dt); k.dashCd = Math.max(0, k.dashCd - dt);
  // sem controlo: ajoelhado, atordoado por um golpe, ou fora do tempo de luta (apresentação / K.O.)
  const locked = k.exhausted || k.kneel > 0.3 || k.stun > 0 || fight.phase !== "fight";
  const inp = locked ? { x: 0, y: 0 } : inputVec();
  if (!locked && want("jump")) k.jumpBuf = C.jumpBuffer;
  if (!locked && k.dashCd <= 0 && !(k.airDash && !k.onFloor) && (k.action === "none" || k.action === "punch") && want("fly")) startDash(inp);
  // como nos jogos de luta: no chão está sempre virado para o adversário (no ar mantém o lado)
  if (k.onFloor && (k.action === "none" || k.action === "charge") && !foe.dead) {
    const f = foe.x >= k.x ? 1 : -1;
    if (f !== k.facing) { k.facing = f; k.turnT = 0.09; }
  }
  if (k.onFloor) { k.airDash = false; k.airAttack = false; }
  // agachar: baixo no chão (sem andar); a guarda baixa defende e os socos passam a ser baixos
  k.crouch = k.onFloor && !locked && inp.y > 0.55 && (k.action === "none" || k.action === "charge" || (k.action === "punch" && k.pt.low !== undefined) || k.action === "punch" && (k.pt === PUNCH_LOW || k.pt === PUNCH_SWEEP));
  k.crouchT = clamp((k.crouchT || 0) + (k.crouch ? dt : -dt) / 0.12, 0, 1);
  k.jumpT = Math.max(0, (k.jumpT || 0) - dt); k.landT = Math.max(0, (k.landT || 0) - dt);
  k.jumpBuf = Math.max(k.jumpBuf - dt, 0);
  k.invuln = Math.max(k.invuln - dt, 0);
  k.coyote = k.onFloor ? C.coyote : Math.max(k.coyote - dt, 0);

  const wasFloor = k.onFloor, fallSpeed = k.vy;
  k.t += dt; k.beam = null;
  if (k.action === "none") {
    if (!locked && want("laser")) {
      start("laser"); k.laserTick = 0; k.lastBeam = null; k.laserSound = false; k.maxTime = 0;
      k.laserLevel = powerLevel(k.laserPow);   // potência que ainda resta continua a contar
      SFX.play("laserStart");
    } else if (!locked && (k.onFloor || !k.airAttack) && want("punch")) startPunch(false);
  } else if (k.action === "charge") {
    chargeFx(dt);
    if (!held.punch || locked) { k.chargedPing = false; SFX.loopStop("charge", 0.06); if (!locked) startPunch(k.t >= C.chargeTime); else start("none"); }
  } else if (k.action === "punch") {
    // segurar o botão depois do jab passa para a carga do soco de energia
    if (!k.energy && held.punch && !locked && k.t >= 0.16) { start("charge"); SFX.loopStart("charge"); }
    // combo: depois de acertar, um novo soco cancela a recuperação
    else if (!locked && k.hitIds.size && k.t >= k.pt.w + k.pt.a * 0.5 && want("punch")) startPunch(false);
    else if (k.t >= k.pt.w && k.t - dt < k.pt.w) punchImpactFx();
    if (k.action === "punch" && k.t >= k.pt.w && k.t < k.pt.w + k.pt.a) punchQuery();
    if (k.action === "punch" && k.t >= k.pt.w + k.pt.a + k.pt.r) start("none");
  } else if (k.action === "laser") {
    const dir = aimDir(inp); laserAimDy = dir.dy;
    const eye = eyeWorld();
    k.aim = castLaser(eye.x, eye.y, dir.dx, dir.dy, C.laserLevels[k.laserLevel - 1].pierce);
    if (!held.laser || locked) {
      start("none");
      if (k.lastBeam) { laserEndFx(eye); SFX.loopStop("laser", 0.08); SFX.play("laserEnd"); }
      if (k.maxTime >= C.overloadMin) startExhaust(Math.min(C.kneelMax, C.kneelBase + k.maxTime * C.kneelPerSec));
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
    const back = inp.x * k.facing < -0.2;
    k.blocking = back && k.onFloor && k.action === "none" && !locked;           // segurar para trás = defender
    const tx = k.crouch ? 0 : inp.x * C.runSpeed * mult * (back ? C.backMult : 1);
    const acc = k.onFloor ? (tx === 0 ? C.groundFriction : C.groundAccel) : C.airAccel;
    if (k.dashT > 0) {                                                          // dash: velocidade fixa, quase sem gravidade
      k.dashT -= dt; k.vx = k.dashDir * C.dashSpeed * (0.4 + 0.6 * k.dashT / C.dashTime); k.vy = Math.min(k.vy, 60);
      if (Math.random() < 0.6) { const [row, col] = kaneFrame(); ghosts.push({ x: k.x, y: k.y, row, col, facing: k.facing, rot: 0, pv: { x: 0, y: 0 }, t: 0.25 }); }
    } else k.vx = approach(k.vx, k.stun > 0 ? 0 : tx, (k.stun > 0 ? 900 : acc) * dt);
    k.vy = Math.min(k.vy + C.gravity * (k.vy > 0 ? C.fallMult : 1) * dt, C.maxFall);
    const canJump = k.action !== "punch" && k.action !== "laser" && !locked;
    if (k.jumpBuf > 0 && canJump && k.coyote > 0) {
      // salto com direção (para a frente/para trás) como nos jogos de luta
      k.vy = C.jumpVel; k.jumpBuf = 0; k.coyote = 0; jumped = true; k.jumpT = 0.08;
      if (Math.abs(inp.x) > 0.3) k.vx = Math.sign(inp.x) * C.runSpeed * 1.05;
    }
    if (released("jump") && k.vy < 0) k.vy *= C.jumpCut;
  }
  moveAndSlide(k, C.bodyW, C.bodyH, dt);
  if (k.y < 400) { k.y = 400; k.vy = Math.max(k.vy, 0); }   // teto da arena

  k.fury = C.maxFury;                                           // energia infinita
  if (!k.beam) k.laserPow = Math.max(0, k.laserPow - C.powerDecay * dt);   // potência dissipa-se sem feixe
  k.anim += dt;
  updateAnimState();
  movementFx(dt, wasFloor, fallSpeed, jumped);
  ambientFx(dt);

  // os dois lutadores não se atravessam: empurram-se
  if (!foe.dead && Math.abs(k.y - foe.y) < 90) {
    const minD = (C.bodyW + foe.w) / 2, d = k.x - foe.x;
    if (Math.abs(d) < minD) {
      const push = (minD - Math.abs(d)) / 2 * (Math.sign(d) || k.facing * -1);
      k.x = clamp(k.x + push, ARENA_L + 14, ARENA_R - 14); foe.x = clamp(foe.x - push, ARENA_L + 22, ARENA_R - 22);
    }
  }
}
function startPunch(energy) {
  // agachado: soco baixo (ou rasteira se carregado); no ar: pontapé aéreo
  k.energy = energy && k.onFloor && !k.crouch;
  k.pt = !k.onFloor ? PUNCH_AIR : k.crouch ? (energy ? PUNCH_SWEEP : PUNCH_LOW) : energy ? PUNCH_HEAVY : PUNCH_JAB;
  if (!k.onFloor) k.airAttack = true;
  k.hitIds.clear(); start("punch");
  if (k.onFloor) k.vx += k.facing * C.punchLunge * k.pt.lunge;
  SFX.play("whoosh", energy);
}
function startDash(inp) {
  const dir = Math.abs(inp.x) > 0.2 ? Math.sign(inp.x) : k.facing;
  k.dashT = C.dashTime; k.dashDir = dir; k.dashCd = C.dashCd; k.invuln = Math.max(k.invuln, 0.1);
  if (!k.onFloor) { k.airDash = true; k.vy = Math.min(k.vy, -60); }
  if (k.action === "punch") start("none");
  SFX.play("dash");
  ring({ x: k.x - dir * 10, y: k.y - 60, r0: 6, r1: 50, arc: Math.PI * 0.8, facing: -dir, hex: PAL.cyan, width: 4, dur: 0.2 });
  spray("sparkCyan", k.x - dir * 14, k.y - 60, 12, { speed: 340, dir: dir > 0 ? Math.PI : 0, spread: 0.9, life: 0.25, size: 1.8 });
  if (k.onFloor) for (let i = 0; i < 8; i++) emit("dust", k.x, k.y - 3, -dir * rand(80, 220), rand(-40, -10), rand(0.4, 0.6), rand(6, 9), 18, "back");
}
function hurtKane(dmg, dir, heavy = false) {
  if (k.dead || (k.invuln > 0 && k.dashT > 0) || fight.phase !== "fight") return;
  if (k.invuln > 0 && !heavy) return;
  // defesa: segurar para trás virado para o ataque (o ataque empurra no sentido "dir")
  if (k.blocking && k.facing === -dir) {
    k.hp = Math.max(1, k.hp - dmg * C.blockChip); k.stun = heavy ? 0.28 : 0.16; k.vx = dir * (heavy ? 300 : 160);
    jiggle(k, 30, -64, 2.5); k.bendV = (k.bendV || 0) - 20;
    const sx = k.x + k.facing * 22, sy = k.y - 70;
    ring({ x: sx, y: sy, r0: 10, r1: 46, arc: Math.PI * 0.9, facing: k.facing, hex: PAL.cyan, width: 6, dur: 0.22 });
    spray("sparkCyan", sx, sy, 14, { speed: 300, dir: k.facing > 0 ? 0 : Math.PI, spread: 1.8, life: 0.25, size: 1.8 });
    light(sx, sy, 120, PAL.cyan, 1); addTrauma(0.12); hitstop = Math.max(hitstop, 0.04);
    SFX.play("block"); floats.push({ x: sx, y: sy - 50, v: "DEFESA", t: 0.6, t0: 0.6, big: true, col: PAL.cyanSoft });
    return;
  }
  k.hp = Math.max(0, k.hp - dmg); k.invuln = heavy ? 0.45 : 0.22; k.hurtFlash = 0.25;
  jiggle(k, 18, -78, heavy ? 6 : 3.5); k.bendV = (k.bendV || 0) - (heavy ? 60 : 35);   // dobra para trás com o golpe
  k.stun = heavy ? 0.55 : 0.32; k.dashT = 0;
  k.vx = dir * (heavy ? 420 : 240); k.vy = heavy ? -320 : (k.onFloor ? 0 : -120);
  if (k.action === "laser" && k.lastBeam) laserEndFx(eyeWorld());
  start("none");
  addTrauma(heavy ? 0.5 : 0.3, dir * 6, 0); flash(heavy ? 0.3 : 0.18, PAL.red); hitstop = Math.max(hitstop, heavy ? 0.09 : 0.05);
  SFX.play("hurt"); SFX.loopStop("charge", 0.05); SFX.loopStop("laser", 0.05);
  spray("sparkHot", k.x, k.y - 60, heavy ? 24 : 14, { speed: 320, life: 0.35, size: 2 });
  fight.foeCombo = (fight.foeComboT > 0 ? fight.foeCombo : 0) + 1; fight.foeComboT = 1.2;
  if (k.hp <= 0) { k.dead = true; k.vy = -380; k.vx = dir * 260; }
}

// ---------------------------------------------------------------- exaustão: perder forças e ajoelhar
function startExhaust(dur) {
  k.exhausted = true; k.exhaustT = dur; k.exhaustDur = dur; k.kneelLanded = false;
  if (k.flying) setFlying(false);                 // sem forças deixa de voar e cai
  SFX.play("powerDown");
  floats.push({ x: k.x, y: k.y - 150, v: "SOBRECARGA", t: 1.3, t0: 1.3, big: true, col: "#ff6a5c" });
  spray("sparkRed", k.x + 12 * k.facing, k.y - 110, 14, { speed: 160, life: 0.4, size: 1.5 });
  for (let i = 0; i < 6; i++) emit("steam", k.x + rand(-14, 14), k.y - rand(60, 110), rand(-20, 20), rand(-60, -30), rand(0.8, 1.2), 6, 22, "front");
}
function updateExhaustion(dt) {
  k.weak = false;
  if (k.exhausted) {
    // só começa a contar a recuperação quando o joelho está no chão
    if (k.kneel >= 1 || !k.onFloor) k.exhaustT -= dt;
    if (k.exhaustT <= 0) {
      k.exhausted = false;
      SFX.play("powerUp");
      ring({ x: k.x, y: k.y - 60, r0: 10, r1: 80, hex: PAL.red, width: 5, dur: 0.35 });
      spray("orbRed", k.x, k.y - 60, 8, { speed: 140, life: 0.35, size: 14, size1: 2 });
    }
  }
  const target = k.exhausted && k.onFloor ? 1 : 0;
  k.kneel = target > k.kneel ? Math.min(1, k.kneel + dt / 0.4) : Math.max(0, k.kneel - dt / 0.35);
  if (k.kneel >= 1 && !k.kneelLanded) {           // joelho bate no chão
    k.kneelLanded = true;
    SFX.play("kneelThud"); addTrauma(0.18, 0, 3);
    for (let i = 0; i < 10; i++) { const s = i % 2 ? -1 : 1; emit("dust", k.x + 18 * k.facing + s * 6, k.y - 3, s * rand(60, 160), rand(-40, -10), rand(0.5, 0.8), rand(7, 10), 18, "back"); }
  }
  if (k.kneel > 0.5) {                             // ajoelhado: vapor da armadura, visor a falhar, arfar
    if (Math.random() < 0.12) emit("steam", k.x + rand(-14, 14), k.y - rand(50, 90), rand(-10, 10), rand(-40, -20), rand(0.8, 1.2), 5, 20, "front");
    if (Math.random() < 0.05) { const e = kneelPoint(PT.eyeGuard); spray("sparkRed", e.x, e.y, 3, { speed: 90, life: 0.25, size: 1.2 }); }
    k.pantT += dt;
    if (k.pantT > 0.75) { k.pantT = 0; SFX.play("pant"); }
  }
}
// ponto do sprite com a pose de joelhos aplicada (para o visor e partículas)
function kneelPoint(p) {
  const kp = easeInOut(k.kneel), HIP = -54, drop = -HIP * 0.52 * kp, a = 0.46 * kp;
  const dx = p.x, dy = p.y - HIP, c = Math.cos(a), sn = Math.sin(a);
  return { x: k.x + (dx * c - dy * sn - 4 * kp) * k.facing, y: k.y + HIP + drop + dx * sn + dy * c };
}
function respawn_unused() { Object.assign(k, { x: 200, y: FLOOR_Y, vx: 0, vy: 0, hp: C.maxHp, fury: C.maxFury, dead: false, invuln: 1, action: "none" }); }

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
  const fr = (name, pose) => [...F(name), pose];
  if (k.kneel > 0.01) return [ROW.punch, 0, "kneel"];
  if (fight.phase === "intro") return fr("intro" + Math.min(3, Math.floor(fight.t / 0.38)), "intro");      // entrada da ronda
  if ((fight.phase === "ko" || fight.phase === "end") && fight.winner === "kane" && !k.dead && fight.t > 1.1) {
    const v = fight.t - 1.1; return fr(v < 0.5 ? "win0" : v < 0.8 ? "win1" : "win2", "win");                 // vitória
  }
  if (k.stun > 0 && !k.dead) {
    if (k.blocking) return fr(k.crouch ? "crouchBlock" : "blockHigh", "block");
    return k.crouch ? fr("crouchHit", "hurt") : [ROW.punch, 2, "hurt"];
  }
  if (k.blocking) return fr(k.crouch ? "crouchBlock" : "blockHigh", "block");
  if (k.action === "laser") return (k.flying || !k.onFloor) ? [ROW.idle, 0, "airLaser"] : [ROW.punch, 0, "attack"];
  if (k.action === "charge") return fr(k.crouch ? "lowJab0" : "special0", "attack");
  if (k.action === "punch") {
    const t = k.t, P = k.pt;
    const i = t < P.w ? 0 : t < P.w + P.a ? 1 : 2;
    return fr(P.frames[i], "attack");
  }
  if (!k.onFloor) return fr(k.jumpT > 0 ? "jumpPrep" : "jumpAir", "air");
  if (k.landT > 0) return fr("jumpLand", "land");
  if (k.crouchT > 0) return fr(k.crouchT < 0.34 ? "crouch0" : k.crouchT < 0.67 ? "crouch1" : "crouch2", "crouch");
  if (k.moveAnim) {
    // passada de 5 frames, pela distância percorrida; a recuar, a animação corre ao contrário
    const n = Math.floor(k.walkPh / (Math.PI * 2) * 5) % 5, back = k.vx * k.facing < 0;
    return fr("walk" + (back ? 4 - n : n), "walk");
  }
  return fr("walk2", "stance");
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
  else if (pose === "walk") rotTarget = 0.07 * Math.sign(k.vx * k.facing) * Math.min(Math.abs(k.vx) / C.runSpeed, 1);   // inclina para onde anda
  else if (pose === "air") rotTarget = clamp(k.vx * k.facing / C.runSpeed * 0.08, -0.08, 0.08);
  else if (pose === "hurt") rotTarget = -0.18;
  else if (pose === "block") rotTarget = -0.04;
  if (k.action === "laser") rotTarget = laserAimDy * 0.16;   // corpo acompanha a mira: inclina para trás a apontar para cima
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
  // molas do corpo: o tronco fica para trás ao acelerar e segue em frente ao travar; capa arrasta-se
  const la = (k.vx - (k.prevVx ?? k.vx)) / Math.max(dt, 1e-4) * k.facing; k.prevVx = k.vx;
  const idleSway = pose === "stance" ? Math.sin(time * 1.7) * 2 : 0;
  spring(k, "bend", clamp(-la * 0.0045, -7, 7) + idleSway + (pose === "walk" ? Math.sign(k.vx * k.facing) * 1.4 : 0), 90, 9, dt);
  spring(k, "cape", clamp(-k.vx * k.facing * 0.035, -8, 8) - (k.onFloor ? 0 : clamp(k.vy * 0.012, -5, 5)), 40, 6, dt);
  spring(k, "land", 0, 160, 10, dt);
  if (k.jig) k.jig.t += dt;
  if (jumped) k.landV = (k.landV || 0) - 30;
  if (k.onFloor && !wasFloor) { k.landV = (k.landV || 0) + Math.min(fallSpeed, 900) * 0.07; if (fallSpeed > 150) k.landT = 0.12; if (k.action === "punch" && k.pt === PUNCH_AIR) start("none"); }
  // fase da passada avança com a distância percorrida (não com o tempo): pés não "patinam"
  const lastPh = k.walkPh; k.walkPh += Math.abs(k.vx) * dt * 0.05;
  if (pose === "walk" || pose === "run") {   // pó e som em cada passo (meia volta da fase)
    if (Math.floor(k.walkPh / Math.PI) !== Math.floor(lastPh / Math.PI)) { SFX.play("step"); for (let i = 0; i < 2; i++) emit("dust", k.x - 10 * k.facing, k.y - 3, -k.facing * rand(30, 80), rand(-35, -10), rand(0.35, 0.55), rand(5, 7), 12, "back"); }
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
  const f = local({ x: k.pt.fx.x + 8, y: k.pt.fx.y });
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
  const s = k.energy ? C.energySizeMult : 1, B = k.pt.box;
  const w = B.w * s, h = B.h * s;
  const cx = k.x + B.x * s * k.facing, cy = k.y + B.y;
  const box = { x: cx - w / 2, y: cy - h / 2, w, h };
  const dmg = k.pt.dmg * (k.energy ? C.energyDmgMult : 1), kb = C.punchKnock * (k.energy ? C.energyKnockMult : 1) * (k.pt.stagger ? 1.4 : 1);
  enemies.forEach((e, i) => {
    if (!enemyAlive(e) || k.hitIds.has(i) || !overlap(box, bodyRect(e, e.w, e.h))) return;
    k.hitIds.add(i);
    const n = Math.hypot(1, 0.35);
    hitEnemy(e, dmg, k.facing / n * kb, -0.35 / n * kb, k.energy || !!k.pt.stagger);
    setFury(k.fury + C.furyOnHit);
    hitstop = k.energy ? 0.14 : 0.07;
    SFX.play("hit", k.energy);
    k.whiteFlash = 0.06;
    const hx = e.x - k.facing * e.w / 2, hy = k.y + k.pt.fx.y;
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
  k.laserPow = Math.min(C.powerFull, k.laserPow + dt);
  const lvl = powerLevel(k.laserPow);
  if (lvl > k.laserLevel) laserLevelUp(lvl);
  if (k.laserLevel >= 3) k.maxTime += dt;
  const LV = C.laserLevels[k.laserLevel - 1];
  b.level = k.laserLevel;
  k.beam = b; k.lastBeam = b; k.beamFade = 0.14;
  if (!k.laserSound) { k.laserSound = true; SFX.loopStart("laser"); }
  SFX.loopSet("laser", (L, t) => {
    L.sizzle.gain.setTargetAtTime(b.hit ? 0.4 + 0.15 * k.laserLevel : 0.05, t, 0.03);
    L.nodes[0].frequency.setTargetAtTime(95 + k.laserLevel * 30 + Math.random() * 8, t, 0.05);
    L.f.frequency.setTargetAtTime(900 + k.laserLevel * 700, t, 0.08);
    L.out.gain.setTargetAtTime(0.22 + k.laserLevel * 0.07, t, 0.08);
  });
  if (b.targets.length) {
    k.laserTick += dt;
    if (k.laserTick >= C.laserTick) {
      k.laserTick -= C.laserTick;
      for (const e of b.targets) {
        hitEnemy(e, C.laserDps * C.laserTick * LV.dmg, b.dx * C.laserKnock * LV.knock, b.dy * C.laserKnock * LV.knock, k.laserLevel >= 3);
        e.flash = 0.035;   // pisca em vez de ficar branco o tempo todo
      }
    }
  }
  if (k.laserLevel >= 3 && k.onFloor) {               // recuo: o feixe empurra o Kane para trás
    k.vx -= k.facing * 260 * dt;
    if (Math.random() < 0.4) emit("dust", k.x - 6 * k.facing, k.y - 3, -k.facing * rand(40, 100), rand(-30, -8), 0.5, 6, 12, "back");
  }
  if (k.laserLevel >= 2 && Math.random() < 0.25 * k.laserLevel) {   // energia a escapar do corpo
    emit("ember", k.x + rand(-16, 16), k.y - rand(30, 120), rand(-20, 20), rand(-90, -40), rand(0.4, 0.8), 2, 1, "front");
  }
  // impacto: faíscas refletidas pela normal, metal derretido, fumo, marca de queimado
  if (b.hit) {
    const rx = b.dx - 2 * (b.dx * b.nx + b.dy * b.ny) * b.nx, ry = b.dy - 2 * (b.dx * b.nx + b.dy * b.ny) * b.ny;
    const refl = Math.atan2(ry, rx);
    spray("sparkHot", b.ex, b.ey, 3, { speed: 520, dir: refl, spread: 1.6, life: 0.4, size: 2 });
    spray("sparkRed", b.ex, b.ey, 2, { speed: 360, dir: refl, spread: 2.2, life: 0.3, size: 1.6 });
    if (Math.random() < 0.25) emit("smoke", b.ex + b.nx * 6, b.ey + b.ny * 6, rand(-20, 20) + b.nx * 30, rand(-60, -30), rand(0.8, 1.3), rand(6, 10), 26, "front");
    if (Math.random() < 0.3) emit("ember", b.ex, b.ey, rand(-80, 80), rand(-160, -40), rand(0.4, 0.8), 2, 1, "front");
    if (!b.target) scorch(b.ex, b.ey, b.nx, b.ny);
    light(b.ex, b.ey, 150 + 60 * k.laserLevel, LV.outer, 1.1);
    if (k.laserLevel >= 2) spray("sparkHot", b.ex, b.ey, k.laserLevel, { speed: 650, dir: refl, spread: 1.2, life: 0.45, size: 2.4 });
  }
  const eye = { x: b.ox, y: b.oy };
  light(eye.x, eye.y, 110 + 50 * k.laserLevel, LV.outer, 0.9);
  // energia a escorrer ao longo do feixe
  if (Math.random() < 0.6) {
    const u = Math.random() * b.len;
    emit("sparkRed", b.ox + b.dx * u, b.oy + b.dy * u, b.dx * 300 + rand(-40, 40), b.dy * 300 + rand(-40, 40), 0.15, 1.2, 0.4, "front");
  }
  addTrauma(0.012 + 0.012 * k.laserLevel);
}
function powerLevel(p) { return p >= C.laserLevels[2].at ? 3 : p >= C.laserLevels[1].at ? 2 : 1; }
// largura do feixe contínua ao longo da barra (sem saltos): 1 → 1,65 → 2,5 → 2,8 quando cheia
function beamWidth(p) {
  const pts = [[0, 1], [C.laserLevels[1].at, 1.65], [C.laserLevels[2].at, 2.5], [C.powerFull, 2.8]];
  for (let i = 1; i < pts.length; i++) if (p <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (p - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  return 2.8;
}
function laserLevelUp(lvl) {
  k.laserLevel = lvl;
  const e = eyeWorld(), LV = C.laserLevels[lvl - 1];
  ring({ x: e.x, y: e.y, r0: 6, r1: 50 + lvl * 25, hex: LV.mid, width: 6, dur: 0.3 });
  ring({ x: k.x, y: k.y - 60, r0: 20, r1: 110 + lvl * 30, hex: LV.outer, width: 4, dur: 0.45 });
  spray("sparkHot", e.x, e.y, 14 + lvl * 6, { speed: 380, life: 0.4, size: 2 });
  spray("orbRed", k.x, k.y - 60, 6, { speed: 160, life: 0.35, size: 18, size1: 2 });
  k.whiteFlash = 0.06; flash(0.12 + lvl * 0.05, LV.mid); zoomKick(0.02 * lvl); addTrauma(0.15 + 0.08 * lvl);
  floats.push({ x: k.x, y: k.y - 150, v: lvl === 3 ? "LASER MÁX!" : "LASER NV " + lvl, t: 1.1, t0: 1.1, big: true, col: LV.core === "#ffffff" ? "#ffd27a" : LV.core });
  SFX.play("levelUp", lvl);
}
function laserEndFx(eye) {
  spray("sparkRed", eye.x, eye.y, 10, { speed: 160, life: 0.3, size: 1.5 });
  for (let i = 0; i < 4; i++) emit("steam", eye.x + rand(-4, 4), eye.y, rand(-15, 15) + k.facing * 20, rand(-50, -25), rand(0.7, 1.1), 5, 18, "front");
}

// ---------------------------------------------------------------- desenho: fundo e cenário
function drawEnemy(e) {
  if (e.type === "trooper") return drawTrooper(e);
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
  const runBob = pose === "run" ? -Math.abs(Math.sin(k.anim * Math.PI * 6)) * 3
    : pose === "walk" ? -Math.abs(Math.sin(k.walkPh)) * 2.4
    : pose === "stance" ? Math.sin(time * 4.2) * 0.9 : 0;                 // guarda: saltitar leve como nos jogos de luta
  const breath = 0;
  const sq = k.squash / 0.12, st = k.stretch / 0.14;
  const turn = k.turnT > 0 ? 0.35 + 0.65 * (1 - k.turnT / 0.09) : 1;   // vira com um "achatar" rápido
  ctx.translate(k.x, k.y + hover + runBob);
  const climb = pose === "hover" ? clamp(-k.vy / C.flightSpeed, -1, 1) * 0.05 : 0;   // estica a subir
  ctx.scale(k.facing * turn * (1 + sq * 0.14 - st * 0.07 - climb * 0.5), 1 - sq * 0.11 + st * 0.09 + breath + climb);
  if (k.rot) { const pv = pivotFor(pose); ctx.translate(pv.x, pv.y); ctx.rotate(k.rot); ctx.translate(-pv.x, -pv.y); }
  if (k.action === "punch") {
    const t = k.t;
    ctx.translate(t < k.pt.w ? -6 * easeOut(t / k.pt.w) : t < k.pt.w + k.pt.a ? 6 : 6 * (1 - Math.min(1, (t - k.pt.w - k.pt.a) / k.pt.r)), 0);
  }
  if (k.dead) ctx.rotate(-1.3);
}
function drawSprite(img, row, col, x = -OX, y = -OY) { ctx.drawImage(img, col * FW, (row % 10) * FH, FW, FH, x, y, FW, FH); }
// Pose de joelhos gerada a partir da guarda: pernas comprimidas a partir dos pés (joelho dobrado)
// e tronco a descer, cabeça baixa e a arfar. Transição contínua com k.kneel (0 → 1).

// ---------------------------------------------------------------- corpo vivo: deformação procedural dos sprites
// Cada pose é um só frame desenhado. Para o corpo não parecer um bloco rígido, o sprite é
// desenhado como uma malha de células de 6 px, e cada célula desloca-se por um "campo":
// o tronco dobra (mola que reage à aceleração), o peito respira, a capa ondula e fica para
// trás com o movimento, as pernas alternam a andar, e o corpo treme a partir do ponto de impacto.
const CELL = 6, _d = [0, 0];
const maskCache = new Map();
function cellMask(img, id, row, col) {
  const key = id + row + "_" + col;
  let m = maskCache.get(key);
  if (m) return m;
  const c = makeCanvas(FW, FH), g = c.getContext("2d");
  g.drawImage(img, col * FW, row * FH, FW, FH, 0, 0, FW, FH);
  const d = g.getImageData(0, 0, FW, FH).data, cells = [];
  for (let cy = 0; cy < FH; cy += CELL) for (let cx = 0; cx < FW; cx += CELL) {
    let any = false;
    for (let y = cy; y < Math.min(cy + CELL, FH) && !any; y++) for (let x = cx; x < Math.min(cx + CELL, FW); x++) if (d[(y * FW + x) * 4 + 3] > 0) { any = true; break; }
    if (any) cells.push(cx, cy);
  }
  m = new Int16Array(cells); maskCache.set(key, m);
  return m;
}
function drawWarped(img, maskImg, id, row, col, field, ox = 0, oy = 0) {
  const cells = cellMask(maskImg, id, row % 10, col), sx0 = col * FW, sy0 = (row % 10) * FH;
  for (let i = 0; i < cells.length; i += 2) {
    const cx = cells[i], cy = cells[i + 1], cw = Math.min(CELL, FW - cx), ch = Math.min(CELL, FH - cy);
    const d = field(cx - OX + cw / 2, cy - OY + ch / 2);
    // +0,5 px de sobreposição para não abrir frestas entre células
    ctx.drawImage(img, sx0 + cx, sy0 + cy, cw, ch, cx - OX + ox + d[0] - 0.25, cy - OY + oy + d[1] - 0.25, cw + 0.5, ch + 0.5);
  }
}
// mola amortecida: valor persegue o alvo com atraso e um pequeno balanço (follow-through)
function spring(o, key, target, stiff, damp, dt) {
  let v = o[key + "V"] || 0;
  v += (target - (o[key] || 0)) * stiff * dt; v *= Math.exp(-damp * dt);
  o[key] = (o[key] || 0) + v * dt; o[key + "V"] = v;
}
function jiggle(o, x, y, amp) { o.jig = { x, y, t: 0, amp }; }
function kaneField(pose) {
  const bend = k.bend || 0, cape = k.cape || 0, land = k.land || 0;
  const brAmp = pose === "stance" ? 1 : pose === "walk" ? 0.6 : pose === "block" ? 0.3 : 0.5;
  const br = (Math.sin(time * (pose === "stance" ? 3 : 2.4)) * 0.5 + 0.5) * brAmp;
  const wave = 1 + Math.min(Math.abs(k.vx) / C.runSpeed, 1) * 1.6 + (k.onFloor ? 0 : 1.2);
  const walking = pose === "walk", ph = k.walkPh, j = k.jig, jt = j ? j.t : 9;
  const guard = pose === "stance" || pose === "walk" || pose === "block";
  const recoil = k.beam ? (0.6 + k.laserLevel * 0.7) : 0, buzz = k.beam ? Math.sin(time * 90) * 0.35 * k.laserLevel : 0;
  return (x, y) => {
    const h = clamp(-y / 130, 0, 1), h2 = h * h;
    let dx = bend * h2, dy = land * h * 5;
    const chest = Math.exp(-(((y + 80) / 18) ** 2));                       // respiração
    dx += x * br * 0.03 * chest; dy -= br * 1.3 * h2;
    const back = clamp((-x - 6) / 36, 0, 1) * clamp((y + 112) / 50, 0, 1);  // capa (atrás do corpo, abaixo dos ombros)
    if (back > 0) {
      dx += back * (cape + Math.sin(time * 7 + y * 0.09 + x * 0.06) * 1.3 * wave);
      dy += back * Math.sin(time * 5.3 + x * 0.11) * 0.9 * wave;
    }
    if (walking && h < 0.42) {                                              // pernas alternam a subir
      const legs = 1 - h / 0.42, sn = Math.sin(ph);
      dy -= (x > 0 ? Math.max(0, sn) : Math.max(0, -sn)) * 2.6 * legs;
      dx += sn * 1.2 * legs * (x > 0 ? 1 : -1);
    }
    if (guard) {                                                            // punhos da guarda a "bombear" como um lutador
      const f1 = Math.exp(-(((x - 34) ** 2 + (y + 64) ** 2) / 260)), f2 = Math.exp(-(((x + 8) ** 2 + (y + 70) ** 2) / 260));
      dy += Math.sin(time * 4.2) * 1.8 * f1 + Math.sin(time * 4.2 + 1.6) * 1.4 * f2;
      dx += Math.cos(time * 4.2) * 0.8 * f1;
    }
    if (recoil) { dx -= recoil * h2 * h; dy += buzz * h2; }                // o laser empurra a cabeça para trás
    if (jt < 0.55) {                                                        // tremor a partir do ponto de impacto
      const ddx = x - j.x, ddy = y - j.y, d = Math.hypot(ddx, ddy) + 1;
      const a = j.amp * Math.exp(-d / 45) * Math.sin(jt * 48) * Math.exp(-jt * 9);
      dx += ddx / d * a; dy += ddy / d * a;
    }
    _d[0] = dx; _d[1] = dy; return _d;
  };
}
function trooperField(e) {
  const bend = e.bend || 0, land = e.land || 0, j = e.jig, jt = j ? j.t : 9;
  const br = Math.sin(time * 2 + e.home) * 0.5 + 0.5, heavyStep = Math.abs(e.vx) > 30 ? Math.abs(Math.sin(e.walkPh || 0)) : 0;
  return (x, y) => {
    const h = clamp(-y / 130, 0, 1), h2 = h * h;
    let dx = bend * h2, dy = land * h * 4 + heavyStep * 1.6 * h;            // passo pesado afunda o tronco
    const chest = Math.exp(-(((y + 82) / 20) ** 2));
    dx += x * br * 0.022 * chest; dy -= br * 1 * h2;
    if (x < -8 && y < -92) dy += Math.sin(time * 9 + e.home) * 0.7;        // mochila a vibrar
    if (jt < 0.55) {
      const ddx = x - j.x, ddy = y - j.y, d = Math.hypot(ddx, ddy) + 1;
      const a = j.amp * Math.exp(-d / 50) * Math.sin(jt * 40) * Math.exp(-jt * 8);
      dx += ddx / d * a; dy += ddy / d * a;
    }
    _d[0] = dx; _d[1] = dy; return _d;
  };
}
let curKaneField = null;
function drawPose(img, row, col, pose, ox = 0, oy = 0) {
  if (pose !== "kneel") return drawWarped(img, kSrc(row), row >= 10 ? "KF" : "K", row, col, curKaneField || kaneField(pose), ox, oy);
  const kp = easeInOut(k.kneel), HIP = -54, comp = 1 - 0.52 * kp, drop = -HIP * 0.52 * kp;
  const pant = Math.sin(time * 8.4) * 1.6 * kp;
  ctx.save(); ctx.scale(1 + 0.14 * kp, comp);
  ctx.beginPath(); ctx.rect(-OX, HIP - 1, FW, -HIP + 8); ctx.clip();
  drawSprite(img, row, col, -OX + ox, -OY + oy);
  ctx.restore();
  ctx.save(); ctx.translate(-4 * kp, drop + pant * 0.5);
  ctx.translate(0, HIP); ctx.rotate(0.46 * kp + pant * 0.006); ctx.translate(0, -HIP);
  ctx.beginPath(); ctx.rect(-OX, -OY - 10, FW, OY + 10 + HIP + 1); ctx.clip();
  drawSprite(img, row, col, -OX + ox, -OY + oy);
  ctx.restore();
}

function drawGhosts() {
  if (!ATLAS.naturalWidth || !KFA.naturalWidth) return;
  ADD();
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i];
    ctx.save(); ctx.globalAlpha = Math.pow(g.t / 0.25, 1.5) * 0.16;
    ctx.translate(g.x, g.y); ctx.scale(g.facing, 1);
    if (g.rot) { ctx.translate(g.pv.x, g.pv.y); ctx.rotate(g.rot); ctx.translate(-g.pv.x, -g.pv.y); }
    if (g.trooper) { if (TROOPER.naturalWidth) ctx.drawImage(tinted(PAL.ember, TROOPER), g.col * FW, g.row * FH, FW, FH, -OX, -OY, FW, FH); }
    else drawSprite(kTint(PAL.cyan, g.row), g.row, g.col);
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
    const tex = kTint(charged ? PAL.cyan : PAL.red, row), a = (0.18 + grow * 0.3) * (0.8 + 0.2 * Math.sin(time * 30));
    ctx.globalAlpha = a;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2]]) drawSprite(tex, row, col, -OX + dx, -OY + dy);
    glow(PT.fistGuard.x, PT.fistGuard.y, 30 + grow * 40, charged ? PAL.cyan : PAL.red, 0.5 + grow * 0.4);
  }
  // aura de poder do laser: cresce com o nível (contorno + brilho atrás do corpo)
  if (k.action === "laser" && k.beam && ATLAS.naturalWidth && k.laserLevel >= 2) {
    const LV = C.laserLevels[k.laserLevel - 1], lv = k.laserLevel - 1;
    const tex = kTint(LV.mid, row), flick = 0.8 + 0.2 * Math.sin(time * 37);
    ctx.globalAlpha = (0.1 + lv * 0.09) * flick;
    const d = 2 + lv * 2;
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, -d]]) drawSprite(tex, row, col, -OX + dx, -OY + dy);
    glow(0, -70, 70 + lv * 45, LV.outer, (0.25 + lv * 0.2) * flick);
    if (lv >= 2) glow(0, -70, 160, LV.mid, 0.18 * flick);
  }
  // fraqueza: brilho vermelho fraco e intermitente (energia a falhar)
  if ((k.weak || k.exhausted) && Math.random() < 0.5) glow(0, -70, 50, PAL.red, 0.08);
  ctx.restore(); NORMAL();
}
function drawKaneSprite(row, col, pose) {
  curKaneField = kaneField(pose);
  ctx.save(); kaneTransform(pose);
  const blink = k.invuln > 0 && Math.floor(k.invuln * 20) % 2;
  ctx.globalAlpha = blink ? 0.45 : 1;
  drawPose(kSrc(row), row, col, pose);
  // clarões de cor por cima do sprite (dano = vermelho, impacto = branco, laser forte = brilho quente)
  ADD();
  if (k.hurtFlash > 0) { ctx.globalAlpha = k.hurtFlash / 0.25 * 0.45; drawPose(kTint(PAL.red, row), row, col, pose); }
  if (k.whiteFlash > 0) { ctx.globalAlpha = 0.9; drawPose(kTint("#ffffff", row), row, col, pose); }
  if (k.action === "laser" && k.beam && k.laserLevel >= 2) { ctx.globalAlpha = 0.05 * (k.laserLevel - 1) * (0.7 + 0.3 * Math.sin(time * 29)); drawPose(kTint(C.laserLevels[k.laserLevel - 1].mid, row), row, col, pose); }
  ctx.restore(); NORMAL(); curKaneField = null;
}
function drawKaneFront(row, col, pose) {
  ctx.save(); kaneTransform(pose);
  ADD();
  if (pose === "kneel") {                // visor a falhar: fraco e intermitente
    ctx.restore(); ADD();
    const e = kneelPoint(PT.eyeGuard), fl = Math.random() < 0.15 ? 0.05 : 0.25 + 0.1 * Math.sin(time * 13);
    glow(e.x, e.y, 14, PAL.red, fl); glowStretch(e.x, e.y, 22, 3, PAL.pink, fl * 0.6);
    NORMAL(); return;
  }
  let eye = row === ROW.punch ? PT.eyeGuard : PT.eyeIdle;
  if (row >= 10) { const nm = Object.keys(KF_INDEX).find(n => KF_INDEX[n][0] === row - 10 && KF_INDEX[n][1] === col); eye = { x: 9, y: (KF_TOP[nm] ?? -129) + 16 }; }
  // visor sempre aceso (pulsa devagar), muito mais forte no laser; com pouca energia, falha
  const pulse = 0.75 + 0.25 * Math.sin(time * 3);
  let vis = 0.35 * pulse * (k.weak && Math.random() < 0.2 ? 0.2 : 1);
  if (k.action === "laser") vis = k.beam ? 1.3 + 0.4 * (k.laserLevel - 1) : 0.5 + k.t / C.laserWindup;
  glow(eye.x, eye.y, 10 + vis * 16, PAL.red, vis);
  glowStretch(eye.x, eye.y, 26 + vis * 30, 4, PAL.pink, vis * 0.8);
  if (row === ROW.idle && !k.dead && false) {
    glow(PT.handBack.x, PT.handBack.y, 16, PAL.red, 0.35 + 0.15 * Math.sin(time * 5));
    glow(PT.fistIdle.x, PT.fistIdle.y, 12, PAL.cyan, 0.3 + 0.15 * Math.sin(time * 7 + 1));
  }
  if (k.action === "charge") {
    const grow = Math.min(k.t / C.chargeTime, 1), charged = grow >= 1 && k.fury >= C.energyCost;
    const p = 0.85 + 0.15 * Math.sin(time * 40);
    glow(PT.fistGuard.x, PT.fistGuard.y, (8 + grow * 18) * p, charged ? PAL.cyan : PAL.red, 1, true);
    glow(PT.fistGuard.x, PT.fistGuard.y, (3 + grow * 6) * p, PAL.white, 1, true);
  }
  if (k.action === "punch" && k.t >= k.pt.w * 0.5) {
    const t = (k.t - k.pt.w * 0.5) / (k.pt.a + k.pt.r * 0.6), E = k.energy;
    if (t < 1) {
      // arco de "smear" do braço + clarão do punho
      const a = 1 - t;
      ctx.lineCap = "round";
      for (const [lw, col, al] of [[14, PAL.cyan, 0.25], [6, PAL.cyanSoft, 0.6], [2, PAL.white, 0.9]]) {
        ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = lw * (E ? 1.4 : 1);
        ctx.beginPath(); ctx.arc(10, -40, 52, -Math.PI * 0.62, -Math.PI * 0.62 + Math.PI * 0.5 * easeOut(Math.min(1, t * 3))); ctx.stroke();
      }
      const fx = k.pt.fx.x + 6, fy = k.pt.fx.y, s = E ? 1.6 : 1;
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
    const lvl = b.level || 1, LV = C.laserLevels[lvl - 1];
    const open = k.beam ? Math.min(1, (k.t - C.laserWindup) / 0.06 + 0.2) : k.beamFade / 0.14;   // abre e fecha
    // a largura cresce suavemente com o tempo de disparo (não aos saltos)
    const grow = beamWidth(k.laserPow);      // a largura segue exatamente a barra LASER
    const w = open * grow;
    const ang = Math.atan2(b.dy, b.dx), L = b.len;
    const pulse = 1 + (0.12 + 0.04 * lvl) * Math.sin(time * (70 + lvl * 15)) + rand(-0.06, 0.06) * lvl;
    ctx.save(); ctx.translate(b.ox, b.oy); ctx.rotate(ang);
    // brilho largo, corpo, núcleo — as cores aquecem com o nível (vermelho → laranja → branco incandescente)
    ctx.globalAlpha = Math.min(1, 0.55 * open + 0.1 * lvl); ctx.drawImage(glowTex(LV.outer), -24, -44 * w * pulse, L + 48, 88 * w * pulse);
    ctx.globalAlpha = open; ctx.drawImage(glowTex(LV.mid, true), -8, -16 * w * pulse, L + 16, 32 * w * pulse);
    ctx.globalAlpha = open; ctx.drawImage(glowTex(LV.core, true), -5, -7.5 * w * pulse, L + 10, 15 * w * pulse);
    ctx.globalAlpha = open; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, -2.2 * w, L, 4.4 * w);
    // hélice de energia a correr ao longo do feixe (mais fitas e mais larga a cada nível)
    ctx.lineWidth = 1.4 + lvl * 0.4; ctx.lineCap = "round";
    for (let strand = 0; strand < lvl + 1; strand++) {
      ctx.strokeStyle = strand % 2 ? LV.core : "#ffffff"; ctx.globalAlpha = 0.75 * open;
      ctx.beginPath();
      for (let x = 0; x <= L; x += 6) {
        const y = Math.sin(x * 0.07 - time * (45 + lvl * 10) + strand * (Math.PI * 2 / (lvl + 1))) * 7 * w * (1 - Math.exp(-x / 30));
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (lvl >= 3) {                     // nível máximo: relâmpagos a saltar à volta do feixe
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      for (let arc = 0; arc < 3; arc++) {
        ctx.globalAlpha = 0.8 * open; ctx.beginPath();
        let y = 0; ctx.moveTo(0, 0);
        for (let x = 12; x <= L; x += 14) { y = clamp(y + rand(-9, 9), -26 * w, 26 * w); ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    // pulsos de energia a viajar no feixe
    for (let i = 0; i < 4; i++) {
      const px = ((time * 1100 + i * 170) % (L + 1));
      ctx.globalAlpha = 0.8 * w; ctx.drawImage(glowTex(PAL.white), px - 14, -6 * w, 28, 12 * w);
    }
    ctx.restore();
    // visor: clarão de lente
    glow(b.ox, b.oy, 30 * w * pulse, LV.outer, 1); glow(b.ox, b.oy, 11 * w, PAL.white, 1, true);
    glowStretch(b.ox, b.oy, 150 * w, 5, LV.core, 0.9 * open); glowStretch(b.ox, b.oy, 5, 40 * w, LV.core, 0.5 * open);
    // impacto
    if (b.hit) {
      const r = 26 * pulse * w;
      glow(b.ex, b.ey, r * 2.4, LV.outer, 0.9); glow(b.ex, b.ey, r, LV.mid, 1, true); glow(b.ex, b.ey, r * 0.45, PAL.white, 1, true);
      ctx.save(); ctx.translate(b.ex, b.ey); ctx.rotate(time * 3);
      glowStretch(0, 0, r * 5, 4, LV.core, 0.8 * open); glowStretch(0, 0, 4, r * 5, LV.core, 0.8 * open);
      ctx.restore();
    }
    // inimigos atravessados pelo feixe máximo brilham por dentro
    if (b.pierce) for (const e of b.targets) glow(e.x, e.y - e.h / 2, 50, LV.mid, 0.5);
  }
  NORMAL();
}

// ---------------------------------------------------------------- HUD e ecrã
function drawHud() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const W = cv.width / scale, H = cv.height / scale, top = 12 + safeTop, cx = W / 2;
  const edge = 16 + safeLeft;
  const barW = Math.max(90, Math.min(280, cx - 40 - edge - 36)), barH = 14;
  // retratos (recortes da cabeça nos atlases)
  const portrait = (img, sx, sy, x, flip) => {
    ctx.fillStyle = "#0b0a10"; ctx.fillRect(x - 1, top - 1, 32, 32);
    ctx.save(); ctx.beginPath(); ctx.rect(x, top, 30, 30); ctx.clip();
    if (flip) { ctx.translate(x + 30, top); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, 26, 26, -2, -2, 34, 34); }
    else ctx.drawImage(img, sx, sy, 26, 26, x - 2, top - 2, 34, 34);
    ctx.restore(); ctx.strokeStyle = "#e8e3d688"; ctx.strokeRect(x - 0.5, top - 0.5, 31, 31);
  };
  const lx = edge + 36, rx = W - edge - 36;
  if (ATLAS.naturalWidth) portrait(ATLAS, OX + 6 - 13, OY - 131, edge, false);
  if (TROOPER.naturalWidth) portrait(TROOPER, OX + 4 - 13, OY - 130, W - edge - 30, true);
  // barras de vida: esvaziam do lado do relógio; atrás, o "dano recente" em claro
  const bar = (x, w, pct, trail, fromLeft, col) => {
    ctx.fillStyle = "#000c"; ctx.fillRect(x - 2, top + 2, w + 4, barH + 4);
    ctx.fillStyle = "#3a0d12"; ctx.fillRect(x, top + 4, w, barH);
    const tw = w * clamp(trail, 0, 1), pw = w * clamp(pct, 0, 1);
    ctx.fillStyle = "#ffe0a0"; ctx.fillRect(fromLeft ? x : x + w - tw, top + 4, tw, barH);
    ctx.fillStyle = pct < 0.25 && Math.floor(time * 5) % 2 ? "#ff5a3a" : col; ctx.fillRect(fromLeft ? x : x + w - pw, top + 4, pw, barH);
    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(fromLeft ? x : x + w - pw, top + 4, pw, 3);
    ctx.strokeStyle = "#e8e3d6aa"; ctx.strokeRect(x - 0.5, top + 3.5, w + 1, barH + 1);
  };
  bar(lx, barW, k.hp / C.maxHp, k.hpTrail / C.maxHp, true, "#f2c14a");
  bar(rx - barW, barW, Math.max(0, foe.hp) / foe.maxHp, fight.foeTrail / foe.maxHp, false, "#f2c14a");
  ctx.font = "10px Silkscreen, monospace";
  ctx.fillStyle = "#e8e3d6"; ctx.textAlign = "left"; ctx.fillText("KANE", lx, top + 32);
  ctx.textAlign = "right"; ctx.fillText(barW > 150 ? "SOLDADO DE CHOQUE" : "SOLDADO", rx, top + 32);
  // vitórias por ronda (quadrados junto ao relógio)
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = i < fight.kWins ? "#ff3344" : "#ffffff22"; ctx.fillRect(lx + barW - 10 - i * 12, top + 24, 8, 8);
    ctx.fillStyle = i < fight.fWins ? "#ff3344" : "#ffffff22"; ctx.fillRect(rx - barW + 2 + i * 12, top + 24, 8, 8);
  }
  // relógio
  ctx.fillStyle = "#0b0a10e0"; ctx.fillRect(cx - 24, top - 2, 48, 34); ctx.strokeStyle = "#e8e3d688"; ctx.strokeRect(cx - 23.5, top - 1.5, 47, 33);
  ctx.textAlign = "center"; ctx.font = "22px Silkscreen, monospace";
  ctx.fillStyle = fight.timer < 10 && Math.floor(time * 4) % 2 ? "#ff5a3a" : "#e8e3d6";
  ctx.fillText(String(Math.ceil(fight.timer)).padStart(2, "0"), cx, top + 24);
  // potência do laser por baixo do nome do Kane (como uma barra de super)
  const lvNow = powerLevel(k.laserPow), LVn = C.laserLevels[lvNow - 1], mw = Math.min(140, barW * 0.6), my = top + 40;
  ctx.fillStyle = "#000a"; ctx.fillRect(lx, my, mw, 6);
  ctx.fillStyle = k.laserPow > 0.01 ? LVn.mid : "#3a2a2e"; ctx.fillRect(lx, my, mw * k.laserPow / C.powerFull, 6);
  for (const lv of [C.laserLevels[1], C.laserLevels[2]]) { ctx.fillStyle = "#e8e3d6aa"; ctx.fillRect(lx + mw * lv.at / C.powerFull, my - 2, 1, 10); }
  ctx.textAlign = "left"; ctx.font = "8px Silkscreen, monospace"; ctx.fillStyle = "#e8e3d6aa";
  ctx.fillText(k.laserPow > 0.01 ? "LASER NV " + lvNow : "LASER", lx + mw + 6, my + 6);
  if (k.exhausted) { ctx.fillStyle = Math.floor(time * 4) % 2 ? "#ff6a5c" : "#8a8f9c"; ctx.fillText("SOBRECARGA", lx, my + 18); }
  // contadores de combo
  const combo = (n, x, align, col) => {
    ctx.textAlign = align; ctx.font = "20px Silkscreen, monospace";
    ctx.fillStyle = "#000"; ctx.fillText(n + " GOLPES", x + 2, H * 0.36 + 2);
    ctx.fillStyle = col; ctx.fillText(n + " GOLPES", x, H * 0.36);
  };
  if (fight.combo >= 2 && fight.comboT > 0) combo(fight.combo, edge, "left", "#ffd27a");
  if (fight.foeCombo >= 2 && fight.foeComboT > 0) combo(fight.foeCombo, W - edge, "right", "#ff8a6a");
  // textos de ronda
  const big = (text, size, col, t) => {
    const pop = 1 + Math.max(0, 0.25 - t) * 2;
    ctx.save(); ctx.translate(cx, H * 0.42); ctx.scale(pop, pop); ctx.textAlign = "center";
    ctx.font = size + "px Silkscreen, monospace";
    ctx.fillStyle = "#000"; ctx.fillText(text, 3, 3); ctx.fillStyle = col; ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  if (fight.phase === "intro") {
    if (fight.t < 1.05) big("ROUND " + fight.round, 34, "#e8e3d6", fight.t);
    else big("LUTA!", 48, "#ff3344", fight.t - 1.05);
  } else if (fight.phase === "ko") {
    big(fight.text, 56, "#ff3344", fight.t);
    if (fight.t > 1.6) {
      ctx.textAlign = "center"; ctx.font = "14px Silkscreen, monospace"; ctx.fillStyle = "#e8e3d6";
      ctx.fillText(fight.winner === "kane" ? "KANE VENCE A RONDA" : "O SOLDADO VENCE A RONDA", cx, H * 0.42 + 34);
    }
  } else if (fight.phase === "end") {
    big(fight.kWins >= 2 ? "VITÓRIA!" : "DERROTA", 44, fight.kWins >= 2 ? "#ffd27a" : "#ff3344", fight.t);
    if (fight.t > 1.5) {
      ctx.textAlign = "center"; ctx.font = "11px Silkscreen, monospace"; ctx.fillStyle = "#e8e3d6";
      ctx.fillText("CARREGA EM QUALQUER BOTÃO PARA JOGAR OUTRA VEZ", cx, H * 0.42 + 34);
    }
  }
  ctx.textAlign = "left";
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
function render(rdt = 1 / 60) {
  const ease = r => 1 - Math.exp(-rdt * r);   // suavização igual a qualquer taxa de imagens
  // câmara de jogo de luta: enquadra os dois lutadores, aproxima quando estão perto, zoom nos impactos
  const dist = Math.abs(k.x - foe.x);
  const wantW = clamp(dist + 460, 620, Math.max(620, viewW));
  cam.zoom += (clamp(viewW / wantW, 1, 1.4) - cam.zoom) * ease(3.6);
  const zoom = cam.zoom + cam.kick;
  const visW = viewW / zoom, visH = viewH / zoom;
  const midX = (k.x + foe.x) / 2;
  cam.x += (clamp(midX, visW / 2, WORLD_W - visW / 2) - cam.x) * ease(6.5);
  const highest = Math.min(k.y, foe.y);
  const lookY = FLOOR_Y + 70 - visH / 2 - Math.max(0, FLOOR_Y - highest - visH * 0.45) * 0.8;
  cam.y += (lookY - cam.y) * ease(6.5);
  const tr = cam.trauma * cam.trauma, n = time * 30 + cam.seed;
  const shx = tr * 16 * (Math.sin(n * 1.7) + Math.sin(n * 3.1) * 0.5) + cam.dirX * tr;
  const shy = tr * 12 * (Math.sin(n * 2.3 + 1) + Math.sin(n * 4.3) * 0.5) + cam.dirY * tr;
  const S = scale * zoom;
  camView = { S, cx: cam.x + shx, cy: cam.y + shy };
  ctx.setTransform(S, 0, 0, S, cv.width / 2 - camView.cx * S, cv.height / 2 - camView.cy * S);
  const left = camView.cx - visW / 2, top = camView.cy - visH / 2;

  drawBackground(left, top, visW, visH);
  drawSolids(left, top, visW, visH);
  const nLights = lights.length;
  drawProps(left, visW);         // candeeiros, néon, farol, fogueiras (acrescentam luzes só para este frame)
  drawLights();                  // luz dos poderes e do cenário, com reflexo no chão (atrás das personagens)
  lights.length = nLights;
  drawDecals();
  drawParticles("back");
  enemies.forEach(drawEnemy);
  const ready = ATLAS.complete && ATLAS.naturalWidth && KFA.complete && KFA.naturalWidth;
  let fr = null;
  if (ready) {
    fr = kaneFrame();
    drawGhosts();
    drawKaneBack(...fr);
    drawKaneSprite(...fr);
  }
  drawLaser();
  if (ready) drawKaneFront(...fr);
  drawBolts();
  drawRings();
  drawParticles("front");
  // números de dano
  ctx.textAlign = "center";
  for (const f of floats) {
    const age = (f.t0 ?? 0.8) - f.t, pop = age < 0.08 ? 1 + (0.08 - age) * 8 : 1;
    ctx.globalAlpha = Math.min(f.t * 2, 1);
    ctx.font = Math.round((f.big ? 18 : 12) * pop) + "px Silkscreen, monospace";
    const fy = typeof f.v === "string" ? f.y - age * 30 : f.y - Math.min(age, 0.25) * 120 - age * 20;
    ctx.fillStyle = "#000"; ctx.fillText(f.v, f.x + 1, fy + 1);
    ctx.fillStyle = f.col || (f.big ? PAL.cyanSoft : "#fff"); ctx.fillText(f.v, f.x, fy);
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";
  drawForeground(left, top, visW, visH);
  drawScreenFx();
  drawHud();
}

// ---------------------------------------------------------------- loop (passo fixo 60 Hz)
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
// posições do passo anterior, para desenhar entre passos da física (fluido a 90/120 Hz)
function snapPrev() {
  k.px = k.x; k.py = k.y; foe.px = foe.x; foe.py = foe.y;
  for (const b of bolts) { b.px = b.x; b.py = b.y; }
}
function frame(now) {
  const rdt = Math.min((now - last) / 1000, 0.1);
  acc += rdt; last = now;
  while (acc >= STEP) {
    time += STEP;
    snapPrev();
    syncInput();
    updateFight(STEP);
    const dtg = fight.phase === "ko" && fight.t < 1.4 ? STEP * 0.3 : STEP;   // K.O. em câmara lenta
    if (hitstop > 0) { hitstop -= STEP; updateParticles(STEP * 0.2); }      // hit-stop: o mundo quase para
    else {
      lights.length = 0;
      updateKane(dtg); updateEnemies(dtg); updateBolts(dtg); updateProps(dtg); Object.assign(prev, held);
      updateParticles(dtg);
      k.beamFade = Math.max(0, k.beamFade - (k.beam ? 0 : STEP));
      for (let i = ghosts.length - 1; i >= 0; i--) if ((ghosts[i].t -= STEP) <= 0) ghosts.splice(i, 1);
    }
    updateWorldFx(STEP);
    cam.trauma = Math.max(0, cam.trauma - STEP * 1.8);
    cam.dirX *= 0.85; cam.dirY *= 0.85;
    cam.kick = Math.max(0, cam.kick - STEP * 0.35);
    acc -= STEP;
  }
  // desenha na posição interpolada entre o passo anterior e o atual
  const al = acc / STEP, save = [k.x, k.y, foe.x, foe.y];
  if (k.px !== undefined) { k.x = lerp(k.px, k.x, al); k.y = lerp(k.py, k.y, al); foe.x = lerp(foe.px, foe.x, al); foe.y = lerp(foe.py, foe.y, al); }
  const bsave = bolts.map(b => [b.x, b.y]);
  for (const b of bolts) if (b.px !== undefined) { b.x = lerp(b.px, b.x, al); b.y = lerp(b.py, b.y, al); }
  render(rdt);
  [k.x, k.y, foe.x, foe.y] = save;
  bolts.forEach((b, i) => { b.x = bsave[i][0]; b.y = bsave[i][1]; });
  requestAnimationFrame(frame);
}
startRound(1);
setTimeout(() => { const h = document.getElementById("help"); if (h) h.classList.add("gone"); }, 9000);   // ajuda some depois de uns segundos
requestAnimationFrame(frame);
