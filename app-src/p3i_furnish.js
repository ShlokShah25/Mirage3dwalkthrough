/* ================= furnishing by design: each room in its own frame, every piece anchored to a wall or a piece =================
   Claude decides what goes where in the room's terms (which wall, how far along, how far out, beside what);
   the code turns that into exact coordinates, checks it against doors, windows, walls and the other pieces,
   fixes what it can, and sends what it can't back to Claude once. */

const RESIZABLE = new Set(['wardrobe', 'closet-lit', 'kitchen-counter', 'kitchen-luxe', 'kitchen-tall-luxe', 'console', 'sideboard-fluted', 'bookshelf', 'panel-slats', 'panel-stone', 'panel-upholstered', 'wall-panel-wood', 'media-wall', 'tv-wall', 'wall-molding', 'feature-stone', 'bar-unit', 'planter-flowers', 'desk', 'vanity', 'vanity-luxe', 'curtain']);
const SEATING = /sofa|sectional|armchair|lounge|chair|barrel|bench|pouf|stool|jhoola/;
const NOT_SOLID = new Set(['rug', 'rug-round', 'loft-platform', 'stair-curved', 'ceiling-cove']);
const isSolid = it => { const d = CAT[it.type]; return !!d && !d.nc && !WALLMOUNT.has(it.type) && !NOT_SOLID.has(it.type) && (+withDefaults(it).y || 0) < 2; };
const ftIn = v => fmtFtIn(Math.max(0, v));
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];

