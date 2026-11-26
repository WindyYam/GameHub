"use strict";
// ---------------------------------------------------------------- the second start reads what the first start worked out
// What the start-up works out from numbers alone (the noise and snow textures, the far ranges, the carved skier, the first fill of the
// mountain's clipmap) comes out the same every time for one build of the game, one mountain, one sun and one set of versions. So the first
// start writes it into the browser's own store (IndexedDB) once the title page is up, and every later start reads it back instead of
// working it out again: the same numbers, so the same picture. Anything that differs (another build, mountain, sun, version, size of
// texture) is not the same key, and that start works everything out as before and writes the store anew. One record, overwritten.
// Where there is no IndexedDB, or it is slow to answer, or it fails, the start goes on as if there were no store (Variants 'bcache' a: off).
// (BUILD: put in by build.js and tools/build-xhs.js, a hash of the whole script; left as it is, as in the iOS app's own build, no store)
const BootCache = (() => {
  const C = { BUILD: '1e079ad6b1fb76ba', rec: null, key: null, on: false, p: null, ms: 0 };
  if (self.CS_WORKER) return C;
  Variants.def('bcache', '开机缓存', [['a', '每次重算'], ['b', '第二次读上次的']], 'b');
  const NAME = 'cold-smoke-boot', STORE = 'b', ID = 'boot';
  let dbP = null;
  function db() {
    if (!dbP) dbP = new Promise((go, no) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (e) { } };
      r.onsuccess = () => go(r.result); r.onerror = () => no(r.error); r.onblocked = () => no(new Error('blocked'));
    });
    return dbP;
  }
  // at the very start: open the store and begin reading (it reads while the graphics are being set up)
  C.load = function (allowed) {
    C.on = allowed && C.BUILD.indexOf('__') !== 0 && Variants.val.bcache !== 'a' && typeof indexedDB !== 'undefined';
    if (!C.on) return;
    const t0 = performance.now();
    C.p = new Promise(go => {
      const done = r => { C.ms = Math.round(performance.now() - t0); go(r); };
      try {
        db().then(d => {
          const q = d.transaction(STORE, 'readonly').objectStore(STORE).get(ID);
          q.onsuccess = () => done(q.result || null); q.onerror = () => done(null);
        }, () => done(null));
      } catch (e) { done(null); }
    });
  };
  // once the mountain is known: the record, if it is this build's and this key's (waiting at most `wait` ms more for it to be read)
  C.take = async function (key, wait) {
    C.key = key;
    if (!C.on || !C.p) return null;
    let r = null;
    try { r = await Promise.race([C.p, new Promise(go => setTimeout(() => go(undefined), wait))]); } catch (e) { r = null; }
    if (r === undefined) { C.late = true; return null; }
    if (r && r.build === C.BUILD && r.key === key) C.rec = r;
    return C.rec;
  };
  // after the start-up, once the title page is up: write what this start worked out (it, the pieces, is let go afterwards)
  C.save = function (pieces) {
    if (!C.on || !C.key) return Promise.resolve(false);
    return new Promise(go => {
      try {
        db().then(d => {
          const tx = d.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(Object.assign({ build: C.BUILD, key: C.key, t: Date.now() }, pieces), ID);
          tx.oncomplete = () => go(true); tx.onerror = tx.onabort = () => go(false);
        }, () => go(false));
      } catch (e) { go(false); }
    });
  };
  C.clear = function () { try { return db().then(d => { d.transaction(STORE, 'readwrite').objectStore(STORE).delete(ID); }); } catch (e) { return Promise.resolve(); } };
  return C;
})();
