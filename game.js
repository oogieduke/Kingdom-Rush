/* =========================================================
   Kingdom Rush — Proto Fun
   Geste central: dessiner une zone, lancer une expédition,
   encaisser le résultat. Tout sur la carte, zéro popup.
   ========================================================= */
(() => {
'use strict';

// ============== Constantes ==============
const GRID_W = 24;
const GRID_H = 18;
const TILE = 44;            // taille de base d'une case en px
const PADDING = 24;

const CASTLE_X = 12, CASTLE_Y = 9;       // centre du complexe
const CASTLE_RECT = { x: 11, y: 8, w: 3, h: 3 };
const BARRACKS = { x: 10, y: 9 };
const HOUSE_CIV = { x: 14, y: 9 };

const TYPE = {
  EMPTY: 'empty', BLE: 'ble', BOIS: 'bois', PIERRE: 'pierre',
  EAU: 'eau', OR: 'or', HOUSE: 'house', MONSTER: 'monster',
  CASTLE: 'castle', BARRACKS: 'barracks', HOUSE_CIV: 'house_civ'
};

const HARVEST_MAX = { ble: 3, bois: 5, pierre: 5, eau: 99, or: 1 };
const HARVEST_AMOUNT = { ble: 3, bois: 2, pierre: 2, eau: 1, or: 1 };

const COLORS = {
  bgGrid: '#e8d5a5',
  tileBorder: '#b89a5e',
  empty: '#e0c890',
  ble: '#e8c947',
  bois: '#5a8a3d',
  pierre: '#9a9a98',
  eau: '#6fa6c8',
  or: '#f2c542',
  house: '#c69466',
  monster: '#7a2a3a',
  castle: '#a07c3a',
  castleRoof: '#7a3a2a',
  barracks: '#8a4a3a',
  houseCiv: '#b07c4e',
  ink: '#3d2817',
  inkSoft: '#6b4a2b',
  parch: '#f6e9c9',
  gold: '#d4a653',
  goldBright: '#f5c451',
  red: '#b83a2c',
  redBright: '#e16a55',
  green: '#4f7a3a',
  greenBright: '#7bb24a',
  selFill: 'rgba(245, 196, 81, 0.18)',
  selStroke: '#3d2817',
};

// ============== RNG seedé simple (mulberry32) ==============
function mkRng(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mkRng(20260425);
const rint = (n) => Math.floor(rng() * n);
const choice = (arr) => arr[rint(arr.length)];

// ============== État du monde ==============
const state = {
  grid: [],            // grid[y][x] = { type, harvests, harvestsMax, x, y }
  resources: { ble: 0, bois: 0, pierre: 0, eau: 0, or: 0 },
  paysans: 2,
  soldats: 0,
  // sélection en cours
  drag: null,          // { startGX, startGY, curGX, curGY }
  selection: null,     // { x0, y0, x1, y1 } cellules inclusives
  pending: false,      // sélection en attente de validation
  validateBtn: null,   // { x, y, r } hitbox du bouton valider
  // expédition
  expe: null,          // état machine d'expédition (voir startExpedition)
  recruits: [],        // [{ id, x, y, vy, hover, dragging, opacity, age }]
  // particules / popups flottants
  floats: [],          // [{ text, x, y, vy, life, color }]
  // caméra
  cam: { offsetX: 0, offsetY: 0, scale: 1, targetScale: 1, focusX: 0, focusY: 0 },
  // dragging recruit
  recruitDrag: null,   // { recruit, mx, my }
  // toast
  toast: { text: '', show: 0 },
  // animation marching ants
  antOffset: 0,
  // counters bump
  bump: { ble: 0, bois: 0, pierre: 0, eau: 0, or: 0, pop: 0, sol: 0 },
  // dimensions
  mapPixelW: GRID_W * TILE,
  mapPixelH: GRID_H * TILE,
};

// ============== Génération de la map ==============
function genMap() {
  const grid = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = [];
    for (let x = 0; x < GRID_W; x++) {
      row.push({ type: TYPE.EMPTY, harvests: 0, harvestsMax: 0, cooldown: 0, x, y });
    }
    grid.push(row);
  }
  // complexe central
  for (let y = CASTLE_RECT.y; y < CASTLE_RECT.y + CASTLE_RECT.h; y++)
    for (let x = CASTLE_RECT.x; x < CASTLE_RECT.x + CASTLE_RECT.w; x++)
      grid[y][x].type = TYPE.CASTLE;
  grid[BARRACKS.y][BARRACKS.x].type = TYPE.BARRACKS;
  grid[HOUSE_CIV.y][HOUSE_CIV.x].type = TYPE.HOUSE_CIV;

  // tiles libres = celles non centrales
  const free = [];
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++)
      if (grid[y][x].type === TYPE.EMPTY) free.push([x, y]);

  // Mélange + placement
  const shuffled = free.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rint(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Quotas (en clusters pour cohérence visuelle)
  const place = (type, count, maxKey) => {
    let placed = 0;
    while (placed < count && shuffled.length) {
      const [sx, sy] = shuffled.pop();
      if (grid[sy][sx].type !== TYPE.EMPTY) continue;
      grid[sy][sx].type = type;
      grid[sy][sx].harvestsMax = HARVEST_MAX[maxKey] || 0;
      grid[sy][sx].harvests = grid[sy][sx].harvestsMax;
      placed++;
      // petit cluster de 1-2 voisins du même type
      const cluster = rint(3);
      for (let k = 0; k < cluster && placed < count; k++) {
        const dx = [-1, 1, 0, 0][rint(4)];
        const dy = [0, 0, -1, 1][rint(4)];
        const nx = sx + dx, ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        if (grid[ny][nx].type !== TYPE.EMPTY) continue;
        grid[ny][nx].type = type;
        grid[ny][nx].harvestsMax = HARVEST_MAX[maxKey] || 0;
        grid[ny][nx].harvests = grid[ny][nx].harvestsMax;
        placed++;
      }
    }
  };

  place(TYPE.BLE, 42, 'ble');
  place(TYPE.BOIS, 34, 'bois');
  place(TYPE.PIERRE, 26, 'pierre');
  place(TYPE.EAU, 14, 'eau');
  place(TYPE.OR, 6, 'or');

  // Maisons (recrutement)
  let houses = 0;
  while (houses < 16 && shuffled.length) {
    const [sx, sy] = shuffled.pop();
    if (grid[sy][sx].type !== TYPE.EMPTY) continue;
    // pas trop près du château
    if (Math.abs(sx - CASTLE_X) <= 1 && Math.abs(sy - CASTLE_Y) <= 1) continue;
    grid[sy][sx].type = TYPE.HOUSE;
    houses++;
  }
  // Camps de monstres
  let monsters = 0;
  while (monsters < 12 && shuffled.length) {
    const [sx, sy] = shuffled.pop();
    if (grid[sy][sx].type !== TYPE.EMPTY) continue;
    if (Math.abs(sx - CASTLE_X) <= 2 && Math.abs(sy - CASTLE_Y) <= 2) continue;
    grid[sy][sx].type = TYPE.MONSTER;
    monsters++;
  }

  state.grid = grid;
}

// ============== Canvas / setup ==============
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // centrer la carte
  state.cam.offsetX = (innerWidth - state.mapPixelW) / 2;
  state.cam.offsetY = (innerHeight - state.mapPixelH) / 2 + 14;
  state.cam.focusX = innerWidth / 2;
  state.cam.focusY = innerHeight / 2 + 14;
}
window.addEventListener('resize', resize);

// ============== Helpers coord ==============
function tileCenter(gx, gy) {
  return {
    x: state.cam.offsetX + (gx + 0.5) * TILE,
    y: state.cam.offsetY + (gy + 0.5) * TILE,
  };
}
function pxToTile(px, py) {
  const gx = Math.floor((px - state.cam.offsetX) / TILE);
  const gy = Math.floor((py - state.cam.offsetY) / TILE);
  return { gx, gy };
}
function inGrid(gx, gy) {
  return gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H;
}
function isComplex(gx, gy) {
  if (!inGrid(gx, gy)) return false;
  const t = state.grid[gy][gx].type;
  return t === TYPE.CASTLE || t === TYPE.BARRACKS || t === TYPE.HOUSE_CIV;
}
function tileAt(gx, gy) {
  if (!inGrid(gx, gy)) return null;
  return state.grid[gy][gx];
}

// ============== Voisinage / scoring zone ==============
function neighbors(gx, gy, r = 1) {
  const out = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const nx = gx + dx, ny = gy + dy;
      if (inGrid(nx, ny)) out.push(state.grid[ny][nx]);
    }
  return out;
}