// the room's walls as faces seen from inside: interior corner, run direction, inward normal, openings, solid stretches
function roomFrame(r) {
  let poly = r.polygon.map(p => [+p[0], +p[1]]);
  // drop repeated and collinear corners
  for (let k = 0; k < 2; k++) poly = poly.filter((p, i) => { const a = poly[(i - 1 + poly.length) % poly.length], b = poly[(i + 1) % poly.length]; const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]], l1 = Math.hypot(...e1), l2 = Math.hypot(...e2); if (l1 < .05) return false; return !(Math.abs(e1[0] * e2[1] - e1[1] * e2[0]) / (l1 * l2 || 1) < .02 && dot2(e1, e2) > 0); });
  if (poly.length < 3) poly = r.polygon;
  const n = poly.length, edges = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .05) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; let nn = [-u[1], u[0]];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (!pip([m[0] + nn[0] * .3, m[1] + nn[1] * .3], poly)) nn = [-nn[0], -nn[1]];
    // walls lying along this edge
    const cover = [];
    for (const w of layout.walls) {
      const WL = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (WL < .1) continue; const wu = [(w.b[0] - w.a[0]) / WL, (w.b[1] - w.a[1]) / WL];
      if (Math.abs(dot2(wu, u)) < .98) continue;
      const dist = Math.abs((m[0] - w.a[0]) * -wu[1] + (m[1] - w.a[1]) * wu[0]); if (dist > Math.max(.9, w.thickness)) continue;
      let s0 = dot2([w.a[0] - a[0], w.a[1] - a[1]], u), s1 = dot2([w.b[0] - a[0], w.b[1] - a[1]], u); if (s0 > s1) [s0, s1] = [s1, s0];
      s0 = Math.max(0, s0); s1 = Math.min(L, s1); if (s1 - s0 < .3) continue;
      cover.push({ w, s0, s1, wu });
    }
    const covered = cover.reduce((s, c) => s + c.s1 - c.s0, 0);
    edges.push({ a, b, L, u, n: nn, cover, off: covered >= L * .4 ? Math.max(...cover.map(c => c.w.thickness / 2)) : 0 });
  }
  // interior outline: each edge pushed in by half its wall, corners where neighbours meet
  const inner = edges.map((e, i) => {
    const p = edges[(i - 1 + edges.length) % edges.length], A = [e.a[0] + e.n[0] * e.off, e.a[1] + e.n[1] * e.off], B = [p.a[0] + p.n[0] * p.off, p.a[1] + p.n[1] * p.off];
    const den = p.u[0] * e.u[1] - p.u[1] * e.u[0]; if (Math.abs(den) < 1e-6) return A;
    const t = ((A[0] - B[0]) * e.u[1] - (A[1] - B[1]) * e.u[0]) / den; return [B[0] + p.u[0] * t, B[1] + p.u[1] * t];
  });
  const xs = inner.map(p => p[0]), zs = inner.map(p => p[1]), ox = Math.min(...xs), oz = Math.min(...zs);
  const N = hasNorth(), faces = [];
  edges.forEach((e, i) => {
    let S = inner[i], E = inner[(i + 1) % inner.length], u = e.u;
    // along runs left→right on top/bottom walls and top→bottom on side walls
    if (Math.abs(u[0]) >= Math.abs(u[1]) ? u[0] < 0 : u[1] < 0) { [S, E] = [E, S]; u = [-u[0], -u[1]]; }
    const len = Math.hypot(E[0] - S[0], E[1] - S[1]); if (len < .4) return;
    const side = Math.abs(e.n[1]) >= Math.abs(e.n[0]) * 1.5 ? (e.n[1] > 0 ? 'top' : 'bottom') : Math.abs(e.n[0]) >= Math.abs(e.n[1]) * 1.5 ? (e.n[0] > 0 ? 'left' : 'right') : `${e.n[1] > 0 ? 'top' : 'bottom'}-${e.n[0] > 0 ? 'left' : 'right'} (angled)`;
    const along = p => dot2([p[0] - S[0], p[1] - S[1]], u);
    const ops = [], walled = [];
    for (const c of e.cover) {
      const ca = along([e.a[0] + e.u[0] * c.s0, e.a[1] + e.u[1] * c.s0]), cb = along([e.a[0] + e.u[0] * c.s1, e.a[1] + e.u[1] * c.s1]);
      walled.push([Math.max(0, Math.min(ca, cb)), Math.min(len, Math.max(ca, cb))]);
      const w = c.w, WL = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      for (const o of w.openings || []) {
        const P0 = [w.a[0] + c.wu[0] * o.start, w.a[1] + c.wu[1] * o.start], P1 = [w.a[0] + c.wu[0] * o.end, w.a[1] + c.wu[1] * o.end];
        let a0 = along(P0), a1 = along(P1); if (a0 > a1) [a0, a1] = [a1, a0]; if (a1 < -.2 || a0 > len + .2) continue;
        const mid = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2], other = roomAt(mid[0] - e.n[0] * (w.thickness / 2 + 1.2), mid[1] - e.n[1] * (w.thickness / 2 + 1.2));
        let swingsIn = false; if (o.type === 'door' && (o.swing?.max ?? o.swing?.open ?? 90) !== 0 || /main/i.test(o.name || '')) { const sd = o.swing?.side || 1, wn = [-c.wu[1] * sd, c.wu[0] * sd]; swingsIn = dot2(wn, e.n) > 0; }
        if (o.type === 'door' && o.swing && o.swing.open === 0 && !/main/i.test(o.name || '')) swingsIn = false;
        ops.push({ type: o.type, a0: clamp(a0, 0, len), a1: clamp(a1, 0, len), sill: o.sill || 0, head: o.head || 7, to: other && other !== r ? other.name : (other ? null : 'outside'), main: /main/i.test(o.name || ''), swingsIn });
      }
    }
    ops.sort((p, q) => p.a0 - q.a0);
    // open stretches (no wall) and the solid stretches that furniture can stand against
    const wl = walled.sort((p, q) => p[0] - q[0]), open = []; let cur = 0;
    for (const [p, q] of wl) { if (p > cur + .3) open.push([cur, p]); cur = Math.max(cur, q); } if (cur < len - .3) open.push([cur, len]);
    const blocks = [...ops.filter(o => o.type !== 'window').map(o => [o.a0 - .15, o.a1 + .15]), ...open].sort((p, q) => p[0] - q[0]);
    const solid = []; cur = 0; for (const [p, q] of blocks) { if (p - cur >= 1) solid.push([cur, p]); cur = Math.max(cur, q); } if (len - cur >= 1) solid.push([cur, len]);
    const wins = ops.filter(o => o.type === 'window');
    faces.push({ id: 'W' + (faces.length + 1), S, E, u, n: e.n, len, side, dir: N ? DIRNAME[dirOf(bearingOf(-e.n[0], -e.n[1]))] : null, ops, open, solid: solid.map(([p, q]) => [Math.max(0, p), Math.min(len, q)]), clearSolid: solid.map(([p, q]) => [Math.max(0, p), Math.min(len, q)]).flatMap(([p, q]) => { const out = []; let c = p; for (const w of wins) { if (w.a1 <= c || w.a0 >= q) continue; if (w.a0 - c >= 1) out.push([c, w.a0]); c = Math.max(c, w.a1); } if (q - c >= 1) out.push([c, q]); return out; }), thick: e.off * 2 });
  });
  const rect = inner.length === 4 && faces.length === 4 && faces.every(f => Math.abs(f.u[0]) > .999 || Math.abs(f.u[1]) > .999);
  // keep-clear zones: in front of every door, slider and opening, as deep as the door is wide (min 3 ft)
  const clear = [];
  for (const f of faces) for (const o of f.ops) {
    if (o.type === 'window') continue;
    // doors keep their swing and a step beyond it clear; wide sliders and archways only the walkway through their middle
    const wd = o.type === 'door' ? o.a1 - o.a0 : Math.min(o.a1 - o.a0, o.type === 'slider' ? 5 : 6), depth = o.type === 'door' && o.swingsIn ? Math.max(3, wd + .3) : o.type === 'door' ? 3 : 2.5, m = (o.a0 + o.a1) / 2;
    const c = [f.S[0] + f.u[0] * m + f.n[0] * depth / 2, f.S[1] + f.u[1] * m + f.n[1] * depth / 2];
    clear.push({ cx: c[0], cz: c[1], hx: wd / 2 + .2, hz: depth / 2, c: f.u[0], s: f.u[1], face: f.id, o });
  }
  return { r, faces, inner, ox, oz, w: Math.max(...xs) - ox, d: Math.max(...zs) - oz, rect, clear };
}
const toLoc = (F, p) => [p[0] - F.ox, p[1] - F.oz];
const L1 = v => f1(v).replace(/\.0$/, '');
const ptL = (F, p) => { const q = toLoc(F, p); return `(${L1(q[0])},${L1(q[1])})`; };

