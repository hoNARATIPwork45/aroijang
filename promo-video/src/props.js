// Procedural, toy-like 3D props: Thai street food, coins, map pins, phone,
// food stall and a little pastel city for the "500 m" map.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, TAU } from './util.js';
import { FONT, texFrom } from './sticker.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const phys = (color, o = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2, ...o });
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });

export function castAll(obj, cast = true, receive = false) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

// ------------------------------------------------------------- fried egg
// Lies flat on XZ (y up). Puffy wobbly white with a crispy golden rim.
export function makeEgg(seed = 1) {
  const r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  const prof = [
    [0.0, 0.16], [0.35, 0.155], [0.62, 0.14], [0.8, 0.115], [0.92, 0.08], [0.99, 0.04],
    [1.01, 0.0], [0.98, -0.035], [0.9, -0.05], [0.5, -0.05], [0.0, -0.05],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(prof, 120);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const white = new THREE.Color('#fffdf7'), gold = new THREE.Color('#efb75e'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.09 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.03 * Math.sin(8 * a + ph[2]);
    pos.setXYZ(i, x * k * 1.12, y, z * k);
    const rr = Math.hypot(x, z);
    const crisp = THREE.MathUtils.smoothstep(rr, 0.82, 1.0) * (y < 0.09 ? 1 : 0.6);
    c.copy(white).lerp(gold, crisp * 0.85);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, phys('#ffffff', { vertexColors: true, roughness: 0.3, clearcoat: 0.8 })));
  const yolk = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 48, 32),
    phys('#ffb000', { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, emissive: new THREE.Color('#ff7b00'), emissiveIntensity: 0.22 })
  );
  yolk.scale.set(1, 0.62, 1);
  yolk.position.set(0.12, 0.17, -0.05);
  g.add(yolk);
  return castAll(g);
}

// ------------------------------------------------------------- Thai iced tea
export function makeTea(logoTex) {
  const g = new THREE.Group();
  const prof = [
    [0.0, -1.15], [0.5, -1.15], [0.55, -1.12], [0.57, -1.06], [0.74, 0.96], [0.79, 1.0], [0.8, 1.05], [0.0, 1.05],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(prof, 64);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const deep = new THREE.Color('#c2410c'), mid = new THREE.Color('#f97316'), cream = new THREE.Color('#ffc078'), milk = new THREE.Color('#fff1e0');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.55) c.copy(deep).lerp(mid, THREE.MathUtils.smoothstep(y, -1.15, 0.55));
    else if (y < 0.8) c.copy(mid).lerp(cream, THREE.MathUtils.smoothstep(y, 0.55, 0.8));
    else c.copy(cream).lerp(milk, THREE.MathUtils.smoothstep(y, 0.8, 0.98));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, phys('#ffffff', { vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })));
  // dome lid
  const lid = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 48, 16, 0, TAU, 0, Math.PI / 2),
    phys('#ffffff', { transparent: true, opacity: 0.38, roughness: 0.05, clearcoat: 1, depthWrite: false })
  );
  lid.scale.set(1, 0.5, 1);
  lid.position.y = 1.05;
  g.add(lid);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 12, 64), phys('#ffffff', { roughness: 0.2 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.05;
  g.add(rim);
  // striped straw
  const stripes = canvas(64, 256, (x, w, h) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#16a34a';
    for (let i = -4; i < 12; i++) {
      x.beginPath();
      x.moveTo(0, i * 32);
      x.lineTo(w, i * 32 + 24);
      x.lineTo(w, i * 32 + 40);
      x.lineTo(0, i * 32 + 16);
      x.fill();
    }
  });
  const st = texFrom(stripes);
  st.wrapS = st.wrapT = THREE.RepeatWrapping;
  st.repeat.set(1, 3);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.0, 24), phys('#ffffff', { map: st, roughness: 0.25 }));
  straw.position.set(0.18, 1.35, 0);
  straw.rotation.z = -0.22;
  g.add(straw);
  if (logoTex) {
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.712, 0.633, 0.9, 32, 1, true, -0.62, 1.24),
      new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, alphaTest: 0.4, roughness: 0.35 })
    );
    label.material.userData.noEnv = true;
    label.position.y = -0.05;
    label.rotation.y = Math.PI / 2;
    g.add(label);
  }
  return castAll(g);
}

