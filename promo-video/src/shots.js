// The film: five shots on a 64-beat (30 s) loop + an overlay layer that
// carries the logo and the URL across cuts (that is what hides the loop seam).
//
//  beat  0 ........ 8 ......... 24 ........ 36 ......... 52 ........ 62 .. 64(=0)
//        HERO+hook | MAP 500 m  | FOOD deals | SELLER 0%  | CTA url    | logo fly-in
import * as THREE from 'three';
import { BEAT, mod, seg, clamp, lerp, ease, spring, wobble, impulse, popInOut, pump, rng, cue, TAU } from './util.js';
import { makeSticker, makeTextSticker, makeBadge, badgeCanvas, rowLayout, texFrom, FONT } from './sticker.js';
import { makeEgg, makeTea, makeChili, makeSkewer, makeCoin, makePin, makePhone, makeStall, makeCity, makeStar, phys, std, castAll } from './props.js';

const S = (b) => b * BEAT; // beats -> seconds

// ------------------------------------------------------------------ styles
export const ST = {
  yellow: { fill: ['#fff3a0', '#ffd43b', '#ff9f1c'], outlineColor: '#14532d' },
  green: { fill: ['#5fdc86', '#1fbf57', '#13863c'], outlineColor: '#0b3d20' },
  white: { fill: ['#ffffff', '#f1fff5', '#cdf5da'], outlineColor: '#15803d' },
  orange: { fill: ['#ffc078', '#ff7f1a', '#e8550a'], outlineColor: '#6b230a' },
  red: { fill: ['#ffa8a8', '#f03e3e', '#c41d1d'], outlineColor: '#4f0b0b' },
  blue: { fill: ['#a5d8ff', '#3b82f6', '#1d4ed8'], outlineColor: '#0b2a6b' },
};

// ------------------------------------------------------------------ helpers
function uiCam() {
  const c = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 300);
  c.position.set(0, 0, 20);
  c.lookAt(0, 0, 0);
  return c;
}
function camPump(cam, b, base = 30, amt = 0.012) {
  cam.fov = base * (1 - amt * pump(b));
  cam.updateProjectionMatrix();
}

// Reflections only where they help (glossy props); printed sticker faces opt out.
function applyEnv(root, env, k = 0.5) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.isMeshStandardMaterial || m.envMap || m.userData.noEnv) continue;
      m.envMap = env;
      m.envMapIntensity = m.userData.envK ?? k;
      m.needsUpdate = true;
    }
  });
}

function lights(scene, env, o = {}) {
  scene.add(new THREE.HemisphereLight(o.sky ?? '#ffffff', o.ground ?? '#d6efdd', o.hemi ?? 0.8));
  const key = new THREE.DirectionalLight(o.keyColor ?? '#fff5e6', o.key ?? 1.45);
  key.position.set(...(o.keyPos ?? [-3.5, 5, 16]));
  key.castShadow = o.shadow !== false;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  const e = o.extent ?? [14, 9];
  sc.left = -e[0];
  sc.right = e[0];
  sc.top = e[1];
  sc.bottom = -e[1];
  sc.near = 0.5;
  sc.far = o.far ?? 45;
  key.shadow.radius = o.radius ?? 9;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#ffffff', o.fill ?? 0.4);
  fill.position.set(9, 3, 7);
  scene.add(fill);
  return key;
}

function uiStage(env, o = {}) {
  const scene = new THREE.Scene();
  lights(scene, env, o);
  if (o.catcher !== false) {
    const c = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 45),
      new THREE.ShadowMaterial({ color: o.shadowColor ?? '#0a3a1e', opacity: o.shadowOpacity ?? 0.3 })
    );
    c.position.z = o.catcherZ ?? -0.8;
    c.receiveShadow = true;
    scene.add(c);
  }
  return scene;
}

function pop(obj, b, b0, b1 = Infinity, base = 1, out = 0.3) {
  const k = popInOut(b, b0, b1, out);
  obj.visible = k > 0.003;
  obj.scale.setScalar(Math.max(1e-4, base * k));
  return k;
}

function line(parts, o = {}) {
  const g = new THREE.Group();
  const items = parts.map((p) => makeTextSticker(p.t, { ...(p.st ?? ST.yellow), em: p.em ?? o.em ?? 1 }));
  const xs = rowLayout(items, o.gap ?? 0.12);
  items.forEach((it, i) => {
    it.position.set(xs[i], parts[i].dy ?? 0, 0);
    g.add(it);
  });
  g.userData.items = items;
  return g;
}

// word-by-word pop with a little jiggle, bump on every beat
function animLine(g, b, b0, step, b1 = Infinity, o = {}) {
  g.userData.items.forEach((it, i) => {
    const bi = b0 + i * step;
    const k = pop(it, b, bi, b1 + i * 0.06, o.base ?? 1, 0.28);
    it.rotation.z = (o.rz ?? 0) + (i % 2 ? -1 : 1) * 0.22 * wobble(S(b - bi), 2.3, 4.2);
    it.rotation.y = 0.14 * Math.sin(S(b) * 1.6 + i * 1.7);
    it.rotation.x = 0.06 * Math.sin(S(b) * 1.2 + i);
    if (k > 0.9) it.scale.multiplyScalar(1 + 0.045 * pump(b));
  });
}

function billboard(obj, cam) {
  obj.rotation.y = Math.atan2(cam.position.x - obj.position.x, cam.position.z - obj.position.z);
}

