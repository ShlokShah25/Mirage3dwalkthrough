/* ================= reference photos: copy the room in the client's photo =================
   A client's Pinterest or magazine photo is read into a recipe: every piece in it (a catalog piece when one really looks
   like it, otherwise a custom piece built from parts), its colours and materials, how the room is arranged, the wall
   treatment, the styling and the light. The palette becomes the room's style as before; the recipe is handed to the
   furnishing step (with the photo itself) as the thing to reproduce. */

const CUSTOM_GUIDE = `CUSTOM PIECES: when no catalog type really looks like the piece wanted (its silhouette, proportions and character), build it instead: {"type":"custom","name":"<short label>","parts":[...], ...placement}. Feet. In the piece's own frame x runs across its front, y up from the floor and z toward its front (its back faces -z). Build it centred on x = 0, z = 0, standing on y = 0. It keeps the parts' own size unless you also give w, d, h. At most 60 parts. Each part has "s" (its shape), "at": [x, y, z], optional "rot": [rx, ry, rz] in degrees, and "m" (its material). A part turns about its "at" point (for the shapes that stand on at.y, that is the middle of their base); rot [0, 90, 0] is a quarter turn that points the part's own +x toward -z (the back) and its +z toward +x. Points given in "pts" are measured from "at":
 box {w, h, d, r: edge rounding} stands on at.y
 cushion {w, h, d, round: .15 crisp to .5 plump} a filled upholstered block, stands on at.y: seats, backs, arms, pillows, mattresses, poufs, headboard channels
 cyl {r, r2: top radius, h} stands on at.y: legs (taper with r2), drums, columns, discs, plinths
 sphere {r, scale: [sx, sy, sz], half: true for a dome} centred on at: globes, pebbles, domes, knobs, leaves
 torus {R, r, arc: degrees} an upright ring in the x-y plane centred on at; rot [90, 0, 0] lays it flat: rims, hoops, rings
 lathe {pts: [[radius, y], ...]} a turned form around the vertical axis, smooth through the points: vases, bowls, lamp bases, bell shades, pedestal bases, turned legs
 tube {pts: [[x, y, z], ...], r} a round rod bent smoothly through the points: bentwood, metal frames, arcs, hairpin legs, handles, branches
 shape {pts: [[x, y], ...], depth, bevel, holes: [[[x, y], ...]]} an outline drawn in the x-y plane (seen from the front), given thickness along z: cut-out panels, scalloped headboards, curved side frames; rot [0, 90, 0] turns it into a side profile; rot [-90, 0, 0] lays it flat as a top of any outline (then "depth" is its thickness, centred on at.y)
 arch {w, h, depth} an arch-topped panel standing on at.y: arched mirrors, headboards, doors, cabinets, niches
 Copies: "mirror": "x" adds the mirror image on the other side, "xz" makes four (legs); "repeat": {"n": 6, "step": [dx, dy, dz]} (slats, flutes, shelves, channels); "around": {"n": 8, "r": 1.2} (a ring of copies centred on "at", each turned to face outward, tubes included).
 Materials, for any part: the finish tokens; "wood:#hex", "fabric:#hex", "linen:#hex", "boucle:#hex", "velvet:#hex", "leather:#hex", "stone:travertine|marble|limestone|concrete|terrazzo:#hex", "metal:#hex" (add ":brushed" or ":matte"), "brass", "chrome", "black-metal", "lacquer:#hex" (gloss paint), "matte:#hex" (flat paint), "ceramic:#hex" (add ":matte"), "stoneware:#hex", "rattan:#hex", "cane:#hex" (open cane webbing), "jute:#hex", "fluted:#hex", "glass:#hex", "mirror", "glow:#hex" (a lit shade or light source).
 Build what makes the piece recognisable: the silhouette and proportions, the legs, how the cushions sit, the channels, seams and welts (several cushions side by side), where the material changes. Real sizes: seat height 1.4 to 1.5, seat depth 1.8 to 2.0, armrest 2.0 to 2.2, dining table 2.5 high, counter 3.0, bed top 1.8 to 2.0. Another piece with the same parts (the second of a pair) is just {"type":"custom","copy":"<id of the first>", ...placement}. A piece's own right, as if sitting in it, is -x. A custom piece is used and placed exactly like a catalog piece: "y" lifts the whole piece, and something that stands on another piece is placed with "on".`;

const REF_ROOMS = ['living', 'dining', 'bedroom', 'kitchen', 'bath', 'study', 'foyer', 'balcony', 'kids', 'other'];
// which recipe family a room belongs to
const refFamily = r => ({ master: 'bedroom', bedroom: 'bedroom', staff: 'bedroom', walkin: 'bedroom', bath: 'bath', utility: 'bath', kitchen: 'kitchen', dining: 'dining', study: 'study', cabin: 'study', foyer: 'foyer', passage: 'foyer', balcony: 'balcony', terrace: 'balcony', living: 'living', pooja: 'other' })[r?.type] || (isOutdoorType(r?.type) ? 'balcony' : 'living');

