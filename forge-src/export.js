/* ================= Forge exporters =================
   Every writer takes the same mesh: positions (Float32Array of x, y, z in millimetres, Z up) and indices (three per
   triangle, counter-clockwise seen from outside). Formats for printing keep millimetres and Z up; formats for viewing
   on screens or in AR (GLB, USDZ) are converted to metres with Y up, as those formats expect. */
const enc = new TextEncoder();
const F = v => { const s = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(5); return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s; };
const safeName = n => String(n || 'model').replace(/[^\w .-]+/g, ' ').trim().slice(0, 60) || 'model';
const triCount = m => m.indices.length / 3;
function normalOf(p, a, b, c, out) {
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2], ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az, vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; nz /= l; } out[0] = nx; out[1] = ny; out[2] = nz; return l;
}
// drop corners no triangle uses, so files hold only what is needed
function compact(m) {
  const p = m.positions, idx = m.indices, map = new Int32Array(p.length / 3).fill(-1), pos = []; const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { let k = map[idx[i]]; if (k < 0) { k = map[idx[i]] = pos.length / 3; pos.push(p[idx[i] * 3], p[idx[i] * 3 + 1], p[idx[i] * 3 + 2]); } out[i] = k; }
  return { positions: new Float32Array(pos), indices: out };
}