class Confetti {
  constructor(scene, n, seed, origin, o = {}) {
    const geo = new THREE.PlaneGeometry(0.17, 0.27);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    const pal = o.palette ?? ['#22c55e', '#ffd43b', '#ff6b6b', '#ffffff', '#ff922b', '#4dabf7', '#f783ac', '#a3e635'];
    const r = rng(seed);
    this.p = [];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const sp = (o.speed ?? 9) * (0.35 + r() * 0.9);
      this.p.push({
        vx: Math.cos(a) * sp * (o.sx ?? 1),
        vy: Math.sin(a) * sp * 0.75 + (o.lift ?? 4) * (0.4 + r() * 0.8),
        vz: (r() - 0.2) * sp * 0.35,
        ax: r() - 0.5, ay: r() - 0.5, az: r() - 0.5,
        w: 5 + r() * 9, ph: r() * TAU, s: 0.7 + r() * 0.8,
      });
      this.mesh.setColorAt(i, new THREE.Color(pal[i % pal.length]));
    }
    this.origin = origin;
    this.life = o.life ?? 2.4;
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }
  update(tau) {
    const vis = tau >= 0 && tau < this.life;
    this.mesh.visible = vis;
    if (!vis) return;
    const k = 2.0, g = 7.5, term = g / k;
    const e = (1 - Math.exp(-k * tau)) / k;
    const d = this.dummy;
    this.p.forEach((q, i) => {
      d.position.set(
        this.origin.x + q.vx * e + 0.3 * Math.sin(3.1 * tau + q.ph) * seg(tau, 0.2, 1),
        this.origin.y + (q.vy + term) * e - term * tau,
        this.origin.z + q.vz * e
      );
      d.rotation.set(q.ax * q.w * tau + q.ph, q.ay * q.w * tau, q.az * q.w * tau);
      const fade = 1 - seg(tau, this.life - 0.6, this.life);
      d.scale.setScalar(q.s * fade * Math.min(1, tau * 14));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// twinkling stars that pop on a beat grid
function sparkles(scene, defs) {
  const stars = defs.map((d) => {
    const m = makeStar(d.color ?? '#ffe14d');
    m.position.set(d.x, d.y, d.z ?? 0.5);
    m.userData = d;
    scene.add(m);
    return m;
  });
  return (b) => {
    for (const m of stars) {
      const d = m.userData;
      const per = d.per ?? 2;
      const k = seg(mod(b - d.b0, per), 0, 0.85);
      const on = b >= d.b0 && b < (d.b1 ?? Infinity);
      const s = on ? (d.s ?? 0.5) * Math.pow(Math.sin(Math.PI * k), 0.6) : 0;
      m.visible = s > 0.01;
      m.scale.setScalar(Math.max(1e-4, s));
      m.rotation.z = k * 1.2;
    }
  };
}

// ------------------------------------------------------------------ canvases
function globeIcon(ctx, x, y, size) {
  const r = size * 0.4;
  const cx = x + r * 0.9;
  ctx.save();
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(cx, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.065;
  ctx.beginPath();
  ctx.ellipse(cx, y, r * 0.42, r * 0.82, 0, 0, TAU);
  ctx.moveTo(cx - r * 0.82, y);
  ctx.lineTo(cx + r * 0.82, y);
  ctx.moveTo(cx - r * 0.7, y - r * 0.42);
  ctx.quadraticCurveTo(cx, y - r * 0.3, cx + r * 0.7, y - r * 0.42);
  ctx.moveTo(cx - r * 0.7, y + r * 0.42);
  ctx.quadraticCurveTo(cx, y + r * 0.3, cx + r * 0.7, y + r * 0.42);
  ctx.stroke();
  ctx.restore();
}

function urlCanvas() {
  return badgeCanvas('honaratipwork45.github.io/aroijang', {
    size: 88, weight: 700, bg: ['#ffffff', '#eefcf2'], fg: '#14532d',
    ring: 11, ringColor: '#16a34a', outer: 14, padX: 44, padY: 30, icon: globeIcon,
  });
}

// A menu card drawn like the real cards on the website.
function cardCanvas(img, it) {
  const W = 600, H = 830, R = 44, K2 = 2;
  const c = document.createElement('canvas');
  c.width = W * K2;
  c.height = H * K2;
  const x = c.getContext('2d');
  x.scale(K2, K2);
  x.beginPath();
  x.roundRect(0, 0, W, H, R);
  x.fillStyle = '#ffffff';
  x.fill();
  x.save();
  x.beginPath();
  x.roundRect(14, 14, W - 28, 548, [34, 34, 18, 18]);
  x.clip();
  const sw = img.width, sh = img.height, ph = 548, pw = W - 28;
  const sc = Math.max(pw / sw, ph / sh);
  x.drawImage(img, 14 + (pw - sw * sc) / 2, 14 + (ph - sh * sc) / 2, sw * sc, sh * sc);
  x.restore();
  // tag pill
  if (it.tag) {
    x.font = `700 30px ${FONT}`;
    const tw = x.measureText(it.tag).width;
    x.beginPath();
    x.roundRect(34, 34, tw + 36, 50, 25);
    x.fillStyle = it.tag === 'ใหม่' ? '#16a34a' : '#dc2626';
    x.fill();
    x.fillStyle = '#fff';
    x.fillText(it.tag, 52, 70);
  }
  // heart
  x.beginPath();
  x.arc(W - 70, 70, 32, 0, TAU);
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.fill();
  x.strokeStyle = '#5b6b60';
  x.lineWidth = 4;
  x.beginPath();
  const hx = W - 70, hy = 74;
  x.moveTo(hx, hy + 11);
  x.bezierCurveTo(hx - 22, hy - 2, hx - 12, hy - 20, hx, hy - 8);
  x.bezierCurveTo(hx + 12, hy - 20, hx + 22, hy - 2, hx, hy + 11);
  x.stroke();
  // name (shrink to fit)
  let fs = 46;
  x.font = `700 ${fs}px ${FONT}`;
  while (x.measureText(it.n).width > W - 64 && fs > 30) {
    fs -= 2;
    x.font = `700 ${fs}px ${FONT}`;
  }
  x.fillStyle = '#1a2e22';
  x.fillText(it.n, 32, 628);
  // stars + rating
  x.font = `700 34px ${FONT}`;
  x.fillStyle = '#f59e0b';
  x.fillText('★★★★★', 32, 684);
  x.font = `500 28px ${FONT}`;
  x.fillStyle = '#5b6b60';
  x.fillText(`${it.r} · ขายแล้ว ${it.s.toLocaleString('en-US')}`, 222, 682);
  // prices
  x.font = `600 34px ${FONT}`;
  x.fillStyle = '#9aa59d';
  const was = `฿${it.was}`;
  x.fillText(was, 32, 776);
  const ww = x.measureText(was).width;
  x.strokeStyle = '#9aa59d';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(30, 764);
  x.lineTo(34 + ww, 764);
  x.stroke();
  x.font = `800 74px ${FONT}`;
  x.fillStyle = '#dc2626';
  x.fillText(`฿${it.p}`, 44 + ww, 784);
  const pw2 = x.measureText(`฿${it.p}`).width;
  x.font = `500 28px ${FONT}`;
  x.fillStyle = '#5b6b60';
  x.fillText('/ จาน', 56 + ww + pw2, 782);
  // + button
  x.beginPath();
  x.roundRect(W - 112, H - 122, 80, 80, 22);
  x.fillStyle = '#16a34a';
  x.fill();
  x.strokeStyle = '#fff';
  x.lineWidth = 8;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(W - 72, H - 102);
  x.lineTo(W - 72, H - 62);
  x.moveTo(W - 92, H - 82);
  x.lineTo(W - 52, H - 82);
  x.stroke();
  return c;
}

// ================================================================== HERO
// hb = beats relative to the logo slam (B = 0). Runs hb ∈ [-2, 8).
function buildHero(A) {
  const ui = uiStage(A.env);
  const cam = uiCam();
  const foods = [
    { o: makeEgg(2), p: [-7.0, 2.6, 0.2], s: 0.92, r: [1.12, 0.2, 0.25], spin: 0.5 },
    { o: makeChili(), p: [-7.1, -2.3, 0.6], s: 0.95, r: [0.15, 0.4, -0.55], spin: 0 },
    { o: makeTea(A.tex.logoFlat), p: [7.45, 2.15, 0.1], s: 0.95, r: [0.22, 0, -0.12], spin: 0.6 },
    { o: makeSkewer(4), p: [-3.9, -3.85, 0.9], s: 0.72, r: [0.35, 0.3, 1.15], spin: 0 },
    { o: makeCoin(), p: [4.35, 3.95, 0.6], s: 1.0, r: [0.3, 0, 0.2], spin: 2.4 },
    { o: makeCoin(), p: [-4.1, 4.15, -0.1], s: 0.82, r: [0.2, 0, -0.3], spin: -2.0 },
  ];
  foods.forEach((f) => ui.add(f.o));
  const peace = A.stk.peace.clone();
  const angry = A.stk.angry.clone();
  ui.add(peace, angry);
  const hook = line([{ t: 'หิวแล้ว', em: 1.9 }], {});
  const hook2 = line([{ t: 'ใช่มั้ย?', em: 1.9 }], {});
  ui.add(hook, hook2);
  const spark = sparkles(ui, [
    { x: -5.3, y: 0.6, b0: 0.5, s: 0.42 }, { x: 3.4, y: -3.9, b0: 1.5, s: 0.5 },
    { x: 2.6, y: 3.0, b0: 1.0, s: 0.38, color: '#ffffff' }, { x: -2.2, y: -4.4, b0: 0, s: 0.35, color: '#ffffff' },
    { x: 8.4, y: -0.6, b0: 0.25, s: 0.45 }, { x: -8.6, y: 0.3, b0: 1.25, s: 0.38 },
  ]);
  cue(0, 'crash');
  cue(0, 'slam', 1.0);
  cue(0, 'confetti', 0.8);
  cue(1, 'pop', 0.9, 0.5);
  cue(3.65, 'flip', 0.8, 0.5);
  cue(4, 'slam', 0.8);
  cue(4, 'boing', 0.7, 0.4);
  cue(5, 'pop2', 1.0, -0.2);
  cue(7.3, 'whoosh', 0.9);

  return {
    name: 'hero',
    ui,
    cam,
    bg(hb) {
      const t = S(hb);
      const hook = hb >= 4 ? 1 : 0;
      const tick = hook ? (Math.PI / 18) * ease.outCubic(mod(hb, 1)) + (Math.PI / 18) * Math.floor(hb - 4) : 0;
      return {
        colA: '#30d16b', colB: '#1fb85a', glow: '#f5fff3',
        glowR: 0.55 + 0.05 * pump(hb), glowAmt: 0.72, rays: 18, rayAmt: 1,
        rot: 0.12 * t + 1.4 * Math.pow(seg(hb, -2, 0), 2) + tick,
        dots: 0.11, dotScale: 12, drift: [0.3 * t, 0.12 * t],
        speed: hb < 0 ? 0.9 * seg(hb, -2, -0.6) : 0.9 * (1 - seg(hb, 0, 0.5)),
        seed: Math.floor(hb * 4),
        vign: 0.32,
      };
    },
    update(hb) {
      const t = S(hb);
      camPump(cam, hb);
      foods.forEach((f, i) => {
        const ox = 0.22 * Math.cos(t * 1.1 + i * 1.3), oy = 0.2 * Math.sin(t * 1.4 + i * 2.1) + 0.12 * pump(hb + i * 0.25);
        f.o.rotation.set(f.r[0] + 0.12 * Math.sin(t * 1.3 + i), f.r[1] + f.spin * t + 0.2 * Math.sin(t + i), f.r[2] + 0.1 * Math.sin(t * 1.7 + i));
        if (hb < 0) {
          // implode: everything gets sucked into the logo before the slam
          const k = ease.inCubic(seg(hb, -1.7 + i * 0.05, -0.05));
          f.o.visible = hb > -1.7 + i * 0.05 && k < 0.98;
          f.o.position.set(lerp(f.p[0] * 2.1, 0, k), lerp(f.p[1] * 2.1, 0.3, k), lerp(f.p[2], -0.5, k));
          f.o.scale.setScalar(Math.max(1e-4, f.s * (1 - 0.8 * k)));
          f.o.rotation.z += 3 * k;
          return;
        }
        const k = spring(t - i * 0.04, 1.9, 0.5);
        f.o.visible = k > 0.002;
        f.o.position.set(lerp(0, f.p[0], k) + ox, lerp(0.3, f.p[1], k) + oy, lerp(-0.5, f.p[2], k));
        f.o.scale.setScalar(Math.max(1e-4, f.s * Math.min(1, k * 1.4)));
      });
      // peace pops in, then flips to the hungry face
      const kp = pop(peace, hb, 1, Infinity, 1);
      const flip = seg(hb, 3.6, 3.9);
      peace.visible = kp > 0.003 && flip < 1;
      peace.position.set(6.95, -1.95 + 0.12 * pump(hb), 1.0);
      peace.rotation.set(0, (Math.PI / 2) * ease.inQuad(flip), 0.06 * Math.sin(t * 3.2) + 0.25 * wobble(S(hb - 1), 2, 4));
      const ta = S(hb - 3.9);
      angry.visible = hb >= 3.9;
      angry.scale.setScalar(1);
      const shake = hb >= 4 ? 0.07 * Math.sin(t * 55) * (0.4 + 0.6 * pump(hb, 5)) : 0;
      angry.position.set(6.0 + shake, -2.2 + 0.22 * pump(hb), 1.2);
      angry.rotation.set(0, -(Math.PI / 2) * (1 - spring(ta, 2.4, 0.42)), (Math.floor(hb) % 2 ? -0.06 : 0.06) * (hb >= 4 ? 1 : 0));
      hook.position.set(-2.3, 0.95, 1.4);
      hook2.position.set(-1.0, -1.75, 1.6);
      animLine(hook, hb, 4, 0, Infinity, { rz: -0.07 });
      animLine(hook2, hb, 5, 0, Infinity, { rz: 0.05 });
      spark(hb);
    },
  };
}

// ================================================================== MAP
// Pins sit every 45° around "you"; a radar sweep turns once per bar and
// each pin pops exactly when the sweep reaches it (one per half beat).
const PIN_PHOTOS = ['m01', 'm05', 'm08', 'm16', 'm06', 'm09', 'm02', 'm15'];
const PIN_R = [3.14, 3.9, 3.0, 4.2, 2.9, 4.1, 3.0, 3.7];
const PIN_A0 = (217.2 * Math.PI) / 180;
const PIN_B0 = 6; // map beat of the first pin
const PIN_DEFS = PIN_PHOTOS.map((photo, i) => {
  const a = PIN_A0 + (i * Math.PI) / 4;
  return { x: PIN_R[i] * Math.cos(a), z: -PIN_R[i] * Math.sin(a), photo, a };
});

function sweepMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { col: { value: new THREE.Color('#3b82f6') }, len: { value: 1.25 }, op: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vP; uniform vec3 col; uniform float len, op;
      void main(){
        float a = atan(vP.y, vP.x); if (a < 0.0) a += 6.2831853;
        float k = a / len; if (k > 1.0) discard;
        float r = length(vP) / 5.0;
        float alpha = (pow(k, 2.2) * 0.42 + smoothstep(0.985, 1.0, k) * 0.5) * op * smoothstep(1.0, 0.93, r);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
}

function buildMap(A) {
  const scene = new THREE.Scene();
  const key = lights(scene, A.env, { keyPos: [-9, 16, 10], extent: [16, 16], far: 60, radius: 6, key: 2.2, hemi: 1.5 });
  scene.fog = new THREE.Fog('#d9ece0', 36, 64);
  const cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 300);
  const city = makeCity(11);
  for (const it of city.userData.items) {
    const nearPin = PIN_DEFS.some((p) => Math.hypot(p.x - it.x, p.z - it.z) < 1.3) || Math.hypot(it.x - 4.07, it.z - 2.9) < 1.6;
    if (nearPin) {
      it.m.visible = false;
      if (it.roof) it.roof.visible = false;
      if (it.trunk) it.trunk.visible = false;
    }
  }
  scene.add(city);
  // you-are-here
  const here = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.38, 48), std('#2563eb', { emissive: new THREE.Color('#1d4ed8'), emissiveIntensity: 0.3 }));
  const dotRing = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.52, 48), std('#ffffff'));
  [dot, dotRing].forEach((m) => { m.rotation.x = -Math.PI / 2; m.position.y = 0.06; here.add(m); });
  const pulses = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05;
    here.add(m);
    return m;
  });
  scene.add(here);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.18, 40), phys('#ffffff', { roughness: 0.3 }));
  base.position.y = 0.09;
  base.castShadow = base.receiveShadow = true;
  scene.add(base);
  const peace = A.stk.peaceSmall.clone();
  scene.add(peace);
  // 500 m radius + radar sweep
  const R = 5;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(R, 128), new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.16, depthWrite: false }));
  const edge = new THREE.Mesh(new THREE.RingGeometry(R - 0.07, R + 0.07, 192), new THREE.MeshBasicMaterial({ color: '#2563eb' }));
  const radial = new THREE.Mesh(new THREE.PlaneGeometry(R, 0.08), new THREE.MeshBasicMaterial({ color: '#2563eb' }));
  const ring = new THREE.Group();
  [fill, edge].forEach((m) => { m.rotation.x = -Math.PI / 2; ring.add(m); });
  radial.rotation.x = -Math.PI / 2;
  radial.position.x = R / 2;
  const radialPivot = new THREE.Group();
  radialPivot.add(radial);
  radialPivot.rotation.y = -0.62;
  ring.add(radialPivot);
  const sweepMat = sweepMaterial();
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(R, 96, 0, 1.25), sweepMat);
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = 0.01;
  const sweepPivot = new THREE.Group();
  sweepPivot.add(sweep);
  ring.add(sweepPivot);
  ring.position.y = 0.04;
  scene.add(ring);
  const label = makeBadge('500 ม.', { bg: ['#74b9ff', '#2563eb'], size: 90, em: 0.85, ring: 0, outer: 10, weight: 800 });
  const la = -0.62;
  const labelPos = new THREE.Vector3(Math.cos(la) * R, 0.75, -Math.sin(la) * R);
  scene.add(label);
  // pins
  const pins = PIN_DEFS.map((d) => {
    const p = makePin(A.tex[d.photo]);
    p.position.set(d.x, 0, d.z);
    p.rotation.order = 'YXZ';
    scene.add(p);
    return p;
  });
  // UI text
  const ui = uiStage(A.env, { shadowOpacity: 0.22 });
  const uicam = uiCam();
  const l1 = line([{ t: 'เปิดแผนที่', st: ST.blue, em: 0.95 }, { t: 'เห็นร้านใกล้ตัว', st: ST.green, em: 0.95 }], { gap: 0.14 });
  const l2 = line([{ t: 'ในระยะ', st: ST.green, em: 0.95 }, { t: '500', st: ST.orange, em: 1.55 }, { t: 'เมตร!', st: ST.green, em: 0.95 }], { gap: 0.14 });
  // soft white haze behind the headline so it reads over the busy map
  const hazeC = document.createElement('canvas');
  hazeC.width = 4;
  hazeC.height = 256;
  const hx = hazeC.getContext('2d');
  const hg = hx.createLinearGradient(0, 0, 0, 256);
  hg.addColorStop(0, 'rgba(255,255,255,0.6)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  hx.fillStyle = hg;
  hx.fillRect(0, 0, 4, 256);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(26, 4.2), new THREE.MeshBasicMaterial({ map: texFrom(hazeC), transparent: true, depthWrite: false, toneMapped: false }));
  haze.position.set(0, 3.9, -1.0);
  ui.add(haze, l1, l2);
  // camera path: orbit params at m (beats from shot start)
  const T0 = new THREE.Vector3(0, 0, -1.2);
  const orbit = (m) => {
    const k = ease.outCubic(seg(m, -0.6, 2.2));
    const yaw = lerp(0.9, -0.24, k) + 0.034 * Math.max(0, m - 2);
    const pitch = lerp(1.32, 0.98, k) + 0.012 * Math.max(0, m - 2);
    const dist = lerp(36, 24.5, k) - 0.22 * Math.max(0, m - 2);
    return { yaw, pitch, dist };
  };
  const camAt = (m, out) => {
    const o = orbit(m);
    out.set(T0.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, T0.y + Math.sin(o.pitch) * o.dist, T0.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
    return out;
  };
  // dive target: photo of pin 0, facing the camera position at the start of the dive
  const DIVE0 = 12;
  const camStart = camAt(DIVE0, new THREE.Vector3());
  const pin0 = pins[0];
  const yaw0 = Math.atan2(camStart.x - pin0.position.x, camStart.z - pin0.position.z);
  const lean = -0.42;
  const pinScale = 0.95;
  const eul = new THREE.Euler(lean, yaw0, 0, 'YXZ');
  const nrm = new THREE.Vector3(0, 0, 1).applyEuler(eul);
  const headW = new THREE.Vector3(pin0.position.x, 0, pin0.position.z).add(new THREE.Vector3(0, 1.3 * pinScale, 0).applyEuler(eul));
  const photoC = headW.clone().addScaledVector(nrm, 0.2 * pinScale);
  const camEnd = photoC.clone().addScaledVector(nrm, 1.05);
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
  // radar: leading edge angle reaches pin i at beat PIN_B0 + i/2
  const OMEGA = Math.PI / 2; // rad per beat (one turn per bar)
  const sweepAngle = (m) => PIN_A0 - 1.25 + OMEGA * (m - PIN_B0);

  cue(8, 'whoosh', 0.8);
  cue(8.4, 'cascade', 0.9);
  cue(8.75, 'pop', 0.6, -0.3);
  cue(9.25, 'pop', 0.6, 0.3);
  cue(10, 'whoosh', 0.6);
  cue(10.75, 'ding', 0.8, 0.4);
  cue(11, 'pop2', 0.8, -0.2);
  cue(11.5, 'boing', 0.8, 0);
  cue(12, 'pop2', 0.8, 0.2);
  cue(12.4, 'ping', 0.8);
  cue(13.4, 'ping', 0.5);
  PIN_DEFS.forEach((d, i) => cue(8 + PIN_B0 + i * 0.5, 'drop', 0.75, clamp(d.x / 6, -1, 1)));
  cue(20, 'riser', 0.7);
  cue(23.6, 'whoosh', 1.0);

  return {
    name: 'map',
    scene3d: scene,
    cam3d: cam,
    ui,
    cam: uicam,
    bg(m) {
      return { colA: '#dcefe2', colB: '#cbe8d4', glow: '#ffffff', glowAmt: 0.0, rays: 12, rayAmt: 0.5, rot: S(m) * 0.1, dots: 0.0, vign: 0.18 };
    },
    update(m) {
      const t = S(m);
      // camera
      if (m < DIVE0) {
        camAt(m, tmpP);
        tmpT.copy(T0);
      } else {
        const kk = Math.pow(seg(m, DIVE0, 15.65), 2.4);
        camAt(m, tmpP).lerp(camEnd, kk);
        tmpT.copy(T0).lerp(photoC, ease.outCubic(seg(m, DIVE0, 14.5)));
      }
      cam.position.copy(tmpP);
      cam.lookAt(tmpT);
      cam.fov = 34 * (1 - 0.012 * pump(m));
      cam.updateProjectionMatrix();
      // city pops in as a wave from the centre
      for (const it of city.userData.items) {
        if (!it.m.visible) continue;
        const k = spring(t - S(0.4) - it.d * 0.035, 2.4, 0.45);
        const sy = Math.max(1e-4, k);
        if (it.tree) {
          it.m.scale.setScalar(Math.max(1e-4, k * it.s0));
          it.trunk.scale.setScalar(Math.max(1e-4, Math.min(1, k)));
        } else {
          it.m.scale.y = it.h * sy;
          it.m.position.y = (it.h * sy) / 2;
          if (it.roof) it.roof.position.y = it.h * sy + 0.06;
        }
      }
      // you-are-here pulses
      pulses.forEach((p, i) => {
        const ph = mod(m * 0.5 + i / 3, 1);
        p.scale.setScalar(0.4 + ph * 2.4);
        p.material.opacity = 0.55 * (1 - ph) * seg(m, 0, 0.6);
      });
      pop(base, m, 0.5, Infinity, 1);
      const kp = popInOut(m, 0.75);
      peace.visible = kp > 0.003;
      peace.scale.setScalar(Math.max(1e-4, kp));
      peace.position.set(0, 0.18 + (peace.userData.h / 2) * kp + 0.14 * pump(m), 0);
      billboard(peace, cam);
      peace.rotation.z = 0.05 * Math.sin(t * 3);
      // radius ring grows, then breathes on the beat
      const kr = m < 2 ? 0 : spring(S(m - 2), 1.6, 0.42);
      ring.visible = kr > 0.002;
      ring.scale.setScalar(Math.max(1e-4, kr * (1 + 0.012 * pump(m))));
      fill.material.opacity = 0.15 + 0.07 * pump(m);
      sweepPivot.rotation.y = sweepAngle(m);
      sweepMat.uniforms.op.value = seg(m, 3.6, 4.6) * (1 - 0.55 * seg(m, 10, 11)) * (1 - seg(m, DIVE0, DIVE0 + 1));
      sweep.visible = m > 3.6 && m < DIVE0 + 1;
      const kl = pop(label, m, 2.75, Infinity, 1);
      label.position.copy(labelPos);
      label.position.y = 1.1 + 0.1 * pump(m) + (1 - kl) * 0.6;
      billboard(label, cam);
      label.rotation.z = 0.2 * wobble(S(m - 2.75), 2, 4);
      // pins pop when the sweep reaches them
      pins.forEach((p, i) => {
        const b0 = PIN_B0 + i * 0.5;
        const tau = S(m - b0);
        const k = spring(tau, 2.2, 0.38);
        p.visible = m >= b0;
        const drop = (1 - clamp(tau / 0.2)) * 4.0;
        p.position.y = Math.max(0, drop * (1 - ease.outQuad(clamp(tau / 0.2))));
        const sq = 0.2 * wobble(tau - 0.2, 3, 6) + 0.05 * pump(m) * (tau > 0.6 ? 1 : 0);
        p.scale.set(pinScale * (1 + sq) * Math.min(1, k + 0.2), pinScale * (1 - sq) * Math.min(1, k + 0.2), pinScale);
        if (i === 0 && m >= DIVE0) p.rotation.set(lean, yaw0, 0);
        else p.rotation.set(lean + 0.06 * Math.sin(t * 2 + i), Math.atan2(cam.position.x - p.position.x, cam.position.z - p.position.z), 0.05 * Math.sin(t * 2.6 + i));
      });
      // text
      uicam.fov = 30;
      uicam.updateProjectionMatrix();
      l1.position.set(0, 3.95, 0.8);
      l2.position.set(0, 2.45, 0.9);
      animLine(l1, m, 0.75, 0.5, DIVE0 - 0.25);
      animLine(l2, m, 3.0, 0.5, DIVE0 - 0.15);
      key.position.set(-9, 16, 10);
    },
  };
}

