
/* ================= ready-made styles ================= */
const P = (id, name, line, o) => ({ id, name, line, style: { summary: o.summary, keywords: o.keywords || [], walls: o.walls, ceiling: o.ceiling || '#f6f2eb', tokens: o.tokens, floors: o.floors, cove: o.cove ?? true, time: o.time || 'golden', view: o.view, plants: o.plants || 'some', features: o.features || [] } });
const PRESETS = [
  P('evening-luxe', 'Evening Luxe', 'Walnut, travertine, glowing coves', { summary: 'Evening luxe: a warm, moody high-rise apartment at dusk. Full-height walnut wall panelling, honed travertine and grey-veined marble, soft cream and taupe upholstery with rust and cognac cushions, bronze and brushed-brass details. Every room glows: cove lights in stepped false ceilings, LED strips under shelves and along wall reveals, wall-washer downlights, linear and globe pendants. Floor-to-ceiling glass with a city skyline outside.', walls: '#c9b8a3', ceiling: '#e9e0d4', time: 'dusk', view: 'city', tokens: { 'wood-light': '#9a7353', 'wood-dark': '#4e3526', stone: { look: 'travertine', color: '#cdbb9f' }, marble: { look: 'marble', color: '#e9e4dc' }, 'stone-dark': { look: 'marble', color: '#3a332e' }, 'fabric-main': '#e3dacb', 'fabric-second': '#8c7865', 'fabric-accent': '#9c5234', metal: 'brass' }, floors: { living: { finish: 'stone-large', color: '#d3c4ad' }, bedroom: { finish: 'wood', color: '#8d6c50' }, wet: { finish: 'stone-large', color: '#c3b39c' }, outdoor: { finish: 'stone-large', color: '#9f968a' } }, plants: 'lush', features: ['full-height walnut wall panelling with LED reveals', 'stepped false ceilings with warm cove light', 'grey-veined marble waterfall island', 'lit walnut shelving and media walls', 'glowing walk-in closet', 'stone spa bathrooms with floating vanities', 'linear brass pendants', 'deep cream sectionals with rust cushions', 'large leafy indoor trees'] }),
  P('warm-minimal', 'Warm Minimal', 'Travertine, oak, cream boucle', { summary: 'Warm minimal luxury: travertine and oak, cream boucle, olive accents, fluted wood and soft cove light.', walls: '#e8dfd2', tokens: { 'wood-light': '#c49a6c', 'wood-dark': '#6c4a33', stone: { look: 'travertine', color: '#d9c9b0' }, marble: { look: 'marble', color: '#ece6dc' }, 'stone-dark': { look: 'marble', color: '#2b2826' }, 'fabric-main': '#ece4d6', 'fabric-second': '#a8937a', 'fabric-accent': '#6f7552', metal: 'brass' }, floors: { living: { finish: 'stone-large', color: '#e6d9c6' }, bedroom: { finish: 'wood', color: '#c9a47d' }, wet: { finish: 'stone-large', color: '#cdbfab' }, outdoor: { finish: 'stone', color: '#9d968c' } }, plants: 'lush', features: ['fluted wood panels', 'curved boucle sofa', 'olive trees', 'arched mirrors', 'travertine TV wall with LED reveals', 'sculptural stone coffee table', 'backlit arched niches', 'velvet-rust accent chair'] }),
  P('modern-indian', 'Modern Indian', 'Teak, brass, peacock and rust', { summary: 'Modern Indian: warm teak and cane, brass details, terrazzo floors, rust and peacock-green textiles, carved accents.', walls: '#efe4d2', tokens: { 'wood-light': '#a0703f', 'wood-dark': '#4b2a1a', stone: { look: 'terrazzo', color: '#d8cbb5' }, marble: { look: 'marble', color: '#efe9df' }, 'stone-dark': { look: 'marble', color: '#1f3b33' }, 'fabric-main': '#e9dcc6', 'fabric-second': '#b5552f', 'fabric-accent': '#1f5a4a', metal: 'brass' }, floors: { living: { finish: 'terrazzo', color: '#e0d4c0' }, bedroom: { finish: 'wood', color: '#9a6a3f' }, wet: { finish: 'tile-1ft', color: '#d2c6b3' }, outdoor: { finish: 'tile-2ft', color: '#b07a55' } }, plants: 'lush', features: ['teak and cane furniture', 'brass lamps', 'terrazzo floors', 'jewel-tone cushions', 'pooja mandir with brass jaali', 'teak jhoola', 'emerald velvet barrel chairs', 'fluted teak sideboard', 'brass chandelier over dining'] }),
  P('scandi', 'Scandinavian', 'Pale ash, white, soft grey', { summary: 'Scandinavian: pale ash wood, white walls, soft grey wool, black accents, simple and bright.', walls: '#f4f2ee', ceiling: '#fbfaf8', time: 'day', tokens: { 'wood-light': '#d9c3a0', 'wood-dark': '#8a6d4d', stone: { look: 'concrete', color: '#c9c6c0' }, marble: { look: 'marble', color: '#f2f1ee' }, 'stone-dark': { look: 'concrete', color: '#4a4a48' }, 'fabric-main': '#e6e3dc', 'fabric-second': '#9aa3a8', 'fabric-accent': '#3f4f5f', metal: 'black' }, floors: { living: { finish: 'wood', color: '#dcc7a4' }, bedroom: { finish: 'wood', color: '#dcc7a4' }, wet: { finish: 'tile-2ft', color: '#e4e2de' }, outdoor: { finish: 'wood', color: '#b39b7a' } }, features: ['light wood', 'white oak shelving', 'wool throws', 'sculptural lounge chair', 'oversized paper drum pendants', 'fluted oak TV wall'] }),
  P('japandi', 'Japandi', 'Oak, linen, charcoal, clay', { summary: 'Japandi: calm oak and linen, low furniture, charcoal and clay accents, lots of negative space.', walls: '#ece5d9', tokens: { 'wood-light': '#b8916a', 'wood-dark': '#3d332c', stone: { look: 'limestone', color: '#cfc3b0' }, marble: { look: 'marble', color: '#e8e2d7' }, 'stone-dark': { look: 'concrete', color: '#3a3733' }, 'fabric-main': '#ddd2c0', 'fabric-second': '#8c7b68', 'fabric-accent': '#5b5f4a', metal: 'black' }, floors: { living: { finish: 'wood', color: '#c4a27c' }, bedroom: { finish: 'wood', color: '#c4a27c' }, wet: { finish: 'stone-large', color: '#c8bfb2' }, outdoor: { finish: 'wood', color: '#8d6a4c' } }, features: ['low platform beds', 'slatted wood', 'paper lamps', 'charcoal plaster feature walls', 'washi drum pendants', 'arched niches with ceramics', 'sculptural stone coffee table'] }),
  P('coastal', 'Coastal', 'Whitewash, rattan, sea blue', { summary: 'Coastal: whitewashed wood, rattan, crisp linen and sea-blue accents, breezy and bright.', walls: '#f6f3ec', time: 'day', tokens: { 'wood-light': '#d8c3a2', 'wood-dark': '#a38561', stone: { look: 'limestone', color: '#e6dccb' }, marble: { look: 'marble', color: '#f4f1ea' }, 'stone-dark': { look: 'marble', color: '#2f4f63' }, 'fabric-main': '#f1ede4', 'fabric-second': '#8fb2c3', 'fabric-accent': '#2f5f7a', metal: 'chrome' }, floors: { living: { finish: 'wood', color: '#e2d0b2' }, bedroom: { finish: 'wood', color: '#e2d0b2' }, wet: { finish: 'tile-1ft', color: '#dfe7ea' }, outdoor: { finish: 'wood', color: '#b89a74' } }, plants: 'lush', features: ['rattan chairs', 'linen curtains', 'blue accents', 'navy velvet accent chairs', 'whitewashed fluted panels', 'woven drum pendants'] }),
  P('industrial', 'Industrial Loft', 'Concrete, steel, cognac leather', { summary: 'Industrial loft: concrete and dark timber, black steel, cognac leather and warm Edison lighting.', walls: '#d9d4cc', ceiling: '#e6e2dc', time: 'night', tokens: { 'wood-light': '#8a6242', 'wood-dark': '#3a2a1f', stone: { look: 'concrete', color: '#9c9994' }, marble: { look: 'concrete', color: '#bdb9b2' }, 'stone-dark': { look: 'concrete', color: '#2e2e2d' }, 'fabric-main': '#8a5a3a', 'fabric-second': '#5d5d5a', 'fabric-accent': '#b8873e', metal: 'black' }, floors: { living: { finish: 'terrazzo', color: '#a7a39c' }, bedroom: { finish: 'wood', color: '#7a5a40' }, wet: { finish: 'tile-2ft', color: '#8f8b85' }, outdoor: { finish: 'stone', color: '#7f7a73' } }, features: ['black steel frames', 'leather sofa', 'exposed-style finishes', 'backlit bar unit', 'dark travertine TV wall', 'arc floor lamp', 'mustard velvet lounge chair'] }),
  P('classic-luxe', 'Classic Luxe', 'White marble, walnut, emerald', { summary: 'Classic luxe: white marble, polished walnut, emerald and burgundy velvet, gold details.', walls: '#efe8dc', tokens: { 'wood-light': '#a57a52', 'wood-dark': '#4a2e1e', stone: { look: 'marble', color: '#efece6' }, marble: { look: 'marble', color: '#f3f0ea' }, 'stone-dark': { look: 'marble', color: '#1f2a26' }, 'fabric-main': '#efe6d6', 'fabric-second': '#6d2f3a', 'fabric-accent': '#1f4d3e', metal: 'brass' }, floors: { living: { finish: 'stone-large', color: '#ece6da' }, bedroom: { finish: 'wood', color: '#8e6443' }, wet: { finish: 'stone-large', color: '#e9e4db' }, outdoor: { finish: 'stone', color: '#b3aca1' } }, features: ['marble surfaces', 'velvet upholstery', 'gold accents', 'classic wall mouldings', 'three-tier brass chandelier', 'channel-tufted emerald headboard wall', 'green marble accents', 'bar unit'] }),
  P('boho', 'Boho Earthy', 'Terracotta, cane, olive', { summary: 'Boho earthy: terracotta floors, cane and rattan, cream textiles, olive and rust, plants everywhere.', walls: '#ecdcc7', tokens: { 'wood-light': '#b8895a', 'wood-dark': '#6b4428', stone: { look: 'terrazzo', color: '#d9b99a' }, marble: { look: 'marble', color: '#eadfcd' }, 'stone-dark': { look: 'concrete', color: '#6a4a3a' }, 'fabric-main': '#efe3cf', 'fabric-second': '#c0643c', 'fabric-accent': '#7d7a3e', metal: 'brass' }, floors: { living: { finish: 'tile-2ft', color: '#c98e67' }, bedroom: { finish: 'wood', color: '#a57a52' }, wet: { finish: 'tile-1ft', color: '#d4b79a' }, outdoor: { finish: 'tile-2ft', color: '#b8744f' } }, plants: 'lush', features: ['cane furniture', 'layered rugs', 'terracotta pots', 'jhoola', 'arched niches', 'tall floor vases with branches', 'rust velvet accents'] }),
];
const presetById = id => PRESETS.find(p => p.id === id);
const swatchOf = st => { const t = st.tokens, c = v => typeof v === 'string' ? v : v?.color; return [st.floors.living.color, c(t['wood-light']), c(t['fabric-main']), c(t['fabric-second']), c(t['fabric-accent'])]; };
const presetCard = (p, on) => `<button type="button" class="preset" data-preset="${p.id}" aria-pressed="${on}"><span class="sw">${swatchOf(p.style).map(h => `<i style="background:${h}"></i>`).join('')}</span><span class="tx"><b>${esc(p.name)}</b><small>${esc(p.line)}</small></span></button>`;
function renderPresets() {
  const cur = project?.presetId || 'warm-minimal';
  $('presetGrid').innerHTML = PRESETS.map(p => presetCard(p, p.id === cur && !project?.customStyle)).join('');
  $('presetGrid').querySelectorAll('[data-preset]').forEach(b => b.onclick = () => choosePreset(b.dataset.preset));
  const n = project?.inspo?.length || 0;
  $('styleMeta').textContent = project?.customStyle ? 'from your photos' : (presetById(cur)?.name || '');
  if (n && !$('ownPhotos').open) $('ownPhotos').open = true;
}
function choosePreset(id) {
  const p = presetById(id); if (!p) return;
  project.presetId = id; project.customStyle = false; project.style = normalizeStyle(structuredClone(p.style));
  if (layout.walls.length) { for (const k in MC) delete MC[k]; layout.settings.timeOfDay = project.style.time; if (project.style.view) layout.settings.view = project.style.view; applyStyleToRooms(layout, project.style); buildAll(); flash(`${p.name} applied to every room. Furniture choices update when you redesign.`); }
  renderPresets(); renderStyle(); saveSoon();
}
function renderHomePresets() {
  $('homePresets').innerHTML = PRESETS.map(p => presetCard(p, false)).join('');
  $('homePresets').querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { const pr = emptyProject(); pr.presetId = b.dataset.preset; pr.style = normalizeStyle(structuredClone(presetById(b.dataset.preset).style)); store.put(pr); openProject(pr); document.body.classList.remove('side-hidden'); });
}

