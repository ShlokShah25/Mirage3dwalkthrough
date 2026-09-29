import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
RectAreaLightUniformsLib.init();
// the photo-mode path tracer reads scene rotation fields added in newer three.js; give r160 scenes neutral defaults
for (const k of ['backgroundRotation', 'environmentRotation']) if (!(k in THREE.Scene.prototype)) Object.defineProperty(THREE.Scene.prototype, k, { get() { return this['_' + k] ||= new THREE.Euler(); }, set(v) { this['_' + k] = v; }, configurable: true });

/* ================= shared state ================= */
let project = null;          // {name, plan, inspo, style, brief, layout, ...}
let layout = { settings: {}, walls: [], rooms: [], railings: [], furniture: [] };
const TOUCH = matchMedia('(pointer: coarse)').matches;
const STEP = 1.0, BODY = 5.6, D2R = Math.PI / 180;
const $ = id => document.getElementById(id);

/* ================= renderer & post ================= */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#e6b48b', 700, 6000);
const camera = new THREE.PerspectiveCamera(80, 1, 0.1, 9000);
const pmrem = new THREE.PMREMGenerator(renderer);

const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, .2, -1) }, sunCol: { value: new THREE.Color() } };
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top,mid,bot,sunDir,sunCol; varying vec3 p; void main(){ float h=p.y; vec3 c = h>0. ? mix(mid,top,pow(h,.5)) : mix(mid,bot,pow(-h,.3)); float s=max(dot(normalize(p),normalize(sunDir)),0.); c += sunCol*(pow(s,900.)*2.+pow(s,40.)*.12); gl_FragColor=vec4(c,1.); }'
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), skyMat); scene.add(sky);
const seaMat = new THREE.MeshStandardMaterial({ color: '#2e5670', roughness: .22, metalness: .2 });
const sea = new THREE.Mesh(new THREE.CircleGeometry(7000, 64), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.y = -220; scene.add(sea);
// ---- city view: a dusk skyline seen from a high floor (towers with lit windows over a tree canopy) ----
const city = new THREE.Group(); city.visible = false; scene.add(city);
const cityWin = { mats: [] };
(function buildCity() {
  const R = rng('mirage-city'), GY = -150;
  const facade = (seed, cool) => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = cool ? '#39414d' : '#4a4540'; g.fillRect(0, 0, 128, 256);
    for (let y = 4; y < 256; y += 8) for (let x = 3; x < 128; x += 7) { const on = r() < .38; g.fillStyle = on ? (r() < .75 ? `rgba(255,${190 + r() * 40 | 0},${120 + r() * 50 | 0},${.55 + r() * .45})` : 'rgba(200,225,255,.7)') : 'rgba(20,24,30,.55)'; g.fillRect(x, y, 4, 5); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const lit = (seed, cool) => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'), r = rng(seed); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    for (let y = 4; y < 256; y += 8) for (let x = 3; x < 128; x += 7) if (r() < .38) { g.fillStyle = r() < .75 ? '#ffc98a' : '#cfe2ff'; g.fillRect(x, y, 4, 5); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  for (let v = 0; v < 4; v++) {
    const m = new THREE.MeshStandardMaterial({ map: facade('f' + v, v % 2), emissive: '#ffffff', emissiveMap: lit('f' + v, v % 2), emissiveIntensity: .6, roughness: .6, metalness: .3, fog: true });
    cityWin.mats.push(m); const geos = [];
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, d = 1100 + Math.pow(R(), .8) * 3200, h = 90 + Math.pow(R(), 1.8) * 620, w = 40 + R() * 80, dd = 35 + R() * 70;
      const gb = new THREE.BoxGeometry(w, h, dd); gb.translate(0, h / 2, 0);
      const uv = gb.attributes.uv, nrm = gb.attributes.normal;
      for (let k = 0; k < uv.count; k++) { const side = Math.abs(nrm.getX(k)) > .5 ? dd : w, top = Math.abs(nrm.getY(k)) > .5; uv.setXY(k, top ? 0 : uv.getX(k) * side / 64, top ? 0 : uv.getY(k) * h / 240); }
      gb.rotateY(R() * 3); gb.translate(Math.cos(a) * d, GY, Math.sin(a) * d); geos.push(gb);
    }
    city.add(new THREE.Mesh(mergeGeometries(geos), m));
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(6000, 64), new THREE.MeshStandardMaterial({ color: '#2c3526', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = GY; city.add(ground);
  const tree = new THREE.IcosahedronGeometry(1, 1), tl = [], tm = new THREE.MeshStandardMaterial({ color: '#3d4a2f', roughness: 1, flatShading: true });
  for (let i = 0; i < 3400; i++) { const a = R() * Math.PI * 2, d = 80 + Math.pow(R(), .7) * 1900; tl.push([Math.cos(a) * d, Math.sin(a) * d, 9 + R() * 14]); }
  const ti = new THREE.InstancedMesh(tree, tm, tl.length), o2 = new THREE.Object3D();
  tl.forEach(([x, z, r], i) => { o2.position.set(x, GY + r * .6, z); o2.scale.set(r, r * .8, r); o2.updateMatrix(); ti.setMatrixAt(i, o2.matrix); ti.setColorAt(i, new THREE.Color().setHSL(.22 + R() * .08, .25 + R() * .15, .16 + R() * .1)); });
  city.add(ti);
  // street lights twinkle at dusk and night
  const sl = [], sg = new THREE.SphereGeometry(1.2, 6, 4), sm = new THREE.MeshBasicMaterial({ color: '#ffcf8a' }); cityWin.street = sm;
  for (let i = 0; i < 900; i++) { const a = R() * Math.PI * 2, d = 120 + R() * 1800; sl.push([Math.cos(a) * d, Math.sin(a) * d]); }
  const si = new THREE.InstancedMesh(sg, sm, sl.length); sl.forEach(([x, z], i) => { o2.position.set(x, GY + 3, z); o2.scale.setScalar(1); o2.updateMatrix(); si.setMatrixAt(i, o2.matrix); }); city.add(si);
  city.traverse(c => { c.castShadow = false; c.receiveShadow = false; });
})();
const hemi = new THREE.HemisphereLight('#ffd9b8', '#8f7a66', .4); scene.add(hemi);
const amb = new THREE.AmbientLight('#ffffff', .12); scene.add(amb);
const sun = new THREE.DirectionalLight('#ffb069', 3);
sun.castShadow = true; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; scene.add(sun, sun.target);

// environment probe built from the sky so glass, stone and metal reflect the right light
const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
const envFloor = new THREE.Mesh(new THREE.CircleGeometry(100, 32), new THREE.MeshBasicMaterial({ color: '#9a8a78' })); envFloor.rotation.x = -Math.PI / 2; envFloor.position.y = -8; envScene.add(envFloor);
let envRT = null;
function rebuildEnv(floorHex) { envFloor.material.color.set(floorHex || '#9a8a78'); if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, .02); scene.environment = envRT.texture; }

let composer = null, gtao = null, bloom = null, quality = TOUCH ? 'fast' : 'high';
let grade = null;
// cinematic finish: gentle S-curve, warm highlights, soft vignette and fine grain (applied in display space)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vig: { value: .32 }, warm: { value: .035 }, contrast: { value: .16 }, grain: { value: .018 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig,warm,contrast,grain,time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec4 c=texture2D(tDiffuse,vUv); vec3 x=c.rgb;
      x=mix(x, x*x*(3.-2.*x), contrast);
      float l=dot(x,vec3(.299,.587,.114)); x+=vec3(warm,warm*.45,-warm*.6)*smoothstep(.45,1.,l);
      float d=distance(vUv,vec2(.5)); x*=mix(1.,1.-vig,smoothstep(.32,.9,d));
      x+=(h(vUv*vec2(1733.,977.)+fract(time))-.5)*grain;
      gl_FragColor=vec4(clamp(x,0.,1.),c.a); }`
};
function setupPost() {
  composer?.dispose?.(); composer = null; gtao = null; bloom = null; grade = null;
  const w = Math.max(2, stage.clientWidth), h = Math.max(2, stage.clientHeight);
  const pr = quality === 'high' ? Math.min(devicePixelRatio, 1.5) : quality === 'balanced' ? Math.min(devicePixelRatio, 1.25) : 1;
  renderer.setPixelRatio(pr);
  const sm = quality === 'high' ? 4096 : quality === 'balanced' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (quality === 'fast') return;
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'high') {
    gtao = new GTAOPass(scene, camera, w * pr, h * pr);
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.05, samples: 16, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    gtao.blendIntensity = .9;
    const cache = gtao._visibilityCache;
    gtao.overrideVisibility = () => { scene.traverse(o => { cache.set(o, o.visible); if (o.isPoints || o.isLine || o.isSprite || o === sky || o === sea || o.parent === city || o === city || (o.material && (o.material.transparent || Array.isArray(o.material)))) o.visible = false; }); };
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .3, .35, 1.05);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  grade = new ShaderPass(GradeShader); composer.addPass(grade);
  composer.setSize(w, h);
  applyTime();
}

/* ================= textures ================= */
function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const TX = {}, NX = {};
function ctex(key, size, draw, rep = 1) {
  if (TX[key]) return TX[key];
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size, rng(key));
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(rep, rep);
  return (TX[key] = t);
}
// normal map from a texture's luminance (grout, grain, weave read as relief)
function nmap(key, strength = 2, invert = false) {
  const k = key + '|' + strength + invert; if (NX[k]) return NX[k];
  const src = TX[key]; if (!src) return null;
  const c0 = src.image, s = c0.width, g0 = c0.getContext('2d'), d = g0.getImageData(0, 0, s, s).data;
  const L = new Float32Array(s * s); for (let i = 0; i < s * s; i++) L[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255 * (invert ? -1 : 1);
  const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), out = g.createImageData(s, s), o = out.data;
  const at = (x, y) => L[((y + s) % s) * s + ((x + s) % s)];
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, len = Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
    o[i] = (-dx / len * .5 + .5) * 255; o[i + 1] = (dy / len * .5 + .5) * 255; o[i + 2] = (1 / len * .5 + .5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.copy(src.repeat); t.anisotropy = 8;
  return (NX[k] = t);
}
function speckle(g, s, R, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '0,0,0'},${R() * a})`; g.fillRect(R() * s, R() * s, 1 + R() * 3, 1 + R() * 3); } }
function veins(g, s, R, col, n, wmax) {
  for (let i = 0; i < n; i++) {
    g.strokeStyle = col; g.globalAlpha = .12 + R() * .4; g.lineWidth = .5 + R() * wmax; g.beginPath();
    let x = R() * s, y = R() * s; g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { const nx = x + (R() - .25) * s * .45, ny = y + (R() - .5) * s * .3; g.bezierCurveTo(x + (R() - .5) * 90, y + (R() - .5) * 90, nx + (R() - .5) * 90, ny + (R() - .5) * 90, nx, ny); x = nx; y = ny; }
    g.stroke();
  }
  g.globalAlpha = 1;
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
function isDark(hex) { const c = new THREE.Color(hex); return c.r * .3 + c.g * .59 + c.b * .11 < .35; }
const stoneTex = (look, hex) => ctex('stone-' + look + hex, 512, (g, s, R) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  const dark = isDark(hex);
  if (look === 'travertine' || look === 'limestone') {
    for (let i = 0; i < 26; i++) { const y = R() * s, h = 6 + R() * 30, gr = g.createLinearGradient(0, y, 0, y + h); const c = R() < .5 ? '120,95,70' : '255,248,236', a = .025 + R() * .045; gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(.5, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(0, y, s, h); }
    for (let i = 0; i < 40; i++) { const x = R() * s, y = R() * s, r = 30 + R() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${R() < .5 ? '140,115,90' : '255,250,240'},${.04 + R() * .05})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    if (look === 'travertine') for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(95,75,55,${.08 + R() * .18})`; g.beginPath(); g.ellipse(R() * s, R() * s, .8 + R() * 4, .5 + R() * 1.6, (R() - .5) * .3, 0, 7); g.fill(); }
    speckle(g, s, R, 2000, .04);
  } else if (look === 'concrete' || look === 'terrazzo') {
    speckle(g, s, R, 9000, .08);
    if (look === 'terrazzo') for (let i = 0; i < 900; i++) { g.fillStyle = ['#d9d2c7', '#8e8479', '#bfa58a', '#f3efe8', '#5f5953'][R() * 5 | 0]; g.beginPath(); g.ellipse(R() * s, R() * s, 1 + R() * 5, 1 + R() * 4, R() * 3, 0, 7); g.fill(); }
  } else {
    speckle(g, s, R, 3000, .04);
    veins(g, s, R, dark ? shade(hex, 2.2) : shade(hex, .86), 22, 7);
    veins(g, s, R, dark ? shade(hex, 4.5) : shade(hex, .5), 9, 2.4);
    veins(g, s, R, dark ? shade(hex, 5.5) : shade(hex, .42), 4, 1.1);
  }
});
// limewash plaster: large soft clouds and fine grain, near-white so it tints to the wall colour
const plasterTex = () => ctex('plaster-lime', 1024, (g, s, R) => {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 140; i++) { const x = R() * s, y = R() * s, r = 60 + R() * 260, gr = g.createRadialGradient(x, y, 0, x, y, r), dk = R() < .55;
    gr.addColorStop(0, dk ? `rgba(120,110,100,${.025 + R() * .04})` : `rgba(255,255,255,${.05 + R() * .06})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); } }
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(110,100,90,${.015 + R() * .025})`; g.lineWidth = 8 + R() * 30; g.beginPath(); const x = R() * s, y = R() * s, a = R() * 6; g.arc(x, y, 40 + R() * 120, a, a + .6 + R()); g.stroke(); }
  speckle(g, s, R, 26000, .05);
});
const woodTex = hex => ctex('wood-' + hex, 512, (g, s, R) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 170; i++) {
    g.strokeStyle = R() < .55 ? 'rgba(40,24,12,.11)' : 'rgba(255,240,220,.07)'; g.lineWidth = .6 + R() * 2.2; g.beginPath();
    const x0 = R() * s, amp = 3 + R() * 10, f = .004 + R() * .01, ph = R() * 6;
    for (let y = 0; y <= s; y += 8) g.lineTo(x0 + Math.sin(y * f + ph) * amp, y); g.stroke();
  }
});
const fabricTex = hex => ctex('fab-' + hex, 256, (g, s, R) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 3) { g.fillStyle = `rgba(0,0,0,${.035 + R() * .03})`; g.fillRect(0, y, s, 1); }
  for (let x = 0; x < s; x += 3) { g.fillStyle = `rgba(255,255,255,${.02 + R() * .03})`; g.fillRect(x, 0, 1, s); }
  for (let i = 0; i < 3500; i++) { g.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '0,0,0'},${R() * .08})`; const r = .6 + R() * 1.6; g.beginPath(); g.arc(R() * s, R() * s, r, 0, 7); g.fill(); }
}, 3);
const rugTex = () => ctex('rug', 512, (g, s, R) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(0,0,0,${R() * .07})`; g.fillRect(R() * s, R() * s, 1, 2 + R() * 3); }
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 10; g.strokeRect(22, 22, s - 44, s - 44);
});
function paintTex(seed) {
  return ctex('paint-' + seed, 512, (g, s) => {
    const R = rng(seed * 7919 + 13);
    const grounds = ['#ebe3d6', '#e4d8c6', '#efe9df', '#d9ccb8'], inks = ['#b4724f', '#6f7552', '#2f2b28', '#c9a47d', '#8a6a52', '#d8c3a5', '#a55b3f'];
    g.fillStyle = grounds[R() * 4 | 0]; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3 + R() * 3; i++) {
      g.fillStyle = inks[R() * inks.length | 0]; g.globalAlpha = .55 + R() * .4; const t = R(); g.beginPath();
      if (t < .4) g.arc(R() * s, R() * s, 40 + R() * 150, 0, 7);
      else if (t < .7) { const x = R() * s, y = R() * s, r = 60 + R() * 140; g.arc(x, y, r, Math.PI, 0); g.lineTo(x + r, y + r * 1.2); g.lineTo(x - r, y + r * 1.2); }
      else g.ellipse(R() * s, R() * s, 30 + R() * 200, 12 + R() * 50, R() * 3, 0, 7);
      g.fill();
    }
    g.globalAlpha = .5; g.strokeStyle = '#2f2b28'; g.lineWidth = 2 + R() * 6; g.beginPath(); g.moveTo(R() * s, R() * s); g.bezierCurveTo(R() * s, R() * s, R() * s, R() * s, R() * s, R() * s); g.stroke();
    g.globalAlpha = 1; speckle(g, s, R, 5000, .05);
  });
}
function floorTex(kind) {
  return ctex('floor-' + kind, 512, (g, s, R) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    if (kind === 'stone-large') {
      // large-format polished stone: soft cloud, a few fine veins per slab, thin grout
      for (let t = 0; t < 4; t++) { const x0 = (t % 2) * s / 2, y0 = (t >> 1) * s / 2; g.save(); g.beginPath(); g.rect(x0, y0, s / 2, s / 2); g.clip();
        g.fillStyle = `rgba(${R() < .5 ? '255,250,240' : '200,185,165'},${.08 + R() * .08})`; g.fillRect(x0, y0, s / 2, s / 2);
        for (let i = 0; i < 26; i++) { const r = 20 + R() * 70, gr = g.createRadialGradient(x0 + R() * s / 2, y0 + R() * s / 2, 0, x0 + R() * s / 2, y0 + R() * s / 2, r); gr.addColorStop(0, `rgba(150,130,105,${.03 + R() * .05})`); gr.addColorStop(1, 'rgba(150,130,105,0)'); g.fillStyle = gr; g.fillRect(x0, y0, s / 2, s / 2); }
        veins(g, s, R, 'rgba(125,108,90,1)', 2, .9); g.restore(); }
      speckle(g, s, R, 2000, .015); g.fillStyle = 'rgba(40,30,20,.3)'; g.fillRect(0, 0, s, 2); g.fillRect(0, s / 2, s, 2); g.fillRect(0, 0, 2, s); g.fillRect(s / 2, 0, 2, s);
    } else if (kind.startsWith('tile')) { g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 5; g.strokeRect(2, 2, 508, 508); speckle(g, s, R, 2000, .03); }
    else if (kind === 'wood') {
      const rows = 8, h = s / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r * 197) % s;
        for (let k = -1; k < 2; k++) { const sh = .86 + ((r * 7 + k * 3) % 5) * .035; g.fillStyle = `rgb(${255 * sh | 0},${249 * sh | 0},${242 * sh | 0})`; g.fillRect(off + k * s * .62, r * h, s * .62, h); }
        for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(90,60,30,.06)'; g.beginPath(); const y = r * h + R() * h; g.moveTo(0, y); g.lineTo(s, y + R() * 4 - 2); g.stroke(); }
        g.fillStyle = 'rgba(60,40,20,.28)'; g.fillRect(0, r * h, s, 2); g.fillRect(off % s, r * h, 2, h);
      }
    } else if (kind === 'stone') { g.fillStyle = '#f0eeea'; g.fillRect(0, 0, s, s); speckle(g, s, R, 6000, .06); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 6; g.strokeRect(0, 0, s, s); }
    else if (kind === 'terrazzo') { speckle(g, s, R, 4000, .04); for (let i = 0; i < 700; i++) { g.fillStyle = ['#cfc6b8', '#8e8479', '#bfa58a', '#5f5953'][R() * 4 | 0]; g.beginPath(); g.ellipse(R() * s, R() * s, 1 + R() * 4, 1 + R() * 3, R() * 3, 0, 7); g.fill(); } }
  }, kind === 'tile-1ft' ? 1 : kind === 'tile-2ft' ? .5 : kind === 'stone' ? 1 / 3 : kind === 'terrazzo' ? .25 : kind === 'stone-large' ? .125 : .25);
}

/* ================= materials & style tokens ================= */
const MC = {}, EMIS = [];
const std = o => new THREE.MeshStandardMaterial({ envMapIntensity: .55, ...o });
const phys = o => new THREE.MeshPhysicalMaterial({ envMapIntensity: .45, ...o });
function emis(color, e, ei) { const m = std({ color, emissive: e, emissiveIntensity: ei, roughness: .6 }); m.userData.baseEI = ei; EMIS.push(m); return m; }
const TOKEN_NAMES = ['wood-light', 'wood-dark', 'stone', 'marble', 'stone-dark', 'fabric-main', 'fabric-second', 'fabric-accent', 'metal'];
const LEGACY = { oak: 'wood-light', walnut: 'wood-dark', travertine: 'stone', boucle: 'fabric-main', 'fabric-taupe': 'fabric-second', 'fabric-olive': 'fabric-accent' };
function resolveSpec(spec, tkOverride) {
  spec ||= '#cccccc';
  const tk = tkOverride || project?.style?.tokens || {};
  if (TOKEN_NAMES.includes(spec)) {
    const v = tk[spec];
    if (spec.startsWith('wood')) return 'wood:' + (typeof v === 'string' ? v : spec === 'wood-dark' ? '#6c4a33' : '#c49a6c');
    if (spec.startsWith('fabric')) return 'fabric:' + (typeof v === 'string' ? v : { 'fabric-main': '#ece4d6', 'fabric-second': '#a8937a', 'fabric-accent': '#6f7552' }[spec]);
    if (spec === 'metal') return v === 'chrome' ? 'chrome' : v === 'black' || v === 'black-metal' ? 'black-metal' : 'brass';
    const def = { stone: { look: 'travertine', color: '#d9c9b0' }, marble: { look: 'marble', color: '#ece6dc' }, 'stone-dark': { look: 'marble', color: '#2b2826' } }[spec];
    const o = v && typeof v === 'object' ? v : typeof v === 'string' ? { look: def.look, color: v } : def;
    return 'stone:' + (o.look || def.look) + ':' + (o.color || def.color);
  }
  const fixed = { oak: 'wood:#c49a6c', walnut: 'wood:#6c4a33', teak: 'wood:#8a5f3c', travertine: 'stone:travertine:#d9c9b0', 'marble-dark': 'stone:marble:#2b2826', concrete: 'stone:concrete:#a7a199', boucle: 'fabric:#ece4d6', linen: 'fabric:#ddd0bd', 'linen-white': 'fabric:#f4efe7', 'fabric-taupe': 'fabric:#a8937a', 'fabric-olive': 'fabric:#6f7552', felt: 'fabric:#55684a', terracotta: 'clay:#b4724f', 'velvet-emerald': 'velvet:#1f4d3f', 'velvet-rust': 'velvet:#9a4a2c', 'velvet-navy': 'velvet:#223251', 'velvet-blush': 'velvet:#c9958a', 'velvet-mustard': 'velvet:#b8872e', 'velvet-ink': 'velvet:#1d1f24', onyx: 'stone:marble:#e7cf9f', 'marble-green': 'stone:marble:#2f4a3e', 'marble-rosso': 'stone:marble:#6e2f28', 'travertine-dark': 'stone:travertine:#9d8466' };
  if (spec === 'marble') return 'stone:marble:#ece6dc';
  return fixed[spec] || spec;
}
function mat(spec0) {
  const spec = resolveSpec(spec0);
  if (MC[spec]) return MC[spec];
  let m; const [kind, a, b] = spec.split(':');
  if (kind === 'wood') { const t = woodTex(a); m = std({ map: t, normalMap: nmap(t === TX['wood-' + a] ? 'wood-' + a : '', 1.2), normalScale: new THREE.Vector2(.35, .35), roughness: .58 }); }
  else if (kind === 'fabric') { const t = fabricTex(a); m = phys({ map: t, normalMap: nmap('fab-' + a, 2.5), normalScale: new THREE.Vector2(.6, .6), roughness: .95, sheen: 1, sheenRoughness: .75, sheenColor: new THREE.Color(a).lerp(new THREE.Color('#ffffff'), .35) }); }
  else if (kind === 'stone') { stoneTex(a, b); m = std({ map: TX['stone-' + a + b], normalMap: nmap('stone-' + a + b, 1.4), normalScale: new THREE.Vector2(.25, .25), roughness: a === 'marble' ? .2 : a === 'concrete' ? .9 : .6 }); }
  else if (kind === 'clay') m = std({ map: fabricTex(a), roughness: .9 });
  else if (kind === 'velvet') { const t = fabricTex(a); m = phys({ map: t, normalMap: nmap('fab-' + a, 1.5), normalScale: new THREE.Vector2(.3, .3), roughness: .7, sheen: 1, sheenRoughness: .35, sheenColor: new THREE.Color(a).lerp(new THREE.Color('#ffffff'), .55) }); }
  else switch (spec) {
    case 'black-metal': m = std({ color: '#1f1c1a', roughness: .38, metalness: .7 }); break;
    case 'leather-cognac': m = phys({ color: '#8a4d2b', map: fabricTex('#ffffff'), roughness: .5, clearcoat: .25, clearcoatRoughness: .5 }); break;
    case 'leather-dark': m = phys({ color: '#3a2a22', map: fabricTex('#ffffff'), roughness: .5, clearcoat: .25, clearcoatRoughness: .5 }); break;
    case 'brass': m = std({ color: '#c09a5f', roughness: .28, metalness: 1, envMapIntensity: 1 }); break;
    case 'chrome': m = std({ color: '#d6d9dc', roughness: .12, metalness: 1, envMapIntensity: 1 }); break;
    case 'white-ceramic': m = phys({ color: '#f5f3ef', roughness: .15, clearcoat: .6, clearcoatRoughness: .1 }); break;
    case 'plaster': m = std({ color: '#efe7dc', roughness: .95 }); break;
    case 'glass': m = std({ color: '#d8ecee', transparent: true, opacity: .14, roughness: .03, metalness: .3, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }); break;
    case 'glass-bronze': m = std({ color: '#6b5a47', transparent: true, opacity: .35, roughness: .06, metalness: .4, envMapIntensity: 1.2, depthWrite: false }); break;
    case 'mirror': m = std({ color: '#c4cacc', metalness: 1, roughness: .04, envMapIntensity: .75 }); break;
    case 'screen': m = phys({ color: '#08090b', roughness: .1, metalness: .2, clearcoat: 1 }); break;
    case 'sheer': m = std({ color: '#f6f1e7', transparent: true, opacity: .55, roughness: 1, side: THREE.DoubleSide, depthWrite: false }); break;
    case 'leaf': m = std({ color: '#6e7b4f', roughness: .75 }); break;
    case 'leaf-dark': m = std({ color: '#53633f', roughness: .75 }); break;
    case 'bark': m = std({ color: '#6d5a45', roughness: .9 }); break;
    case 'soil': m = std({ color: '#3b2f25', roughness: 1 }); break;
    case 'lamp': m = emis('#f6e7cf', '#ffc98a', .9); break;
    case 'lamp-white': m = emis('#f8f2e8', '#ffd9a8', .8); break;
    case 'led': m = emis('#ffd9a0', '#ffc57a', 1.8); break;
    case 'led-soft': m = emis('#f3dcc0', '#ffcf94', .7); break;
    case 'wine-glow': m = emis('#3b2416', '#ffb466', .9); break;
    default: m = spec.startsWith('#') ? phys({ color: spec, map: fabricTex('#ffffff'), roughness: .85, sheen: .5, sheenRoughness: .8, sheenColor: new THREE.Color(spec) }) : std({ color: '#cccccc' });
  }
  return (MC[spec] = m);
}
function tintMat(key, map, color, rough = .9) { const k = key + color; return MC[k] ||= std({ map, color, roughness: rough }); }
function floorMat(finish, color) {
  const k = 'floor:' + finish + color; if (MC[k]) return MC[k];
  const map = finish && finish !== 'plain' ? floorTex(finish) : null;
  return (MC[k] = std({ color, map, normalMap: map ? nmap('floor-' + finish, finish === 'wood' ? 2.2 : 3) : null, normalScale: new THREE.Vector2(.5, .5), roughness: finish === 'wood' ? .5 : finish === 'stone' ? .8 : finish === 'stone-large' ? .16 : .32, envMapIntensity: finish === 'stone-large' ? 1 : .7 }));
}
function paintMat(seed) { return MC['paint' + seed] ||= std({ map: paintTex(seed), roughness: .9 }); }

/* ================= geometry helpers ================= */
const G = () => new THREE.Group();
function add(g, geo, m, x, y, z, ry = 0, rx = 0, rz = 0) { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.order = 'YXZ'; me.rotation.set(rx, ry, rz); g.add(me); return me; }
const bx = (g, w, h, d, m, x = 0, y = 0, z = 0, ry = 0, rx = 0) => add(g, new THREE.BoxGeometry(Math.max(w, .005), Math.max(h, .005), Math.max(d, .005)), m, x, y + h / 2, z, ry, rx);
const rb = (g, w, h, d, r, m, x = 0, y = 0, z = 0, ry = 0, rx = 0) => { const rr = Math.max(.004, Math.min(r, w / 2, h / 2, d / 2) - .004); return add(g, new RoundedBoxGeometry(w, h, d, 2, rr), m, x, y + h / 2, z, ry, rx); };
const cy = (g, rt, rbot, h, m, x = 0, y = 0, z = 0, seg = 20, rx = 0) => add(g, new THREE.CylinderGeometry(rt, rbot, h, seg), m, x, y + h / 2, z, 0, rx);
function rod(g, a, b, r, m) { const dir = new THREE.Vector3().subVectors(b, a), L = dir.length(); const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 5), m); me.position.copy(a).addScaledVector(dir, .5); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); g.add(me); return me; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function lampOn(g, x, y, z, s = 1) { cy(g, .12 * s, .19 * s, .72 * s, mat('#d9cdb9'), x, y, z, 16); cy(g, .36 * s, .44 * s, .55 * s, mat('lamp'), x, y + .68 * s, z, 24); }
function inst(g, geo, m, list) { const im = new THREE.InstancedMesh(geo, m, list.length), o = new THREE.Object3D(); list.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.scale.setScalar(p[3] || 1); if (p[4]) o.scale.y *= p[4]; o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); im.castShadow = false; im.receiveShadow = true; g.add(im); return im; }
