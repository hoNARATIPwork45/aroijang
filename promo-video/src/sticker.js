// Thick die-cut "sticker" meshes: trace the alpha outline of an image or a
// canvas, extrude it with a soft bevel and print the picture on the front.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const FONT = 'Kanit';
const ANISO = 8;

// ---------------------------------------------------------------- contours
// Marching squares on a scalar field (row-major, w*h), outside counts as 0.
export function traceContours(field, w, h, iso = 0.5) {
  const val = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : field[y * w + x]);
  const W2 = w + 2;
  const hid = (x, y) => ((y + 1) * W2 + (x + 1)) * 2;
  const vid = (x, y) => ((y + 1) * W2 + (x + 1)) * 2 + 1;
  const pts = new Map();
  const adj = new Map();
  const cross = (id, x0, y0, v0, x1, y1, v1) => {
    if (!pts.has(id)) {
      const t = (iso - v0) / (v1 - v0);
      pts.set(id, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
    return id;
  };
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const a = val(x, y), b = val(x + 1, y), c = val(x + 1, y + 1), d = val(x, y + 1);
      const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = () => cross(hid(x, y), x, y, a, x + 1, y, b);
      const R = () => cross(vid(x + 1, y), x + 1, y, b, x + 1, y + 1, c);
      const B = () => cross(hid(x, y + 1), x, y + 1, d, x + 1, y + 1, c);
      const L = () => cross(vid(x, y), x, y, a, x, y + 1, d);
      switch (idx) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), R()); break;
        case 3: case 12: link(L(), R()); break;
        case 4: case 11: link(T(), R()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(L(), T()); break;
        case 5: {
          if ((a + b + c + d) / 4 > iso) { link(T(), L()); link(B(), R()); } else { link(T(), R()); link(L(), B()); }
          break;
        }
        case 10: {
          if ((a + b + c + d) / 4 > iso) { link(T(), R()); link(L(), B()); } else { link(T(), L()); link(B(), R()); }
          break;
        }
      }
    }
  }
  const loops = [];
  const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    for (let guard = 0; guard < 1e7; guard++) {
      seen.add(cur);
      loop.push(pts.get(cur));
      const n = adj.get(cur);
      const next = n[0] !== prev ? n[0] : n[1];
      prev = cur;
      cur = next;
      if (cur === start || seen.has(cur)) break;
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-9;
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const l = rdp(pts.slice(0, idx + 1), eps);
    const r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}