// ------------------------------------------------------------- chilli
export function makeChili() {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([V3(0, 1.0, 0), V3(0.2, 0.45, 0.03), V3(0.12, -0.2, 0), V3(-0.12, -0.72, -0.03), V3(-0.48, -1.05, 0)]);
  const tube = new THREE.TubeGeometry(curve, 90, 0.27, 28, false);
  const pos = tube.attributes.position, uv = tube.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const p = curve.getPointAt(u);
    const s = u < 0.07 ? 0.55 + 0.45 * Math.sqrt(1 - Math.pow(1 - u / 0.07, 2)) : 1 - 0.9 * Math.pow((u - 0.07) / 0.93, 1.7);
    pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * s, p.y + (pos.getY(i) - p.y) * s, p.z + (pos.getZ(i) - p.z) * s);
  }
  tube.computeVertexNormals();
  g.add(new THREE.Mesh(tube, phys('#e3172b', { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 })));
  const calyx = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), phys('#4c9a2a', { roughness: 0.4 }));
  calyx.scale.set(1.1, 0.5, 1.1);
  calyx.position.set(0, 1.0, 0);
  g.add(calyx);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.5, 12), phys('#3f8a22', { roughness: 0.45 }));
  stem.position.set(-0.06, 1.24, 0);
  stem.rotation.z = 0.35;
  g.add(stem);
  return castAll(g);
}

// ------------------------------------------------------------- moo ping skewer
let charTex = null;
function grillTexture() {
  if (charTex) return charTex;
  const c = canvas(256, 256, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#c2672a');
    gr.addColorStop(0.5, '#a24a17');
    gr.addColorStop(1, '#7c3410');
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(${r() < 0.5 ? '60,22,6' : '235,160,90'},${0.08 + r() * 0.18})`;
      x.beginPath();
      x.arc(r() * w, r() * h, 2 + r() * 7, 0, TAU);
      x.fill();
    }
    x.strokeStyle = 'rgba(45,16,4,0.75)';
    x.lineWidth = 10;
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.moveTo(i * 48 - 30, 0);
      x.lineTo(i * 48 + 30, h);
      x.stroke();
    }
  });
  charTex = texFrom(c);
  return charTex;
}

export function makeSkewer(seed = 3) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 12), std('#e3c08f', { roughness: 0.7 }));
  stick.position.y = -0.35;
  g.add(stick);
  const r = rng(seed);
  const mat = phys('#ffffff', { map: grillTexture(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  for (let k = 0; k < 4; k++) {
    const geo = new THREE.SphereGeometry(0.5, 36, 24);
    const p = geo.attributes.position;
    const f1 = r() * 6, f2 = r() * 6;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.07 * Math.sin(5 * x + f1) * Math.cos(4 * z + f2) + 0.05 * Math.sin(7 * y + f1);
      p.setXYZ(i, x * n, y * n, z * n);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(1.18 + r() * 0.12, 0.6, 0.72);
    m.position.y = 1.15 - k * 0.6;
    m.rotation.set((r() - 0.5) * 0.3, (r() - 0.5) * 0.6, (r() - 0.5) * 0.25);
    g.add(m);
  }
  return castAll(g);
}

// ------------------------------------------------------------- coin
let coinFace = null;
export function makeCoin() {
  if (!coinFace) {
    const c = canvas(256, 256, (x, w) => {
      const gr = x.createRadialGradient(w * 0.38, w * 0.35, 10, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#fff3b0');
      gr.addColorStop(0.55, '#ffcf3a');
      gr.addColorStop(1, '#e09a00');
      x.fillStyle = gr;
      x.fillRect(0, 0, w, w);
      x.strokeStyle = '#c98200';
      x.lineWidth = 12;
      x.beginPath();
      x.arc(w / 2, w / 2, w * 0.4, 0, TAU);
      x.stroke();
      // baht sign drawn as B + bar so it never depends on font coverage
      const baht = (dx, dy, col) => {
        x.font = `800 140px ${FONT}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillStyle = col;
        x.fillText('B', w / 2 + dx, w / 2 + 8 + dy);
        x.fillRect(w / 2 - 12 + dx - 8, w / 2 - 78 + dy, 16, 156);
      };
      baht(5, 6, '#b86e00');
      baht(0, 0, '#ffe680');
    });
    coinFace = texFrom(c);
  }
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.11, 48);
  const side = std('#ffc21a', { metalness: 0.45, roughness: 0.3, emissive: new THREE.Color('#8a5a00'), emissiveIntensity: 0.35 });
  const face = std('#ffffff', { map: coinFace, metalness: 0.3, roughness: 0.32, emissiveMap: coinFace, emissive: new THREE.Color(0.38, 0.38, 0.38) });
  const m = new THREE.Mesh(geo, [side, face, face]);
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return castAll(g);
}