// ================================================================== FOOD
const CARDS = [
  { img: 'm01', n: 'ข้าวกะเพราหมูสับไข่ดาว', p: 60, was: 100, o: 40, r: 4.9, s: 1200, tag: 'ขายดี' },
  { img: 'm05', n: 'ตำไทยไข่เค็ม', p: 55, was: 110, o: 50, r: 4.9, s: 1320, tag: 'ขายดี' },
  { img: 'm16', n: 'ข้าวเหนียวมะม่วง', p: 40, was: 60, o: 35, r: 4.9, s: 1320, tag: 'ใหม่' },
];

function buildFood(A) {
  const ui = uiStage(A.env, { shadowColor: '#5c3500', shadowOpacity: 0.26 });
  const cam = uiCam();
  const CH = 5.4;
  const badges = [];
  const cards = CARDS.map((it) => {
    const cv = cardCanvas(A.tex[it.img].image, it);
    const card = makeSticker(cv, { height: CH, depth: 0.16, bevel: 0.04, side: '#ffffff', grid: 360, clearcoat: 0.3, roughness: 0.5, lit: 0.36, glow: 0.6 });
    const badge = makeBadge(`ลด ${it.o}%`, { bg: ['#ff6b6b', '#d91f1f'], size: 84, em: 0.44, ring: 0, outer: 8, weight: 800 });
    const k = CH / 830;
    badge.position.set(-300 * k + 0.2 + badge.userData.w / 2, CH / 2 - 562 * k + 0.1 + badge.userData.h / 2, 0.16);
    card.add(badge);
    badges.push(badge);
    ui.add(card);
    return card;
  });
  const SLOTS = [
    { x: -5.35, y: 0.0, z: 0.0, rz: 0.075, ry: 0.2, s: 1.0 },
    { x: 0.0, y: 0.3, z: 0.5, rz: 0.0, ry: 0.0, s: 1.04 },
    { x: 5.35, y: 0.0, z: 0.0, rz: -0.075, ry: -0.2, s: 1.0 },
  ];
  const title = line([{ t: 'เมนูเด็ด', st: ST.green, em: 1.05 }, { t: 'ราคาเบาๆ', st: ST.red, em: 1.05 }], { gap: 0.12 });
  const tag = line([{ t: 'อร่อยครบทุกจาน!', st: ST.green, em: 1.15 }]);
  ui.add(title, tag);
  const deco = [
    { o: makeEgg(9), p: [-8.25, 2.55, -0.4], s: 0.85, r: [1.1, 0, 0.3], b0: 6 },
    { o: makeChili(), p: [8.45, 2.7, -0.3], s: 0.85, r: [0.2, 0.3, 0.6], b0: 6.5 },
    { o: makeTea(A.tex.logoFlat), p: [8.3, -2.9, -0.2], s: 0.8, r: [0.2, -0.4, 0.1], b0: 7 },
    { o: makeSkewer(6), p: [-8.4, -2.8, -0.2], s: 0.62, r: [0.3, 0.2, -0.9], b0: 7.5 },
  ];
  deco.forEach((d) => ui.add(d.o));
  const spark = sparkles(ui, [
    { x: -2.6, y: 2.3, b0: 4, s: 0.4 }, { x: 2.7, y: 2.1, b0: 4.5, s: 0.45, color: '#ffffff' },
    { x: 7.6, y: 0.6, b0: 5, s: 0.38 }, { x: -7.6, y: 0.4, b0: 5.5, s: 0.38, color: '#ffffff' },
    { x: 0, y: -3.2, b0: 8, s: 0.5 },
  ]);
  const B0 = 24;
  cue(B0 + 0.0, 'whoosh', 0.7);
  cue(B0 + 0.75, 'pop', 0.8, -0.2);
  cue(B0 + 1.25, 'pop2', 0.8, 0.2);
  cue(B0 + 2, 'swish', 0.9, 0.6);
  cue(B0 + 3, 'swish', 0.9, 0.6);
  cue(B0 + 4, 'stamp', 1, -0.6);
  cue(B0 + 4.5, 'stamp', 1, 0);
  cue(B0 + 5, 'stamp', 1, 0.6);
  deco.forEach((d) => cue(B0 + d.b0, 'pop', 0.55, d.p[0] > 0 ? 0.7 : -0.7));
  cue(B0 + 8, 'slam', 0.9);
  cue(B0 + 8, 'confetti', 0.7);
  cue(B0 + 11.3, 'whoosh', 0.9);

  return {
    name: 'food',
    ui,
    cam,
    bg(f) {
      const t = S(f);
      return {
        colA: '#ffd25e', colB: '#ffc233', glow: '#fff6dc', glowR: 0.6, glowAmt: 0.45,
        rays: 20, rayAmt: 1, rot: -0.1 * t, dots: 0.16, dotScale: 13, drift: [-0.25 * t, 0.15 * t],
        speed: 0, vign: 0.28,
      };
    },
    update(f) {
      const t = S(f);
      camPump(cam, f);
      // card 0: starts as the full-frame photo (match cut from the map pin)
      const c0 = cards[0];
      const zoomK = ease.outExpo(seg(f, 0, 1.5));
      const photoY = CH / 2 - 288 * (CH / 830);
      const s0 = lerp(5.6, 1.12, zoomK);
      let x0 = 0, y0 = lerp(-photoY * 5.6, 0.3, zoomK), z0 = 0.5, rz0 = 0, ry0 = 0, ss0 = s0;
      if (f >= 2) {
        const k = spring(S(f - 2), 2.2, 0.5);
        x0 = lerp(0, SLOTS[0].x, k);
        y0 = lerp(0.3, SLOTS[0].y, k);
        z0 = lerp(0.5, SLOTS[0].z, k);
        rz0 = lerp(0, SLOTS[0].rz, k);
        ry0 = lerp(0, SLOTS[0].ry, k);
        ss0 = lerp(1.12, SLOTS[0].s, k);
      }
      c0.visible = true;
      c0.position.set(x0, y0 + 0.08 * pump(f), z0);
      c0.rotation.set(0.03 * Math.sin(t * 1.3), ry0 + 0.05 * Math.sin(t * 1.1), rz0);
      c0.scale.setScalar(ss0);
      // cards 1, 2 whip in
      [1, 2].forEach((i) => {
        const c = cards[i];
        const b0 = i + 1;
        const tau = S(f - b0);
        const k = spring(tau, 2.1, 0.48);
        c.visible = f >= b0 - 0.05;
        const from = i === 1 ? { x: 14, y: 1.5, ry: -2.6 } : { x: 6, y: -10, ry: 1.8 };
        const sl = SLOTS[i];
        c.position.set(lerp(from.x, sl.x, k), lerp(from.y, sl.y, k) + 0.08 * pump(f + i * 0.33), sl.z);
        c.rotation.set(0.03 * Math.sin(t * 1.2 + i), lerp(from.ry, sl.ry, ease.outCubic(clamp(tau / 0.45))) + 0.05 * Math.sin(t * 1.1 + i), sl.rz + 0.2 * wobble(tau - 0.3, 2, 5));
        c.scale.setScalar(sl.s);
      });
      // discount badges stamp in
      badges.forEach((b, i) => {
        const b0 = 4 + i * 0.5;
        const tau = S(f - b0);
        b.visible = f >= b0;
        const k = tau < 0 ? 0 : 1 + 0.9 * Math.exp(-tau * 14) * Math.cos(tau * 30);
        b.scale.setScalar(Math.max(1e-4, k * (1 + 0.06 * pump(f))));
        b.rotation.z = -0.12 + 0.3 * Math.exp(-tau * 10);
        b.position.z = 0.16 + 0.6 * Math.exp(-tau * 12);
      });
      title.position.set(0, 3.95, 1.2);
      animLine(title, f, 0.75, 0.5);
      tag.position.set(0, -4.1, 1.6);
      animLine(tag, f, 8, 0);
      deco.forEach((d, i) => {
        const k = pop(d.o, f, d.b0, Infinity, d.s);
        d.o.position.set(d.p[0] + 0.15 * Math.sin(t * 1.3 + i), d.p[1] + 0.18 * Math.sin(t * 1.7 + i * 2) + 0.12 * pump(f + i * 0.25), d.p[2]);
        d.o.rotation.set(d.r[0] + 0.1 * Math.sin(t + i), d.r[1] + 0.6 * t, d.r[2] + 0.1 * Math.sin(t * 1.4 + i));
        void k;
      });
      spark(f);
    },
  };
}