/* ---- STL ---- */
function toSTL(m, name) {
  const n = triCount(m), buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), p = m.positions, idx = m.indices, N = [0, 0, 0];
  new Uint8Array(buf, 0, 80).set(enc.encode(`${safeName(name)} - made with Forge - units mm`.slice(0, 79))); dv.setUint32(80, n, true);
  for (let t = 0, o = 84; t < n; t++, o += 50) { const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2]; normalOf(p, a, b, c, N); for (let k = 0; k < 3; k++) dv.setFloat32(o + k * 4, N[k], true); let q = o + 12; for (const v of [a, b, c]) for (let k = 0; k < 3; k++, q += 4) dv.setFloat32(q, p[v * 3 + k], true); }
  return new Uint8Array(buf);
}
function toSTLAscii(m, name) {
  const p = m.positions, idx = m.indices, N = [0, 0, 0], out = [`solid ${safeName(name).replace(/\s+/g, '_')}`];
  for (let t = 0; t < idx.length; t += 3) { normalOf(p, idx[t], idx[t + 1], idx[t + 2], N); out.push(` facet normal ${F(N[0])} ${F(N[1])} ${F(N[2])}`, '  outer loop'); for (let k = 0; k < 3; k++) { const v = idx[t + k] * 3; out.push(`   vertex ${F(p[v])} ${F(p[v + 1])} ${F(p[v + 2])}`); } out.push('  endloop', ' endfacet'); }
  out.push(`endsolid ${safeName(name).replace(/\s+/g, '_')}`); return enc.encode(out.join('\n') + '\n');
}
/* ---- OBJ ---- */
function toOBJ(m0, name) {
  const m = compact(m0), p = m.positions, idx = m.indices, out = [`# ${safeName(name)} - made with Forge`, '# units: millimetres, Z up', `o ${safeName(name).replace(/\s+/g, '_')}`];
  for (let i = 0; i < p.length; i += 3) out.push(`v ${F(p[i])} ${F(p[i + 1])} ${F(p[i + 2])}`);
  for (let t = 0; t < idx.length; t += 3) out.push(`f ${idx[t] + 1} ${idx[t + 1] + 1} ${idx[t + 2] + 1}`);
  return enc.encode(out.join('\n') + '\n');
}
/* ---- PLY (binary) ---- */
function toPLY(m0, name) {
  const m = compact(m0), p = m.positions, idx = m.indices, nV = p.length / 3, nT = idx.length / 3;
  const head = enc.encode(`ply\nformat binary_little_endian 1.0\ncomment ${safeName(name)} - made with Forge - units mm\nelement vertex ${nV}\nproperty float x\nproperty float y\nproperty float z\nelement face ${nT}\nproperty list uchar int vertex_indices\nend_header\n`);
  const buf = new Uint8Array(head.length + nV * 12 + nT * 13), dv = new DataView(buf.buffer); buf.set(head); let o = head.length;
  for (let i = 0; i < p.length; i++, o += 4) dv.setFloat32(o, p[i], true);
  for (let t = 0; t < nT; t++) { dv.setUint8(o, 3); o++; for (let k = 0; k < 3; k++, o += 4) dv.setInt32(o, idx[t * 3 + k], true); }
  return buf;
}
/* ---- zip (for 3MF and USDZ) ---- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function deflateRaw(data) { if (typeof CompressionStream === 'undefined') return null; try { const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(data); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); } catch { return null; } }
// files: [{ name, data: Uint8Array }]. compress: shrink entries when the browser can; align: pad so each file's bytes start on a multiple of `align` (USDZ needs 64).
async function zip(files, { compress = true, align = 0 } = {}) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name), crc = crc32(f.data); let body = f.data, method = 0; if (compress) { const z = await deflateRaw(f.data); if (z && z.length < f.data.length) { body = z; method = 8; } }
    let extra = new Uint8Array(0); if (align) { const start = off + 30 + nameB.length, padTo = Math.ceil((start + 4) / align) * align, n = padTo - start - 4; extra = new Uint8Array(4 + n); new DataView(extra.buffer).setUint16(0, 0x1986, true); new DataView(extra.buffer).setUint16(2, n, true); }
    const h = new Uint8Array(30), dv = new DataView(h.buffer); dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, method, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, crc, true); dv.setUint32(18, body.length, true); dv.setUint32(22, f.data.length, true); dv.setUint16(26, nameB.length, true); dv.setUint16(28, extra.length, true);
    const c = new Uint8Array(46), cv = new DataView(c.buffer); cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, f.data.length, true); cv.setUint16(28, nameB.length, true); cv.setUint32(42, off, true);
    central.push(c, nameB); parts.push(h, nameB, extra, body); off += 30 + nameB.length + extra.length + body.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, b) => s + b.length, 0)); let o = 0; for (const b of all) { out.set(b, o); o += b.length; } return out;
}
/* ---- 3MF ---- */
async function to3MF(m0, name) {
  const m = compact(m0), p = m.positions, idx = m.indices, v = [], t = [];
  for (let i = 0; i < p.length; i += 3) v.push(`<vertex x="${F(p[i])}" y="${F(p[i + 1])}" z="${F(p[i + 2])}"/>`);
  for (let i = 0; i < idx.length; i += 3) t.push(`<triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}"/>`);
  const nm = safeName(name).replace(/[<>&"]/g, ' ');
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Title">${nm}</metadata>\n<metadata name="Application">Forge</metadata>\n<resources>\n<object id="1" name="${nm}" type="model">\n<mesh>\n<vertices>\n${v.join('\n')}\n</vertices>\n<triangles>\n${t.join('\n')}\n</triangles>\n</mesh>\n</object>\n</resources>\n<build>\n<item objectid="1"/>\n</build>\n</model>\n`;
  return zip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
  ]);
}
/* ---- AMF ---- */
function toAMF(m0, name) {
  const m = compact(m0), p = m.positions, idx = m.indices, out = ['<?xml version="1.0" encoding="UTF-8"?>', '<amf unit="millimeter" version="1.1">', `<metadata type="name">${safeName(name).replace(/[<>&"]/g, ' ')}</metadata>`, '<object id="0"><mesh><vertices>'];
  for (let i = 0; i < p.length; i += 3) out.push(`<vertex><coordinates><x>${F(p[i])}</x><y>${F(p[i + 1])}</y><z>${F(p[i + 2])}</z></coordinates></vertex>`);
  out.push('</vertices><volume>'); for (let i = 0; i < idx.length; i += 3) out.push(`<triangle><v1>${idx[i]}</v1><v2>${idx[i + 1]}</v2><v3>${idx[i + 2]}</v3></triangle>`);
  out.push('</volume></mesh></object>', '</amf>'); return enc.encode(out.join('\n') + '\n');
}
/* ---- Collada (DAE) ---- */
function toDAE(m0, name) {
  const m = compact(m0), p = m.positions, idx = m.indices, nm = safeName(name).replace(/[<>&"]/g, ' '), now = new Date().toISOString();
  return enc.encode(`<?xml version="1.0" encoding="utf-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">\n<asset><contributor><authoring_tool>Forge</authoring_tool></contributor><created>${now}</created><modified>${now}</modified><unit name="millimeter" meter="0.001"/><up_axis>Z_UP</up_axis></asset>\n<library_geometries><geometry id="mesh" name="${nm}"><mesh>\n<source id="mesh-pos"><float_array id="mesh-pos-array" count="${p.length}">${Array.from(p, F).join(' ')}</float_array><technique_common><accessor source="#mesh-pos-array" count="${p.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>\n<vertices id="mesh-vtx"><input semantic="POSITION" source="#mesh-pos"/></vertices>\n<triangles count="${idx.length / 3}"><input semantic="VERTEX" source="#mesh-vtx" offset="0"/><p>${Array.from(idx).join(' ')}</p></triangles>\n</mesh></geometry></library_geometries>\n<library_visual_scenes><visual_scene id="scene"><node id="model" name="${nm}"><instance_geometry url="#mesh"/></node></visual_scene></library_visual_scenes>\n<scene><instance_visual_scene url="#scene"/></scene>\n</COLLADA>\n`);
}
/* ---- GLB (glTF 2.0 binary): metres, Y up ---- */
function yUpMetres(m0) {       // corners are split per triangle so each face keeps its own flat shading
  const p = m0.positions, idx = m0.indices, n = idx.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), N = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t += 3) { normalOf(p, idx[t], idx[t + 1], idx[t + 2], N); for (let k = 0; k < 3; k++) { const v = idx[t + k] * 3, o = (t + k) * 3, x = p[v] / 1000, y = p[v + 2] / 1000, z = -p[v + 1] / 1000; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; nor[o] = N[0]; nor[o + 1] = N[2]; nor[o + 2] = -N[1]; if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z; } }
  return { pos, nor, lo, hi, n };
}
function toGLB(m0, name) {
  const { pos, nor, lo, hi, n } = yUpMetres(m0), bin = new Uint8Array(pos.byteLength + nor.byteLength); bin.set(new Uint8Array(pos.buffer), 0); bin.set(new Uint8Array(nor.buffer), pos.byteLength);
  const json = { asset: { version: '2.0', generator: 'Forge' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: safeName(name) }], meshes: [{ name: safeName(name), primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0, mode: 4 }] }],
    materials: [{ name: 'Print', pbrMetallicRoughness: { baseColorFactor: [.78, .78, .76, 1], metallicFactor: 0, roughnessFactor: .7 } }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 }, { buffer: 0, byteOffset: pos.byteLength, byteLength: nor.byteLength, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: lo, max: hi }, { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' }] };
  let jb = enc.encode(JSON.stringify(json)); const jp = (4 - jb.length % 4) % 4, bp = (4 - bin.length % 4) % 4, total = 12 + 8 + jb.length + jp + 8 + bin.length + bp, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, jb.length + jp, true); dv.setUint32(16, 0x4E4F534A, true); out.set(jb, 20); out.fill(0x20, 20 + jb.length, 20 + jb.length + jp);
  const o = 20 + jb.length + jp; dv.setUint32(o, bin.length + bp, true); dv.setUint32(o + 4, 0x004E4942, true); out.set(bin, o + 8); return out;
}
/* ---- USDZ (for AR on iPhone and iPad): metres, Y up ---- */
async function toUSDZ(m0, name) {
  const { pos, nor, n } = yUpMetres(m0), P = [], Nn = [], I = [];
  for (let i = 0; i < n; i++) { P.push(`(${+pos[i * 3].toFixed(7)}, ${+pos[i * 3 + 1].toFixed(7)}, ${+pos[i * 3 + 2].toFixed(7)})`); Nn.push(`(${F(nor[i * 3])}, ${F(nor[i * 3 + 1])}, ${F(nor[i * 3 + 2])})`); I.push(i); }
  const usda = `#usda 1.0\n(\n    customLayerData = {\n        string creator = "Forge"\n    }\n    defaultPrim = "Root"\n    metersPerUnit = 1\n    upAxis = "Y"\n)\n\ndef Xform "Root"\n{\n    def Scope "Materials"\n    {\n        def Material "Print"\n        {\n            token outputs:surface.connect = </Root/Materials/Print/Shader.outputs:surface>\n\n            def Shader "Shader"\n            {\n                uniform token info:id = "UsdPreviewSurface"\n                color3f inputs:diffuseColor = (0.78, 0.78, 0.76)\n                float inputs:metallic = 0\n                float inputs:roughness = 0.7\n                token outputs:surface\n            }\n        }\n    }\n\n    def Mesh "Model" (\n        prepend apiSchemas = ["MaterialBindingAPI"]\n    )\n    {\n        int[] faceVertexCounts = [${new Array(n / 3).fill(3).join(', ')}]\n        int[] faceVertexIndices = [${I.join(', ')}]\n        normal3f[] normals = [${Nn.join(', ')}] (\n            interpolation = "vertex"\n        )\n        point3f[] points = [${P.join(', ')}]\n        uniform token subdivisionScheme = "none"\n        rel material:binding = </Root/Materials/Print>\n    }\n}\n`;
  return zip([{ name: 'model.usda', data: enc.encode(usda) }], { compress: false, align: 64 });
}
/* ---- STEP (ISO 10303-21): the solid as flat faces, one per triangle. CAD programs open it as a solid body made of facets. ---- */
const STEP_MAX = 30000;
function toSTEP(m0, name) {
  const m = compact(m0), p = m.positions, idx = m.indices, nT = idx.length / 3, nV = p.length / 3; if (nT > STEP_MAX) throw new Error(`STEP holds one flat face per triangle, which is only practical up to ${STEP_MAX.toLocaleString()} triangles; this model has ${nT.toLocaleString()}. Use 3MF or STL for it, or a lower detail setting.`);
  const L = [], nm = safeName(name).replace(/'/g, ''); let id = 0; const add = s => { L.push(`#${++id}=${s};`); return id; }, R = v => { const s = F(v); return s.includes('.') ? s : s + '.'; };
  const ctx = add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`); add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${ctx})`);
  const pc = add(`PRODUCT_CONTEXT('',#${ctx},'mechanical')`), prod = add(`PRODUCT('${nm}','${nm}','',(#${pc}))`), pdf = add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`), pdc = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ctx},'design')`), pd = add(`PRODUCT_DEFINITION('design','',#${pdf},#${pdc})`), pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
  const lu = add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`), au = add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`), su = add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`), unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#${lu},'distance_accuracy_value','confusion accuracy')`);
  const gctx = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lu},#${au},#${su}))REPRESENTATION_CONTEXT('Context','3D'))`);
  const o0 = add(`CARTESIAN_POINT('',(0.,0.,0.))`), dz = add(`DIRECTION('',(0.,0.,1.))`), dx = add(`DIRECTION('',(1.,0.,0.))`), ax0 = add(`AXIS2_PLACEMENT_3D('',#${o0},#${dz},#${dx})`);
  const cp = new Int32Array(nV), vp = new Int32Array(nV); for (let i = 0; i < nV; i++) { cp[i] = add(`CARTESIAN_POINT('',(${R(p[i * 3])},${R(p[i * 3 + 1])},${R(p[i * 3 + 2])}))`); vp[i] = add(`VERTEX_POINT('',#${cp[i]})`); }
  const edges = new Map(), edgeOf = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b), k = lo * nV + hi; let e = edges.get(k); if (!e) { const ux = p[hi * 3] - p[lo * 3], uy = p[hi * 3 + 1] - p[lo * 3 + 1], uz = p[hi * 3 + 2] - p[lo * 3 + 2], l = Math.hypot(ux, uy, uz) || 1; const d = add(`DIRECTION('',(${R(ux / l)},${R(uy / l)},${R(uz / l)}))`), v = add(`VECTOR('',#${d},${R(l)})`), ln = add(`LINE('',#${cp[lo]},#${v})`); e = add(`EDGE_CURVE('',#${vp[lo]},#${vp[hi]},#${ln},.T.)`); edges.set(k, e); } return [e, a < b]; };
  const faces = [], N = [0, 0, 0];
  for (let t = 0; t < nT; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2]; if (!(normalOf(p, a, b, c, N) > 1e-12)) continue;
    const oe = [[a, b], [b, c], [c, a]].map(([u, v]) => { const [e, fwd] = edgeOf(u, v); return add(`ORIENTED_EDGE('',*,*,#${e},${fwd ? '.T.' : '.F.'})`); });
    const loop = add(`EDGE_LOOP('',(${oe.map(e => '#' + e).join(',')}))`), bound = add(`FACE_OUTER_BOUND('',#${loop},.T.)`);
    let rx = p[b * 3] - p[a * 3], ry = p[b * 3 + 1] - p[a * 3 + 1], rz = p[b * 3 + 2] - p[a * 3 + 2]; const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    const dn = add(`DIRECTION('',(${R(N[0])},${R(N[1])},${R(N[2])}))`), dr = add(`DIRECTION('',(${R(rx)},${R(ry)},${R(rz)}))`), ax = add(`AXIS2_PLACEMENT_3D('',#${cp[a]},#${dn},#${dr})`), pl = add(`PLANE('',#${ax})`);
    faces.push(add(`ADVANCED_FACE('',(#${bound}),#${pl},.T.)`));
  }
  const shell = add(`CLOSED_SHELL('',(${faces.map(f => '#' + f).join(',')}))`), brep = add(`MANIFOLD_SOLID_BREP('${nm}',#${shell})`), rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('${nm}',(#${ax0},#${brep}),#${gctx})`); add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
  const stamp = new Date().toISOString().slice(0, 19);
  return enc.encode(`ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('${nm}'),'2;1');\nFILE_NAME('${nm}.step','${stamp}',('Forge'),(''),'Forge','Forge','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`);
}

// what the app offers: id, file ending, label, what it is for, and the writer (some are async)
const FORMATS = [
  { id: 'stl', ext: 'stl', label: 'STL', note: 'Every slicer and printer. Millimetres.', mime: 'model/stl', write: toSTL },
  { id: '3mf', ext: '3mf', label: '3MF', note: 'Modern print format: smaller, carries units. Bambu, Prusa, Cura.', mime: 'model/3mf', write: to3MF },
  { id: 'obj', ext: 'obj', label: 'OBJ', note: 'Blender, Maya, most 3D tools.', mime: 'model/obj', write: toOBJ },
  { id: 'step', ext: 'step', label: 'STEP', note: 'CAD programs (Fusion, SolidWorks, FreeCAD): a solid made of flat facets.', mime: 'model/step', write: toSTEP, max: STEP_MAX },
  { id: 'glb', ext: 'glb', label: 'GLB', note: 'Web, games, AR on Android. Metres, Y up.', mime: 'model/gltf-binary', write: toGLB },
  { id: 'usdz', ext: 'usdz', label: 'USDZ', note: 'AR on iPhone and iPad. Metres, Y up.', mime: 'model/vnd.usdz+zip', write: toUSDZ },
  { id: 'ply', ext: 'ply', label: 'PLY', note: 'Scanning and research tools, MeshLab.', mime: 'application/octet-stream', write: toPLY },
  { id: 'dae', ext: 'dae', label: 'DAE', note: 'Collada: SketchUp and older 3D tools.', mime: 'model/vnd.collada+xml', write: toDAE },
  { id: 'amf', ext: 'amf', label: 'AMF', note: 'Older print format, still read by most slicers.', mime: 'application/x-amf', write: toAMF },
  { id: 'stla', ext: 'stl', label: 'STL (text)', note: 'The same STL as readable text, for tools that need it.', mime: 'model/stl', write: toSTLAscii },
];
export { FORMATS, toSTL, toSTLAscii, toOBJ, toPLY, to3MF, toAMF, toDAE, toGLB, toUSDZ, toSTEP, zip, crc32, compact, safeName };