function describeRoom(F, withHints = true) {
  const r = F.r, lines = [];
  lines.push(`ROOM "${r.name}" — ${r.type}${r.kind === 'outdoor' ? ', outdoor' : ''}${r.size ? `, printed size ${r.size}` : ''}${hasNorth() ? `, in the ${DIRNAME[roomZone(r)]} of the home` : ''}.`);
  lines.push(F.rect ? `Clear floor ${ftIn(F.w)} × ${ftIn(F.d)} (${L1(F.w)} × ${L1(F.d)} ft), ${Math.round(F.w * F.d)} sq ft. Room coordinates: X 0–${L1(F.w)} left to right, Z 0–${L1(F.d)} top to bottom; (0,0) is the top-left inside corner.`
    : `Clear floor outline (room coordinates, X right, Z down): ${F.inner.map(p => ptL(F, p)).join(' ')}. Bounding box ${L1(F.w)} × ${L1(F.d)} ft, floor area ${Math.round(polyArea(F.inner))} sq ft.`);
  lines.push('Walls (along = feet along the wall face from its left end for top/bottom walls, from its top end for side walls):');
  for (const f of F.faces) {
    const ops = f.ops.map(o => o.type === 'window' ? `window ${L1(o.a0)}–${L1(o.a1)} (sill ${L1(o.sill)} ft)` : `${o.main ? 'MAIN ENTRANCE door' : o.type === 'opening' ? 'open doorway' : o.type} ${L1(o.a0)}–${L1(o.a1)}${o.to ? ' to ' + o.to : ''}${o.type === 'door' ? (o.swingsIn ? ', swings into this room' : ', swings outward') : ''}`);
    const open = f.open.map(([p, q]) => `no wall ${L1(p)}–${L1(q)}${(() => { const m = (p + q) / 2, x = f.S[0] + f.u[0] * m - f.n[0] * 1.2, z = f.S[1] + f.u[1] * m - f.n[1] * 1.2, o = roomAt(x, z); return o && o !== F.r ? ' (open to ' + o.name + ')' : ''; })()}`);
    lines.push(` ${f.id}: ${f.side} wall${f.dir ? ` (${f.dir} side)` : ''}, ${L1(f.len)} ft from ${ptL(F, f.S)} to ${ptL(F, f.E)}, faces into the room toward (${f1(f.n[0])},${f1(f.n[1])}).${ops.length || open.length ? ' ' + [...ops, ...open].join('; ') + '.' : ''} Solid: ${f.solid.length ? f.solid.map(([p, q]) => `${L1(p)}–${L1(q)}`).join(', ') : 'none'}${f.clearSolid.length !== f.solid.length || f.clearSolid.some((s, i) => s[0] !== f.solid[i]?.[0] || s[1] !== f.solid[i]?.[1]) ? ` (without windows: ${f.clearSolid.map(([p, q]) => `${L1(p)}–${L1(q)}`).join(', ') || 'none'})` : ''}.`);
  }
  if (F.clear.length) lines.push('Keep clear (door swings and walkways): ' + F.clear.map(z => { const f = F.faces.find(q => q.id === z.face), m = dot2([z.cx - f.S[0], z.cz - f.S[1]], f.u); return `${f.id} ${L1(m - z.hx)}–${L1(m + z.hx)} along, ${L1(z.hz * 2)} ft out`; }).join('; ') + '.');
  const drawn = withHints ? (layout.planFurniture || []).filter(p => p.room === r.name) : [];
  if (drawn.length) {
    const fw = { 0: 'down (+Z)', 90: 'right (+X)', 180: 'up (-Z)', '-90': 'left (-X)' };
    lines.push("THE ARCHITECT'S PLAN SHOWS THIS FURNITURE (follow it: same piece, same place, same orientation, same size, unless the homeowner's notes say otherwise):");
    for (const p of drawn) lines.push(` - ${p.kind}: ${L1(p.x1 - p.x0)} × ${L1(p.z1 - p.z0)} ft, X ${L1(p.x0 - F.ox)}–${L1(p.x1 - F.ox)}, Z ${L1(p.z0 - F.oz)}–${L1(p.z1 - F.oz)}${p.rot != null ? `, front facing ${fw[p.rot]}` : ''}${(() => { const f = nearFace(F, [(p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2], Math.max(p.x1 - p.x0, p.z1 - p.z0)); return f ? `, against ${f.id}` : ''; })()}`);
  }
  return lines.join('\n');
}
function nearFace(F, c, size) { let best = null, bd = 1e9; for (const f of F.faces) { const d = dot2([c[0] - f.S[0], c[1] - f.S[1]], f.n), a = dot2([c[0] - f.S[0], c[1] - f.S[1]], f.u); if (a < -.5 || a > f.len + .5 || d < 0) continue; if (d < bd) { bd = d; best = f; } } return best && bd < size * .6 + .6 ? best : null; }

