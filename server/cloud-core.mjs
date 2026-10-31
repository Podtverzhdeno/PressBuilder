/**
 * Cloud deck storage and safe operations shared by REST and MCP.
 * Node 24 loads the existing PressBuilder TypeScript splitting algorithm.
 */
import fs from 'node:fs';
import path from 'node:path';
import { splitText, splitToCues, recommendSlides } from '../src/engine/split.ts';

const IDS = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const STYLES = new Set(['terevo', 'midnight', 'paper', 'lines']);
const ROOT = process.cwd();
const SEED = path.join(ROOT, 'src', 'decks');
const DATA = path.resolve(process.env.PB_DATA_DIR || path.join(ROOT, '.cloud-data'));
const DECKS = path.join(DATA, 'decks');
const OUT = path.join(DATA, 'out');

export { DATA, DECKS, OUT };
export class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const deckId = (value) => {
  if (typeof value !== 'string' || !IDS.test(value)) throw new UserError('Invalid deck id');
  return value;
};
const deckPath = (id, root = DECKS) => path.join(root, deckId(id), 'deck.json');
const seedPath = (id) => deckPath(id, SEED);
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const validText = (s, max = 50000) => {
  if (typeof s !== 'string' || !s.trim() || s.length > max) throw new UserError('Text must be non-empty and at most ' + max + ' characters');
  return s.trim();
};
const optionalNum = (v, min, max, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new UserError('Invalid ' + name);
  return v;
};
export function saveFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
export function listDecks() {
  const ids = new Set();
  for (const root of [SEED, DECKS]) {
    if (!fs.existsSync(root)) continue;
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (ent.isDirectory() && IDS.test(ent.name) && fs.existsSync(deckPath(ent.name, root))) ids.add(ent.name);
    }
  }
  return [...ids].map((id) => {
    try {
      const file = fs.existsSync(deckPath(id)) ? deckPath(id) : seedPath(id);
      const d = read(file);
      return { id, title: String(d.title || id), slides: d.slides?.length || 0, target: d.target ?? null,
        style: d.style || 'terevo', hasScenes: fs.existsSync(path.join(SEED, id, 'index.ts')),
        mtime: fs.statSync(file).mtimeMs };
    } catch { return null; }
  }).filter(Boolean).sort((a,b) => b.mtime - a.mtime);
}
export function getDeck(id) {
  const local = deckPath(id);
  const file = fs.existsSync(local) ? local : seedPath(id);
  if (!fs.existsSync(file)) throw new UserError('Deck not found: ' + id, 404);
  return read(file);
}
export function hasDeck(id) {
  deckId(id);
  return fs.existsSync(deckPath(id)) || fs.existsSync(seedPath(id));
}
export function putDeck(id, value) {
  deckId(id);
  if (!hasDeck(id)) throw new UserError('Deck not found: ' + id, 404);
  if (!value || typeof value !== 'object' || value.id !== id || !Array.isArray(value.slides) || !value.format) throw new UserError('Invalid deck structure');
  if (JSON.stringify(value).length > 1024 * 1024) throw new UserError('Deck exceeds 1 MiB');
  saveFile(deckPath(id), value);
  return { ok: true, id };
}
export function createDeck({ id, title, text, style = 'terevo', slide_count, target = null }) {
  deckId(id);
  if (hasDeck(id)) throw new UserError('Deck already exists: ' + id, 409);
  const script = validText(text);
  if (!STYLES.has(style)) throw new UserError('Invalid style');
  const cues = splitToCues(script);
  if (!cues.length) throw new UserError('Script has no cues');
  const n = slide_count === undefined ? recommendSlides(cues) : Math.round(optionalNum(slide_count, 1, 300, 'slide_count'));
  const count = Math.max(1, Math.min(n, cues.length));
  if (target !== null) optionalNum(target, 1, 36000, 'target');
  const deck = { id, title: validText(title || id, 180), text: script, target, style,
    format: { height: 1080, fps: 60, bitrate: 24 }, slides: splitText(script, count) };
  saveFile(deckPath(id), deck);
  return { id, title: deck.title, slides: deck.slides.length, cues: cues.length };
}
export function patchDeck(id, patch) {
  const d = getDeck(id);
  if (patch.title !== undefined) d.title = validText(patch.title, 180);
  if (patch.style !== undefined) {
    if (!STYLES.has(patch.style)) throw new UserError('Invalid style');
    d.style = patch.style;
  }
  if (patch.target !== undefined) d.target = patch.target === null ? null : optionalNum(patch.target, 1, 36000, 'target');
  if (patch.fps !== undefined) d.format.fps = optionalNum(patch.fps, 1, 120, 'fps');
  if (patch.height !== undefined) {
    if (![720,1080,1440,2160].includes(patch.height)) throw new UserError('Invalid video height');
    d.format.height = patch.height;
  }
  putDeck(id, d);
  return { ok: true, id, title: d.title, style: d.style, target: d.target, format: d.format };
}
function slide(d, slideId) {
  const s = d.slides.find((x) => x.id === slideId);
  if (!s) throw new UserError('Slide not found: ' + slideId, 404);
  return s;
}
export function patchCue(id, slide_id, cue_id, patch) {
  const d = getDeck(id);
  const c = slide(d, slide_id).cues.find((x) => x.id === cue_id);
  if (!c) throw new UserError('Cue not found: ' + cue_id, 404);
  if (patch.say !== undefined) c.say = validText(patch.say, 2000);
  if (patch.show !== undefined) {
    if (patch.show === null || patch.show === '') delete c.show;
    else c.show = validText(patch.show, 350);
  }
  if (patch.dur !== undefined) {
    if (patch.dur === null) delete c.dur;
    else c.dur = optionalNum(patch.dur, 0.1, 600, 'dur');
  }
  if (patch.hold !== undefined) {
    if (patch.hold === null) delete c.hold;
    else c.hold = optionalNum(patch.hold, 0, 60, 'hold');
  }
  putDeck(id, d);
  return { ok: true, cue: c };
}
export function patchSlide(id, slide_id, patch) {
  const d = getDeck(id);
  const s = slide(d, slide_id);
  if (patch.label !== undefined) s.label = validText(patch.label, 180);
  for (const k of ['lead', 'tail']) if (patch[k] !== undefined) {
    if (patch[k] === null) delete s[k];
    else s[k] = optionalNum(patch[k], 0, 60, k);
  }
  putDeck(id, d);
  return { ok: true, slide: s };
}
export function patchObject(id, slide_id, object_id, patch) {
  if (typeof object_id !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(object_id)) throw new UserError('Invalid object id');
  const d = getDeck(id);
  const s = slide(d, slide_id);
  s.objects ||= {};
  const o = { ...(s.objects[object_id] || {}) };
  for (const k of ['x','y','scale']) if (patch[k] !== undefined) {
    if (patch[k] === null) delete o[k];
    else o[k] = optionalNum(patch[k], k === 'scale' ? 0.01 : -10000, k === 'scale' ? 100 : 10000, k);
  }
  if (patch.text !== undefined) {
    if (patch.text === null) delete o.text;
    else { if (typeof patch.text !== 'string' || patch.text.length > 1000) throw new UserError('Invalid object text'); o.text = patch.text; }
  }
  if (patch.hidden !== undefined) {
    if (typeof patch.hidden !== 'boolean') throw new UserError('hidden must be boolean');
    if (patch.hidden) o.hidden = true; else delete o.hidden;
  }
  if (Object.keys(o).length) s.objects[object_id] = o;
  else delete s.objects[object_id];
  if (!Object.keys(s.objects).length) delete s.objects;
  putDeck(id,d);
  return { ok: true, object: o };
}
export function reorderSlides(id, slide_ids) {
  const d = getDeck(id);
  if (!Array.isArray(slide_ids) || slide_ids.length !== d.slides.length || new Set(slide_ids).size !== d.slides.length) throw new UserError('slide_ids must contain all slide IDs exactly once');
  const byId = new Map(d.slides.map((s)=>[s.id,s]));
  if (slide_ids.some((sid)=>!byId.has(sid))) throw new UserError('Unknown slide id');
  d.slides = slide_ids.map((sid)=>byId.get(sid));
  putDeck(id,d);
  return { ok: true, slide_ids };
}