function simplifyClosed(loop, eps) {
  let far = 0, dm = 0;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > dm) { dm = d; far = i; }
  }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp(loop.slice(far).concat([loop[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

function signedArea(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return s / 2;
}

function pointInPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function loopsToShapes(loops, toWorld, minArea) {
  const polys = loops
    .map((pts) => ({ pts, a: Math.abs(signedArea(pts)) }))
    .filter((p) => p.a >= minArea)
    .sort((p, q) => q.a - p.a);
  polys.forEach((p, i) => {
    p.depth = 0;
    p.parent = null;
    const [x, y] = p.pts[0];
    for (let j = 0; j < i; j++) {
      if (pointInPoly(x, y, polys[j].pts)) {
        p.depth++;
        if (!p.parent || polys[j].a < p.parent.a) p.parent = polys[j];
      }
    }
  });
  const shapes = [];
  for (const p of polys) {
    if (p.depth % 2 === 0) {
      p.shape = new THREE.Shape(p.pts.map(toWorld));
      shapes.push(p.shape);
    }
  }
  for (const p of polys) {
    if (p.depth % 2 === 1 && p.parent && p.parent.shape) p.parent.shape.holes.push(new THREE.Path(p.pts.map(toWorld)));
  }
  return shapes;
}

export function alphaField(src, gridMax) {
  const s = gridMax / Math.max(src.width, src.height);
  const gw = Math.max(8, Math.round(src.width * s));
  const gh = Math.max(8, Math.round(src.height * s));
  const c = document.createElement('canvas');
  c.width = gw;
  c.height = gh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, gw, gh);
  const d = ctx.getImageData(0, 0, gw, gh).data;
  const f = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) f[i] = d[i * 4 + 3] / 255;
  return { f, gw, gh };
}

// ---------------------------------------------------------------- extrusion
export function extrudeShapes(shapes, worldW, worldH, { depth = 0.16, bevel = 0.035, bevelSegments = 3 } = {}) {
  const uvGen = {
    generateTopUV(geometry, v, a, b, c) {
      return [a, b, c].map((i) => new THREE.Vector2(v[i * 3] / worldW + 0.5, v[i * 3 + 1] / worldH + 0.5));
    },
    generateSideWallUV() {
      return [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
    },
  };
  let geo = new THREE.ExtrudeGeometry(shapes, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    UVGenerator: uvGen,
  });
  // ExtrudeGeometry puts back + front lids in one group: split them.
  const groups = [];
  for (const g of geo.groups) {
    if (g.materialIndex === 0) {
      const h = g.count / 2;
      groups.push({ start: g.start, count: h, materialIndex: 2 }, { start: g.start + h, count: h, materialIndex: 0 });
    } else groups.push(g);
  }
  geo.clearGroups();
  groups.forEach((g) => geo.addGroup(g.start, g.count, g.materialIndex));
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export function texFrom(src) {
  const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

// Printed face: mostly self-lit so brand colours stay true, with enough real
// lighting left for shading and glossy highlights when the sticker turns.
export function stickerMaterials(tex, o = {}) {
  const front = new THREE.MeshPhysicalMaterial({
    map: tex,
    color: new THREE.Color(o.lit ?? 0.42, o.lit ?? 0.42, o.lit ?? 0.42),
    emissiveMap: tex,
    emissive: new THREE.Color(o.glow ?? 0.66, o.glow ?? 0.66, o.glow ?? 0.66),
    roughness: o.roughness ?? 0.5,
    metalness: 0,
    specularIntensity: 0.6,
    clearcoat: o.clearcoat ?? 0.3,
    clearcoatRoughness: 0.35,
  });
  front.userData.noEnv = true;
  const side = new THREE.MeshStandardMaterial({ color: o.side ?? '#f3efe6', roughness: 0.55 });
  const back = new THREE.MeshStandardMaterial({ color: o.back ?? o.side ?? '#ece7dc', roughness: 0.65 });
  side.userData.envK = 0.25;
  back.userData.envK = 0.2;
  return [front, side, back];
}

// Build a sticker from any image/canvas with alpha. Returns a Group whose
// userData has {w, h, mesh}. Origin = centre of the picture.
export function makeSticker(src, o = {}) {
  const height = o.height ?? 3;
  const worldH = height;
  const worldW = height * (src.width / src.height);
  const { f, gw, gh } = alphaField(src, o.grid ?? 320);
  const loops = traceContours(f, gw, gh, 0.5).map((l) => simplifyClosed(l, o.eps ?? 0.3));
  const toWorld = ([gx, gy]) =>
    new THREE.Vector2(((gx + 0.5) / gw - 0.5) * worldW, (0.5 - (gy + 0.5) / gh) * worldH);
  const shapes = loopsToShapes(loops, toWorld, o.minArea ?? 4);
  const geo = extrudeShapes(shapes, worldW, worldH, { depth: o.depth ?? 0.16, bevel: o.bevel ?? 0.035 });
  const mesh = new THREE.Mesh(geo, stickerMaterials(o.tex ?? texFrom(src), o));
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData = { w: worldW, h: worldH };
  return g;
}

// ---------------------------------------------------------------- text
const measureCtx = document.createElement('canvas').getContext('2d');

export function textCanvas(text, st = {}) {
  const size = st.size ?? 170;
  const font = `${st.weight ?? 800} ${size}px ${st.font ?? FONT}`;
  measureCtx.font = font;
  const m = measureCtx.measureText(text);
  const asc = Math.ceil(m.actualBoundingBoxAscent);
  const desc = Math.ceil(m.actualBoundingBoxDescent);
  const left = Math.ceil(m.actualBoundingBoxLeft);
  const right = Math.ceil(m.actualBoundingBoxRight);
  const outline = st.outline ?? Math.round(size * 0.06);
  const border = st.border ?? Math.round(size * 0.12);
  const pad = outline + border + 6;
  const c = document.createElement('canvas');
  c.width = left + right + pad * 2;
  c.height = asc + desc + pad * 2;
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const x = pad + left, y = pad + asc;
  if (border > 0) {
    ctx.strokeStyle = ctx.fillStyle = st.borderColor ?? '#ffffff';
    ctx.lineWidth = 2 * (outline + border);
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }
  if (outline > 0) {
    ctx.strokeStyle = st.outlineColor ?? '#14532d';
    ctx.lineWidth = 2 * outline;
    ctx.strokeText(text, x, y);
  }
  // fill on its own layer so the gloss only touches the letters
  const L = document.createElement('canvas');
  L.width = c.width;
  L.height = c.height;
  const lc = L.getContext('2d');
  lc.font = font;
  const fills = st.fill ?? ['#fff27a', '#ffc21a', '#ff9f0a'];
  const gr = lc.createLinearGradient(0, y - asc, 0, y + desc);
  fills.forEach((col, i) => gr.addColorStop(i / Math.max(1, fills.length - 1), col));
  lc.fillStyle = gr;
  lc.fillText(text, x, y);
  if (st.gloss !== false) {
    lc.globalCompositeOperation = 'source-atop';
    const top = y - asc, hh = (asc + desc) * 0.46;
    const g2 = lc.createLinearGradient(0, top, 0, top + hh);
    g2.addColorStop(0, 'rgba(255,255,255,0.65)');
    g2.addColorStop(1, 'rgba(255,255,255,0.08)');
    lc.fillStyle = g2;
    lc.fillRect(0, 0, L.width, top + hh);
  }
  ctx.drawImage(L, 0, 0);
  c.userData = { size };
  return c;
}

// em = world height of one font-size unit, so all lines share a scale.
export function makeTextSticker(text, st = {}) {
  const c = textCanvas(text, st);
  const em = st.em ?? 1.0;
  const height = (c.height / (st.size ?? 170)) * em;
  const grid = Math.min(900, Math.round(Math.max(c.width, c.height) * 0.55));
  return makeSticker(c, {
    height,
    grid,
    depth: st.depth ?? 0.2 * em,
    bevel: st.bevel ?? 0.045 * em,
    side: st.side ?? '#f6f3ec',
    back: st.back,
    eps: 0.3,
  });
}

// Rounded pill / badge with text, drawn on a canvas, then extruded.
export function badgeCanvas(text, st = {}) {
  const size = st.size ?? 90;
  const font = `${st.weight ?? 700} ${size}px ${st.font ?? FONT}`;
  measureCtx.font = font;
  const m = measureCtx.measureText(text);
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  const tw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const padX = st.padX ?? size * 0.55, padY = st.padY ?? size * 0.32;
  const iconW = st.icon ? size * 1.05 : 0;
  const outer = st.outer ?? 0;
  const ring = (st.ring ?? Math.round(size * 0.12)) + outer;
  const w = Math.ceil(tw + padX * 2 + iconW + ring * 2);
  const h = Math.ceil(asc + desc + padY * 2 + ring * 2);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const r = st.radius ?? h / 2;
  const rr = (x, y, ww, hh, rad) => {
    ctx.beginPath();
    ctx.roundRect(x, y, ww, hh, rad);
  };
  if (outer > 0) {
    rr(0, 0, w, h, r);
    ctx.fillStyle = st.outerColor ?? '#ffffff';
    ctx.fill();
  }
  rr(outer, outer, w - outer * 2, h - outer * 2, Math.max(2, r - outer));
  ctx.fillStyle = st.ringColor ?? '#ffffff';
  ctx.fill();
  rr(ring, ring, w - ring * 2, h - ring * 2, Math.max(2, r - ring));
  const g = ctx.createLinearGradient(0, ring, 0, h - ring);
  const bg = st.bg ?? ['#22c55e', '#15803d'];
  bg.forEach((col, i) => g.addColorStop(i / Math.max(1, bg.length - 1), col));
  ctx.fillStyle = g;
  ctx.fill();
  // soft top gloss
  ctx.save();
  rr(ring, ring, w - ring * 2, (h - ring * 2) * 0.5, [Math.max(2, r - ring), Math.max(2, r - ring), 0, 0]);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  if (st.icon) st.icon(ctx, ring + padX * 0.7, h / 2, size);
  ctx.font = font;
  ctx.fillStyle = st.fg ?? '#ffffff';
  ctx.textBaseline = 'alphabetic';
  const tx = ring + padX + iconW + m.actualBoundingBoxLeft;
  const ty = h / 2 + (asc - desc) / 2;
  ctx.fillText(text, tx, ty);
  return c;
}

export function makeBadge(text, st = {}) {
  const c = badgeCanvas(text, st);
  const em = st.em ?? 0.5;
  const height = (c.height / (st.size ?? 90)) * em;
  return makeSticker(c, {
    height,
    grid: Math.min(700, Math.round(Math.max(c.width, c.height) * 0.6)),
    depth: st.depth ?? 0.12,
    bevel: st.bevel ?? 0.03,
    side: st.side ?? '#f6f3ec',
  });
}

// Lay out several stickers on one line, centred. gap in world units.
export function rowLayout(items, gap = 0.15) {
  const total = items.reduce((s, it) => s + it.userData.w, 0) + gap * (items.length - 1);
  let x = -total / 2;
  return items.map((it) => {
    const cx = x + it.userData.w / 2;
    x += it.userData.w + gap;
    return cx;
  });
}
