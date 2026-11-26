"use strict";
// ---------------------------------------------------------------- background threads for the start-up
// A phone has six cores and the start-up used one. The page is one script: a background thread (a Web Worker) runs that same script
// again, with no page around it (Par.W), and makes the pieces of the start-up it is handed (Par.jobs, filled in by the modules that have
// such pieces). Same code, same numbers, same browser: what comes back is bit for bit what the page would have made itself, only sooner.
// Where a worker cannot be made (no Worker, a blocked blob, a script it cannot run), Par.ok stays false and every module makes its piece
// on the page as it always did. Variants 'par' a turns the threads off. The threads are let go once the start-up is done (Par.stop).
const Par = (() => {
  const P = { jobs: {}, W: !!self.CS_WORKER, ok: false, n: 0 };
  if (P.W) {
    // ---- inside the thread: the world as the page has it (the versions picked, the mountain, the sun), then each job as it comes
    self.onmessage = e => {
      const m = e.data; let res = null, err = null;
      if (m.hi) { self.postMessage({ up: 1 }); return; }          // (the script has been read and run: ready for work)
      try { if (m.init) P.jobs.__init(m.init); if (m.job) res = P.jobs[m.job](m.a); } catch (x) { err = String((x && x.stack) || x); }
      const tr = []; collect(res, tr, 0); self.postMessage({ id: m.id, res, err }, tr);
    };
    return P;
  }
  // the script the page is running: its text where it sits in the page (the web), or its address (the 小红书 package's app.js)
  let src = null, srcUrl = null; try { const s = document.currentScript; if (s && s.src) srcUrl = new URL('worker.js', s.src).href; else if (s) src = s.textContent; } catch (e) { }
  const pool = [], queue = []; let seq = 0, url = null;
  function collect(o, out, d) {           // the buffers of the typed arrays in a result go across without a copy
    if (!o || typeof o !== 'object' || d > 3) return;
    if (ArrayBuffer.isView(o)) { if (!out.includes(o.buffer)) out.push(o.buffer); return; }
    for (const k in o) collect(o[k], out, d + 1);
  }
  // start n threads (each parses and runs the whole script once, ~0.1 s, while the page goes on with its own work)
  P.start = function (n, state) {
    
    // (/*web{*/ … /*}web*/: the 小红书 小工具 forbids threads, tools/build-xhs.js; there the page makes everything itself)
    /*web{*/
    if (P.n || (!src && !srcUrl) || typeof Worker === 'undefined') return false;
    if (src) { try { url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); } catch (e) { return false; } }
    for (let i = 0; i < n; i++) {
      let w; try { w = new Worker(url || srcUrl); } catch (e) { break; }
      const slot = { w, busy: null, init: state, up: false };
      w.onmessage = e => { if (e.data && e.data.up) { slot.up = true; clearTimeout(slot.t); pump(); } else done(slot, e.data); };
      w.onerror = e => { e.preventDefault && e.preventDefault(); fail(slot, 'worker error: ' + (e.message || '?')); };
      // (a thread that has not read the script in 4 s, or never will: given up, and its work done on the page)
      slot.t = setTimeout(() => { if (!slot.up) fail(slot, 'worker did not start'); }, 4000);
      w.postMessage({ hi: 1 });
      pool.push(slot);
    }
    P.n = pool.length; P.ok = P.n > 0; return P.ok;
    /*}web*/
    return false;
  };
  function pump() {
    for (const s of pool) {
      if (s.busy || !queue.length || s.dead || !s.up) continue;
      const k = queue.findIndex(j => !j.slot || j.slot === s); if (k < 0) continue;
      const j = queue.splice(k, 1)[0]; s.busy = j;
      const m = { id: j.id, job: j.job, a: j.a }; if (s.init) { m.init = s.init; s.init = null; }
      try { s.w.postMessage(m, j.tr || []); } catch (e) { fail(s, e.message); }
    }
  }
  function done(s, m) { const j = s.busy; s.busy = null; if (j) { if (m.err) j.no(new Error(m.err)); else j.go(m.res); } pump(); }
  function fail(s, why) {
    s.dead = true; const j = s.busy; s.busy = null; if (j) j.no(new Error(why));
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].slot === s) { if (queue[i].soft) queue[i].slot = null; else queue.splice(i, 1)[0].no(new Error(why)); }
    if (pool.every(x => x.dead)) { P.ok = false; while (queue.length) queue.shift().no(new Error('no workers')); }
    pump();
  }
  // run(job, args, transfer): a promise of the job's result. (tr: buffers handed over with the arguments; the page no longer has them)
  // (on: the number of the thread to run it in, so that work on one stretch of the mountain stays where that stretch is already known;
  // a thread that has died hands it to whichever is free)
  P.run = function (job, a, tr, on) {
    if (!P.ok) return Promise.reject(new Error('no workers'));
    const slot = on != null ? pool[on % pool.length] : null;
    return new Promise((go, no) => { queue.push({ id: ++seq, job, a, tr, go, no, slot: slot && !slot.dead ? slot : null, soft: true }); pump(); });
  };
  // each(job, args): the same job once in every thread (to hand them all the same data before a round of work), a promise of all of them
  P.each = function (job, a) {
    const live = pool.filter(s => !s.dead); if (!P.ok || !live.length) return Promise.reject(new Error('no workers'));
    return Promise.all(live.map(slot => new Promise((go, no) => { queue.push({ id: ++seq, job, a, slot, go, no }); pump(); })));
  };
  P.stop = function () { for (const s of pool) { clearTimeout(s.t); try { s.w.terminate(); } catch (e) { } } pool.length = 0; P.ok = false; P.n = 0; if (url) { try { URL.revokeObjectURL(url); } catch (e) { } url = null; } };
  P.idle = () => !queue.length && pool.every(s => !s.busy);
  return P;
})();
