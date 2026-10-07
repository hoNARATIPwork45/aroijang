// Renderer + compositor. window.renderAt(t) draws the frame at time t (s);
// ?play previews in real time (add &audio to hear out/soundtrack.wav).
import * as THREE from 'three';
import { BEAT, BEATS, DUR, mod, SFX } from './util.js';
import { makeQuad, makeBackdropMaterial, makeCompositeMaterial } from './fxshaders.js';
import { buildFilm } from './shots.js';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
const hud = document.getElementById('hud');
if (hud && !params.has('play')) hud.style.display = 'none'; // never burn the HUD into rendered frames

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.autoClear = false;

// Soft studio reflections for the glossy props: gradient dome + three softboxes.
function studioEnv() {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const pos = geo.attributes.position;
  const col = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const v = y > 0 ? 0.55 + 0.45 * y : 0.5 + 0.35 * y;
    col.push(v, v * 1.01, v * 0.98);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.97), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  box(5, 3.5, -4.5, 5.5, 6, 3.2);
  box(2.5, 6, 7, 2, -3, 2.2);
  box(7, 1.6, 0, 8.5, -1, 1.8);
  const pm = new THREE.PMREMGenerator(renderer);
  return pm.fromScene(s, 0.02).texture;
}
const env = studioEnv();

const rtOpts = { type: THREE.HalfFloatType, samples: 4 };
const rtA = new THREE.WebGLRenderTarget(W, H, rtOpts);
const rtB = new THREE.WebGLRenderTarget(W, H, rtOpts);
const bgMat = makeBackdropMaterial();
const bgScene = makeQuad(bgMat);
const compMat = makeCompositeMaterial();
const compScene = makeQuad(compMat);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const BG_DEFAULT = {
  colA: '#22c55e', colB: '#16a34a', glow: '#ffffff', dotCol: '#ffffff', glowR: 0.55, glowAmt: 1,
  rays: 16, rayAmt: 1, rot: 0, center: [0, 0], dots: 0.12, dotScale: 14, drift: [0, 0], speed: 0, seed: 0, vign: 0.3,
};

function applyBg(p) {
  const u = bgMat.uniforms;
  const q = { ...BG_DEFAULT, ...p };
  for (const k in q) {
    const uni = u[k];
    if (!uni) continue;
    const v = q[k];
    if (uni.value && uni.value.isColor) uni.value.set(v);
    else if (uni.value && uni.value.isVector2) uni.value.set(v[0], v[1]);
    else uni.value = v;
  }
}

function renderShot({ shot, b }, rt) {
  shot.update(b);
  applyBg(shot.bg(b));
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  renderer.render(bgScene, quadCam);
  if (shot.scene3d) {
    renderer.clearDepth();
    renderer.render(shot.scene3d, shot.cam3d);
  }
  if (shot.ui) {
    renderer.clearDepth();
    renderer.render(shot.ui, shot.cam);
  }
}

let film = null;
function renderAt(t) {
  const B = mod(t / BEAT, BEATS);
  const p = film.plan(B);
  renderShot(p.a, rtA);
  if (p.b) renderShot(p.b, rtB);
  const u = compMat.uniforms;
  u.tA.value = rtA.texture;
  u.tB.value = p.b ? rtB.texture : rtA.texture;
  u.mode.value = p.mode;
  u.prog.value = p.prog;
  u.center.value.set(p.center[0], p.center[1]);
  u.dir.value.set(p.dir[0], p.dir[1]);
  const f = film.fx(B);
  u.flash.value = f.flash;
  u.ca.value = f.ca;
  u.zoom.value = f.zoom;
  u.shake.value.set(f.shake[0], f.shake[1]);
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  renderer.render(compScene, quadCam);
  film.overlay.update(B);
  renderer.clearDepth();
  renderer.render(film.overlay.scene, film.overlay.cam);
  if (hud) hud.textContent = `t ${t.toFixed(2)}s  beat ${B.toFixed(2)}  bar ${Math.floor(B / 4) + 1}`;
}

const TEX = {
  logo: 'assets/logo-sticker.png', logoFlat: 'assets/logo.png',
  peace: 'assets/mascot-peace.png', angry: 'assets/mascot-angry.png', hug: 'assets/mascot-hug.png',
  siteHome: 'assets/site-home.png', siteMap: 'assets/site-map.png',
};
for (const m of ['m01', 'm02', 'm05', 'm06', 'm08', 'm09', 'm15', 'm16']) TEX[m] = `assets/${m}.jpg`;

async function init() {
  const faces = [
    new FontFace('Kanit', 'url(fonts/Kanit-ExtraBold.ttf)', { weight: '800' }),
    new FontFace('Kanit', 'url(fonts/Kanit-Bold.ttf)', { weight: '700' }),
  ];
  for (const f of faces) {
    await f.load();
    document.fonts.add(f);
  }
  const loader = new THREE.TextureLoader();
  const tex = {};
  await Promise.all(
    Object.entries(TEX).map(([k, url]) =>
      loader.loadAsync(url).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        tex[k] = t;
      })
    )
  );
  film = buildFilm({ env, tex });
  for (const t of [0.05, 2, 4, 8, 12, 15, 18, 22, 25, 28.9, 29.5]) renderAt(t); // compile everything
  window.SFX_CUES = SFX.slice().sort((a, b) => a.t - b.t);
  window.renderAt = renderAt;
  window.FILM = film;
  window.DUR = DUR;
  window.READY = true;

  if (params.has('play')) {
    document.body.classList.add('fit');
    const fit = () => {
      const s = Math.min(innerWidth / W, innerHeight / H);
      canvas.style.transform = `translate(-50%, -50%) scale(${s})`;
      canvas.style.transformOrigin = '50% 50%';
    };
    fit();
    addEventListener('resize', fit);
    let audio = null;
    if (params.has('audio')) {
      audio = new Audio('out/soundtrack.wav');
      audio.loop = true;
      addEventListener('click', () => audio.play());
    }
    const t0 = performance.now();
    const start = parseFloat(params.get('from') || '0');
    const loop = () => {
      const t = audio && !audio.paused ? audio.currentTime : mod(start + (performance.now() - t0) / 1000, DUR);
      renderAt(t);
      requestAnimationFrame(loop);
    };
    loop();
  } else if (params.has('t')) {
    renderAt(parseFloat(params.get('t')));
  }
}

init().catch((e) => {
  console.error(e);
  window.INIT_ERROR = String(e && e.stack ? e.stack : e);
});