const DESIGN_RULES = `HOW A GOOD DESIGNER LAYS OUT A ROOM (follow these; they are what make a room feel planned rather than filled):
1. Circulation first. From every door draw the path a person walks: at least 3 ft wide (2.5 ft in small rooms and bathrooms) to the bed sides, the sofa, the wardrobe, the counter, the next door. Nothing stands in a "Keep clear" zone or across a path.
2. Anchor the big piece on the right wall. Beds: headboard centred on a solid wall stretch (not a wall with a door, ideally not under a window), usually the wall facing or beside the entrance but not directly in line with the door; at least 2 ft clear on each side of a double bed and 3 ft at its foot. Sofas: facing the focal wall (TV or feature), 8–12 ft from a TV, back to a wall or floating with a console behind it; never with its back to the entrance door if avoidable. Dining tables: centred in the dining zone with 3 ft from the table edge to any wall or piece on every side with chairs. Wardrobes and tall units: on long solid stretches with 3 ft in front for the doors, never across a window.
3. Kitchens: counters along solid walls in an L, U, parallel or straight run as the room allows; the sink under the window if there is one; the hob on a solid wall away from the door and not under a window; the fridge (tall-unit "fridge") at the end of a run; 3.5–4 ft between parallel counters or counter and island. Follow the counters drawn on the plan exactly.
4. Bathrooms: the shower in the far corner from the door; the WC on a side wall, not facing the door if avoidable, with 1.3 ft each side; the vanity near the door; keep 2 ft clear in front of each.
5. Centre and align. Centre the hero piece on its wall stretch or on the window; line pieces up with each other; mirror pairs (nightstands, lamps, armchairs, sconces) exactly; equal gaps.
6. Scale to the room. Choose sizes (w, d) that fit the clear floor with the paths above: a queen bed (5 × 6.7 ft) in rooms under 11 ft wide, a king (6.4 × 7.4) only from 12 ft; a 3-seat sofa (7 ft) unless the wall is long; rugs sized so the front legs of every seat sit on them, 1–1.5 ft inside the walls.
7. Windows and light: don't block windows with anything taller than the sill; curtains go on the window wall beside each window; a reading chair or desk goes by the window.
8. Every room must be fully furnished for how it will be used, and every piece must have a reason to be where it is.`;

const PLACE_SCHEMA = `PLACING PIECES — use the room coordinates and wall ids above, never whole-home coordinates. Each item is one of:
 a) Against a wall: {"id":"bed1","type":"bed-luxe","wall":"W3","along":7.7,"off":0, ...} — the item's back is "off" feet from that wall face (0 = touching), its centre is "along" feet along it, and its front faces into the room. Use this for everything that stands against or hangs on a wall (beds, sofas on a wall, wardrobes, counters, consoles, desks, vanities, WCs, TVs, art, mirrors, sconces, wall panels, curtains) and for pieces that face away from a wall from further out (a floating sofa: off = distance from the wall behind it).
 b) Next to another piece: {"id":"ct1","type":"coffee-plinth","rel":"sofa1","side":"front","gap":1.5} — side is "front", "back", "left" or "right" (the piece's own left/right, as if sitting on it), gap is the clear distance between them, "shift" slides it sideways; it faces the other piece unless "face" or "turn" says otherwise. "side":"both" places a mirrored pair left and right.
 c) On top of a piece: {"type":"lamp-table","on":"ns1"} (lamps, vases, decor) or above one: {"type":"pendant-linear","over":"table1"} (pendants, chandeliers).
 d) At a point: {"id":"rug1","type":"rug","at":[9.2,7.6],"rot":0,"w":9,"d":12} — X,Z in room coordinates; rot in degrees: front faces +Z (down) at 0, +X (right) at 90, -Z (up) at 180, -X (left) at -90.
 Optional on any item: "face":"W2" (turn its front toward that wall) or "face":"<id>" (toward that piece); "turn": extra degrees; w, d, h, y (lift off the floor), finish, accent, name, and any extra fields the catalog note gives.
 Groups the code builds for you: on a dining table "chairs": 6 and "chair": "dining-chair-luxe"; on a bed "nightstands": true (two matched nightstands at the headboard, "lamps": true puts a lamp on each); on an island "stools": 3. A "ceiling-cove" with no position fills the room's ceiling.
 Give "id" to any piece another piece refers to; refer only to ids defined earlier in the list.`;

