// js/core/hud.js — part of subsystem "film". OWNER: film engineer.
// The DOM overlay of the film, drawn under #hud and styled by hud.css (rules under `#hud.bbl`; the rules of the
// frozen stub stay in hud.css so that `--stub film` still looks right). SPEC 4.6: restrained. It has
//   - a small serif title, top-left;
//   - ONE translucent glass bar, bottom-centre: the ten camera presets and the four light modes, the current
//     ones highlighted. They change the instant a flight / a light change begins, with a short press flash, as
//     if someone had clicked them (the reference video's bar);
//   - one caption line per shot on a soft backing plate under the title (the sky side of the frame: the lower third
//     holds the foreground life of the eye-level shots), verbatim from world.json;
//   - an end card (a column on the right, over the sky) from the last flight to the last frame: what is
//     reconstructed or conjectural, one paragraph per class of world.json `conjectural`;
//   - a debug readout (off by default) and the contact-sheet tag.
// Deterministic: no CSS transitions or animations, no clocks. Every opacity is set from the film time.

/** Overlay timing (seconds) and the fixed texts. */
export const HUD_TIMING = Object.freeze({
  title: 'BABYLON', subtitle: 'c. 575 BCE \u00b7 a reconstruction at true scale',
  subtitleOut: 1e9,        // the subtitle stays: the film is labelled a reconstruction from the first frame to the last
  firstCaption: 1.3,       // the first caption comes in after the title
  // A caption comes in while the camera is still flying to its hold (the second half of the flight, when the
  // subject is in view) and stays until the camera has left: the long captions need every tenth of a second.
  captionLeadShare: 0.5, captionLeadMin: 0.7, captionLeadMax: 1.6,
  captionFade: 0.5,
  captionTail: 0.6,        // ...and is gone this long after the camera has left (the last caption stays to the end)
  press: 0.16,             // decay time of the press flash on a pill
  endCardLead: 1.3,        // the end card starts to come in this long before the camera arrives at the last hold
  endFade: 0.6,
});

/**
 * Where the overlay sits, as fractions of the frame (x from the left, y from the TOP). Measured from the DOM
 * (film.hud.rects(), the same at 1920 x 1080 and at deviceScaleFactor 2); filmcheck.mjs uses these to test that no
 * subject point lies under the overlay. `caption` is the widest caption of the ten. After a change of hud.css
 * measure again: node render.mjs eval --hud 1 --js "(window.renderAt(62), CTX.film.hud.rects())".
 */
export const HUD_LAYOUT = Object.freeze({
  title: { x0: 0.031, x1: 0.169, y0: 0.044, y1: 0.093 },
  bar: { x0: 0.263, x1: 0.737, y0: 0.95, y1: 0.984 },
  // the caption plate starts at x0 and is as wide as its text: about captionPerChar of the frame width per character
  caption: { x0: 0.0235, x1: 0.7313, y0: 0.114, y1: 0.1544 },
  captionPerChar: 0.00445,
  endCard: { x0: 0.676, x1: 0.974, y0: 0.092, y1: 0.417 },
});

/**
 * What the end card SAYS for each class of world.json `conjectural` (keys = the classes buildEndCard derives from the
 * flags). The card is on screen for about four seconds: the eight class names can be read in that time and a short
 * line per class skimmed; the 130 words of the full item list cannot (they stay available as groups[].items).
 * Every item of world.json is covered by a phrase of its class. A class without an entry here (world.json gained
 * a new flag) shows its items instead, so nothing is ever silently dropped.
 */
export const END_CARD_SUMMARY = Object.freeze({
  'heights reconstructed': 'all walls, towers, gates, palaces and temples',
  'profile after the stele; height debated': 'Etemenanki above its base',
  'reconstructed': 'Ishtar Gate elevation, glaze and colours; white plaster of the precinct; north half of the West Fortification; nine-tenths of the housing',
  'conjectural': 'the royal garden; the outer city; canal courses and culvert; the quay at the bridge; bridge deck, boats, people, night fires',
  'late-reign state': 'northern defences and Summer Palace as finished',
  'unexcavated, schematic': 'the whole west city',
  'known from texts only': 'thirteen temples',
  'approximate': 'river course, water level, west bank',
});

/**
 * The end card from world.json `conjectural`: the items grouped by the class of their flag.
 * Returns { heading, groups: [{ key, label, items: [head phrase of every element], summary (the line shown) }], lines: [string] }.
 */