// ================================================================== SELLER
function buildSeller(A) {
  const scene = new THREE.Scene();
  const key = lights(scene, A.env, { keyPos: [-7, 12, 12], extent: [10, 10], far: 50, radius: 7, key: 1.5, hemi: 0.8 });
  void key;
  const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 300);
  // round diorama platform
  const plat = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 0.5, 96), phys('#fffaf0', { roughness: 0.5, clearcoat: 0.2 }));
  top.position.y = -0.25;
  top.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(7.32, 7.0, 0.6, 96), phys('#22c55e', { roughness: 0.35, clearcoat: 0.8 }));
  rim.position.y = -0.62;
  rim.receiveShadow = true;
  plat.add(top, rim);
  scene.add(plat);
  const stall = makeStall(A.tex.logoFlat);
  stall.position.set(-2.9, 0, -0.8);
  stall.rotation.y = 0.32;
  stall.scale.setScalar(0.92);
  scene.add(stall);
  const hug = A.stk.hug.clone();
  scene.add(hug);
  // coins flying into the bag (3D)
  const coins3 = Array.from({ length: 4 }, () => {
    const c = makeCoin();
    c.scale.setScalar(0.62);
    scene.add(c);
    return c;
  });
  // coin rain that piles up on the platform
  const rain = Array.from({ length: 12 }, (_, i) => {
    const c = makeCoin();
    const r = rng(300 + i);
    c.scale.setScalar(0.6);
    c.userData = { x: -4.6 + r() * 9.4, z: 1.7 + r() * 2.6, land: 8.5 + i * 0.5, yaw: r() * 6, w: 6 + r() * 6, ph: r() * 6 };
    scene.add(c);
    return c;
  });
  const ui = uiStage(A.env, { shadowOpacity: 0.24 });
  const uicam = uiCam();
  const l1 = line([{ t: 'ร้านค้า', st: ST.green, em: 1.05 }, { t: 'มาขายกับเรา', st: ST.yellow, em: 1.05 }], { gap: 0.25 });
  const l2 = line([{ t: 'ไม่เก็บค่าคอม', st: ST.red, em: 1.2 }]);
  const zero = line([{ t: '0%', st: { ...ST.yellow, border: 11, outline: 9 }, em: 4.0 }]);
  const l3 = line([{ t: 'ขายได้เท่าไหร่', st: ST.green, em: 1.0 }, { t: 'ได้เต็มๆ!', st: ST.yellow, em: 1.25 }], { gap: 0.25 });
  ui.add(l1, l2, zero, l3);
  // coin burst around "0%" (UI space)
  const burst = Array.from({ length: 16 }, (_, i) => {
    const c = makeCoin();
    const r = rng(100 + i);
    c.userData = { a: (i / 16) * TAU + r() * 0.3, sp: 5 + r() * 5, w: (r() - 0.5) * 14, s: 0.7 + r() * 0.5 };
    ui.add(c);
    return c;
  });
  const spark = sparkles(ui, [
    { x: -3.4, y: 1.4, b0: 4.25, s: 0.5 }, { x: 3.6, y: 1.8, b0: 4.75, s: 0.45, color: '#ffffff' },
    { x: 7.4, y: -1.0, b0: 9, s: 0.45 }, { x: -7.2, y: -0.4, b0: 9.5, s: 0.4, color: '#ffffff' },
  ]);
  const B0 = 36;
  cue(B0, 'whoosh', 0.6);
  cue(B0 + 0.15, 'thud', 0.8);
  cue(B0 + 0.5, 'pop', 0.8, -0.3);
  cue(B0 + 1.0, 'pop2', 0.8, 0.3);
  cue(B0 + 0.75, 'pop', 0.6, 0.6);
  cue(B0 + 3.4, 'pop2', 0.8, 0);
  cue(B0 + 2, 'riser2', 0.7);
  cue(B0 + 4, 'slam', 1.2);
  cue(B0 + 4, 'crash', 0.8);
  cue(B0 + 4, 'coins', 1.0);
  cue(B0 + 4, 'confetti', 0.6);
  cue(B0 + 8, 'pop', 0.8, 0.3);
  cue(B0 + 8.75, 'pop2', 0.9, 0.5);
  for (let i = 0; i < 4; i++) cue(B0 + 9.25 + i, 'ching', 0.7, 0.4);
  for (let i = 0; i < 12; i++) cue(B0 + 8.5 + i * 0.5, 'ching', 0.42, -0.5 + (i % 5) * 0.25);
  cue(B0 + 15.3, 'whoosh', 0.9);

  const bagLocal = new THREE.Vector3(-0.95, -0.1, 0.4);
  const tmp = new THREE.Vector3();
  return {
    name: 'seller',
    scene3d: scene,
    cam3d: cam,
    ui,
    cam: uicam,
    bg(s) {
      const t = S(s);
      const tick = s >= 4 ? (Math.PI / 16) * (Math.floor(s) + ease.outCubic(mod(s, 1))) : 0;
      return {
        colA: '#b8f2cb', colB: '#93e6b1', glow: '#ffffff', glowR: 0.6, glowAmt: 0.5,
        rays: 16, rayAmt: 1, rot: 0.08 * t + tick, dots: 0.22, dotScale: 12, drift: [0.2 * t, -0.1 * t],
        speed: s >= 4 ? 0.7 * (1 - seg(s, 4, 4.8)) : 0, seed: Math.floor(s * 4), vign: 0.25,
      };
    },
    update(s) {
      const t = S(s);
      // camera: gentle push-in, punch on the 0% slam
      const push = ease.inOutSine(seg(s, 0, 16));
      const punch = 1.4 * impulse(S(s - 4), 5) * (s >= 4 ? 1 : 0);
      const yaw = lerp(-0.36, 0.32, push);
      const dist = lerp(18.6, 16.6, push) - punch;
      cam.position.set(Math.sin(yaw) * dist, lerp(5.3, 4.5, push), Math.cos(yaw) * dist);
      cam.lookAt(0, 1.7, 0);
      cam.fov = 30 * (1 - 0.012 * pump(s));
      cam.updateProjectionMatrix();
      const kp = spring(S(s + 0.4), 1.8, 0.5);
      plat.position.y = lerp(-6, 0, kp);
      stall.position.y = plat.position.y;
      const ks = spring(S(s - 0.1), 2.2, 0.4);
      stall.scale.set(0.92 * Math.max(1e-4, ks), 0.92 * Math.max(1e-4, ks) * (1 + 0.04 * pump(s)), 0.92 * Math.max(1e-4, ks));
      const kh = popInOut(s, 0.5);
      hug.visible = kh > 0.003;
      const coinHit = s >= 9 ? pump(s - 0.98 + 1, 9) : 0;
      hug.scale.set(Math.max(1e-4, kh) * (1 + 0.06 * coinHit), Math.max(1e-4, kh) * (1 - 0.06 * coinHit), 1);
      hug.position.set(3.4, plat.position.y + hug.userData.h / 2 * kh + 0.05, 0.9);
      hug.rotation.set(0, yaw * 0.7 - 0.12 + 0.05 * Math.sin(t * 2), 0.05 * Math.sin(t * 3.1));
      // coins pour into the bag on every half beat
      hug.updateMatrixWorld();
      const bag = hug.localToWorld(tmp.copy(bagLocal));
      coins3.forEach((c, i) => {
        const b0 = 8.75 + i;
        const k = seg(s, b0, b0 + 0.5);
        c.visible = s >= b0 && s < b0 + 0.5;
        const sx = 0.5 + (i % 2) * 1.2, sy = 7.5, sz = 1.4;
        c.position.set(lerp(sx, bag.x, k), lerp(sy, bag.y + 0.3, k) + 2.2 * Math.sin(Math.PI * k), lerp(sz, bag.z, k));
        c.rotation.set(t * 9 + i, t * 5, 0);
      });
      rain.forEach((c) => {
        const u = c.userData;
        const fall = 1.5; // beats from the top to the platform
        const tau = S(s - u.land);
        c.visible = s >= u.land - fall;
        if (!c.visible) return;
        if (tau < 0) {
          const k = 1 - (u.land - s) / fall;
          c.position.set(u.x - 0.6 * (1 - k), lerp(9, 0.04, k * k), u.z);
          c.rotation.set(t * u.w + u.ph, t * 4, 0);
        } else {
          c.position.set(u.x, 0.04 + 0.55 * Math.exp(-tau * 5) * Math.abs(Math.sin(tau * 11)), u.z);
          const settle = ease.outCubic(clamp(tau / 0.35));
          c.rotation.set(lerp(u.ph + S(u.land) * u.w, -Math.PI / 2, settle) + 0.2 * wobble(tau, 4, 6), u.yaw, 0);
        }
      });
      // texts
      l1.position.set(0, 3.95, 1);
      animLine(l1, s, 0.5, 0.5, 3.4);
      l2.position.set(0, 3.95, 1.2);
      animLine(l2, s, 3.5, 0, 7.6);
      const kz = popInOut(s, 4);
      const toCorner = ease.inOutCubic(seg(s, 7.6, 8.4));
      zero.visible = kz > 0.003;
      zero.position.set(lerp(0, -5.6, toCorner), lerp(-0.6, 1.95, toCorner) + 0.1 * pump(s), lerp(2.2, 1.4, toCorner));
      const zs = lerp(1, 0.48, toCorner) * Math.max(1e-4, kz) * (1 + 0.05 * pump(s));
      zero.scale.setScalar(zs);
      zero.rotation.set(0.05 * Math.sin(t * 1.5), 0.25 * Math.sin(t * 1.2) * seg(s, 4.5, 6), -0.06 + 0.3 * wobble(S(s - 4), 2, 3.5));
      zero.userData.items.forEach((it) => it.scale.setScalar(1));
      burst.forEach((c) => {
        const u = c.userData;
        const tau = S(s - 4);
        const vis = tau >= 0 && tau < 1.6;
        c.visible = vis;
        if (!vis) return;
        const e = (1 - Math.exp(-2.4 * tau)) / 2.4;
        c.position.set(Math.cos(u.a) * u.sp * e, -0.6 + Math.sin(u.a) * u.sp * e * 0.75 - 4.5 * tau * tau, 2.6 + 1.5 * e);
        c.rotation.set(u.w * tau, u.w * 0.7 * tau, 0);
        c.scale.setScalar(u.s * (1 - seg(tau, 1.2, 1.6)) * Math.min(1, tau * 10));
      });
      l3.position.set(0, 3.95, 1.2);
      animLine(l3, s, 8, 0.75);
      spark(s);
    },
  };
}