function furnishPrompt(rooms, extra = '') {
  const st = project.style, cat = Object.entries(CAT).map(([k, d]) => `${k}: ${d.d.w}×${d.d.d}×${d.d.h}${d.d.y ? ' y' + d.d.y : ''} — ${NOTES[k] || d.label}`).join('\n');
  const others = layout.rooms.filter(r => r.kind !== 'ledge').map(r => `${r.name} (${r.type})`).join(', '), BRIEF = briefForFurnish();
  const blocks = rooms.map(r => { const F = roomFrame(r); return describeRoom(F) + (project.roomStyles?.[r.name] ? `\nROOM STYLE (from inspiration for this room; it overrides the home style here): ${project.roomStyles[r.name].summary} Signature: ${(project.roomStyles[r.name].features || []).join(', ') || 'none'}.` : ''); }).join('\n\n');
  return `You are a senior interior designer at a luxury studio, placing furniture into a 3D model of a real home built from its architect's floor plan. The homeowner will walk through it, so the layout must be one a professional would sign off: right pieces, right sizes, in the right places, with a reason for each. Units are feet.

STYLE: ${st.summary} Signature elements: ${(st.features || []).join(', ') || 'none given'}. Plants: ${st.plants}.
FINISH TOKENS (use these so the style stays consistent): wood-light, wood-dark, stone, marble, stone-dark, fabric-main, fabric-second, fabric-accent, metal. Also allowed: linen, linen-white, white-ceramic, black-metal, brass, felt, terracotta, concrete, plaster, teak, glass, glass-bronze, onyx, marble-green, marble-rosso, travertine-dark, velvet-emerald, velvet-rust, velvet-navy, velvet-blush, velvet-mustard, velvet-ink, or a "#rrggbb" hex (rugs and fabrics). Use one or two rich contrast materials per room against the calm base tokens.
HOMEOWNER'S NOTES: ${(project.brief || 'none').slice(0, 1200)}${extra ? '\nREQUEST FOR THESE ROOMS (takes priority over the notes): ' + String(extra).slice(0, 600) : ''}
CEILING HEIGHT: ${layout.settings.ceilingHeight} ft. The whole home has: ${others}.${BRIEF ? '\n' + BRIEF : ''}

${blocks}

${DESIGN_RULES}

CATALOG (type: default w×d×h — notes):
${cat}

FINISHING (after the layout works): living, dining and bedrooms get a feature treatment on the focal wall (tv-wall, media-wall, panel-stone, panel-slats, panel-upholstered, wall-panel-wood, wall-molding, arch-niche, or bed-luxe whose headboard wall is the feature), a ceiling-cove, three layers of light (a statement pendant or chandelier, a floor or table lamp, sconces), one hero piece, a rug, art, a plant, and sheer curtains at the windows — scaled to the budget. Bathrooms: vanity-luxe, shower-luxe in the far corner, wc, a plant. Walk-ins: closet-lit on the solid walls. Balconies: an outdoor seat, planters, a small table. Pooja rooms: a pooja-unit centred on the east or west wall. Rooms must not repeat each other's feature, rug or accent colour.

${PLACE_SCHEMA}

Think it through before answering: for each room decide its entrance path, its focal wall, the hero piece's wall and position, then fit everything else around the paths. Check every piece against the wall lengths, solid stretches and keep-clear zones above.
Reply with only JSON: {"items":[{"room":"<room name>","type":"<catalog type>","name":"<short label>", ...placement..., "finish":"<token>","accent":"<token>"}]}`;
}

