"use strict";
// ---------------------------------------------------------------- versions to compare (the owner picks one of each)
// Every look or feel choice the owner should make lives here as 2-3 versions, so one row per choice can sit in the 场景 panel and the owner can switch
// while playing. A module registers its choice once at load and reads Variants.val[name] where it needs it (cheap: a property read).
//   Variants.def('cam', '追身镜头', [['a', '现在的'], ['b', '低机位'], ['c', '折中']], 'b')  -> returns the current id
//   if (Variants.val.cam === 'b') ...
// The default is the version the team recommends. A viewer's pick is kept in this browser only (localStorage), so a reload keeps it; ?v-<name>=<id>
// in the page address (dev and headless tests) overrides both. Variants.on(fn) hears (name, id) after a change; Variants.set(name, id) changes one.
const Variants = (() => {
  const V = { defs: [], val: {}, subs: [] };
  const K = n => 'cs.v.' + n;
  const fromUrl = n => { try { const m = new RegExp('[?&]v-' + n + '=([a-z0-9]+)').exec(location.search); return m ? m[1] : null; } catch (e) { return null; } };
  V.def = function (name, label, opts, def) {
    const has = id => opts.some(o => o[0] === id);
    if (!has(def)) def = opts[0][0];
    const old = V.defs.findIndex(d => d.name === name);
    const d = { name, label, opts, def };
    if (old >= 0) V.defs[old] = d; else V.defs.push(d);
    let v = def;
    try { const s = localStorage.getItem(K(name)); if (s && has(s)) v = s; } catch (e) { }
    const u = fromUrl(name); if (u && has(u)) v = u;
    V.val[name] = v;
    for (const f of V.subs) try { f(name, v, true); } catch (e) { }
    return v;
  };
  V.set = function (name, id) {
    const d = V.defs.find(x => x.name === name);
    if (!d || !d.opts.some(o => o[0] === id) || V.val[name] === id) return;
    V.val[name] = id;
    try { localStorage.setItem(K(name), id); } catch (e) { }
    for (const f of V.subs) try { f(name, id, false); } catch (e) { }
  };
  V.reset = function () { for (const d of V.defs) { V.set(d.name, d.def); try { localStorage.removeItem(K(d.name)); } catch (e) { } } };
  V.on = fn => { V.subs.push(fn); };
  return V;
})();