export function buildEndCard(conj) {
  const short = (el) => {
    let s = String(el).replace(/\s*\([^)]*\)/g, '').split(/[;:]/)[0].trim();
    if (s.length > 58) {
      const c = s.lastIndexOf(',', 58), a = s.lastIndexOf(' and ', 58);
      if (c > 20) s = s.slice(0, c); else if (a > 20) s = s.slice(0, a);
    }
    return s;
  };
  const classOf = (flag) => {
    const f = String(flag).toLowerCase();
    if (f.includes('conjectural')) return 'conjectural';
    if (f.includes('reconstructed')) return f.startsWith('heights') ? 'heights reconstructed' : 'reconstructed';
    if (f.includes('stele')) return 'profile after the stele; height debated';
    return f.replace(/\s+-\s+/g, ', ');
  };
  const groups = [];
  for (const it of (conj && conj.items) || []) {
    const key = classOf(it.flag);
    let g = groups.find((q) => q.key === key);
    if (!g) groups.push((g = { key, label: key.charAt(0).toUpperCase() + key.slice(1), items: [] }));
    g.items.push(short(it.element));
  }
  for (const g of groups) g.summary = END_CARD_SUMMARY[g.key] || g.items.join('; ');
  return {
    heading: 'Reconstructed or conjectural in this film',
    groups: groups.map((g) => ({ key: g.key, label: g.label, items: g.items, summary: g.summary })),
    lines: groups.map((g) => `${g.label}: ${g.summary}.`),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

/** Build the overlay DOM under `root` (#hud). Returns { update(state, { visible, tag, debug }), rects(), root }. */
export function createHud(root, { presets, modes }) {
  root.className = 'bbl';
  root.innerHTML =
    '<div class="title"><div class="t"></div><div class="s"></div></div>' +
    '<div class="end"><div class="h"></div><div class="b"></div></div>' +
    '<div class="cap"><span></span></div>' +
    '<div class="barwrap"><div class="bar">' +
    `<div class="grp presets">${presets.map((p) => `<span class="pill">${esc(p)}</span>`).join('')}</div><i class="sep"></i>` +
    `<div class="grp modes">${modes.map((m) => `<span class="pill">${esc(m)}</span>`).join('')}</div>` +
    '</div></div>' +
    '<pre class="dbg"></pre><div class="tag"></div>';
  const q = (sel) => root.querySelector(sel);
  const el = {
    title: q('.title'), titleT: q('.title .t'), titleS: q('.title .s'),
    cap: q('.cap'), capText: q('.cap span'),
    bar: q('.barwrap'), presets: [...root.querySelectorAll('.presets .pill')], modes: [...root.querySelectorAll('.modes .pill')],
    end: q('.end'), endH: q('.end .h'), endB: q('.end .b'),
    dbg: q('.dbg'), tag: q('.tag'),
  };
  const last = {};
  const text = (node, key, value) => { if (last[key] !== value) { node.textContent = value; last[key] = value; } };
  const html = (node, key, value) => { if (last[key] !== value) { node.innerHTML = value; last[key] = value; } };
  const style = (node, key, prop, value) => { if (last[key] !== value) { node.style.setProperty(prop, value); last[key] = value; } };
  const opacity = (node, key, v) => style(node, key, 'opacity', v <= 0.0005 ? '0' : v >= 0.9995 ? '1' : v.toFixed(4));
  const pills = (list, key, active, press) => {
    list.forEach((p, i) => {
      const on = i === active ? 'pill on' : 'pill';
      if (last[key + i] !== on) { p.className = on; last[key + i] = on; }
      style(p, key + 'p' + i, '--press', i === active ? press.toFixed(4) : '0');
    });
  };

  function update(state, { visible = true, tag = null, debug = null } = {}) {
    const k = visible ? 1 : 0;
    text(el.titleT, 'tt', state.title.text); text(el.titleS, 'ts', state.title.sub);
    opacity(el.title, 'to', k * state.title.opacity);
    text(el.capText, 'ct', state.caption.text);
    opacity(el.cap, 'co', k * state.caption.opacity);
    opacity(el.bar, 'bo', k * state.bar.opacity);
    pills(el.presets, 'pp', state.bar.activePreset, state.bar.presetPress);
    pills(el.modes, 'pm', state.bar.activeMode, state.bar.modePress);
    text(el.endH, 'eh', state.endCard.heading);
    // every item of a line wraps as a whole (no break inside 'nine-tenths of the housing')
    html(el.endB, 'eb', state.endCard.groups.map((g) => `<p><b>${esc(g.label)}</b>${String(g.summary || g.items.join('; ')).split('; ').map((it, i, all) => `<span>${esc(it)}${i < all.length - 1 ? ';' : '.'}</span>`).join(' ')}</p>`).join(''));
    opacity(el.end, 'eo', k * state.endCard.opacity);
    if (debug) {
      const d = debug, p = d.pose, l = d.light;
      const mode = l.a === l.b ? l.a : `${l.a} > ${l.b}  k ${f(l.k, 3)}`;
      text(el.dbg, 'dbg',
        `t ${f(d.t, 3)} s   frame ${d.frame}\n` +
        `shot ${d.shot.n} ${d.shot.name}   ${d.inTransition ? 'flight' : 'hold'} ${f(d.k * 100, 0)} %   local ${f(d.local, 2)} s\n` +
        `light ${mode}\n` +
        `pos ${f(p.pos[0])}, ${f(p.pos[1])}, ${f(p.pos[2])}   fov ${f(p.fov)}   near ${f(p.near, 2)}\n` +
        `look ${f(p.look[0])}, ${f(p.look[1])}, ${f(p.look[2])}\n` +
        `${f(d.speed, d.speed < 20 ? 2 : 0)} m/s   ${f(d.turn)} deg/s${d.override ? '   DEBUG CAMERA' : ''}`);
      style(el.dbg, 'dbgd', 'display', 'block');
    } else style(el.dbg, 'dbgd', 'display', 'none');
    text(el.tag, 'tag', tag || '');
    style(el.tag, 'tagd', 'display', tag ? 'block' : 'none');
  }

  /** Bounding boxes of the visible overlay parts as fractions of the frame (x from the left, y from the top). */
  function rects() {
    const W = root.clientWidth || window.innerWidth, H = root.clientHeight || window.innerHeight;
    const r = (node) => { const b = node.getBoundingClientRect(); return { x0: +(b.left / W).toFixed(4), x1: +(b.right / W).toFixed(4), y0: +(b.top / H).toFixed(4), y1: +(b.bottom / H).toFixed(4) }; };
    return { title: r(el.title), bar: r(root.querySelector('.bar')), caption: r(el.capText), endCard: r(el.end) };
  }
  return { update, rects, root };
}