// ============== Sélection (drag rectangle) ==============
// Aire max d'une zone = nombre de paysans (1 paysan couvre 1 case).
// Les soldats n'élargissent pas la zone — ils escortent uniquement.
function clampSelection(x0, y0, x1, y1) {
  let ax = Math.min(x0, x1), bx = Math.max(x0, x1);
  let ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const anchorX = x0, anchorY = y0;
  const maxArea = Math.max(1, state.paysans);
  let w = bx - ax + 1, h = by - ay + 1;
  // Réduit la dimension la plus longue jusqu'à passer sous l'aire max.
  while (w * h > maxArea && (w > 1 || h > 1)) {
    if (w >= h && w > 1) {
      if (anchorX === ax) bx--; else ax++;
      w--;
    } else if (h > 1) {
      if (anchorY === ay) by--; else ay++;
      h--;
    } else break;
  }
  return { x0: ax, y0: ay, x1: bx, y1: by };
}

// ============== Path / polyline ==============
function tilesInSelection(sel) {
  const out = [];
  for (let y = sel.y0; y <= sel.y1; y++)
    for (let x = sel.x0; x <= sel.x1; x++)
      out.push(state.grid[y][x]);
  return out;
}

// Trace une polyline du château vers le centre de la sélection.
// Plusieurs points de contrôle, légèrement bruités, qui glissent.
function buildPath(sel) {
  const start = tileCenter(CASTLE_X, CASTLE_Y);
  // sortie de la porte (un peu sous le centre du château)
  start.y += TILE * 0.4;
  const cx = (sel.x0 + sel.x1) / 2;
  const cy = (sel.y0 + sel.y1) / 2;
  const end = tileCenter(cx, cy);

  // 4 segments avec un léger arc
  const pts = [];
  const N = 5;
  const dx = end.x - start.x, dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);
  // perp pour bowing
  const px = -dy / (dist || 1), py = dx / (dist || 1);
  const bow = Math.min(40, dist * 0.12);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // courbe bezier-like : sin pour bowing
    const arc = Math.sin(t * Math.PI) * bow;
    const x = start.x + dx * t + px * arc;
    const y = start.y + dy * t + py * arc;
    pts.push({ x, y, t });
  }
  return pts;
}

// Distance d'un point à un segment
function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Distance minimale d'un point au polyline complet
function pointToPath(px, py, path) {
  let mind = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegment(px, py, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
    if (d < mind) mind = d;
  }
  return mind;
}

// Distance seuil pour qu'un monstre menace le convoi
const MONSTER_THREAT_RANGE = TILE * 1.1;

// Renvoie les monstres qui interceptent le chemin (hors zone cible)
function findThreatMonsters(path, sel) {
  const out = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = state.grid[y][x];
      if (t.type !== TYPE.MONSTER) continue;
      if (sel && x >= sel.x0 && x <= sel.x1 && y >= sel.y0 && y <= sel.y1) continue;
      const c = tileCenter(x, y);
      const d = pointToPath(c.x, c.y, path);
      if (d < MONSTER_THREAT_RANGE) out.push({ tile: t, distance: d });
    }
  }
  return out;
}

// Couleur d'un segment selon ce qu'il croise
function segmentColor(p1, p2) {
  // monstre proche du segment ?
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = state.grid[y][x];
      if (t.type !== TYPE.MONSTER) continue;
      const c = tileCenter(x, y);
      const d = pointToSegment(c.x, c.y, p1.x, p1.y, p2.x, p2.y);
      if (d < MONSTER_THREAT_RANGE) return COLORS.red;
    }
  }
  // sinon : voisinage cellulaire (or / maison)
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const { gx, gy } = pxToTile(mx, my);
  if (!inGrid(gx, gy)) return COLORS.inkSoft;
  const around = neighbors(gx, gy, 1);
  let house = false, gold = false;
  for (const t of around) {
    if (t.type === TYPE.HOUSE) house = true;
    else if (t.type === TYPE.OR && t.harvests > 0) gold = true;
  }
  if (gold) return COLORS.goldBright;
  if (house) return COLORS.greenBright;
  return COLORS.inkSoft;
}

// ============== Rendu du décor ==============
const icons = {
  ble: document.getElementById('img-ble'),
  bois: document.getElementById('img-bois'),
  pierre: document.getElementById('img-pierre'),
  eau: document.getElementById('img-eau'),
  or: document.getElementById('img-or'),
};

function drawTile(t) {
  const { x, y } = t;
  const px = state.cam.offsetX + x * TILE;
  const py = state.cam.offsetY + y * TILE;

  // Fond
  let fill = COLORS.empty;
  if (t.type === TYPE.BLE) fill = COLORS.ble;
  else if (t.type === TYPE.BOIS) fill = COLORS.bois;
  else if (t.type === TYPE.PIERRE) fill = COLORS.pierre;
  else if (t.type === TYPE.EAU) fill = COLORS.eau;
  else if (t.type === TYPE.OR) fill = COLORS.or;
  else if (t.type === TYPE.HOUSE) fill = '#c69466';
  else if (t.type === TYPE.MONSTER) fill = '#5e2030';

  // Épuisement → désature progressivement
  if (t.harvestsMax > 0 && t.harvests < t.harvestsMax) {
    const ratio = t.harvests / t.harvestsMax; // 0..1
    fill = blendColors(fill, '#b8a06a', 1 - ratio);
  }
  if (t.harvestsMax > 0 && t.harvests <= 0) {
    fill = '#9a8358';
  }

  // base
  ctx.fillStyle = fill;
  ctx.fillRect(px, py, TILE, TILE);

  // texture biome
  ctx.save();
  ctx.translate(px, py);
  if (t.type === TYPE.BLE) drawWheatTexture(t);
  else if (t.type === TYPE.BOIS) drawForestTexture(t);
  else if (t.type === TYPE.PIERRE) drawStoneTexture(t);
  else if (t.type === TYPE.EAU) drawWaterTexture(t);
  else if (t.type === TYPE.OR) drawGoldTexture(t);
  else if (t.type === TYPE.HOUSE) drawHouseSprite(t);
  else if (t.type === TYPE.MONSTER) drawMonsterCamp();
  ctx.restore();

  // grille
  ctx.strokeStyle = 'rgba(120,90,40,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
}