// ================================================================== CTA
function buildCta(A) {
  const ui = uiStage(A.env, { shadowOpacity: 0.3 });
  const cam = uiCam();
  const phone = makePhone(A.tex.siteHome);
  ui.add(phone);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
  ripple.position.set(((346 / 390) - 0.5) * (3.15 - 0.38), (0.5 - 77 / 844) * (6.5 - 0.38), 0.24);
  phone.add(ripple);
  const peace = A.stk.peace.clone();
  ui.add(peace);
  const l1 = line([{ t: 'เข้าเว็บเลย!', st: ST.yellow, em: 1.3 }]);
  const l2 = line([{ t: 'สั่งง่าย', st: ST.white, em: 0.82 }, { t: 'อิ่มคุ้ม', st: ST.white, em: 0.82 }, { t: 'ทุกมื้อ', st: ST.white, em: 0.82 }], { gap: 0.12 });
  ui.add(l1, l2);
  const spark = sparkles(ui, [
    { x: -0.9, y: 2.9, b0: 1, s: 0.45 }, { x: -7.4, y: 3.6, b0: 1.5, s: 0.4, color: '#ffffff' },
    { x: 8.5, y: 3.4, b0: 2, s: 0.45 }, { x: -1.0, y: -3.4, b0: 2.5, s: 0.38, color: '#ffffff' },
  ]);
  const deco = [
    { o: makeEgg(12), p: [-8.3, 0.3, -0.2], s: 0.72, r: [1.1, 0, 0.3], b0: 4 },
    { o: makeSkewer(8), p: [-8.1, -3.3, 0.2], s: 0.55, r: [0.3, 0.2, -0.8], b0: 4.5 },
    { o: makeChili(), p: [0.8, -2.5, 0.4], s: 0.7, r: [0.2, 0.3, 0.9], b0: 5 },
    { o: makeTea(A.tex.logoFlat), p: [8.75, 1.75, -0.2], s: 0.72, r: [0.2, -0.4, 0.08], b0: 5.5 },
    { o: makeCoin(), p: [-1.7, 3.85, 0.2], s: 0.85, r: [0.3, 0, 0.2], b0: 6 },
  ];
  deco.forEach((d) => ui.add(d.o));
  const B0 = 52;
  deco.forEach((d) => cue(B0 + d.b0, 'pop', 0.5, clamp(d.p[0] / 9, -1, 1)));
  cue(B0, 'swish', 0.8, -0.4);
  cue(B0 + 0.5, 'slam', 0.7);
  cue(B0 + 0.75, 'pop', 0.8, 0.6);
  cue(B0 + 1, 'whoosh', 0.6);
  cue(B0 + 1.5, 'pop', 0.6, 0.2);
  cue(B0 + 1.75, 'pop', 0.6, 0.35);
  cue(B0 + 2.0, 'pop2', 0.7, 0.5);
  cue(B0 + 3.25, 'tap', 1.0, -0.4);
  cue(B0 + 3.5, 'swish', 0.6, -0.4);
  cue(B0 + 5.5, 'ding', 0.7, 0);
  return {
    name: 'cta',
    ui,
    cam,
    bg(c) {
      const t = S(c);
      return {
        colA: '#27c862', colB: '#18b053', glow: '#f2fff4', glowR: 0.55, glowAmt: 0.55,
        rays: 14, rayAmt: 1, rot: -0.12 * t, dots: 0.15, dotScale: 12, drift: [0.2 * t, 0.2 * t],
        speed: c > 8.5 ? 0.6 * seg(c, 8.5, 10) : 0, seed: Math.floor(c * 4), vign: 0.3,
      };
    },
    update(c) {
      const t = S(c);
      camPump(cam, c);
      const kp = spring(S(c + 0.15), 1.9, 0.5);
      const out = ease.inBack(seg(c, 9.3, 9.9), 2);
      phone.position.set(-4.0 - 9 * out, lerp(-9, -0.35, kp) + 0.1 * Math.sin(t * 1.6) + 0.08 * pump(c), 0.8);
      phone.rotation.set(0.05 * Math.sin(t * 1.2), lerp(-2.4, 0.3, ease.outCubic(seg(c, -0.3, 0.9))) + 0.06 * Math.sin(t * 1.1) - 3 * out, 0.06);
      phone.scale.setScalar(1.02);
      phone.userData.screen.material.map = c >= 3.5 ? A.tex.siteMap : A.tex.siteHome;
      const rk = seg(c, 3.25, 3.9);
      ripple.visible = c >= 3.25 && c < 3.9;
      ripple.scale.setScalar(1 + rk * 3.2);
      ripple.material.opacity = 0.95 * (1 - rk);
      const km = popInOut(c, 0.75, 9.4, 0.4);
      peace.visible = km > 0.003;
      peace.scale.setScalar(Math.max(1e-4, km * 1.08));
      peace.position.set(5.6, -1.45 + 0.15 * pump(c), 1.2);
      peace.rotation.set(0, -0.2 + 0.08 * Math.sin(t * 1.5), 0.07 * Math.sin(t * 3.3) + 0.25 * wobble(S(c - 0.75), 2, 4));
      deco.forEach((d, i) => {
        pop(d.o, c, d.b0, 9.35, d.s, 0.3);
        d.o.position.set(d.p[0] + 0.15 * Math.sin(t * 1.3 + i), d.p[1] + 0.18 * Math.sin(t * 1.7 + i * 2) + 0.12 * pump(c + i * 0.25), d.p[2]);
        d.o.rotation.set(d.r[0] + 0.1 * Math.sin(t + i), d.r[1] + 0.7 * t, d.r[2] + 0.1 * Math.sin(t * 1.4 + i));
      });
      l1.position.set(3.1, 3.55, 1.3);
      animLine(l1, c, 0.5, 0, 9.4, { rz: -0.04 });
      l2.position.set(3.1, 2.05, 1.2);
      animLine(l2, c, 1.5, 0.25, 9.45);
      spark(c);
    },
  };
}