const REF_PROMPT = (brief, room) => {
  const cat = Object.entries(CAT).filter(([k]) => k !== 'custom').map(([k, d]) => `${k}: ${d.d.w}×${d.d.d}×${d.d.h} — ${NOTES[k] || d.label}`).join('\n');
  const where = room ? (() => { const xs = room.polygon.map(p => p[0]), zs = room.polygon.map(p => p[1]); return `one room of their home: the ${room.name} (a ${room.type}, ceiling ${layout.settings.ceilingHeight} ft, about ${Math.round(Math.max(...xs) - Math.min(...xs))} × ${Math.round(Math.max(...zs) - Math.min(...zs))} ft, ${Math.round(polyArea(room.polygon))} sq ft)`; })() : `their whole home (each photo may show a different room; ceilings are ${layout.settings.ceilingHeight} ft)`;
  return `You are a senior interior designer. A client has given you reference photos (Pinterest, magazines, hotels, showrooms) for ${where}, and wants their room to look like the photo: the same kinds of pieces with the same shapes, colours, materials and arrangement, fitted to their room. A 3D model of their home will be built from what you write, so be exact. Study each photo closely before you answer.

Reply with only one JSON object:
{
 "summary": "one sentence describing the look",
 "keywords": ["4-7 short tags"],
 "walls": "#hex wall colour", "ceiling": "#hex ceiling colour",
 "tokens": {
   "wood-light": "#hex main timber", "wood-dark": "#hex darker timber",
   "stone": {"look": "travertine|marble|limestone|concrete|terrazzo", "color": "#hex"},
   "marble": {"look": "marble|terrazzo|concrete", "color": "#hex worktop / vanity stone"},
   "stone-dark": {"look": "marble|concrete", "color": "#hex dark statement stone"},
   "fabric-main": "#hex main upholstery", "fabric-second": "#hex secondary upholstery", "fabric-accent": "#hex accent textile",
   "metal": "brass|black|chrome"
 },
 "floors": {
   "living": {"finish": "stone-large|wood|tile-2ft|terrazzo", "color": "#hex"},
   "bedroom": {"finish": "wood|stone-large|tile-2ft", "color": "#hex"},
   "wet": {"finish": "stone-large|tile-1ft|tile-2ft|terrazzo", "color": "#hex"},
   "outdoor": {"finish": "stone|wood|tile-2ft", "color": "#hex"}
 },
 "cove": true or false (is there a lit cove or recessed strip light in the ceiling),
 "time": "golden|day|night" (the light in the photo),
 "plants": "none|some|lush",
 "features": ["up to 6 signature elements"],
 "recipes": [ one for each kind of room the photos show${room ? ' (here normally one, for this room)' : ''}:
  {
   "shows": "${REF_ROOMS.join('|')}",
   "wall": {"color": "#hex", "treatment": "paint|limewash|wood panelling|fluted wood|wainscot moulding|stone cladding|wallpaper|plaster arches|other", "where": "all walls or which wall"},
   "pieces": [
     {"role": "what it does in the room, e.g. main sofa, accent chair, coffee table, rug, pendant, art above sofa",
      "type": "<a catalog type that really looks like it, or custom>", "name": "short descriptive label, e.g. bouclé cloud sofa",
      "count": 1, "w": 0, "d": 0, "h": 0, "y": 0,
      "finish": "<material>", "accent": "<material>",
      "parts": [ ... only for custom: see CUSTOM PIECES ... ],
      "where": "where it is: which wall as seen in the photo (the wall facing the camera, the left wall, the right wall, the window wall), what it faces, what it stands next to or on (on the coffee table, on the sideboard), how far out from the wall"}
   ],
   "layout": "two or three sentences: the focal wall, what faces what, what stands in each corner, how much floor is left open",
   "styling": "the small things that make the photo: cushions and throws (colours, how many), books, vases and branches, bowls, trays, candles, plants (kind and size), art (subject, colours, frame), mirrors",
   "light": "every light you see (pendants, chandeliers, lamps, sconces, cove or strip light, candles) and the mood"
  }
 ]
}

RULES
1. List every piece you can see, big and small, including the lights, rug, curtains, art, mirror, plants and the styling objects. A pair of chairs is one entry with count 2.
2. Use a catalog type only when that piece really looks like it: same silhouette, proportions and character. A generic stand-in is a failure: if the photo has a channel-tufted velvet sofa, a cane-back chair, a mushroom lamp, a scalloped headboard or a fluted pedestal table and the catalog has nothing that looks like it, build it as a custom piece. Many of the newest catalog pieces (sofa-cloud, sofa-channel, chair-cane, chair-shell, chair-bentwood, table-pedestal, coffee-pebble, side-drum, mirror-arch, cabinet-arch, lamp-mushroom, lamp-paper, pendant-paper, bed-wing, bed-platform, bench-curved, shelves-floating, vase-branches, decor-books) were made from Pinterest rooms; use them when they match.
3. Colours are the real observed colours of the objects (allow for the photo's warm or cool light: a white sofa in golden light is still white). Do not drift everything toward beige. Name the material you see: bouclé or linen or velvet or leather; light oak or walnut or ebonised wood; travertine or marble or limestone; brushed brass or black metal or chrome; cane or rattan or jute.
4. Sizes in feet from real proportions (seat height 1.4 to 1.5; a three-seat sofa is 7 to 8.5 wide; a king bed 6.6 wide; a coffee table 1.2 to 1.5 high), not from how big things look in the photo.
5. Fields a catalog note mentions (kind, seed, options) may be given on the piece. A styling object that stands on another piece says so in "where" (on the coffee table) and gives no y.
6. Finish values may be the style tokens (they then follow this palette) or any explicit material string from CUSTOM PIECES; prefer explicit materials for anything that must match the photo exactly.
${brief ? 'CLIENT NOTES (context): ' + brief.slice(0, 500) + '\n' : ''}
${CUSTOM_GUIDE}

CATALOG (type: default w×d×h — notes):
${cat}`;
};

