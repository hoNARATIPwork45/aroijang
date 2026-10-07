// Full-screen shaders: the animated backdrop of each shot and the final
// compositor that does the beat-synced transitions between shots.
import * as THREE from 'three';

const quadVS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function makeQuad(material) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const m = new THREE.Mesh(geo, material);
  m.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(m);
  return scene;
}

// ------------------------------------------------------------ backdrop
// Sunburst rays + centre glow + drifting polka dots + speed lines.
export function makeBackdropMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: quadVS,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      colA: { value: new THREE.Color('#22c55e') },
      colB: { value: new THREE.Color('#16a34a') },
      glow: { value: new THREE.Color('#f0fff4') },
      dotCol: { value: new THREE.Color('#ffffff') },
      glowR: { value: 0.55 },
      glowAmt: { value: 1.0 },
      rays: { value: 16.0 },
      rayAmt: { value: 1.0 },
      rot: { value: 0.0 },
      center: { value: new THREE.Vector2(0, 0) },
      dots: { value: 0.12 },
      dotScale: { value: 14.0 },
      drift: { value: new THREE.Vector2(0, 0) },
      speed: { value: 0.0 },
      seed: { value: 0.0 },
      vign: { value: 0.35 },
    },
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 colA, colB, glow, dotCol;
      uniform float glowR, glowAmt, rays, rayAmt, rot, dots, dotScale, speed, seed, vign;
      uniform vec2 center, drift;
      float hash(float n) { return fract(sin(n) * 43758.5453123); }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0) - center;
        float r = length(p);
        float a = atan(p.y, p.x) + rot;
        float f = fract(a / 6.2831853 * rays);
        float tri = abs(f - 0.5) * 2.0;
        float aa = rays / 6.2831853 * (1.5 / 1080.0) / max(r, 1e-3);
        float s = smoothstep(0.5 - aa, 0.5 + aa, tri);
        vec3 col = mix(colA, mix(colA, colB, rayAmt), s);
        // polka dots on a rotated grid
        vec2 q = mat2(0.866, -0.5, 0.5, 0.866) * (p * dotScale) + drift;
        vec2 cell = floor(q);
        vec2 g = fract(q) - 0.5;
        float odd = mod(cell.y, 2.0);
        g.x = fract(q.x + odd * 0.5) - 0.5;
        float d = length(g);
        float da = 1.5 * dotScale / 1080.0;
        float dot = smoothstep(0.17 + da, 0.17 - da, d);
        col = mix(col, dotCol, dot * dots * smoothstep(0.15, 0.6, r));
        // speed lines (radial streaks)
        if (speed > 0.001) {
          float sl = a / 6.2831853 * 90.0;
          float id = floor(sl);
          float on = step(0.55, hash(id + seed * 13.1));
          float w = abs(fract(sl) - 0.5);
          float line = on * smoothstep(0.18, 0.05, w) * smoothstep(0.28 + 0.2 * hash(id + 3.7 + seed), 0.75, r);
          col = mix(col, vec3(1.0), line * speed * 0.85);
        }
        // centre glow
        col = mix(col, glow, glowAmt * (1.0 - smoothstep(0.0, glowR, r)));
        // vignette
        col *= 1.0 - vign * smoothstep(0.45, 1.25, length((vUv - 0.5) * vec2(1.6, 1.0)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ------------------------------------------------------------ compositor
// mode: 0 = A only, 1 = circle wipe, 2 = diagonal stripes, 3 = push,
//       4 = crossfade, 5 = zoom-through
export function makeCompositeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: quadVS,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tA: { value: null },
      tB: { value: null },
      mode: { value: 0 },
      prog: { value: 0 },
      center: { value: new THREE.Vector2(0.5, 0.5) },
      dir: { value: new THREE.Vector2(-1, 0) },
      ringCol: { value: new THREE.Color('#ffffff') },
      stripeA: { value: new THREE.Color('#16a34a') },
      stripeB: { value: new THREE.Color('#ffd23f') },
      stripeC: { value: new THREE.Color('#ffffff') },
      flash: { value: 0 },
      flashCol: { value: new THREE.Color('#ffffff') },
      ca: { value: 0 },
      zoom: { value: 1 },
      shake: { value: new THREE.Vector2(0, 0) },
    },
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tA, tB;
      uniform int mode;
      uniform float prog, flash, ca, zoom;
      uniform vec2 center, dir, shake;
      uniform vec3 ringCol, stripeA, stripeB, stripeC, flashCol;
      const vec2 ASP = vec2(16.0 / 9.0, 1.0);

      vec3 samp(sampler2D t, vec2 uv) {
        if (ca > 0.0001) {
          vec2 d = (uv - 0.5) * ca;
          return vec3(texture2D(t, uv + d).r, texture2D(t, uv).g, texture2D(t, uv - d).b);
        }
        return texture2D(t, uv).rgb;
      }
      vec2 zoomUv(vec2 uv, float z) { return (uv - 0.5) / z + 0.5; }

      void main() {
        vec2 uv = zoomUv(vUv + shake, zoom);
        vec3 A = samp(tA, uv);
        vec3 col = A;
        if (mode == 1) {
          float r = length((vUv - center) * ASP);
          float R = prog * 2.4;
          vec3 B = samp(tB, uv);
          float inB = smoothstep(R + 0.002, R - 0.002, r);
          float ring = smoothstep(R + 0.035, R + 0.03, r) * (1.0 - inB) * step(0.001, prog);
          col = mix(A, B, inB);
          col = mix(col, ringCol, ring);
        } else if (mode == 2) {
          float d = dot(vUv * ASP, normalize(vec2(1.0, 0.55))) / 2.0;
          float p = prog * 1.9 - 0.35;
          float e0 = smoothstep(p + 0.002, p - 0.002, d);
          float e1 = smoothstep(p + 0.002, p - 0.002, d + 0.09);
          float e2 = smoothstep(p + 0.002, p - 0.002, d + 0.18);
          float e3 = smoothstep(p + 0.002, p - 0.002, d + 0.27);
          vec3 B = samp(tB, uv);
          col = A;
          col = mix(col, stripeA, e0);
          col = mix(col, stripeB, e1);
          col = mix(col, stripeC, e2);
          col = mix(col, B, e3);
        } else if (mode == 3) {
          float e = prog;
          vec2 uvA = uv + dir * e;
          vec2 uvB = uv + dir * (e - 1.0);
          bool inA = all(greaterThanEqual(uvA, vec2(0.0))) && all(lessThanEqual(uvA, vec2(1.0)));
          col = inA ? samp(tA, uvA) : samp(tB, uvB);
        } else if (mode == 4) {
          col = mix(A, samp(tB, uv), prog);
        } else if (mode == 5) {
          vec3 Az = samp(tA, zoomUv(uv, 1.0 + prog * 2.5));
          vec3 Bz = samp(tB, zoomUv(uv, 0.6 + 0.4 * prog));
          col = mix(Az, Bz, smoothstep(0.35, 0.75, prog));
        }
        col = mix(col, flashCol, clamp(flash, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