// ================================================================== OVERLAY
function buildOverlay(A) {
  const scene = uiStage(A.env, { shadowOpacity: 0.28, catcherZ: -0.9 });
  const cam = uiCam();
  const logo = A.stk.logo;
  scene.add(logo);
  const url = makeSticker(urlCanvas(), { height: 1.12, depth: 0.14, bevel: 0.03, grid: 700 });
  scene.add(url);
  const confs = [
    { c: new Confetti(scene, 110, 1, new THREE.Vector3(0, 0.6, 2.5), { speed: 10, lift: 5 }), b: 0 },
    { c: new Confetti(scene, 90, 2, new THREE.Vector3(0, -3.6, 2.5), { speed: 9, lift: 8 }), b: 32 },
    { c: new Confetti(scene, 120, 3, new THREE.Vector3(0, -0.4, 2.8), { speed: 11, lift: 5 }), b: 40 },
  ];
  const BUG = { x: -8.0, y: 4.32, s: 0.25 };
  const CEN = { x: 0, y: 0.25, s: 1.0 };
  const TOP = { x: 0, y: 3.62, s: 0.4 };
  const lp = (a, b2, k) => ({ x: lerp(a.x, b2.x, k), y: lerp(a.y, b2.y, k), s: lerp(a.s, b2.s, k) });
  return {
    scene,
    cam,
    bugUv() {
      return new THREE.Vector2(0.5 + (BUG.x / 9.53) * 0.5, 0.5 + (BUG.y / 5.36) * 0.5);
    },
    update(B) {
      const hb = B >= 32 ? B - 64 : B;
      const t = S(hb);
      camPump(cam, B, 30, 0.006);
      let st, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, z = 1.0;
      if (hb >= -2 && hb < 0) {
        const k = ease.inCubic(seg(hb, -2, 0));
        st = lp(BUG, CEN, k);
        ry = TAU * ease.inOutCubic(seg(hb, -2, -0.15));
        z = 1 + 5 * Math.sin(Math.PI * k) * 0.6;
        rz = -0.3 * Math.sin(Math.PI * k);
      } else if (hb >= 0 && hb < 4) {
        st = { ...CEN };
        const [a, b2] = [wobble(t, 2.6, 4.2), 0];
        void b2;
        sx = 1 + 0.2 * a;
        sy = 1 - 0.2 * a;
        rz = 0.04 * Math.sin(t * 2.2);
        ry = 0.18 * Math.sin(t * 1.4);
        st.y += 0.08 * pump(hb);
      } else if (hb >= 4 && hb < 7.5) {
        const k = spring(S(hb - 4), 2.0, 0.55);
        st = lp(CEN, TOP, k);
        ry = 0.15 * Math.sin(t * 1.4);
        rz = 0.03 * Math.sin(t * 2);
      } else if (hb >= 7.5 && hb < 8.6) {
        const k = ease.inOutCubic(seg(hb, 7.5, 8.4));
        st = lp(TOP, BUG, k);
        rz = -0.25 * Math.sin(Math.PI * k);
      } else {
        st = { ...BUG };
        const ant = seg(hb, -2.4, -2.0);
        const bounce = pump(B / 4, 3);
        sx = 1 + 0.08 * bounce - 0.12 * Math.sin(Math.PI * ant);
        sy = 1 - 0.06 * bounce + 0.14 * Math.sin(Math.PI * ant);
        rz = 0.06 * Math.sin(S(B) * 2.2);
        ry = 0.2 * Math.sin(S(B) * 1.3);
      }
      // small logo sits closer to its shadow so the shadow stays tight
      logo.position.set(st.x, st.y, z * lerp(0.3, 1, clamp((st.s - 0.25) / 0.75)));
      logo.scale.set(st.s * sx, st.s * sy, st.s);
      logo.rotation.set(rx, ry, rz);
      // URL pill: CTA beat 1 -> through the loop -> exits as the hook starts
      const cb = mod(B - 52, 64);
      const kIn = spring(S(cb - 1), 2.1, 0.5);
      const kOut = ease.inBack(seg(cb, 15.6, 16.2), 2);
      url.visible = cb >= 1 && cb < 16.3;
      url.position.set(0, lerp(-7.2, -4.28, kIn) - 3.2 * kOut + 0.05 * pump(B), 1.6);
      url.rotation.set(lerp(0.9, 0, clamp(kIn)) + 0.03 * Math.sin(S(B) * 1.4), 0.04 * Math.sin(S(B) * 1.1), 0.12 * wobble(S(cb - 12), 2.4, 4));
      url.scale.setScalar(1 + 0.025 * pump(B) + 0.1 * wobble(S(cb - 5.5), 2.2, 5) + 0.06 * wobble(S(cb - 9), 2.2, 5));
      confs.forEach(({ c, b }) => c.update(S(mod(B - b, 64))));
    },
  };
}