/* ---------- from room terms to coordinates ---------- */
const rotOf = v => r2(((Math.atan2(v[0], v[1]) / D2R) + 540) % 360 - 180);
const fwd = rot => [Math.sin((rot || 0) * D2R), Math.cos((rot || 0) * D2R)];
function resolveItems(raw, frames, roomsByName) {
  const out = [], byId = {}, notes = [];
  const list = (Array.isArray(raw) ? raw : []).filter(x => x && typeof x === 'object' && CAT[x.type]);
  const pending = [...list];
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    for (let i = 0; i < pending.length; i++) {
      const src = pending[i], ref = src.rel ?? src.on ?? src.over;
      if (ref != null && !byId[ref]) { if (pass < 2) continue; notes.push(`${src.type}${src.id ? ' "' + src.id + '"' : ''} refers to "${ref}", which was not placed`); pending.splice(i--, 1); continue; }
      pending.splice(i--, 1);
      const r = roomsByName[src.room] || (ref != null ? roomsByName[byId[ref]?.room] : null) || (isFinite(+src.x) && isFinite(+src.z) ? roomAt(+src.x, +src.z) : null) || (frames.length === 1 ? frames[0].r : null); if (!r) { notes.push(`${src.type} has no room`); continue; }
      const F = frames.find(f => f.r === r) || roomFrame(r);
      const it = { type: src.type, name: String(src.name || CAT[src.type].label).slice(0, 40), room: r.name };
      for (const [k, v] of Object.entries(src)) if (!['id', 'type', 'name', 'room', 'wall', 'along', 'off', 'at', 'rel', 'side', 'gap', 'shift', 'on', 'over', 'face', 'turn', 'chairs', 'chair', 'nightstands', 'lamps', 'stools', 'x', 'z'].includes(k)) it[k] = v;
      for (const k of ['rot', 'w', 'd', 'h', 'y']) if (k in it) { const v = +it[k]; if (!isFinite(v) || (['w', 'd', 'h'].includes(k) && v <= 0)) delete it[k]; else it[k] = v; }
      const f = () => withDefaults(it);
      let anchor = null;
      const face = F.faces.find(q => q.id === String(src.wall || '').toUpperCase());
      if (face) {
        const fw = f().w, raw = isFinite(+src.along) ? +src.along : face.len / 2, along = face.len >= fw ? clamp(raw, fw / 2, face.len - fw / 2) : clamp(raw, 0, face.len), off = Math.max(0, +src.off || 0), d = f().d;
        it.x = face.S[0] + face.u[0] * along + face.n[0] * (off + d / 2); it.z = face.S[1] + face.u[1] * along + face.n[1] * (off + d / 2);
        it.rot = rotOf(face.n); anchor = { face: face.id, along, off };
      } else if (ref != null) {
        const R = byId[ref], RF = withDefaults(R), fr = fwd(R.rot), right = [-fr[1], fr[0]], left = [fr[1], -fr[0]], sh = +src.shift || 0;
        if (src.on != null || src.over != null) {
          it.x = R.x + right[0] * sh; it.z = R.z + right[1] * sh; it.rot = R.rot || 0;
          if (src.on != null && !('y' in src)) it.y = r2((+RF.y || 0) + (+RF.h || 0));
          anchor = { on: src.on ?? null, over: src.over ?? null }; it._ref = R;
        } else {
          const side = String(src.side || 'front').toLowerCase(), gap = +src.gap || 0;
          const place = sd => {
            const v = sd === 'front' ? fr : sd === 'back' ? [-fr[0], -fr[1]] : sd === 'left' ? left : right;
            const depthR = sd === 'front' || sd === 'back' ? RF.d / 2 : RF.w / 2;
            const lateral = sd === 'front' || sd === 'back' ? right : fr;
            const c = { ...it };
            // seats placed across from a piece face it; tables, rugs and the rest line up with it
            const across = sd === 'front' || sd === 'back';
            c.rot = across && SEATING.test(c.type) ? rotOf([-v[0], -v[1]]) : (R.rot || 0);
            const myDepth = across ? withDefaults(c).d / 2 : withDefaults(c).w / 2;
            c.x = R.x + v[0] * (depthR + gap + myDepth) + lateral[0] * sh; c.z = R.z + v[1] * (depthR + gap + myDepth) + lateral[1] * sh;
            return c;
          };
          if (side === 'both') { const a = place('left'), b = place('right'); Object.assign(it, a); const twin = { ...b, name: it.name }; twin._anchor = { rel: ref, side: 'right' }; finishItem(twin, src, F, byId); out.push(twin); anchor = { rel: ref, side: 'left' }; }
          else { Object.assign(it, place(side)); anchor = { rel: ref, side }; }
        }
      } else if (numOk(src.at)) {
        it.x = F.ox + +src.at[0]; it.z = F.oz + +src.at[1]; it.rot = +src.rot || 0; anchor = { at: true };
      } else if (src.type === 'ceiling-cove') {
        const xs = F.inner.map(p => p[0]), zs = F.inner.map(p => p[1]);
        it.x = (Math.min(...xs) + Math.max(...xs)) / 2; it.z = (Math.min(...zs) + Math.max(...zs)) / 2; it.rot = 0; it.w ??= r2(F.w - .3); it.d ??= r2(F.d - .3); it.y ??= r2(layout.settings.ceilingHeight - .6); anchor = { at: true };
      } else if (isFinite(+src.x) && isFinite(+src.z)) { it.x = +src.x; it.z = +src.z; it.rot = +src.rot || 0; anchor = { global: true }; }
      else { notes.push(`${src.type} "${it.name}" in ${r.name} has no position`); continue; }
      it._anchor = anchor;
      finishItem(it, src, F, byId, frames);
      if (src.id != null) byId[src.id] = it;
      out.push(it);
      // groups
      if (+src.chairs > 0 && /table|pool-table/.test(src.type)) out.push(...chairsFor(it, Math.min(14, Math.round(+src.chairs)), CAT[src.chair] ? src.chair : 'dining-chair-luxe', src));
      if (src.nightstands && /bed/.test(src.type)) out.push(...nightstandsFor(it, !!src.lamps));
      if (+src.stools > 0 && /island/.test(src.type)) out.push(...stoolsFor(it, Math.min(6, Math.round(+src.stools))));
    }
  }
  for (const it of out) { it.x = r2(it.x); it.z = r2(it.z); it.rot = r2(((it.rot || 0) + 540) % 360 - 180); }
  return { items: out, notes };
}
function finishItem(it, src, F, byId) {
  if (src.face != null) {
    const f = F.faces.find(q => q.id === String(src.face).toUpperCase()), R = byId[src.face];
    if (f) it.rot = rotOf([-f.n[0], -f.n[1]]); else if (R) it.rot = rotOf([R.x - it.x, R.z - it.z]);
  }
  if (isFinite(+src.turn)) it.rot = (it.rot || 0) + +src.turn;
}
function chairsFor(T, n, type, src) {
  const t = withDefaults(T), c = withDefaults({ type }), fr = fwd(T.rot), ax = [fr[1], -fr[0]], out = [];
  const mk = (x, z, rot) => ({ type, name: CAT[type].label, room: T.room, x, z, rot, finish: src.chairFinish || c.finish, accent: c.accent, _anchor: { group: true }, _group: T });
  if (T.type === 'table-round' || Math.abs(t.w - t.d) < .3 && t.w < 5) {
    const R = t.w / 2 + c.d / 2 - .35; for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI, v = [Math.sin(a), Math.cos(a)]; out.push(mk(T.x + v[0] * R, T.z + v[1] * R, rotOf([-v[0], -v[1]]))); }
    return out;
  }
  // long sides run along the table's width, as many chairs as fit with elbow room; the rest go to the ends
  const cap = Math.max(1, Math.floor((t.w - .2) / (c.w + .3))), per = Math.min(cap, Math.floor(n / 2)), ends = Math.min(2, n - 2 * per), pitch = t.w / per;
  for (const sg of [1, -1]) for (let i = 0; i < per; i++) {
    const s = -t.w / 2 + pitch * (i + .5), off = t.d / 2 + c.d / 2 - .4;
    out.push(mk(T.x + ax[0] * s + fr[0] * sg * off, T.z + ax[1] * s + fr[1] * sg * off, rotOf([-fr[0] * sg, -fr[1] * sg])));
  }
  for (let e = 0; e < ends; e++) { const sg = e ? -1 : 1, off = t.w / 2 + c.d / 2 - .3; out.push(mk(T.x + ax[0] * sg * off, T.z + ax[1] * sg * off, rotOf([-ax[0] * sg, -ax[1] * sg]))); }
  return out;
}
function nightstandsFor(B, lamps) {
  const b = withDefaults(B), ns = withDefaults({ type: 'nightstand' }), fr = fwd(B.rot), ax = [fr[1], -fr[0]], out = [];
  for (const sg of [-1, 1]) {
    const back = b.d / 2 - ns.d / 2, side = b.w / 2 + .15 + ns.w / 2;
    const it = { type: 'nightstand', name: 'Nightstand', room: B.room, x: B.x - fr[0] * back + ax[0] * sg * side, z: B.z - fr[1] * back + ax[1] * sg * side, rot: B.rot, _anchor: B._anchor?.face ? { face: B._anchor.face, off: B._anchor.off } : { group: true } };
    out.push(it);
    if (lamps) out.push({ type: 'lamp-table', name: 'Bedside lamp', room: B.room, x: it.x, z: it.z, rot: B.rot, y: r2(ns.h), _anchor: { on: true }, _ref: it });
  }
  return out;
}
function stoolsFor(I, n) {
  const t = withDefaults(I), s = withDefaults({ type: 'bar-stool' }), fr = fwd(I.rot), ax = [fr[1], -fr[0]], out = [], span = t.w - s.w;
  for (let i = 0; i < n; i++) { const p = n > 1 ? -span / 2 + span * i / (n - 1) : 0, off = t.d / 2 + s.d / 2 - .1; out.push({ type: 'bar-stool', name: 'Counter stool', room: I.room, x: I.x + ax[0] * p + fr[0] * off, z: I.z + ax[1] * p + fr[1] * off, rot: rotOf([-fr[0], -fr[1]]), _anchor: { group: true }, _group: I }); }
  return out;
}