// ------------------------------------------------------------- map pin
export function makePin(photoTex, color = '#16a34a') {
  const g = new THREE.Group();
  const R = 0.95, cy = 1.3;
  const phi = Math.acos(R / cy);
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(R * Math.sin(phi), cy - R * Math.cos(phi));
  s.absarc(0, cy, R, -Math.PI / 2 + phi, Math.PI * 1.5 - phi, false);
  s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 4, curveSegments: 48 });
  geo.translate(0, 0, -0.11);
  const body = new THREE.Mesh(geo, phys(color, { roughness: 0.25, clearcoat: 1 }));
  g.add(body);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.82, 48), std('#ffffff', { roughness: 0.4 }));
  ring.position.set(0, cy, 0.205);
  g.add(ring);
  const photo = new THREE.Mesh(new THREE.CircleGeometry(0.7, 48), new THREE.MeshStandardMaterial({ map: photoTex, roughness: 0.5, emissiveMap: photoTex, emissive: new THREE.Color(0.45, 0.45, 0.45), color: new THREE.Color(0.6, 0.6, 0.6) }));
  photo.material.userData.noEnv = true;
  photo.position.set(0, cy, 0.21);
  g.add(photo);
  g.userData.photo = photo;
  g.userData.headY = cy;
  return castAll(g);
}

// ------------------------------------------------------------- phone
export function makePhone(screenTex) {
  const g = new THREE.Group();
  const W = 3.15, H = 6.5;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRectShape(W, H, 0.5), { depth: 0.24, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 5, curveSegments: 16 }),
    phys('#22c55e', { roughness: 0.3, clearcoat: 1 })
  );
  body.position.z = -0.12;
  g.add(body);
  const bezel = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(W - 0.12, H - 0.12, 0.44), 16), std('#0d1612', { roughness: 0.3 }));
  bezel.position.z = 0.205;
  g.add(bezel);
  const sw = W - 0.38, sh = H - 0.38;
  const sg = new THREE.ShapeGeometry(roundedRectShape(sw, sh, 0.32), 16);
  const p = sg.attributes.position, uv = sg.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / sw + 0.5, p.getY(i) / sh + 0.5);
  const screen = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = 0.21;
  g.add(screen);
  const island = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(0.75, 0.2, 0.1), 8), new THREE.MeshBasicMaterial({ color: '#050806' }));
  island.position.set(0, sh / 2 - 0.22, 0.215);
  g.add(island);
  // glossy glass sheen
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(sw, sh, 0.32), 16), phys('#ffffff', { transparent: true, opacity: 0.06, roughness: 0.02, clearcoat: 1, depthWrite: false }));
  glass.position.z = 0.22;
  g.add(glass);
  g.userData.screen = screen;
  return castAll(g);
}