// keep only what the furnishing step can use, with the custom pieces cleaned
function normRecipes(list) {
  return (Array.isArray(list) ? list : []).slice(0, 6).filter(r => r && typeof r === 'object').map(r => ({
    shows: REF_ROOMS.includes(r.shows) ? r.shows : 'living',
    wall: r.wall && typeof r.wall === 'object' ? { color: hexOk(r.wall.color, null), treatment: String(r.wall.treatment || 'paint').slice(0, 60), where: String(r.wall.where || '').slice(0, 120) } : null,
    pieces: (Array.isArray(r.pieces) ? r.pieces : []).slice(0, 40).filter(p => p && typeof p === 'object').map(p => {
      const o = { role: String(p.role || '').slice(0, 80), type: p.type === 'custom' ? 'custom' : (nearType(p.type) || 'custom'), name: String(p.name || p.role || '').slice(0, 60), count: Math.max(1, Math.min(12, Math.round(+p.count || 1))), where: String(p.where || '').slice(0, 220) };
      for (const k of ['w', 'd', 'h', 'y']) if (+p[k] > 0) o[k] = r2(+p[k]);
      for (const k of ['finish', 'accent']) if (p[k]) o[k] = String(p[k]).slice(0, 60);
      if (o.type === 'custom') { o.parts = (Array.isArray(p.parts) ? p.parts : []).slice(0, 60); if (!o.parts.length) return null; }
      return o;
    }).filter(Boolean),
    layout: String(r.layout || '').slice(0, 700), styling: String(r.styling || '').slice(0, 700), light: String(r.light || '').slice(0, 500),
  })).filter(r => r.pieces.length);
}
// the recipe to copy in a room: its own photos first, then a whole-home photo of the same kind of room
function recipeFor(r) {
  const own = project.roomStyles?.[r.name]?.recipe; if (own) return { recipe: own, photos: project.roomInspo?.[r.name] || [] };
  const fam = refFamily(r), list = project.style?.recipes || [];
  const hit = list.find(x => x.shows === fam) || (fam === 'dining' ? list.find(x => x.shows === 'living') : fam === 'living' ? list.find(x => x.shows === 'dining') : null);
  return hit ? { recipe: hit, photos: project.inspo || [] } : null;
}
function recipeText(rec) {
  const pieces = rec.pieces.map(p => JSON.stringify(p)).join('\n');
  return `REFERENCE TO COPY (read from the client's own photo, which is attached; this room must look like it):
Wall: ${rec.wall ? `${rec.wall.treatment} ${rec.wall.color || ''} ${rec.wall.where ? '(' + rec.wall.where + ')' : ''}` : 'as the style says'}
Layout in the photo: ${rec.layout || 'not described'}
Styling: ${rec.styling || 'not described'}
Light: ${rec.light || 'not described'}
Pieces in the photo (one per line; custom pieces carry their parts):
${pieces}
HOW TO COPY IT: place every piece listed, with its type, name, finish and accent, and for a custom piece its "parts" copied exactly, character for character. Keep their sizes unless the room is too small, then shrink widths a little rather than dropping pieces. Arrange them as the photo does, mapped onto this room's walls, windows and doors (the photo's focal wall becomes this room's best solid wall). Add the styling objects and lights described (decor-books, vase-branches, floor-vase, cushions as custom pieces, lamps). Rugs, ceiling coves and curtains are sized to this room, not to the photo. This reference overrides the FINISHING list: add a feature wall, extra lights or decor only when the photo shows them or the room's use needs them. Only after that, add what this room's use still needs that the photo does not show, in the same style. The wall colour is applied for you from the photo; for panelling, fluted wood, stone cladding, moulding or arches seen in the photo, add the matching wall piece (wall-panel-wood, panel-slats, feature-stone, panel-stone, wall-molding, arch-niche) on that wall.`;
}
// for the change engine: the photo recipes behind the rooms being changed, so "make it more like my photo" can be done
function refsFor(rooms) {
  const out = []; for (const r of rooms || []) { const ref = recipeFor(r); if (ref) out.push(`\nThe ${r.name} was designed from the client's reference photo. ${recipeText(ref.recipe).split('\nHOW TO COPY IT')[0]}`); }
  return out.join('\n').slice(0, 14000);
}

