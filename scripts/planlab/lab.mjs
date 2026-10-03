// Plan lab: runs Mirage's real plan-reading code (the browser modules) headless, one step at a time, so a plan read can be
// driven and scored from the command line. The model's answers come from files, so any Claude can play the model:
// the API (see run-api.mjs) or a person/agent answering prompt files by hand.
//   node lab.mjs prompt  <dir>            write the first-read prompt and image to <dir>
//   node lab.mjs first   <dir>            take <dir>/answer-first.json, snap to pixels, write the check prompt + overlay
//   node lab.mjs check   <dir>            take <dir>/answer-check.json (optional), start the deep read: write round 1
//   node lab.mjs round   <dir> <n>        take <dir>/answer-round-<n>.json, apply, write round n+1 (or finish)
//   node lab.mjs score   <dir> [key.json] score the current tracing (and compare with an answer key layout)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.env.PLAYWRIGHT_ROOT || '/home/claude/.npm-global/lib/node_modules', 'playwright'))); }
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../app-src/');
const read = f => fs.readFileSync(SRC + f, 'utf8');
const grab = (src, re) => { const m = src.match(re); if (!m) throw new Error('missing ' + re); return m[0]; };
const trace = read('p3b_trace.js'), world = read('p2c_world.js'), app = read('p3a_app.js');
const helpers = [
  grab(app, /^const clamp = .*$/m), grab(app, /^const r1 = .*$/m), grab(app, /^function loadImg.*$/m), grab(app, /^function dataURLtoBlob.*$/m),
  grab(world, /^const isOutdoorType = .*$/m), grab(world, /^function centroid.*$/m), grab(world, /^function polyArea.*$/m), grab(world, /^function pip.*$/m),
  grab(trace, /^const PLAN_PROMPT = [\s\S]*?^\$\{brief[^\n]*\n?/m).replace(/\n?$/, ''),
  grab(trace, /^const TYPES = .*$/m), grab(trace, /^function normType[\s\S]*?^}/m), grab(trace, /^function fmtFtIn.*$/m), grab(trace, /^const numOk = .*$/m),
].join('\n');
const page_src = `${helpers}\n${read('p3g_planfix.js')}\n${read('p3j_deepread.js')}\nwindow.LAB = { PLAN_PROMPT, PLAN_CHECK_PROMPT, DEEP_PROMPT, planInk, refineTrace, fitToDims, traceOverlay, inkSegments, auditTrace, applyDeepEdits, snapRoomsToWalls, refinePinned, deepCrop, deepRoundInputs, compactTrace, deepRead, boxPad, boxHit, segBox, segPoly, measureRooms, wallFrames, applyAnswer, pinAskEdits, plainIssue };`;

export async function openLab() {
  const browser = await chromium.launch(); const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message)); page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.setContent('<html><body></body></html>'); await page.addScriptTag({ content: page_src });
  return { browser, page };
}
export const dataURL = file => `data:image/${/png$/i.test(file) ? 'png' : 'jpeg'};base64,` + fs.readFileSync(file).toString('base64');
export const saveURL = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
const J = f => JSON.parse(fs.readFileSync(f, 'utf8')), W = (f, o) => fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o, null, 1));
const planFile = dir => fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => /plan\.(jpe?g|png)$/i.test(f));