/* ================= idea chips ================= */
const IDEAS = ['Home office', 'Kids\' room', 'Pooja unit', 'Reading nook', 'Bar counter', 'Walk-in wardrobe', 'Lots of plants', 'Pet friendly', 'Pool table', 'Big dining table', 'Balcony seating', 'Extra storage'];
function renderIdeas() {
  const cur = ($('brief').value || '').toLowerCase();
  $('ideaChips').innerHTML = IDEAS.map(t => `<button type="button" aria-pressed="${cur.includes(t.toLowerCase())}">${esc(t)}</button>`).join('');
  $('ideaChips').querySelectorAll('button').forEach(b => b.onclick = () => {
    const ta = $('brief'), t = b.textContent, low = ta.value.toLowerCase();
    if (low.includes(t.toLowerCase())) ta.value = ta.value.replace(new RegExp('(,\\s*)?' + t.replace(/[.*+?^${}()|[\]\\']/g, '\\$&'), 'i'), '').replace(/^\s*,\s*/, '');
    else ta.value = ta.value.trim() ? ta.value.trim().replace(/[.,]?$/, ', ') + t : t;
    project.brief = ta.value; saveSoon(); renderIdeas();
  });
}
$('brief').addEventListener('input', () => renderIdeas());

/* ================= sample plan & sample home ================= */
$('btnSamplePlan').onclick = () => {
  const sp = SAMPLE.plan; project.plan = { image: sp.image, w: sp.w, h: sp.h, s: null, ox: 0, oy: 0 }; project.trace = null;
  if (!project.name || project.name === 'Untitled house' || project.name === 'My new home') { project.name = 'Sample 4BHK apartment'; $('projName').value = project.name; }
  project.cover ||= sp.image; renderUploads(); saveSoon(); flash('Sample plan added. Pick a style, then press Read my floor plan.');
};
$('btnSampleHome').onclick = async () => { const list = await store.all(); const v = list.find(p => p.id === 'sample-home'); if (v) openProject(v); else { const c = structuredClone(SAMPLE); c.id = 'sample-home'; c.status = 'generated'; await store.put(c); openProject(c); } };

/* ================= first-time walking tips ================= */
function maybeCoach() {
  if (!layout.walls.length) return; let seen = false; try { seen = localStorage.getItem('ws-coach') === '1'; } catch { }
  if (seen) return; const el = $('coach');
  el.innerHTML = `<div class="eyebrow">Your home in 3D</div><h3>Take a walk</h3><ul>${TOUCH ? `<li><kbd>Joystick</kbd><span>Walk with the pad at the bottom left</span></li><li><kbd>Swipe</kbd><span>Look around</span></li>` : `<li><kbd>W A S D</kbd><span>Walk (arrow keys work too)</span></li><li><kbd>Drag</kbd><span>Look around</span></li>`}<li><kbd>Tap map</kbd><span>Jump to any room</span></li>${TOUCH ? `<li><kbd>Hand</kbd><span>Look at a door or a piece and tap the hand to open it or move it</span></li>` : `<li><kbd>E</kbd><span>Look at a door to open or close it</span></li><li><kbd>X</kbd><span>Look at a piece to pick it up and move it</span></li>`}<li><kbd>Click</kbd><span>Any furniture to change it</span></li><li><kbd>Ask</kbd><span>Type a change in the bar below</span></li></ul><button class="primary" id="coachOk">Start walking</button>`;
  el.hidden = false; $('coachOk').onclick = () => { el.hidden = true; try { localStorage.setItem('ws-coach', '1'); } catch { } };
}

/* ================= hero animation: plan draws, walls rise, rooms fill ================= */
const hero = (() => {
  const cv = $('heroCanvas'), g = cv.getContext('2d'), cap = $('heroCap');
  const L = SAMPLE.layout, walls = L.walls, rooms = L.rooms.filter(r => r.kind !== 'ledge'), items = L.furniture.filter(it => !['rug', 'curtain', 'artwork', 'pendants', 'linear-light', 'hood', 'panel-stone', 'panel-slats', 'panel-upholstered', 'mirror', 'vase', 'lamp-table', 'tv', 'stair-curved'].includes(it.type));
  const xs = rooms.flatMap(r => r.polygon.map(p => p[0])), zs = rooms.flatMap(r => r.polygon.map(p => p[1]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const tok = SAMPLE.style.tokens, col = v => typeof v === 'string' ? v : v?.color;
  const COL = { 'wood-light': col(tok['wood-light']), 'wood-dark': col(tok['wood-dark']), stone: col(tok.stone), marble: col(tok.marble), 'stone-dark': col(tok['stone-dark']), 'fabric-main': col(tok['fabric-main']), 'fabric-second': col(tok['fabric-second']), 'fabric-accent': col(tok['fabric-accent']), linen: '#ddd0bd', teak: '#8a5f3c', concrete: '#a7a199', terracotta: '#b4724f', felt: '#55684a' };
  const itemCol = it => COL[it.finish] || (String(it.finish || '').startsWith('#') ? it.finish : it.type.startsWith('plant') || it.type === 'planter-flowers' ? '#6e7b4f' : '#cdbfa8');
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, (n >> 16) * k) | 0, gg = Math.min(255, (n >> 8 & 255) * k) | 0, b = Math.min(255, (n & 255) * k) | 0; return `rgb(${r},${gg},${b})`; };
  let W = 0, H = 0, k = 1, t0 = performance.now(), raf = 0, visible = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio, 2); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); k = Math.min(W, H * 1.4) / span * .7; }
  new ResizeObserver(size).observe(cv);
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3), back = t => { t = Math.max(0, Math.min(1, t)); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function frame(now) {
    raf = 0; if (!visible || !W) return;
    const T = reduce ? 9.5 : ((now - t0) / 1000) % 12;
    const draw = ease(T / 2.6), rise = ease((T - 2.4) / 2), fill = ease((T - 4.2) / 1.4), fade = T > 11.3 ? 1 - ease((T - 11.3) / .7) : 1;
    const ang = -0.62 + (reduce ? 0 : Math.sin(now / 5200) * .12) + (1 - rise) * .25, ca = Math.cos(ang), sa = Math.sin(ang), tilt = .42 + rise * .14;
    const pr = (x, z, y) => { const dx = x - cx, dz = z - cz, rx = dx * ca - dz * sa, rz = dx * sa + dz * ca; return [W / 2 + rx * k, H * .54 + rz * k * tilt - y * k * .82]; };
    g.clearRect(0, 0, W, H); g.globalAlpha = fade;
    cap.textContent = T < 2.4 ? 'Reading the plan' : T < 4.3 ? 'Raising the walls' : T < 6 ? 'Furnishing every room' : 'Ready to walk through';
    // floors
    for (const r of rooms) {
      g.beginPath(); r.polygon.forEach((p, i) => { const [a, b] = pr(p[0], p[1], 0); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath();
      g.fillStyle = fill > 0 ? shade(r.floor || '#d9d2c5', .55 + .35 * fill) : 'rgba(91,240,209,.05)'; g.globalAlpha = fade * (fill > 0 ? .25 + .75 * fill : 1); g.fill(); g.globalAlpha = fade;
    }
    // plan lines drawing in
    if (rise < 1) {
      g.strokeStyle = `rgba(91,240,209,${.85 * (1 - rise)})`; g.lineCap = 'round';
      let budget = draw * walls.length;
      for (const w of walls) { if (budget <= 0) break; const f = Math.min(1, budget); budget -= 1; const [a1, b1] = pr(w.a[0], w.a[1], 0), [a2, b2] = pr(w.b[0], w.b[1], 0); g.lineWidth = Math.max(1, w.thickness * k * .7); g.beginPath(); g.moveTo(a1, b1); g.lineTo(a1 + (a2 - a1) * f, b1 + (b2 - b1) * f); g.stroke(); }
    }
    // walls + furniture as extruded prisms, painter-sorted
    const Hh = 9.5 * rise, prisms = [];
    if (rise > 0) for (const w of walls) {
      const L2 = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, nx = -(w.b[1] - w.a[1]) / L2 * w.thickness / 2, nz = (w.b[0] - w.a[0]) / L2 * w.thickness / 2;
      prisms.push({ pts: [[w.a[0] + nx, w.a[1] + nz], [w.b[0] + nx, w.b[1] + nz], [w.b[0] - nx, w.b[1] - nz], [w.a[0] - nx, w.a[1] - nz]], h: Hh * (w.kind === 'ext' ? 1 : .96), c: '#efe6d8', wall: true });
    }
    if (fill > 0) items.forEach((it, i) => {
      const p = back((T - 4.3 - (i % 40) * .03) / .6); if (p <= 0) return;
      const th = -(it.rot || 0) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), hw = (it.w || 1.5) / 2, hd = (it.d || 1.5) / 2;
      const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [it.x + a * c - b * s, it.z + a * s + b * c]);
      prisms.push({ pts, h: Math.min(it.h || 2, 7) * p, y0: (it.y || 0) * p, c: itemCol(it) });
    });
    const depth = q => { const m = q.pts.reduce((a, p) => a + (p[0] - cx) * sa + (p[1] - cz) * ca, 0) / 4; return m; };
    prisms.sort((a, b) => depth(a) - depth(b));
    for (const q of prisms) {
      const y0 = q.y0 || 0, top = q.pts.map(p => pr(p[0], p[1], y0 + q.h)), bot = q.pts.map(p => pr(p[0], p[1], y0));
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, a = bot[i], b = bot[j], c = top[j], d = top[i];
        if ((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) > 0) continue;
        const ex = q.pts[j][0] - q.pts[i][0], ez = q.pts[j][1] - q.pts[i][1], lit = .62 + .3 * Math.abs(Math.cos(Math.atan2(ez, ex) + ang - .4));
        g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath(); g.fillStyle = shade(q.c, lit * (q.wall ? .92 : .85)); g.fill();
      }
      g.beginPath(); top.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fillStyle = shade(q.c, q.wall ? 1.02 : 1.08); g.fill();
    }
    // warm glow once furnished
    if (fill > .5) { const gr = g.createRadialGradient(W * .55, H * .45, 10, W * .55, H * .45, W * .6); gr.addColorStop(0, `rgba(91,240,209,${.10 * (fill - .5) * 2})`); gr.addColorStop(1, 'rgba(91,240,209,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    g.globalAlpha = 1;
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  return { start() { visible = true; size(); t0 = performance.now(); if (!raf) raf = requestAnimationFrame(frame); }, stop() { visible = false; if (raf) cancelAnimationFrame(raf); raf = 0; } };
})();