// ------------------------------------------------------------- food stall
export function makeStall(logoTex) {
  const g = new THREE.Group();
  const white = phys('#fffaf0', { roughness: 0.4, clearcoat: 0.3 });
  const green = phys('#16a34a', { roughness: 0.35, clearcoat: 0.6 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(4.4, 1.7, 1.8, 4, 0.14), white);
  body.position.y = 1.15;
  g.add(body);
  const band = new THREE.Mesh(new RoundedBoxGeometry(4.46, 0.34, 1.86, 3, 0.1), green);
  band.position.y = 0.45;
  g.add(band);
  const top = new THREE.Mesh(new RoundedBoxGeometry(4.7, 0.16, 2.0, 3, 0.06), phys('#d08a4a', { roughness: 0.5 }));
  top.position.y = 2.05;
  g.add(top);
  if (logoTex) {
    const lg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3 * (logoTex.image.height / logoTex.image.width)), new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, alphaTest: 0.3, roughness: 0.4 }));
    lg.material.userData.noEnv = true;
    lg.position.set(0, 1.18, 0.915);
    g.add(lg);
  }
  for (const sx of [-1.75, 1.75]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 16, 32), std('#2b2f2c', { roughness: 0.7 }));
    wheel.position.set(sx, 0.36, 0.95);
    g.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20), phys('#ffd23f'));
    hub.rotation.x = Math.PI / 2;
    hub.position.set(sx, 0.36, 0.98);
    g.add(hub);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 12), std('#e5e7eb', { metalness: 0.6, roughness: 0.3 }));
    post.position.set(sx * 1.18, 3.3, -0.55);
    g.add(post);
  }
  // glass display case on the counter
  const glass = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.9, 1.2, 2, 0.06), phys('#e6fbff', { transparent: true, opacity: 0.3, roughness: 0.05, clearcoat: 1, depthWrite: false }));
  glass.position.set(-0.6, 2.58, 0.05);
  g.add(glass);
  // striped awning with scalloped edge
  const stripeC = canvas(512, 64, (x, w, h) => {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#ffffff' : '#22c55e';
      x.fillRect((i * w) / 8, 0, w / 8, h);
    }
  });
  const stripeT = texFrom(stripeC);
  const awn = new THREE.Mesh(new RoundedBoxGeometry(5.0, 0.14, 2.3, 2, 0.05), phys('#ffffff', { map: stripeT, roughness: 0.45 }));
  awn.position.set(0, 4.55, 0.05);
  awn.rotation.x = 0.28;
  g.add(awn);
  const half = new THREE.CylinderGeometry(0.31, 0.31, 0.08, 24, 1, false, -Math.PI / 2, Math.PI);
  for (let i = 0; i < 8; i++) {
    const sc = new THREE.Mesh(half, phys(i % 2 ? '#ffffff' : '#22c55e', { roughness: 0.45 }));
    sc.rotation.x = Math.PI / 2;
    sc.position.set(-2.19 + i * 0.625, 4.22, 1.17);
    g.add(sc);
  }
  return castAll(g);
}