function blendColors(c1, c2, t) {
  const p1 = parseColor(c1), p2 = parseColor(c2);
  const r = Math.round(p1[0] + (p2[0] - p1[0]) * t);
  const g = Math.round(p1[1] + (p2[1] - p1[1]) * t);
  const b = Math.round(p1[2] + (p2[2] - p1[2]) * t);
  return `rgb(${r},${g},${b})`;
}
function parseColor(c) {
  if (c.startsWith('#')) {
    const v = parseInt(c.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  // rgb/rgba
  const m = c.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [200, 180, 130];
}

// Petites textures procédurales par tile (légères, look pixel)
function drawWheatTexture(t) {
  const seed = (t.x * 31 + t.y * 17) % 100;
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < 6; j++) {
      const x = 4 + j * 9 + ((i % 2) * 4);
      const y = 8 + i * 12 + ((seed + j) % 3);
      ctx.fillStyle = t.harvests > 0 ? '#a07628' : '#7c5a20';
      ctx.fillRect(x, y, 2, 6);
    }
  }
}
function drawForestTexture(t) {
  const seed = (t.x * 13 + t.y * 7) % 100;
  for (let i = 0; i < 5; i++) {
    const cx = 6 + ((seed * (i + 1)) % (TILE - 12));
    const cy = 8 + ((seed * (i + 3)) % (TILE - 16));
    ctx.fillStyle = '#3a5a26';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5e3a1a';
    ctx.fillRect(cx - 1, cy + 4, 2, 4);
  }
  if (t.harvests <= 0) {
    ctx.fillStyle = 'rgba(100,80,50,0.3)';
    ctx.fillRect(0, 0, TILE, TILE);
  }
}
function drawStoneTexture(t) {
  const seed = (t.x * 23 + t.y * 11) % 100;
  for (let i = 0; i < 4; i++) {
    const cx = 8 + ((seed * (i + 2)) % (TILE - 16));
    const cy = 8 + ((seed * (i + 5)) % (TILE - 16));
    ctx.fillStyle = '#7a7a78';
    ctx.beginPath(); ctx.arc(cx, cy, 5 + (i % 2), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5e5e5c';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 1, 2, 0, Math.PI * 2); ctx.fill();
  }
}
function drawWaterTexture() {
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const y = 14 + i * 14;
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.bezierCurveTo(18, y - 3, 28, y + 3, TILE - 8, y);
    ctx.stroke();
  }
}
function drawGoldTexture(t) {
  // pépites brillantes
  for (let i = 0; i < 5; i++) {
    const seed = (t.x * 31 + t.y * 19 + i * 7) % 100;
    const cx = 10 + (seed % (TILE - 20));
    const cy = 10 + ((seed * 3) % (TILE - 20));
    ctx.fillStyle = '#a07a20';
    ctx.beginPath(); ctx.arc(cx + 1, cy + 1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5c451';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7c8';
    ctx.beginPath(); ctx.arc(cx - 1, cy - 1, 1.2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHouseSprite(t) {
  const cooled = t && t.cooldown > 0;
  ctx.save();
  if (cooled) ctx.globalAlpha = 0.55;
  // toit
  ctx.fillStyle = cooled ? '#5a2a1e' : '#7a3a2a';
  ctx.beginPath();
  ctx.moveTo(6, 22);
  ctx.lineTo(TILE / 2, 8);
  ctx.lineTo(TILE - 6, 22);
  ctx.closePath();
  ctx.fill();
  // mur
  ctx.fillStyle = cooled ? '#a89568' : '#e0c890';
  ctx.fillRect(10, 22, TILE - 20, 18);
  // porte
  ctx.fillStyle = cooled ? '#2e1a0a' : '#5e3a1a';
  ctx.fillRect(TILE / 2 - 3, 30, 6, 10);
  // fenêtres
  ctx.fillStyle = cooled ? '#5e4a28' : '#a07c3a';
  ctx.fillRect(13, 25, 4, 4);
  ctx.fillRect(TILE - 17, 25, 4, 4);
  // contour
  ctx.strokeStyle = '#3d2817';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6, 22);
  ctx.lineTo(TILE / 2, 8);
  ctx.lineTo(TILE - 6, 22);
  ctx.stroke();
  ctx.strokeRect(10, 22, TILE - 20, 18);
  ctx.restore();
  // badge cooldown
  if (cooled) {
    const bx = TILE - 12, by = TILE - 11;
    ctx.fillStyle = 'rgba(40,25,15,0.92)';
    ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff7d0'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#fff7d0';
    ctx.font = 'bold 10px Manrope, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.cooldown + '', bx, by + 1);
  }
}

function drawMonsterCamp() {
  // tente foncée
  ctx.fillStyle = '#3d1820';
  ctx.beginPath();
  ctx.moveTo(8, 44);
  ctx.lineTo(TILE / 2, 14);
  ctx.lineTo(TILE - 8, 44);
  ctx.closePath();
  ctx.fill();
  // crâne stylisé
  ctx.fillStyle = '#f0e0c0';
  ctx.beginPath(); ctx.arc(TILE / 2, 32, 6, 0, Math.PI * 2); ctx.fill();
  // yeux
  ctx.fillStyle = '#2a0a14';
  ctx.beginPath(); ctx.arc(TILE / 2 - 2, 31, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(TILE / 2 + 2, 31, 1.2, 0, Math.PI * 2); ctx.fill();
  // pic
  ctx.strokeStyle = '#5e3a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(TILE - 14, 44); ctx.lineTo(TILE - 12, 12); ctx.stroke();
}

function drawCastle() {
  const px = state.cam.offsetX + CASTLE_RECT.x * TILE;
  const py = state.cam.offsetY + CASTLE_RECT.y * TILE;
  const w = CASTLE_RECT.w * TILE, h = CASTLE_RECT.h * TILE;

  // base parchemin
  ctx.fillStyle = '#e0c890';
  ctx.fillRect(px, py, w, h);

  // sol pavé
  ctx.fillStyle = '#c4a872';
  for (let y = 0; y < h; y += 8) {
    for (let x = 0; x < w; x += 12) {
      if (((x / 12 + y / 8) % 2) === 0) ctx.fillRect(px + x, py + y, 12, 8);
    }
  }

  // mur d'enceinte
  const wallY = py + h - 26;
  ctx.fillStyle = '#a89060';
  ctx.fillRect(px + 4, wallY, w - 8, 22);
  ctx.strokeStyle = '#3d2817';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(px + 4, wallY, w - 8, 22);
  // créneaux
  for (let i = 0; i < 8; i++) {
    const cx = px + 6 + i * ((w - 12) / 8);
    ctx.fillStyle = '#a89060';
    ctx.fillRect(cx, wallY - 5, 8, 5);
    ctx.strokeRect(cx, wallY - 5, 8, 5);
  }

  // donjon central
  const dX = px + w / 2 - 22, dY = py + 16, dW = 44, dH = h - 50;
  ctx.fillStyle = '#b89868';
  ctx.fillRect(dX, dY, dW, dH);
  ctx.strokeRect(dX, dY, dW, dH);
  // toit
  ctx.fillStyle = '#7a3a2a';
  ctx.beginPath();
  ctx.moveTo(dX - 4, dY); ctx.lineTo(dX + dW / 2, dY - 22); ctx.lineTo(dX + dW + 4, dY); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // drapeau
  ctx.strokeStyle = '#3d2817';
  ctx.beginPath(); ctx.moveTo(dX + dW / 2, dY - 22); ctx.lineTo(dX + dW / 2, dY - 38); ctx.stroke();
  ctx.fillStyle = COLORS.red;
  ctx.beginPath(); ctx.moveTo(dX + dW / 2, dY - 36); ctx.lineTo(dX + dW / 2 + 12, dY - 32); ctx.lineTo(dX + dW / 2, dY - 28); ctx.closePath(); ctx.fill();
  // porte
  ctx.fillStyle = '#3d2817';
  ctx.fillRect(dX + dW / 2 - 6, dY + dH - 14, 12, 14);
  // tours latérales
  ctx.fillStyle = '#a89060';
  ctx.fillRect(px + 8, wallY - 18, 14, 20);
  ctx.strokeRect(px + 8, wallY - 18, 14, 20);
  ctx.fillRect(px + w - 22, wallY - 18, 14, 20);
  ctx.strokeRect(px + w - 22, wallY - 18, 14, 20);

  // Habiter visuellement la cour : paysans / soldats
  const occupants = state.paysans + state.soldats;
  const yardY = py + h - 38;
  for (let i = 0; i < occupants; i++) {
    const isSold = i >= state.paysans;
    drawLittlePerson(
      px + 18 + (i * 10) % (w - 60),
      yardY + (Math.floor((i * 10) / (w - 60)) * 10),
      isSold
    );
  }
}

function drawBarracks() {
  const px = state.cam.offsetX + BARRACKS.x * TILE;
  const py = state.cam.offsetY + BARRACKS.y * TILE;
  const w = TILE, h = TILE;

  ctx.fillStyle = '#e0c890'; ctx.fillRect(px, py, w, h);
  // bâtiment
  ctx.fillStyle = '#8a4a3a';
  ctx.fillRect(px + 8, py + 18, w - 16, h - 24);
  ctx.strokeStyle = '#3d2817'; ctx.lineWidth = 1.2;
  ctx.strokeRect(px + 8, py + 18, w - 16, h - 24);
  // toit
  ctx.fillStyle = '#5a2a20';
  ctx.beginPath();
  ctx.moveTo(px + 4, py + 18); ctx.lineTo(px + w / 2, py + 6); ctx.lineTo(px + w - 4, py + 18); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // épée pas-cher
  ctx.strokeStyle = '#f0e0c0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + w / 2 - 6, py + 28); ctx.lineTo(px + w / 2 + 6, py + 28); // garde
  ctx.moveTo(px + w / 2, py + 28); ctx.lineTo(px + w / 2, py + 44); // lame
  ctx.stroke();
  // soldats devant la caserne
  for (let i = 0; i < state.soldats; i++) {
    drawLittlePerson(px + 8 + (i * 9) % (w - 16), py + h - 6, true);
  }
}

function drawHouseCiv() {
  const px = state.cam.offsetX + HOUSE_CIV.x * TILE;
  const py = state.cam.offsetY + HOUSE_CIV.y * TILE;
  const w = TILE, h = TILE;
  ctx.fillStyle = '#e0c890'; ctx.fillRect(px, py, w, h);
  // bâtiment
  ctx.fillStyle = '#b07c4e';
  ctx.fillRect(px + 8, py + 18, w - 16, h - 24);
  ctx.strokeStyle = '#3d2817'; ctx.lineWidth = 1.2;
  ctx.strokeRect(px + 8, py + 18, w - 16, h - 24);
  ctx.fillStyle = '#7a3a2a';
  ctx.beginPath();
  ctx.moveTo(px + 4, py + 18); ctx.lineTo(px + w / 2, py + 6); ctx.lineTo(px + w - 4, py + 18); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // fenêtre
  ctx.fillStyle = '#f0e0a0';
  ctx.fillRect(px + w / 2 - 4, py + 24, 8, 8);
  ctx.strokeRect(px + w / 2 - 4, py + 24, 8, 8);
  // porte
  ctx.fillStyle = '#3d2817';
  ctx.fillRect(px + w / 2 - 4, py + h - 14, 8, 12);
  // paysans (débordement de la maison)
  const overflow = Math.max(0, state.paysans - 4);
  for (let i = 0; i < overflow; i++) {
    drawLittlePerson(px + 8 + (i * 9) % (w - 16), py + h - 4, false);
  }
}

function drawLittlePerson(x, y, isSold) {
  // corps
  ctx.fillStyle = isSold ? '#a83a2c' : '#8a6a3e';
  ctx.fillRect(x - 2, y - 4, 4, 4);
  // tête
  ctx.fillStyle = '#f0d0a0';
  ctx.beginPath(); ctx.arc(x, y - 6, 2, 0, Math.PI * 2); ctx.fill();
  if (isSold) {
    // mini-épée
    ctx.strokeStyle = '#e8e0c0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 3, y - 4); ctx.lineTo(x + 3, y); ctx.stroke();
  }
}

// ============== Rendu sélection (zone + polyline) ==============
function drawSelection() {
  if (!state.selection) return;
  const sel = state.selection;
  const px = state.cam.offsetX + sel.x0 * TILE;
  const py = state.cam.offsetY + sel.y0 * TILE;
  const w = (sel.x1 - sel.x0 + 1) * TILE;
  const h = (sel.y1 - sel.y0 + 1) * TILE;

  // remplissage doux
  ctx.fillStyle = COLORS.selFill;
  ctx.fillRect(px, py, w, h);

  // marching ants
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -state.antOffset;
  ctx.strokeStyle = COLORS.selStroke;
  ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -state.antOffset + 5;
  ctx.strokeStyle = COLORS.goldBright;
  ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
  ctx.restore();

  // chiffres dans la zone (live overlay)
  const tiles = tilesInSelection(sel);
  for (const t of tiles) {
    const c = tileCenter(t.x, t.y);
    if (t.harvestsMax > 0 && t.harvests > 0) {
      const amt = HARVEST_AMOUNT[t.type];
      drawFloatingLabel(`+${amt} ${labelOfType(t.type)}`, c.x, c.y - 2, '#3d2817', '#fff7d0');
    } else if (t.type === TYPE.MONSTER) {
      drawFloatingLabel(`!`, c.x, c.y, '#fff', COLORS.red);
    } else if (t.type === TYPE.HOUSE) {
      if (t.cooldown > 0) {
        drawFloatingLabel('vide', c.x, c.y - 2, '#fff7d0', '#7a5a2a');
      } else {
        drawFloatingLabel('+1', c.x, c.y - 2, '#fff', COLORS.green);
      }
    }
  }
}

function labelOfType(type) {
  return ({ ble: 'blé', bois: 'bois', pierre: 'pierre', eau: 'eau', or: 'or' })[type] || '';
}

function drawFloatingLabel(text, x, y, fg, bg) {
  ctx.font = 'bold 12px Manrope, sans-serif';
  const metrics = ctx.measureText(text);
  const w = metrics.width + 10, h = 18;
  ctx.fillStyle = bg;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = '#3d2817';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPolyline(path, opts = {}) {
  // segments colorés
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i], p2 = path[i + 1];
    const col = segmentColor(p1, p2);
    ctx.strokeStyle = col;
    ctx.lineWidth = opts.lineWidth || 4;
    if (col === COLORS.red) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawThreatBadges(threats) {
  if (!threats || !threats.length) return;
  const pulse = 1 + Math.sin(performance.now() / 220) * 0.12;
  for (const th of threats) {
    const c = tileCenter(th.tile.x, th.tile.y);
    const bx = c.x;
    const by = c.y - TILE / 2 - 6;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(pulse, pulse);
    // halo
    ctx.fillStyle = 'rgba(184, 58, 44, 0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    // pastille rouge
    ctx.fillStyle = COLORS.red;
    ctx.strokeStyle = '#fff7d0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // !
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Manrope, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();
  }
}

function drawValidateButton() {
  if (!state.selection || !state.pending || state.expe) {
    state.validateBtn = null;
    return;
  }
  const sel = state.selection;
  const cx = state.cam.offsetX + ((sel.x0 + sel.x1 + 1) / 2) * TILE;
  const cy = state.cam.offsetY + ((sel.y0 + sel.y1 + 1) / 2) * TILE;
  const pulse = 1 + Math.sin(performance.now() / 280) * 0.06;
  const r = 22 * pulse;

  ctx.save();
  // ombre
  ctx.fillStyle = 'rgba(40,25,15,0.35)';
  ctx.beginPath(); ctx.arc(cx + 2, cy + 4, r, 0, Math.PI * 2); ctx.fill();
  // fond doré
  const grad = ctx.createRadialGradient(cx - 6, cy - 8, 4, cx, cy, r);
  grad.addColorStop(0, COLORS.goldBright);
  grad.addColorStop(1, COLORS.gold);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // bord
  ctx.strokeStyle = '#3d2817';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // anneau intérieur
  ctx.strokeStyle = 'rgba(255, 247, 208, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.stroke();
  // checkmark
  ctx.strokeStyle = '#3d2817';
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + 1);
  ctx.lineTo(cx - 3, cy + 8);
  ctx.lineTo(cx + 11, cy - 7);
  ctx.stroke();
  ctx.restore();

  state.validateBtn = { x: cx, y: cy, r };
}

// ============== Floats / popups de chiffres ==============
function spawnFloat(text, x, y, color = '#3d2817') {
  state.floats.push({ text, x, y, vy: -0.6, life: 1.0, color });
}
function tickFloats(dt) {
  for (const f of state.floats) {
    f.y += f.vy;
    f.vy *= 0.97;
    f.life -= dt * 0.8;
  }
  state.floats = state.floats.filter(f => f.life > 0);
}
function drawFloats() {
  for (const f of state.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.font = 'bold 14px Manrope, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeStyle = f.color;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}

// ============== HUD updates ==============
function updateHUD() {
  document.getElementById('c-ble').textContent = state.resources.ble;
  document.getElementById('c-bois').textContent = state.resources.bois;
  document.getElementById('c-pierre').textContent = state.resources.pierre;
  document.getElementById('c-eau').textContent = state.resources.eau;
  document.getElementById('c-or').textContent = state.resources.or;
  document.getElementById('c-pop').textContent = state.paysans;
  document.getElementById('c-sol').textContent = state.soldats;
}
function bumpCounter(key) {
  const map = {
    ble: '[data-res="ble"]', bois: '[data-res="bois"]',
    pierre: '[data-res="pierre"]', eau: '[data-res="eau"]', or: '[data-res="or"]',
    pop: '.counter.pop:nth-of-type(6)', sol: '.counter.pop:nth-of-type(7)'
  };
  const el = document.querySelector(map[key]);
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 240);
}

function showToast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ============== Input ==============
let dragStart = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state.expe) return; // bloqué pendant expé
  if (state.recruitDrag) return;
  // détection click sur recrue
  const r = pickRecruit(e.clientX, e.clientY);
  if (r) {
    state.recruitDrag = { recruit: r, mx: e.clientX, my: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  // bouton de validation en attente ?
  if (state.pending && state.validateBtn) {
    const dx = e.clientX - state.validateBtn.x;
    const dy = e.clientY - state.validateBtn.y;
    if (Math.hypot(dx, dy) < state.validateBtn.r) {
      const sel = state.selection;
      state.pending = false;
      state.validateBtn = null;
      startExpedition(sel);
      return;
    }
    // clic ailleurs : annule la sélection en attente
    state.pending = false;
    state.validateBtn = null;
    state.selection = null;
  }
  const { gx, gy } = pxToTile(e.clientX, e.clientY);
  if (!inGrid(gx, gy)) return;
  if (isComplex(gx, gy)) return;
  if (state.paysans <= 0) {
    showToast('Aucun paysan disponible.');
    return;
  }
  state.drag = { startGX: gx, startGY: gy, curGX: gx, curGY: gy };
  state.selection = { x0: gx, y0: gy, x1: gx, y1: gy };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (state.recruitDrag) {
    state.recruitDrag.mx = e.clientX;
    state.recruitDrag.my = e.clientY;
    state.recruitDrag.recruit.dragging = true;
    state.recruitDrag.recruit.dragX = e.clientX;
    state.recruitDrag.recruit.dragY = e.clientY;
    return;
  }
  // hover sur recrue
  const r = pickRecruit(e.clientX, e.clientY);
  for (const rc of state.recruits) rc.hover = false;
  if (r && !state.recruitDrag) r.hover = true;

  if (!state.drag) return;
  const { gx, gy } = pxToTile(e.clientX, e.clientY);
  state.drag.curGX = gx;
  state.drag.curGY = gy;
  const sel = clampSelection(state.drag.startGX, state.drag.startGY, gx, gy);
  state.selection = sel;
});

canvas.addEventListener('pointerup', (e) => {
  if (state.recruitDrag) {
    handleRecruitDrop(e.clientX, e.clientY);
    canvas.releasePointerCapture(e.pointerId);
    return;
  }
  if (!state.drag || !state.selection) {
    state.drag = null;
    return;
  }
  const sel = state.selection;
  const tiles = tilesInSelection(sel);
  // empêche la zone qui ne fait que toucher le complexe
  let valid = false;
  for (const t of tiles) {
    if (!isComplex(t.x, t.y)) { valid = true; break; }
  }
  if (valid) {
    state.pending = true;        // attend la validation
  } else {
    state.selection = null;
  }
  state.drag = null;
});

canvas.addEventListener('pointercancel', () => {
  state.drag = null;
  state.selection = null;
  state.pending = false;
  state.validateBtn = null;
  state.recruitDrag = null;
});

// ============== Recrutement / drop ==============
function pickRecruit(mx, my) {
  for (const r of state.recruits) {
    if (r.dragging) continue;
    const dx = mx - r.x, dy = my - r.y;
    if (Math.hypot(dx, dy) < 18) return r;
  }
  return null;
}

function handleRecruitDrop(mx, my) {
  const r = state.recruitDrag.recruit;
  state.recruitDrag = null;
  r.dragging = false;
  const { gx, gy } = pxToTile(mx, my);
  const target = tileAt(gx, gy);
  if (target && target.type === TYPE.BARRACKS) {
    // soldat
    state.soldats++;
    bumpCounter('sol');
    spawnFloat('+1 soldat', tileCenter(BARRACKS.x, BARRACKS.y).x, tileCenter(BARRACKS.x, BARRACKS.y).y - 12, COLORS.red);
    state.recruits = state.recruits.filter(x => x !== r);
    showToast('Recrue → soldat');
  } else if (target && target.type === TYPE.HOUSE_CIV) {
    state.paysans++;
    bumpCounter('pop');
    spawnFloat('+1 paysan', tileCenter(HOUSE_CIV.x, HOUSE_CIV.y).x, tileCenter(HOUSE_CIV.x, HOUSE_CIV.y).y - 12, '#8a6a3e');
    state.recruits = state.recruits.filter(x => x !== r);
    showToast('Recrue → paysan');
  } else {
    // retour à la porte
    const door = tileCenter(CASTLE_X, CASTLE_Y + 1);
    r.targetX = door.x + (Math.random() - 0.5) * 20;
    r.targetY = door.y + 4;
  }
  updateHUD();
}

// ============== Expédition (state machine) ==============
/*
  expe.phase :
    - 'leave'   : sprites sortent du château, s'alignent
    - 'travel'  : marchent le long du polyline (aller)
    - 'work'    : récolte / combat sur la zone cible
    - 'return'  : reviennent
    - 'arrive'  : rentrent au château + drop ressources
*/
function startExpedition(sel) {
  const path = buildPath(sel);
  const reverse = path.slice().reverse();
  const tiles = tilesInSelection(sel).filter(t => !isComplex(t.x, t.y));

  // 1 paysan = 1 case. Les soldats n'occupent pas de case.
  const area = (sel.x1 - sel.x0 + 1) * (sel.y1 - sel.y0 + 1);
  const sendP = Math.min(state.paysans, area);

  // Encounters : monstres qui interceptent le chemin (hors zone cible)
  const threats = findThreatMonsters(path, sel);
  const monstersOnPath = threats.length;
  const monstersInZone = tiles.filter(t => t.type === TYPE.MONSTER).length;
  const totalMonsters = monstersOnPath + monstersInZone;
  // 1 soldat envoyé en escorte par monstre rencontré (plafonné par le stock).
  const sendS = Math.min(state.soldats, totalMonsters);

  const sprites = [];
  for (let i = 0; i < sendP; i++) sprites.push(makeSprite(false));
  for (let i = 0; i < sendS; i++) sprites.push(makeSprite(true));

  const encounters = threats.map(th => {
    const c = tileCenter(th.tile.x, th.tile.y);
    let bestT = 0, bestD = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i], p2 = path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      let s = lenSq === 0 ? 0 : ((c.x - p1.x) * dx + (c.y - p1.y) * dy) / lenSq;
      s = Math.max(0, Math.min(1, s));
      const cx = p1.x + s * dx, cy = p1.y + s * dy;
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d < bestD) { bestD = d; bestT = i + s; }
    }
    return { tile: th.tile, t: bestT, resolved: false };
  }).sort((a, b) => a.t - b.t);

  state.cam.targetScale = 1.05;

  state.expe = {
    phase: 'leave',
    sel, tiles,
    pathOut: path, pathBack: reverse,
    sprites,
    encounters,
    paysansAlive: sendP,
    soldatsAlive: sendS,
    soldatsBudget: sendS,            // 1 soldat tue 1 monstre, pas de réutilisation
    totalMonsters,
    pickups: { ble: 0, bois: 0, pierre: 0, eau: 0, or: 0 },
    recruitGained: 0,
    losses: { paysans: 0, soldats: 0 },
    pathT: 0,
    workT: 0,
    leaveT: 0,
    arriveT: 0,
    fightT: 0,
    fightingTile: null,
  };
}

function makeSprite(isSold) {
  const door = tileCenter(CASTLE_X, CASTLE_Y);
  return {
    isSold,
    x: door.x, y: door.y + TILE * 0.3,
    targetX: door.x, targetY: door.y + TILE * 0.4,
    alpha: 1,
    bobPhase: Math.random() * Math.PI * 2,
  };
}

function tickExpedition(dt) {
  const E = state.expe;
  if (!E) return;
  if (E.phase === 'leave') {
    E.leaveT += dt;
    // place les sprites en file devant la porte avec cascade 50ms
    const door = tileCenter(CASTLE_X, CASTLE_Y);
    for (let i = 0; i < E.sprites.length; i++) {
      const s = E.sprites[i];
      const delay = i * 0.06;
      if (E.leaveT < delay) continue;
      s.targetX = door.x - (E.sprites.length - 1) * 6 + i * 12;
      s.targetY = door.y + TILE * 0.55;
      s.x += (s.targetX - s.x) * Math.min(1, dt * 8);
      s.y += (s.targetY - s.y) * Math.min(1, dt * 8);
    }
    // démarre le voyage après ~0.4s + cascade
    if (E.leaveT > 0.4 + E.sprites.length * 0.06) {
      E.phase = 'travel';
      E.pathT = 0;
    }
  }
  else if (E.phase === 'travel') {
    // déclenche un combat quand on croise un encounter monstre
    let triggered = null;
    for (const enc of E.encounters) {
      if (!enc.resolved && E.pathT >= enc.t) { triggered = enc; break; }
    }
    if (triggered) {
      triggered.resolved = true;
      E.fightingTile = triggered.tile;
      E.fightT = 0;
      E.phase = 'fight';
      resolveCombat(E, triggered.tile);
      return;
    }
    // pas-à-pas le long du chemin
    E.pathT += dt * 1.3;
    const totalT = E.pathOut.length - 1;
    if (E.pathT >= totalT) {
      E.pathT = totalT;
      E.phase = 'work';
      E.workT = 0;
      resolveAllOnZone(E);
    }
    placeSpritesAlongPath(E, E.pathOut, E.pathT, totalT);
  }
  else if (E.phase === 'fight') {
    E.fightT += dt;
    // petit clash visuel : sprites se rassemblent près du monstre
    if (E.fightingTile) {
      const c = tileCenter(E.fightingTile.x, E.fightingTile.y);
      for (let i = 0; i < E.sprites.length; i++) {
        const s = E.sprites[i];
        if (s.alpha <= 0) continue;
        const angle = (i / Math.max(1, E.sprites.length)) * Math.PI * 2 + E.fightT * 4;
        const r = 14 + Math.sin(E.fightT * 12 + i) * 4;
        s.targetX = c.x + Math.cos(angle) * r;
        s.targetY = c.y + Math.sin(angle) * r;
        s.x += (s.targetX - s.x) * 0.35;
        s.y += (s.targetY - s.y) * 0.35;
      }
    }
    if (E.fightT > 0.7) {
      // tous morts ?
      if (E.paysansAlive + E.soldatsAlive <= 0) {
        // expédition décimée : retour vide
        E.phase = 'return';
        E.pathT = 0;
      } else {
        E.phase = 'travel';
      }
    }
  }
  else if (E.phase === 'work') {
    E.workT += dt;
    // anim des récoltes/combats étalées sur ~1.5s
    if (E.workT > 1.6) {
      E.phase = 'return';
      E.pathT = 0;
    }
  }
  else if (E.phase === 'return') {
    E.pathT += dt * 1.5;
    const totalT = E.pathBack.length - 1;
    if (E.pathT >= totalT) {
      E.pathT = totalT;
      E.phase = 'arrive';
      E.arriveT = 0;
      // dépose ressources avec animation des compteurs
      depositResources(E);
    }
    placeSpritesAlongPath(E, E.pathBack, E.pathT, totalT);
  }
  else if (E.phase === 'arrive') {
    E.arriveT += dt;
    // sprites rentrent dans le château (alpha down)
    const door = tileCenter(CASTLE_X, CASTLE_Y);
    for (const s of E.sprites) {
      s.targetX = door.x;
      s.targetY = door.y;
      s.x += (s.targetX - s.x) * Math.min(1, dt * 6);
      s.y += (s.targetY - s.y) * Math.min(1, dt * 6);
      s.alpha = Math.max(0, 1 - E.arriveT * 1.5);
    }
    if (E.arriveT > 1.0) {
      // recrue : laisse devant la porte
      for (let k = 0; k < E.recruitGained; k++) {
        const door2 = tileCenter(CASTLE_X, CASTLE_Y + 1);
        state.recruits.push({
          id: Math.random().toString(36).slice(2),
          x: door2.x + (Math.random() - 0.5) * 24,
          y: door2.y + 4,
          targetX: door2.x + (Math.random() - 0.5) * 24,
          targetY: door2.y + 4,
          hover: false,
          dragging: false,
          opacity: 1,
          age: 0,
        });
      }
      // pertes
      state.paysans = Math.max(0, state.paysans - E.losses.paysans);
      state.soldats = Math.max(0, state.soldats - E.losses.soldats);
      if (E.losses.paysans > 0) bumpCounter('pop');
      if (E.losses.soldats > 0) bumpCounter('sol');
      // tic des cooldowns sur toutes les maisons
      for (let yy = 0; yy < GRID_H; yy++) {
        for (let xx = 0; xx < GRID_W; xx++) {
          const tt = state.grid[yy][xx];
          if (tt.type === TYPE.HOUSE && tt.cooldown > 0) tt.cooldown--;
        }
      }
      updateHUD();
      state.expe = null;
      state.selection = null;
      state.cam.targetScale = 1;

      // age les recrues : si elles survivent à 3 expés sans assignation → partent
      for (const r of state.recruits) r.age = (r.age || 0);
      // (l'incrément d'âge se fait à chaque nouvelle expé, pas ici)
    }
  }
}

function lerpPath(path, t) {
  const i = Math.floor(t);
  const f = t - i;
  if (i >= path.length - 1) return path[path.length - 1];
  return {
    x: path[i].x + (path[i + 1].x - path[i].x) * f,
    y: path[i].y + (path[i + 1].y - path[i].y) * f,
  };
}

function placeSpritesAlongPath(E, path, t, totalT) {
  // étale les sprites en queue
  for (let i = 0; i < E.sprites.length; i++) {
    const s = E.sprites[i];
    const stagger = i * 0.25;
    const tt = Math.max(0, Math.min(totalT, t - stagger));
    const p = lerpPath(path, tt);
    s.targetX = p.x + (i % 2 ? 4 : -4);
    s.targetY = p.y + (i % 2 ? -3 : 3);
    s.x += (s.targetX - s.x) * 0.25;
    s.y += (s.targetY - s.y) * 0.25;
    s.bobPhase += 0.3;
  }
}

// ============== Résolution gameplay ==============

// Combat sur un camp de monstres (sur le chemin OU dans la zone).
// Règle simple :
//  - Si un soldat dispo dans le budget d'escorte : il tue le monstre, il survit.
//  - Sinon, 1 paysan se sacrifie pour tuer le monstre.
//  - Si plus aucun paysan non plus, le camp survit (improbable car on cape l'envoi).
function resolveCombat(E, mTile) {
  if (mTile.type !== TYPE.MONSTER) return;
  const c = tileCenter(mTile.x, mTile.y);

  if (E.soldatsBudget > 0) {
    E.soldatsBudget--;
    mTile.type = TYPE.EMPTY;
    mTile.harvests = 0; mTile.harvestsMax = 0;
    spawnFloat('Camp détruit !', c.x, c.y - 14, COLORS.gold);
  } else if (E.paysansAlive >= 1) {
    E.paysansAlive--;
    E.losses.paysans++;
    removeSpriteOf(E, false);
    mTile.type = TYPE.EMPTY;
    mTile.harvests = 0; mTile.harvestsMax = 0;
    spawnFloat('-1 paysan', c.x, c.y - 14, COLORS.red);
    spawnFloat('Camp détruit', c.x + 28, c.y - 4, '#3d2817');
  } else {
    spawnFloat('Repli', c.x, c.y - 14, COLORS.red);
  }
}

function removeSpriteOf(E, isSold) {
  const idx = E.sprites.findIndex(s => s.isSold === isSold && s.alpha > 0);
  if (idx >= 0) E.sprites[idx].alpha = 0;
}

function resolveAllOnZone(E) {
  // 1) combats : monstres dans la zone (priorité, ils consomment soldats)
  const monsters = E.tiles.filter(t => t.type === TYPE.MONSTER);
  for (const t of monsters) {
    if (E.paysansAlive + E.soldatsAlive <= 0) break;
    resolveCombat(E, t);
  }

  // 2) récoltes — paysans uniquement (les soldats n'agricultent pas)
  let pAvail = E.paysansAlive;
  const resources = E.tiles
    .filter(t => t.harvestsMax > 0 && t.harvests > 0)
    .sort((a, b) => HARVEST_AMOUNT[b.type] - HARVEST_AMOUNT[a.type]);

  for (const t of resources) {
    if (pAvail <= 0) break;
    const yieldAmt = HARVEST_AMOUNT[t.type];
    pAvail--;
    E.pickups[t.type] = (E.pickups[t.type] || 0) + yieldAmt;
    t.harvests--;
    const c = tileCenter(t.x, t.y);
    spawnFloat(`+${yieldAmt} ${labelOfType(t.type)}`, c.x, c.y - 12, '#3d2817');
  }

  // 3) recrues : maisons (cooldown 15 expés après recrutement)
  const houses = E.tiles.filter(t => t.type === TYPE.HOUSE && t.cooldown <= 0);
  for (const t of houses) {
    if (rng() < 0.85) {
      E.recruitGained++;
      t.cooldown = 15;
      const c = tileCenter(t.x, t.y);
      spawnFloat('+1 recrue', c.x, c.y - 12, COLORS.green);
    }
  }
  for (const t of E.tiles) {
    const ns = neighbors(t.x, t.y, 1);
    for (const n of ns) {
      if (n.type === TYPE.HOUSE && n.cooldown <= 0 && !E.tiles.includes(n)) {
        if (rng() < 0.25) {
          E.recruitGained++;
          n.cooldown = 15;
          const c = tileCenter(n.x, n.y);
          spawnFloat('+1 recrue', c.x, c.y - 12, COLORS.green);
          break;
        }
      }
    }
  }
}

function depositResources(E) {
  // anim tic-tic-tic : ressources arrivent une par une (étalées)
  let delay = 0;
  for (const k of ['ble', 'bois', 'pierre', 'eau', 'or']) {
    const amt = E.pickups[k] || 0;
    if (amt > 0) {
      for (let i = 0; i < amt; i++) {
        setTimeout(() => {
          state.resources[k]++;
          updateHUD();
          bumpCounter(k);
        }, delay);
        delay += 80;
      }
    }
  }
  // age toutes les recrues d'un cran
  for (const r of state.recruits) r.age = (r.age || 0) + 1;
  // celles qui dépassent 3 expés sans assignation → s'en vont
  state.recruits = state.recruits.filter(r => {
    if (r.age >= 3) {
      showToast('Une recrue, lassée d\'attendre, est repartie.');
      return false;
    }
    return true;
  });
}

// ============== Rendu sprites expédition ==============
function drawExpeditionSprites() {
  if (!state.expe) return;
  for (const s of state.expe.sprites) {
    if (s.alpha <= 0) continue;
    ctx.globalAlpha = s.alpha;
    drawWalker(s.x, s.y + Math.sin(s.bobPhase) * 1.5, s.isSold);
    ctx.globalAlpha = 1;
  }
}

function drawWalker(x, y, isSold) {
  // ombre
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 2, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
  // corps
  ctx.fillStyle = isSold ? '#a83a2c' : '#8a6a3e';
  ctx.fillRect(x - 3, y - 8, 6, 8);
  // tête
  ctx.fillStyle = '#f0d0a0';
  ctx.beginPath(); ctx.arc(x, y - 11, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3d2817'; ctx.lineWidth = 1;
  ctx.stroke();
  // arme/outil
  if (isSold) {
    ctx.strokeStyle = '#e8e0c0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 4, y - 8); ctx.lineTo(x + 4, y); ctx.stroke();
  } else {
    ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 4, y - 10); ctx.lineTo(x + 4, y - 2); ctx.stroke();
  }
}

// ============== Recrues à la porte ==============
function tickRecruits(dt) {
  for (const r of state.recruits) {
    // bobbing si hover
    if (!r.dragging) {
      r.x += (r.targetX - r.x) * 0.18;
      r.y += (r.targetY - r.y) * 0.18;
    }
    // opacité diminue avec age
    r.opacity = Math.max(0.4, 1 - (r.age || 0) * 0.18);
  }
}

function drawRecruits() {
  for (const r of state.recruits) {
    let x = r.x, y = r.y;
    if (r.dragging) { x = r.dragX; y = r.dragY; }
    const lift = r.hover && !r.dragging ? -3 : 0;
    ctx.globalAlpha = r.opacity;
    drawWalker(x, y + lift, false);
    // bulle d'assignation (icône fourche / épée)
    if (!r.dragging) {
      drawAssignBubble(x, y - 24);
    }
    ctx.globalAlpha = 1;
  }

  // glow des bâtiments si on drag une recrue
  if (state.recruitDrag) {
    drawBuildingGlow(BARRACKS, COLORS.red);
    drawBuildingGlow(HOUSE_CIV, COLORS.green);
  }
}

function drawAssignBubble(x, y) {
  // bulle ovale parchemin
  ctx.fillStyle = '#fff7d0';
  ctx.strokeStyle = '#3d2817';
  ctx.lineWidth = 1.2;
  roundRect(ctx, x - 22, y - 9, 44, 18, 8); ctx.fill(); ctx.stroke();
  // queue
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 9); ctx.lineTo(x, y + 14); ctx.lineTo(x + 4, y + 9);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // icônes : fourche / épée
  // fourche
  ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 4); ctx.lineTo(x - 10, y + 4);
  ctx.moveTo(x - 13, y - 4); ctx.lineTo(x - 13, y - 1); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x - 7, y - 1);
  ctx.stroke();
  // épée
  ctx.strokeStyle = '#3d2817'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 4); ctx.lineTo(x + 10, y + 4);
  ctx.moveTo(x + 6, y - 4); ctx.lineTo(x + 14, y - 4);
  ctx.stroke();
}