// one deep-read round as files: state.json carries the session between runs
async function writeRound(page, dir, st) {
  const out = await page.evaluate(async ({ st, src }) => {
    const L = window.LAB, P = await L.planInk(src), SEGS = L.inkSegments(P), dismissed = new Set(st.dismissed);
    const audit = L.auditTrace(st.tr, P, SEGS, dismissed), { crops, extraSegs } = await L.deepRoundInputs(src, st.tr, P, SEGS, audit, st.zoom, st.round, 8, st.prev || null);
    const overlay = await L.traceOverlay(src, st.tr);
    return { prompt: L.DEEP_PROMPT({ W: P.W, H: P.H, tr: st.tr, audit, crops, log: st.log, round: st.round, maxRounds: st.maxRounds, extraSegs }), overlay, crops: crops.map(c => c.image), audit: { score: audit.score, open: audit.open.map(i => i.id), parts: audit.parts } };
  }, { st, src: dataURL(planFile(dir)) });
  W(path.join(dir, `round-${st.round}-prompt.txt`), out.prompt); saveURL(out.overlay, path.join(dir, `round-${st.round}-overlay.jpg`));
  out.crops.forEach((c, i) => saveURL(c, path.join(dir, `round-${st.round}-C${i + 1}.jpg`)));
  st.audit = out.audit; W(path.join(dir, 'state.json'), st);
  console.log(`round ${st.round}: score ${out.audit.score}, open: ${out.audit.open.join(', ') || 'none'}; ${out.crops.length} close-ups written`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, dir, arg] = process.argv.slice(2); const { browser, page } = await openLab(); const src = dataURL(planFile(dir));
  try {
    if (cmd === 'prompt') {
      const dim = await page.evaluate(async src => { const P = await window.LAB.planInk(src); return [P.W, P.H, window.LAB.PLAN_PROMPT(P.W, P.H, '')]; }, src);
      W(path.join(dir, 'first-prompt.txt'), dim[2]); console.log('plan', dim[0], 'x', dim[1], '→ first-prompt.txt');
    } else if (cmd === 'first') {
      const out = await page.evaluate(async ({ src, tr }) => { const L = window.LAB, P = await L.planInk(src); const r = L.refineTrace(tr, P); const overlay = await L.traceOverlay(src, tr); return { tr, stats: r.stats, hints: r.hints, overlay, prompt: L.PLAN_CHECK_PROMPT(P.W, P.H, tr, r.hints) }; }, { src, tr: J(path.join(dir, 'answer-first.json')) });
      W(path.join(dir, 'trace-1.json'), out.tr); W(path.join(dir, 'check-prompt.txt'), out.prompt); saveURL(out.overlay, path.join(dir, 'check-overlay.jpg')); console.log('snapped:', JSON.stringify(out.stats));
    } else if (cmd === 'check') {
      const f = path.join(dir, 'answer-check.json'); let tr = J(path.join(dir, 'trace-1.json'));
      if (fs.existsSync(f)) { const fixed = J(f); delete fixed.changes; tr = await page.evaluate(async ({ src, tr }) => { const L = window.LAB, P = await L.planInk(src); L.refineTrace(tr, P); return tr; }, { src, tr: fixed }); }
      tr = await page.evaluate(tr => { window.LAB.snapRoomsToWalls(tr); return tr; }, tr);
      W(path.join(dir, 'trace-2.json'), tr);
      await writeRound(page, dir, { tr, round: 1, maxRounds: +arg || 7, log: [], dismissed: [], zoom: [], history: [] });
    } else if (cmd === 'round') {
      const st = J(path.join(dir, 'state.json')), ans = J(path.join(dir, `answer-round-${st.round}.json`));
      const out = await page.evaluate(async ({ st, ans, src }) => {
        const L = window.LAB, P = await L.planInk(src), SEGS = L.inkSegments(P), dismissed = new Set(st.dismissed);
        const before = L.auditTrace(st.tr, P, SEGS, dismissed), next = structuredClone(st.tr), did = L.applyDeepEdits(next, ans.edits, SEGS), rf = L.refinePinned(next, P); L.snapRoomsToWalls(next);
        for (const d of ans.dismiss || []) if (d?.id && before.issues.some(i => i.id === d.id)) dismissed.add(String(d.id));
        const after = L.auditTrace(next, P, SEGS, dismissed), fresh = after.open.filter(i => !before.open.some(j => j.id === i.id));
        const undone = after.score < before.score - 6 && did.length;
        return { tr: undone ? st.tr : next, did, undone, fresh: fresh.map(i => i.text.split('. ')[0]), score: undone ? L.auditTrace(st.tr, P, SEGS, dismissed).score : after.score, dropped: rf.stats.dropped, dismissed: [...dismissed] };
      }, { st, ans, src });
      st.log.push(out.undone ? `round ${st.round}: your edits (${out.did.slice(0, 6).join('; ')}) were undone because they created new problems: ${out.fresh.slice(0, 3).join(' | ')}` : `round ${st.round}: ${out.did.length ? out.did.slice(0, 8).join('; ') : 'no edits'}${(ans.dismiss || []).length ? `; dismissed ${(ans.dismiss || []).length}` : ''}${out.dropped ? `; ${out.dropped} wall(s) lie on plain floor and were removed by the pixel check` : ''}${ans.notes ? ' — your note: ' + String(ans.notes).slice(0, 400) : ''} → score ${out.score}`);
      console.log(st.log.at(-1));
      st.history.push(out.score); if (!out.undone) st.prev = st.tr; st.tr = out.tr; st.dismissed = out.dismissed; st.zoom = (ans.zoom || []).slice(0, 3); st.asks = [...(st.asks || []), ...(ans.ask || [])]; st.round++;
      W(path.join(dir, 'trace-deep.json'), st.tr);
      if (st.round > st.maxRounds) { W(path.join(dir, 'state.json'), st); console.log('out of rounds'); } else await writeRound(page, dir, st);
    } else if (cmd === 'replay') {
      // runs the app's own deepRead() loop with answers read from answer-round-<n>.json (then "done"), to test the loop itself
      const answers = []; for (let n = 1; fs.existsSync(path.join(dir, `answer-round-${n}.json`)); n++) answers.push(J(path.join(dir, `answer-round-${n}.json`)));
      const out = await page.evaluate(async ({ src, tr, answers, maxRounds }) => { const L = window.LAB, P = await L.planInk(src); let n = 0, imgs = [];
        const sample = { json: async (prompt, o) => { imgs.push(o.images.length); return answers[n++] || { edits: [], dismiss: [], done: true }; } };
        const r = await L.deepRead({ tr, P, src, sample, maxRounds }); return { tr: r.tr, history: r.history, rounds: r.rounds, open: r.audit.open.map(i => i.id), score: r.audit.score, asks: r.asks.length, imgs, log: r.log.map(l => l.slice(0, 160)) }; }, { src, tr: J(path.join(dir, "trace-1.json")), answers, maxRounds: +arg || 6 });
      W(path.join(dir, 'trace-replay.json'), out.tr); delete out.tr; console.log(JSON.stringify(out, null, 1));
    } else if (cmd === 'rewrite') {
      await writeRound(page, dir, J(path.join(dir, 'state.json')));
    } else if (cmd === 'score') {
      const f = ['trace-deep.json', 'trace-2.json', 'trace-1.json'].map(x => path.join(dir, x)).find(x => fs.existsSync(x)), tr = J(f);
      const out = await page.evaluate(async ({ tr, src }) => { const L = window.LAB, P = await L.planInk(src), SEGS = L.inkSegments(P), a = L.auditTrace(tr, P, SEGS); const ov = await L.traceOverlay(src, tr); return { score: a.score, parts: a.parts, open: a.open.map(i => `[${i.id}] ${i.text}`), segs: SEGS.length, ov }; }, { tr, src });
      saveURL(out.ov, path.join(dir, 'score-overlay.jpg')); delete out.ov; console.log(path.basename(f), JSON.stringify(out, null, 1));
    }
  } finally { await browser.close(); }
}