// ------------------------------------------------------------- pastel city
export function makeCity(seed = 11) {
  const r = rng(seed);
  const g = new THREE.Group();
  const SIZE = 48, PX = 2048, step = 6, road = 1.0;
  const toPx = (u) => ((u + SIZE / 2) / SIZE) * PX;
  const c = canvas(PX, PX, (x) => {
    x.fillStyle = '#d3dce4';
    x.fillRect(0, 0, PX, PX);
    // blocks
    for (let bx = -SIZE / 2; bx < SIZE / 2; bx += step) {
      for (let bz = -SIZE / 2; bz < SIZE / 2; bz += step) {
        const park = r() < 0.16;
        x.fillStyle = park ? '#74d391' : r() < 0.5 ? '#b3e9c4' : '#ffe8b5';
        const x0 = toPx(bx + road / 2), z0 = toPx(bz + road / 2), w = ((step - road) / SIZE) * PX;
        x.beginPath();
        x.roundRect(x0, z0, w, w, 18);
        x.fill();
      }
    }
    // canal
    x.strokeStyle = '#7cc4f2';
    x.lineWidth = 46;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(toPx(-24), toPx(-9));
    x.bezierCurveTo(toPx(-10), toPx(-12), toPx(-2), toPx(-6.5), toPx(24), toPx(-14));
    x.stroke();
    // road centre dashes
    x.strokeStyle = '#ffffff';
    x.lineWidth = 5;
    x.setLineDash([22, 22]);
    for (let u = -SIZE / 2; u <= SIZE / 2; u += step) {
      x.beginPath();
      x.moveTo(toPx(u), 0);
      x.lineTo(toPx(u), PX);
      x.stroke();
      x.beginPath();
      x.moveTo(0, toPx(u));
      x.lineTo(PX, toPx(u));
      x.stroke();
    }
    x.setLineDash([]);
  });
  // roads are the leftover background between blocks, tint them
  const tex = texFrom(c);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  ground.material.userData.noEnv = true;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);
  const pastel = ['#ffd166', '#ffadad', '#a0c4ff', '#b9fbc0', '#cdb4db', '#ffc09f', '#ffc6ff', '#fdffb6'];
  const roofs = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'];
  const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.4, 8);
  const buildings = [];
  for (let bx = -SIZE / 2; bx < SIZE / 2; bx += step) {
    for (let bz = -SIZE / 2; bz < SIZE / 2; bz += step) {
      const cx = bx + step / 2, cz = bz + step / 2;
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const w = 1.2 + r() * 1.3, d = 1.2 + r() * 1.3, h = 0.45 + r() * r() * 1.6;
        const px = cx + (r() - 0.5) * (step - road - w - 0.4), pz = cz + (r() - 0.5) * (step - road - d - 0.4);
        if (Math.hypot(px, pz) < 2.2) continue;
        const m = new THREE.Mesh(box, phys(pastel[Math.floor(r() * pastel.length)], { roughness: 0.6, clearcoat: 0.1 }));
        m.scale.set(w, h, d);
        m.position.set(px, h / 2, pz);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        const roof = new THREE.Mesh(box, phys(roofs[Math.floor(r() * roofs.length)], { roughness: 0.5 }));
        roof.scale.set(w * 0.98, 0.12, d * 0.98);
        roof.position.set(px, h + 0.06, pz);
        roof.castShadow = true;
        g.add(roof);
        buildings.push({ m, roof, x: px, z: pz, h, d: Math.hypot(px, pz) });
      }
      for (let k = 0; k < 3; k++) {
        const tx = cx + (r() < 0.5 ? -1 : 1) * (step / 2 - road / 2 - 0.35), tz = cz + (r() - 0.5) * (step - road);
        if (Math.hypot(tx, tz) < 2.0) continue;
        const crown = new THREE.Mesh(sphere, phys(r() < 0.5 ? '#4ade80' : '#22c55e', { roughness: 0.6, clearcoat: 0.2 }));
        const s = 0.32 + r() * 0.15;
        crown.scale.setScalar(s);
        crown.position.set(tx, 0.45 + s * 0.8, tz);
        crown.castShadow = true;
        g.add(crown);
        const t = new THREE.Mesh(trunk, std('#a16207'));
        t.position.set(tx, 0.2, tz);
        g.add(t);
        buildings.push({ m: crown, trunk: t, s0: s, x: tx, z: tz, h: 0.45 + s, d: Math.hypot(tx, tz), tree: true });
      }
    }
  }
  g.userData.items = buildings;
  return g;
}

// ------------------------------------------------------------- sparkle star
export function makeStar(color = '#ffe14d') {
  const s = new THREE.Shape();
  const pts = 4;
  for (let k = 0; k <= pts; k++) {
    const a = Math.PI / 2 + (k * TAU) / pts;
    const x = Math.cos(a), y = Math.sin(a);
    if (k === 0) s.moveTo(x, y);
    else {
      const am = a - Math.PI / pts;
      s.quadraticCurveTo(Math.cos(am) * 0.18, Math.sin(am) * 0.18, x, y);
    }
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -0.02);
  const m = new THREE.Mesh(geo, phys(color, { emissive: new THREE.Color(color), emissiveIntensity: 0.55, roughness: 0.2, clearcoat: 1 }));
  return m;
}