// ================================================================== FILM
export function buildFilm(A) {
  // shared stickers (cloned per shot)
  A.stk = {
    logo: makeSticker(A.tex.logo.image, { height: 5.1, depth: 0.34, bevel: 0.07, grid: 380, side: '#ffffff' }),
    peace: makeSticker(A.tex.peace.image, { height: 4.3, depth: 0.22, bevel: 0.05, grid: 340 }),
    peaceSmall: makeSticker(A.tex.peace.image, { height: 2.7, depth: 0.16, bevel: 0.04, grid: 300 }),
    angry: makeSticker(A.tex.angry.image, { height: 4.9, depth: 0.22, bevel: 0.05, grid: 340 }),
    hug: makeSticker(A.tex.hug.image, { height: 3.7, depth: 0.2, bevel: 0.05, grid: 340 }),
  };
  const hero = buildHero(A);
  const map = buildMap(A);
  const food = buildFood(A);
  const seller = buildSeller(A);
  const cta = buildCta(A);
  const overlay = buildOverlay(A);
  for (const s of [hero, map, food, seller, cta]) {
    if (s.ui) applyEnv(s.ui, A.env, 0.5);
    if (s.scene3d) applyEnv(s.scene3d, A.env, 0.4);
  }
  applyEnv(overlay.scene, A.env, 0.5);
  cue(60, 'riser', 0.9);
  cue(61.6, 'whoosh', 1.0);

  const at = (shot, b) => ({ shot, b });
  const heroB = (B) => (B >= 32 ? B - 64 : B);
  function plan(B) {
    const p = { a: null, b: null, mode: 0, prog: 0, center: [0.5, 0.5], dir: [-1, 0] };
    if (B >= 7.4 && B < 8.0) {
      Object.assign(p, { a: at(hero, heroB(B)), b: at(map, B - 8), mode: 1, prog: ease.inQuad(seg(B, 7.4, 8.0)), center: [0.5, 0.45] });
    } else if (B < 7.4 || B >= 62.2) {
      p.a = at(hero, heroB(B));
    } else if (B < 23.6) {
      p.a = at(map, B - 8);
    } else if (B < 24.0) {
      Object.assign(p, { a: at(map, B - 8), b: at(food, B - 24), mode: 4, prog: ease.inOutQuad(seg(B, 23.62, 23.95)) });
    } else if (B < 35.4) {
      p.a = at(food, B - 24);
    } else if (B < 36.0) {
      Object.assign(p, { a: at(food, B - 24), b: at(seller, B - 36), mode: 2, prog: seg(B, 35.4, 36.0) });
    } else if (B < 51.5) {
      p.a = at(seller, B - 36);
    } else if (B < 52.0) {
      Object.assign(p, { a: at(seller, B - 36), b: at(cta, B - 52), mode: 3, prog: ease.inOutCubic(seg(B, 51.5, 52.0)), dir: [1, 0] });
    } else if (B < 61.6) {
      p.a = at(cta, B - 52);
    } else {
      const c = overlay.bugUv();
      Object.assign(p, { a: at(cta, B - 52), b: at(hero, heroB(B)), mode: 1, prog: ease.inQuad(seg(B, 61.6, 62.2)), center: [c.x, c.y] });
    }
    return p;
  }

  // global hits: flash, chromatic aberration, shake, punch zoom
  const HITS = [
    { b: 0.07, flash: 0, ca: 0.014, shake: 1.0, zoom: 0.025 },
    { b: 4, flash: 0.22, ca: 0.01, shake: 0.6, zoom: 0.015 },
    { b: 11, flash: 0.08, ca: 0.0, shake: 0.2, zoom: 0.0 },
    { b: 32, flash: 0.18, ca: 0.008, shake: 0.5, zoom: 0.015 },
    { b: 40, flash: 0.42, ca: 0.022, shake: 1.2, zoom: 0.035 },
    { b: 52.5, flash: 0.12, ca: 0.006, shake: 0.4, zoom: 0.01 },
  ];
  function fx(B) {
    let flash = 0, ca = 0, sx = 0, sy = 0, zoom = 1;
    for (const h of HITS) {
      const tau = S(mod(B - h.b, 64));
      if (tau > 2) continue;
      flash += h.flash * impulse(tau, 11);
      ca += h.ca * impulse(tau, 7);
      const sh = h.shake * impulse(tau, 9) * 0.006;
      sx += sh * Math.sin(tau * 83);
      sy += sh * Math.cos(tau * 71);
      zoom += h.zoom * impulse(tau, 6);
    }
    return { flash, ca, shake: [sx, sy], zoom };
  }

  return { shots: { hero, map, food, seller, cta }, overlay, plan, fx };
}