/* ---------- check the room as built; fix what code can, list the rest ---------- */
function obbCorners(it) { const f = withDefaults(it), th = (it.rot || 0) * D2R, c = Math.cos(th), s = Math.sin(th), hx = f.w / 2, hz = f.d / 2; return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [it.x + a * c + b * s, it.z - a * s + b * c]); }
function insideRoom(it, F, slack = .08) { return obbCorners(it).every(p => pip(p, F.inner) || F.inner.some((q, i) => segDist(p[0], p[1], q, F.inner[(i + 1) % F.inner.length]) < slack)); }
function faceSpan(it, f) { const wd = withDefaults(it).w, a = dot2([it.x - f.S[0], it.z - f.S[1]], f.u); return [a - wd / 2, a + wd / 2, a]; }
function auditRoom(items, F) {
  const issues = [], label = it => `${it.type} "${it.name}" at ${ptL(F, [it.x, it.z])}`;
  const mine = items.filter(it => it.room === F.r.name);
  const shift = (it, dx, dz) => { it.x += dx; it.z += dz; for (const o of mine) if (o._ref === it) shift(o, dx, dz); };
  // wall pieces: keep them off doors (and tall ones off windows), sliding along the wall to the nearest stretch that fits
  for (const it of mine) {
    const A = it._anchor; if (!A?.face) continue; const f = F.faces.find(q => q.id === A.face); if (!f) continue;
    if (A.off > .3 || it.type === 'curtain') continue;
    const df = withDefaults(it), wall = WALLMOUNT.has(it.type) || BACKED.has(it.type);
    // tall wall pieces may not cover a window; beds, sofas and low pieces may sit under one
    const tall = wall && (+df.y || 0) + (+df.h || 0) > 3.2 && !['bed', 'bed-luxe', 'sofa', 'sectional', 'outdoor-sofa', 'wc'].includes(it.type);
    const stretches = (tall ? f.clearSolid : f.solid).filter(([p, q]) => q > p);
    let [a0, a1, mid] = faceSpan(it, f); const w = a1 - a0;
    const fits = stretches.find(([p, q]) => a0 >= p - .05 && a1 <= q + .05);
    if (fits) continue;
    let best = null, bd = 1e9;
    for (const [p, q] of stretches) { if (q - p < w - .01) continue; const m = clamp(mid, p + w / 2, q - w / 2), d = Math.abs(m - mid); if (d < bd) { bd = d; best = m; } }
    if (best != null && bd <= Math.max(3, w)) { const dm = best - mid; shift(it, f.u[0] * dm, f.u[1] * dm); A.along = best; continue; }
    // long joinery may give up a little length to fit (never more than a third of it)
    if (RESIZABLE.has(it.type)) {
      const big = stretches.filter(s => s[1] - s[0] >= Math.max(2, w * .67)).sort((p, q) => Math.abs((p[0] + p[1]) / 2 - mid) - Math.abs((q[0] + q[1]) / 2 - mid))[0];
      if (big) { const nw = r2(Math.min(w, big[1] - big[0])), m = clamp(mid, big[0] + nw / 2, big[1] - nw / 2), dm = m - mid; it.w = nw; shift(it, f.u[0] * dm, f.u[1] * dm); A.along = m; continue; }
    }
    issues.push(`${label(it)} on ${f.id} spans ${L1(a0)}–${L1(a1)} along it, which covers ${tall ? 'a door or window' : 'a door or open side'}; the wall's ${tall ? 'stretches without openings' : 'solid stretches'} are ${stretches.map(([p, q]) => `${L1(p)}–${L1(q)}`).join(', ') || 'none'}`);
  }
  // inside the room
  for (const it of mine) {
    if (WALLMOUNT.has(it.type) || it._anchor?.on || (+withDefaults(it).y || 0) > 6) continue;
    if (!insideRoom(it, F, it.type === 'rug' || it.type === 'rug-round' ? .5 : .12)) {
      // a piece just over the line steps back in
      const cen = centroid(F.inner), x0 = it.x, z0 = it.z;
      for (let k = 1; k <= 12 && !insideRoom(it, F); k++) { const v = [cen[0] - it.x, cen[1] - it.z], L = Math.hypot(...v) || 1; shift(it, v[0] / L * .1, v[1] / L * .1); }
      if (!insideRoom(it, F, .15)) { shift(it, x0 - it.x, z0 - it.z); issues.push(`${label(it)} (${L1(withDefaults(it).w)} × ${L1(withDefaults(it).d)} ft) sticks out of the room`); }
    }
  }
  // doors and walkways
  for (const it of mine) {
    if (!isSolid(it) || it._anchor?.on) continue;
    for (const z of F.clear) { const m = sat(itemOBB(it), z); if (m && m.ov > .2) issues.push(`${label(it)} stands in the clear zone of the ${z.o.main ? 'main entrance' : z.o.type}${z.o.to ? ' to ' + z.o.to : ''} on ${z.face} (${L1(z.o.a0)}–${L1(z.o.a1)} along, keep ${L1(z.hz * 2)} ft out clear)`); }
  }
  // pieces running into each other
  const solid = mine.filter(it => isSolid(it) && !it._anchor?.on);
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const A = solid[i], B = solid[j]; if (A._group === B || B._group === A || (A._group && A._group === B._group)) continue;
    const m = sat(itemOBB(A), itemOBB(B)); if (m && m.ov > .25) issues.push(`${label(A)} overlaps ${label(B)} by ${L1(m.ov)} ft`);
  }
  return [...new Set(issues)];
}

