"use strict";
// ---------------------------------------------------------------- the leaderboards, inside 小红书 only
// The 小红书 小工具 container offers public boards (submitScore / getRankList / getMyRank, client 9.51+, still in 内测; see the official
// skill's references/js-api.md, 「排行榜（内测）」). Five board slots are allowed; the platform splits every submission into day / week /
// month / all-time (Beijing midnight, weeks from Monday) and keeps each player's BEST in each. Three things are ranked:
//   极速      board 1   top speed of a run, km/h to a tenth                       (best: what the platform keeps anyway)
//   最远飞行  board 2   the longest flight of a run, m to a tenth (from JUMP_T in the air, as on the splits)
//   今日之山  board 3   today only: the average speed, km/h to a tenth, over the first three stretches of today's mountain skied in one go
//             from the gate (UI: SP.d3). Everyone skis the same mountain on the same Beijing day, and the board's day turns with it.
//   滑雪时长  board 5   minutes skied in all (all time only). A total is not a best, so it is fed the running total; the latest is always
//             the best, so the platform's 'keep the best' does the right thing. The total lives in the container's storage (setStorage,
//             client 9.46+) and is raised to what the platform already holds for this player, so a new phone or cleared storage never
//             counts down.
//   (2026-11-14: boards 3 and 4 used to hold 滑雪时长 today / this week. The owner kept only all time; 3 became 今日之山 and 4 is free.
//   Board 3's day list may still show minutes from before the change until the next Beijing midnight.)
// Outside the container (the web build, a browser) nothing here does anything and the menu has no 排行榜 at all.
// Calls are few: a figure goes up only when it beats what was already sent for its period, at most once every 30 s (and when the page is
// put away, the board is opened, or a day card comes); minutes are whole. Lists are cached for 45 s. The platform's own limit is 150 calls
// a second for the whole tool.
const Rank = self.Rank = (() => {
  const R = { on: false };
  const T = s => I18N.t(s), EN = () => I18N.en();
  const mins = v => { v = Math.round(v); if (v < 60) return v + (EN() ? ' min' : ' 分钟'); const h = Math.floor(v / 60), m = v % 60; return EN() ? h + ' h ' + m + ' min' : h + ' 小时 ' + m + ' 分'; };
  // what is shown: a chip each; which board holds it for each period
  // (用户 2026-11-18 02:40 UTC: 排行榜只留玩的时间，剩下的都给挑战的排行榜) boards 1-4 are the challenges' now, one per map's ranked line:
  // 寒烟山 · 整圈 · 标准 on board 4 (the board it already had), boards 1-3 kept for the maps to come. 极速, 最远飞行 and 今日之山 are no longer
  // shown or sent. Their old figures stay on the server for good (km/h, metres; board 4's old minutes): a challenge time goes up as
  // 6000 − seconds, so anything outside 4200..6000 (a time over 30 min) is an old figure and is left out of the lists.
  // (用户 2026-11-18 06:51 UTC: 每张地图两条线，速降线和越野线) 寒烟山 · 越野线 · 标准 on board 3 (今日之山's old km/h figures are all under 4200)
  const CHAL = [{ map: 'hanyan', line: 'a', board: 4, name: '寒烟山 · 速降线' }, { map: 'hanyan', line: 'x', board: 3, name: '寒烟山 · 越野线' }];
  const tfmt = v => { const t = Math.max(0, Math.round((6000 - v) * 100) / 100), m = Math.floor(t / 60), r = t - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2); };
  const tok = v => v > 4200 && v < 6000;
  const VIEWS = [
    ...CHAL.map(c => ({ id: 'c-' + c.map + '-' + c.line, name: c.name, boards: { day: c.board, week: c.board, all: c.board }, fmt: tfmt, ok: tok, chal: true })),
    { id: 'time', name: '滑雪时长', boards: { all: 5 }, fmt: mins },
  ];
  // (用户 2026-11-19 19:23 UTC: 在排行榜底下说清楚速降线、越野线是怎么算的) the note under a challenge board: how its time is made, with
  // this line's own numbers (the ring bonus and each level's added time, from 92_rings.js RG.rules, so the note never drifts from the code)
  const chalNote = bd => {
    const c = CHAL.find(q => 'c-' + q.map + '-' + q.line === bd.id), ru = self.__rings && self.__rings.rules, hc = (ru && c && ru.hcOf) ? { a: ru.hcOf(c.line, 'a'), b: ru.hcOf(c.line, 'b'), c: 0 } : {}, bon = (ru && ru.BON.b) || 1.5;
    const add = d => hc[d] ? ' +' + hc[d] + (EN() ? ' s' : ' 秒') : (EN() ? ' nothing' : '不加'), none = !hc.a && !hc.b;
    return EN()
      ? 'How it is scored: your time, less ' + bon + ' s for every ring you go through. Easy, Standard and Hard share one board' + (none ? ', no level adds time' : ': Easy' + add('a') + ', Standard' + add('b') + ', Hard' + add('c')) + '. Lowest wins. Today and This week restart at Beijing midnight; All time stays. Only your best run counts.'
      : '怎么算：用时，每穿过一个圈减 ' + bon + ' 秒。轻松、标准、难一起排' + (none ? '，三档都不加时' : '：轻松' + add('a') + '，标准' + add('b') + '，难' + add('c')) + '。越少越靠前。今日和本周按北京时间零点重新开始，总榜一直保留。每人只留最好的一次。';
  };
  const views = () => VIEWS;          // (用户 2026-11-19 00:39 UTC: 挑战直接上线) the challenge boards show for everyone in 小红书
  R.chalBoard = (map, line) => { const c = CHAL.find(q => q.map === map && q.line === line); return c ? c.board : 0; };
  const PERIODS = [['day', '今日'], ['week', '本周'], ['all', '总榜']];
  const FLUSH_EVERY = 30000, CACHE = 45000, KEY = 'coldsmoke.playtime';
  let mt = null, el = null, view = VIEWS[0].id, period = 'day', lastFlush = 0, cool = 0, flushing = null, sig = 0, saved = 0, last = '';
  const sent = {}, pend = {}, cache = {};

  const api = () => { try { const m = window.xhs && window.xhs.miniTool; return m && typeof m.submitScore === 'function' && typeof m.getRankList === 'function' && typeof m.getMyRank === 'function' ? m : null; } catch (e) { return null; } };
  // the day and the week as the platform counts them: Beijing time, weeks from Monday (day 0 of the count was a Thursday)
  const bjDay = () => Math.floor((Date.now() + 8 * 3600e3) / 86400e3);
  const bjWeek = () => Math.floor((bjDay() + 3) / 7);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const code = e => (e && typeof e.errCode === 'number') ? e.errCode : (e && +e.errCode) || 0;
  // no boards for this tool (not authorised at upload, or not let into the 内测): the entry goes away for the rest of the page
  function off(e) { R.on = false; console.warn('rank off', e && e.errMsg, code(e)); { const t = document.getElementById('t-rank'); if (t) t.hidden = true; } if (R.onOff) try { R.onOff(); } catch (_) { } if (el) { el.nav.hidden = true; if (el.sec.classList.contains('on')) el.sec.textContent = ''; } }
  const fatal = c => c === 1005 || c === 10003;

  // ---- time skied: seconds today, this week, in all (P.d / P.w: which day and week the first two are of)
  const P = { d: 0, ds: 0, w: 0, ws: 0, as: 0 };
  function roll() { const d = bjDay(), w = bjWeek(); if (P.d !== d) { P.d = d; P.ds = 0; } if (P.w !== w) { P.w = w; P.ws = 0; } }
  function merge(o) {          // (what storage or the platform says is added in as a floor, never counted twice)
    if (!o) return; roll();
    if (o.d === P.d && o.ds > P.ds) P.ds = o.ds; if (o.w === P.w && o.ws > P.ws) P.ws = o.ws; if (o.as > P.as) P.as = o.as;
    if (P.ws < P.ds) P.ws = P.ds; if (P.as < P.ws) P.as = P.ws;
  }
  async function load() {
    let txt = null;
    try { if (typeof mt.getStorage === 'function') { const r = await mt.getStorage({ key: KEY }); txt = r && r.data; } } catch (e) { }
    if (txt == null) try { txt = localStorage.getItem(KEY); } catch (e) { }
    try { if (txt) merge(JSON.parse(txt)); } catch (e) { }
    // what the platform already holds for this player (another phone, storage cleared): a floor for the totals
    try {
      const a = await mt.getMyRank({ board: 5, period: 'all' }).catch(() => null);
      const sc = r => r && r.status === 'EXACT' && r.score != null ? +r.score * 60 : 0;
      merge({ as: sc(a) });
    } catch (e) { }
  }
  function save() {
    const txt = JSON.stringify(P); saved = Date.now(); if (txt === last) return; last = txt;
    try { if (typeof mt.setStorage === 'function') { mt.setStorage({ key: KEY, data: txt }).catch(() => { try { localStorage.setItem(KEY, txt); } catch (e) { } }); return; } } catch (e) { }
    try { localStorage.setItem(KEY, txt); } catch (e) { }
  }

  R.init = function () {
    mt = api(); if (!mt) return;
    const menu = document.getElementById('menu'); if (!menu) return;
    el = { nav: menu.querySelector('nav [data-sec="rank"]'), sec: menu.querySelector('section[data-sec="rank"]'), day: document.getElementById('day-r') };
    if (!el.nav || !el.sec) { el = null; return; }
    R.on = true; roll(); load();
    el.nav.hidden = false;
    { const t = document.getElementById('t-rank'); if (t) t.hidden = false; }          // (菜单方案 B: 排行榜 on the title too, 19_ui.js layoutB)
    el.sec.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rv) { view = b.dataset.rv; render(); } else if (b.dataset.rp) { period = b.dataset.rp; render(); }
    });
    if (typeof App !== 'undefined' && App.onTick) App.onTick.push(tick);
    document.addEventListener('visibilitychange', () => { if (document.hidden && R.on) { save(); R.flush(); } });
    I18N.on(() => { if (el.sec.classList.contains('on')) render(); });
  };

  // ---- every step: the clock of time skied runs while a run is on; whatever beats what its period was last sent waits to go up
  function want(id, v, per) {
    if (!(v > 0) || !isFinite(v)) return;
    const s = sent[id]; if (s && s.per === per && v <= s.v) return;
    const p = pend[id]; if (!p || p.per !== per || v > p.v) pend[id] = { per, v };
  }
  function tick(dt) {
    if (!R.on) return;
    roll();
    const live = typeof Game !== 'undefined' && Game.mode === 'run' && !document.hidden;
    if (live && dt > 0) { const k = Math.min(dt, 0.25); P.ds += k; P.ws += k; P.as += k; }
    want(5, Math.min(999999, Math.floor(P.as / 60)), 0);
    if (Date.now() - saved > FLUSH_EVERY) save();
    if (Object.keys(pend).length && Date.now() - lastFlush > FLUSH_EVERY && Date.now() > cool) R.flush();
  }
  // send what waits (one board at a time; a failure leaves it waiting, except the ones that will never go)
  R.flush = function () {
    if (!R.on || flushing) return flushing || Promise.resolve();
    lastFlush = Date.now();
    flushing = (async () => {
      for (const id of Object.keys(pend)) {
        const p = pend[id]; if (!p) continue;
        try {
          await mt.submitScore({ board: +id, score: p.v });
          const s = sent[id]; if (!s || s.per !== p.per || p.v > s.v) sent[id] = { per: p.per, v: p.v };
          if (pend[id] === p) delete pend[id];
          for (const k of Object.keys(cache)) if (k.indexOf(id + ':') === 0) delete cache[k];
        } catch (e) {
          const c = code(e);
          if (fatal(c)) { off(e); break; }
          if (c === 1001 || c === 1004 || c === 10001) { delete pend[id]; continue; }          // (a figure the platform will never take)
          if (c === 2009) cool = Date.now() + 60000;
          break;
        }
      }
    })().catch(e => console.warn(e)).then(() => { flushing = null; });
    return flushing;
  };

  // ---- reading a board: 2002 means it is not ready yet (never an empty board); a few tries with backoff, then say so
  async function call(fn, args) {
    for (const wait of [500, 1000, 2000, 4000, -1]) {
      try { return await fn.call(mt, args); }
      catch (e) { const c = code(e); if (c !== 2002 || wait < 0) throw e; await sleep(wait); }
    }
  }
  async function read(b, p) {
    const k = b + ':' + p, c = cache[k];
    if (c && Date.now() - c.t < CACHE) return c;
    const [list, me] = await Promise.all([call(mt.getRankList, { board: b, period: p }), call(mt.getMyRank, { board: b, period: p })]);
    const r = { t: Date.now(), list: (list && Array.isArray(list.data)) ? list.data : [], me: me || {} };
    cache[k] = r; return r;
  }

  // ---- the menu's page
  const node = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const who = n => (n == null || n === '') ? T('雪友') : String(n);
  function myLine(bd, me) {
    if (me.status === 'EXACT' && bd.ok && !bd.ok(+me.score)) return T('还没有成绩，滑一趟就会上榜');
    if (me.status === 'EXACT' && me.rank != null) return T('我') + ' · ' + (EN() ? '#' + me.rank : '第 ' + me.rank + ' 名') + ' · ' + bd.fmt(+me.score);
    if (me.status === 'OVER_LIMIT') return T('我') + ' · 500+';
    return T('还没有成绩，滑一趟就会上榜');
  }
  async function render() {
    if (!el || !R.on) return;
    const list = views(); let bd = list.find(v => v.id === view); if (!bd) { view = list[0].id; bd = list[0]; }
    const my = ++sig, s = el.sec; if (!(period in bd.boards)) period = PERIODS.find(([id]) => id in bd.boards)[0]; const board = bd.boards[period];
    s.textContent = '';
    s.appendChild(node('h4', null, T('RANKING · 排行榜')));
    const row1 = node('div', 'chips rk-b'), row2 = node('div', 'chips rk-p');
    for (const v of list) { const x = node('button', v.id === view ? 'on' : '', T(v.name)); x.type = 'button'; x.dataset.rv = v.id; row1.appendChild(x); }
    for (const [id, name] of PERIODS) { if (!(id in bd.boards)) continue; const x = node('button', id === period ? 'on' : '', T(name)); x.type = 'button'; x.dataset.rp = id; row2.appendChild(x); }
    s.appendChild(row1); s.appendChild(row2);
    const me = node('p', 'rk-me', T('读取中…')); s.appendChild(me);
    const box = node('ol', 'rk-list'); s.appendChild(box);
    try {
      await R.flush();
      const r = await read(board, period); if (my !== sig) return;
      me.textContent = myLine(bd, r.me);
      const rows = bd.ok ? r.list.filter(it => bd.ok(+it.score)) : r.list;
      if (!rows.length) box.appendChild(node('li', 'rk-none', T(period === 'day' ? '今天还没有人上榜' : '还没有人上榜')));
      for (const it of rows.slice(0, 100)) {
        const li = node('li', it.rank <= 3 ? 'top' : '');
        li.appendChild(node('b', null, String(it.rank))); li.appendChild(node('span', null, who(it.nickname))); li.appendChild(node('em', null, bd.fmt(+it.score)));
        box.appendChild(li);
      }
    } catch (e) {
      if (my !== sig) return;
      if (fatal(code(e))) { off(e); return; }
      me.textContent = T(code(e) === 2002 ? '榜单还在准备，稍后再看' : '暂时读不到榜单，稍后再看');
    }
    s.appendChild(node('p', 'note', (bd.chal ? chalNote(bd) : T(view === 'd3' ? '今日之山：从山顶一口气滑完前三段的平均速度，北京时间零点换山。每人只留最好的一次。' : view === 'time' ? '滑雪时长只算总榜，一直累计。' : '今日和本周按北京时间重新开始，总榜一直保留。每人只留最好的一次。'))));
  }
  // ---- 光圈速降线 (dev, 用户 18:54 UTC 成绩页跟个人最好、全部最好比，还有排名): board 4, all time, the 标准 line only. A shorter time is
  // better but the platform keeps each player's highest, so a time goes up as 6000 − seconds (to a tenth) and comes back the same way.
  // Returns { top, mine, rank } (top: the best time of all players; rank: this player's place, or '500+'), or null outside the container.
  // b: the line's board (R.chalBoard); t null = only read it (the 挑战 panel shows the place and the best before a run)
  R.line = async function (t, b) {
    if (!R.on || !mt) return null;
    b = b || 4;
    const sc = Math.round((6000 - t) * 10) / 10, back = v => Math.round((6000 - v) * 10) / 10;
    try {
      if (t > 0 && t < 1800) { await mt.submitScore({ board: b, score: sc }); delete cache[b + ':all']; }
      const r = await read(b, 'all'), top = r.list.find(it => tok(+it.score)), me = r.me.status === 'EXACT' && !tok(+r.me.score) ? {} : r.me;
      return { top: top ? back(+top.score) : null, topName: top ? who(top.nickname) : '', mine: me.status === 'EXACT' ? back(+me.score) : null, rank: me.status === 'EXACT' ? me.rank : me.status === 'OVER_LIMIT' ? '500+' : null };
    } catch (e) { if (fatal(code(e))) off(e); return null; }
  };
  // ---- this player on a board: the nickname the platform shows for them and their place (路线卡, 94_routecard.js). The platform gives the
  // name only in the list, so it is the list entry at the player's own place; null outside the container
  R.me = async function (b) {
    if (!R.on || !mt || !b) return null;
    try { const r = await read(b, 'all'), me = r.me || {}; let nick = me.nickname || null;
      if (!nick && me.status === 'EXACT') { const it = r.list.find(q => +q.rank === +me.rank); if (it) nick = it.nickname || null; }
      return { nick, rank: me.status === 'EXACT' ? me.rank : me.status === 'OVER_LIMIT' ? '500+' : null };
    } catch (e) { return null; }
  };
  // (菜单方案 B) opened during a challenge line, the page starts at that line's board
  let shownLine = null;
  R.show = function () { const ln = self.__rings && __rings.line && __rings.line.id; if (ln && ln !== shownLine) R.pick('hanyan', ln); shownLine = ln || null; if (el && R.on) render(); };
  // (菜单方案 B, 用户 2026-11-22) the board of one challenge line, opened from elsewhere (the result card, the menu during that line)
  R.pick = function (map, line) { const c = CHAL.find(q => q.map === map && q.line === line); if (c) { view = 'c-' + c.map + '-' + c.line; period = 'day'; } };
  // one board as rows, for the 挑战 panel's own column and the title's card: { rows: [{ rank, name, t }], me: { rank, t } | null, line }
  // (times in m:ss.xx; old figures outside the challenge range are left out, as on the menu's page). null outside the container
  R.top = async function (b, per, n) {
    if (!R.on || !mt || !b) return null;
    try {
      await R.flush();
      const r = await read(b, per || 'day'), rows = r.list.filter(it => tok(+it.score)).slice(0, n || 50).map(it => ({ rank: +it.rank, name: who(it.nickname), t: tfmt(+it.score) }));
      const m = r.me || {}, mine = m.status === 'EXACT' && tok(+m.score) ? { rank: m.rank, t: tfmt(+m.score) } : m.status === 'OVER_LIMIT' ? { rank: '500+', t: '' } : null;
      return { rows, me: mine };
    } catch (e) { if (fatal(code(e))) off(e); return { rows: [], me: null, err: code(e) === 2002 ? '榜单还在准备，稍后再看' : '暂时读不到榜单，稍后再看' }; }
  };

  // ---- the day card: today's places, if they come back while the card is still up
  R.onDay = async function () {
    if (!el || !el.day || !R.on) return;
    el.day.textContent = '';
    const my = Date.now();
    R.dayAsk = my;
    try {
      await R.flush();
      const out = [];
      for (const v of views()) {
        const b = v.boards.day; if (!b) continue; const st = sent[b]; if (!st || st.per !== P.d) continue;
        const me = await call(mt.getMyRank, { board: b, period: 'day' });
        if (me && me.status === 'EXACT' && me.rank != null) out.push(T(v.name) + ' ' + (EN() ? '#' + me.rank : '第 ' + me.rank));
        else if (me && me.status === 'OVER_LIMIT') out.push(T(v.name) + ' 500+');
      }
      if (R.dayAsk !== my || Date.now() - my > 4000 || !out.length) return;
      el.day.textContent = T('今日排名') + ' · ' + out.join(' · ');
    } catch (e) { if (fatal(code(e))) off(e); }
  };
  R.state = () => ({ P: Object.assign({}, P), pend: JSON.parse(JSON.stringify(pend)), sent: JSON.parse(JSON.stringify(sent)), flushing: !!flushing });          // (for the tests)
  return R;
})();