function drawBuildingGlow(b, color) {
  const px = state.cam.offsetX + b.x * TILE;
  const py = state.cam.offsetY + b.y * TILE;
  const t = (performance.now() / 600) % (Math.PI * 2);
  const a = 0.35 + Math.sin(t) * 0.2;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = color === COLORS.red ? COLORS.redBright : COLORS.greenBright;
  ctx.fillRect(px, py, TILE, TILE);
  ctx.restore();
}

// ============== Boucle principale ==============
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  // Anim ants
  state.antOffset = (state.antOffset + dt * 22) % 22;

  // Caméra
  state.cam.scale += (state.cam.targetScale - state.cam.scale) * 0.06;

  tickFloats(dt);
  tickExpedition(dt);
  tickRecruits(dt);

  // ----- RENDER -----
  ctx.fillStyle = '#d9bf83';
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // Subtle scale autour du centre carte
  ctx.save();
  const sx = state.cam.focusX, sy = state.cam.focusY;
  ctx.translate(sx, sy);
  ctx.scale(state.cam.scale, state.cam.scale);
  ctx.translate(-sx, -sy);

  // Ombre de la carte
  ctx.fillStyle = 'rgba(60,40,20,0.18)';
  ctx.fillRect(state.cam.offsetX + 4, state.cam.offsetY + 6, state.mapPixelW, state.mapPixelH);

  // Grille
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++)
      drawTile(state.grid[y][x]);

  drawCastle();
  drawBarracks();
  drawHouseCiv();

  // Sélection en cours (drag ou en attente de validation)
  if (state.selection && !state.expe) {
    drawSelection();
    const path = buildPath(state.selection);
    drawPolyline(path);
    drawThreatBadges(findThreatMonsters(path, state.selection));
    drawValidateButton();
  }

  // Polyline d'expé en cours (subtile)
  if (state.expe) {
    const path = state.expe.phase === 'return' ? state.expe.pathBack : state.expe.pathOut;
    ctx.globalAlpha = 0.4;
    drawPolyline(path, { lineWidth: 3 });
    ctx.globalAlpha = 1;
  }

  drawExpeditionSprites();
  drawFloats();
  drawRecruits();

  ctx.restore();

  requestAnimationFrame(frame);
}

// ============== Init ==============
function init() {
  resize();
  genMap();
  updateHUD();
  requestAnimationFrame(frame);
  // petit toast d'ouverture
  showToast('Glissez sur la carte pour dessiner une zone d\'expédition.');
}
init();

})();