async function furnishOne(sample, rooms, extra, signal, repairOK) {
  const frames = rooms.map(roomFrame), byName = Object.fromEntries(layout.rooms.map(r => [r.name, r]));
  const prompt = furnishPrompt(rooms, extra);
  let res = await sample.json(prompt, { modelTier: 'default', signal });
  let raw = Array.isArray(res) ? res : res?.items, { items, notes } = resolveItems(raw, frames, byName);
  let issues = [...notes, ...frames.flatMap(F => auditRoom(items, F))];
  if (issues.length && repairOK) {
    const fixPrompt = `${prompt}\n\nYOUR FIRST ANSWER:\n${JSON.stringify({ items: raw })}\n\nWHEN IT WAS BUILT, THESE PROBLEMS CAME UP:\n- ${issues.slice(0, 40).join('\n- ')}\n\nFix every problem without breaking anything that worked (move, resize, swap or drop pieces as a designer would; keep the design intent). Reply with only the complete corrected JSON in the same shape: {"items":[...]}.`;
    try {
      const res2 = await sample.json(fixPrompt, { modelTier: 'default', signal });
      const raw2 = Array.isArray(res2) ? res2 : res2?.items;
      if (Array.isArray(raw2) && raw2.length >= Math.min(3, (raw || []).length * .5)) { const r2_ = resolveItems(raw2, frames, byName), iss2 = [...r2_.notes, ...frames.flatMap(F => auditRoom(r2_.items, F))]; if (iss2.length <= issues.length) { items = r2_.items; issues = iss2; raw = raw2; } }
    } catch (e) { if (e?.code === 'cancelled') throw e; }
  }
  for (const it of items) { if (it._anchor && !it._anchor.global && !(it._anchor.face && (it._anchor.off || 0) <= .3)) it._float = true; delete it._anchor; delete it._group; delete it._ref; }
  return { items: settleItems(items, rooms), issues };
}