/* ---------- "copy this photo here": a Pinterest photo dropped into Mira's chat refurnishes the room the client stands in ---------- */
async function copyPhotoInto(img, room) {
  room ||= roomAt(player.x, player.z) || (selected && layout.rooms.find(r => r.name === selected.room));
  if (!room || room.kind === 'ledge') { gNote('Walk into the room you want to look like this photo, then add it again.', 'sys'); return; }
  if (running) { gNote('One moment: a change is still being made. Add the photo again when it finishes.', 'sys'); return; }
  if (!SITE && wallet.credits < BILLING.perChange - 1e-9) { openWallet('empty'); return; }
  if (SITE && !(await SITE.canEdit?.(project))) return;
  if (!GUIDE.open) openGuide(true);
  const me = gSay(`Make the ${room.name} look like this photo.`, 'you'), im = document.createElement('img'); im.className = 'gimg'; im.src = img; im.alt = 'Reference photo'; me.appendChild(im);
  const typing = gNote(`Studying your photo: every piece, its shape, colours and materials…`, 'guide typing');
  try {
    const sample = await getSample(); if (!sample) throw Object.assign(new Error('Claude is not available in this view.'), { code: 'unavailable' });
    if (SITE) SITE.ctx = { kind: 'reference', homeId: project.id };
    const raw = await sample.json(REF_PROMPT(project.brief, room), { images: [img], modelTier: 'complex' });
    const st = normalizeStyle(raw), recipe = st.recipes.find(x => x.shows === refFamily(room)) || st.recipes[0];
    typing.remove();
    if (!recipe) { gSay('I could not find furniture in that photo to copy. Try a photo that shows the whole room.'); return; }
    gSay(`I see ${st.summary.replace(/\.$/, '')}. ${recipe.pieces.length} pieces to recreate${recipe.pieces.some(p => p.type === 'custom') ? `, ${recipe.pieces.filter(p => p.type === 'custom').length} of them built specially to match` : ''}. Rebuilding the ${room.name} now.`);
    project.roomInspo ||= {}; project.roomInspo[room.name] = [img, ...(project.roomInspo[room.name] || [])].slice(0, 4);
    project.roomStyles ||= {}; project.roomStyles[room.name] = { summary: st.summary, features: st.features, tokens: st.tokens, floor: st.floors[roomCat(room.type)], recipe, walls: recipe.wall?.color || st.walls, ceiling: st.ceiling };
    room.finish = st.floors[roomCat(room.type)].finish; room.floor = st.floors[roomCat(room.type)].color; room.wall = recipe.wall?.color || st.walls; room.ceil = st.ceiling;
    buildAll();
    await refurnishRoom(room, `Recreate the client's reference photo in this room (see REFERENCE TO COPY).`, false);
    const n = layout.furniture.filter(it => it.room === room.name).length;
    if (!SITE && n) charge(`Copy a photo · ${room.name}`, BILLING.perChange);
    gSay(n ? `The ${room.name} now follows your photo. Walk around it, and tell me anything that should be closer to the picture.` : `I could not furnish the ${room.name} from that photo. Nothing was charged for the furniture; try again.`);
    saveSoon();
  } catch (e) { typing.remove(); if (e?.code !== 'cancelled') gNote(errText(e), 'sys'); }
}
$('guidePic').addEventListener('click', () => $('guidePicFile').click());
$('guidePicFile').addEventListener('change', async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const { image } = await prepImage(f, 1.1e6, .82); copyPhotoInto(image); } catch { gNote('That picture could not be read. Try a JPG or PNG.', 'sys'); } });
