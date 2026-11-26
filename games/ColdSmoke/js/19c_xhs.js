"use strict";
// ---------------------------------------------------------------- the 小红书 小工具 host, inside 小红书 only
// What the container offers through window.xhs.miniTool beyond the boards (19b_rank.js), each used only where the client has it (a method
// that is missing is a feature that is not there: nothing shows for it). Outside the container every call here does nothing.
//   getWindowInfo (9.49+)   the host's own buttons (back, 我, share) lie over the page: the frame's gutters (--xl … --xb on #app) are widened
//                           on whichever side of the frame each one stands, so the speed, the menu glyph and the rest stay clear of them.
//                           The frame may be laid on its side (#app.rot), so each button is carried into the frame's own coordinates first.
//   setStorage (9.46+)      the player's settings (the versions picked, the language) kept in the container's storage, which
//                           lasts; the page's localStorage is not promised to there. Read back before the game is built.
//   postNote + writeTempFile + saveImageToPhotosAlbum   分享 in the menu: the picture as it stands into a new note, with the run's figures in
//                           the text; or the picture into the phone's photos.
//   followAuthor / getFollowStatus (9.51+)   a quiet 关注作者 in the same place (gone for the author, 已关注 once followed).
//   onGyroscopeChange + startGyroscope (9.50+)   the phone's turning, for steering and for forward and back by tilt: the container switches
//                           off the page's own tilt, so its gyroscope is the only way (Input.onGyro). Started once, at 60 ms; where it fails
//                           (no gyroscope: errCode 10002, or an older client) the finger steers, as before. The container pauses it in the background.
const XHS = self.XHS = (() => {
  const X = { on: false };
  const T = s => I18N.t(s), EN = () => I18N.en();
  const KEY = 'coldsmoke.prefs';
  let mt = null, app = null, sec = null, navB = null, probes = null, info = null, infoAt = 0, asking = null;
  const has = n => !!mt && typeof mt[n] === 'function';
  const code = e => (e && typeof e.errCode === 'number') ? e.errCode : (e && +e.errCode) || 0;
  try { const m = window.xhs && window.xhs.miniTool; if (m && typeof m === 'object') mt = m; } catch (e) { }
  X.on = !!mt;

  // ---- settings kept in the container's storage: one JSON object of the same keys the page keeps in localStorage
  const prefs = {}; let dirty = 0, saveT = null;
  const OURS = k => /^cs\.v\./.test(k) || /^cs\.q\./.test(k) || k === 'coldsmoke.lang';
  function put(k, v) { if (prefs[k] === v) return; prefs[k] = v; try { localStorage.setItem(k, v); } catch (e) { } dirty++; if (!saveT) saveT = setTimeout(save, 1500); }
  function save() {
    saveT = null; if (!dirty || !has('setStorage')) return; dirty = 0;
    try { mt.setStorage({ key: KEY, data: JSON.stringify(prefs) }).catch(e => console.warn('prefs not kept', e && e.errMsg)); } catch (e) { }
  }
  const wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  // (before the game is built: what was kept goes back into localStorage and into the modules that already read it at load)
  X.restore = async function () {
    if (!mt) return;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (OURS(k)) prefs[k] = localStorage.getItem(k); } } catch (e) { }
    if (has('getStorage')) {
      try {
        const r = await wait(mt.getStorage({ key: KEY }), 800), o = r && r.data ? JSON.parse(r.data) : null;
        if (o && typeof o === 'object') for (const k of Object.keys(o)) if (OURS(k) && typeof o[k] === 'string') {
          prefs[k] = o[k]; try { localStorage.setItem(k, o[k]); } catch (e) { }
          if (k.indexOf('cs.v.') === 0) Variants.set(k.slice(5), o[k]);
          else if (k === 'coldsmoke.lang') I18N.set(o[k]);
        }
      } catch (e) { console.warn('prefs not read', e && e.errMsg); }
    }
    Variants.on((n, id, first) => { if (!first) put('cs.v.' + n, id); });
    Quality.keep = (k, v) => put(k, v);                                  // (the picked or learned Quality level, 00c_quality.js)
    I18N.on(l => put('coldsmoke.lang', l));
    document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) { clearTimeout(saveT); save(); } });
  };

  // ---- the host's buttons
  X.layout = function () {
    if (!mt || !has('getWindowInfo')) return;
    if (!app) app = document.getElementById('app'); if (!app) return;
    if (!probes) {          // (three marks at the frame's own corners: where they land on the screen says how the frame lies, turned or not)
      probes = ['left:0;top:0', 'left:100%;top:0', 'left:0;top:100%'].map(css => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;' + css; app.appendChild(p); return p; });
    }
    const fresh = info && Date.now() - infoAt < 400;
    if (fresh) return place();
    if (asking) return;
    asking = mt.getWindowInfo().then(r => { info = r; infoAt = Date.now(); place(); }, e => console.warn('getWindowInfo', e && e.errMsg)).then(() => { asking = null; });
  };
  function place() {
    if (!info || !info.menuButtons || !app) return;
    const c = probes.map(p => { const r = p.getBoundingClientRect(); return [r.left, r.top]; });
    const ex = [c[1][0] - c[0][0], c[1][1] - c[0][1]], ey = [c[2][0] - c[0][0], c[2][1] - c[0][1]];
    const W = Math.hypot(ex[0], ex[1]), H = Math.hypot(ey[0], ey[1]); if (!(W > 0 && H > 0)) return;
    const uv = (x, y) => [((x - c[0][0]) * ex[0] + (y - c[0][1]) * ex[1]) / W, ((x - c[0][0]) * ey[0] + (y - c[0][1]) * ey[1]) / H];
    // the host's buttons stand in a row along the top of the screen: whichever side of the frame lies along the top of the screen (the left,
    // with the frame laid on its side) gives them room, its gutter reaching past the deepest of them
    const du = -ex[1] / W, dv = -ey[1] / H, side = Math.abs(du) > Math.abs(dv) ? (du < 0 ? 'l' : 'r') : (dv < 0 ? 't' : 'b');
    const g = { l: 0, r: 0, t: 0, b: 0 };
    for (const k of ['back', 'me', 'share']) {
      const b = info.menuButtons[k]; if (!b || !(b.width > 0) || !(b.height > 0)) continue;
      const pts = [uv(b.left, b.top), uv(b.right, b.top), uv(b.left, b.bottom), uv(b.right, b.bottom)];
      const u0 = Math.min(...pts.map(p => p[0])), u1 = Math.max(...pts.map(p => p[0])), v0 = Math.min(...pts.map(p => p[1])), v1 = Math.max(...pts.map(p => p[1]));
      if (u1 < 0 || v1 < 0 || u0 > W || v0 > H) continue;          // (off the frame altogether)
      const need = side === 'l' ? u1 + 8 : side === 'r' ? W - u0 + 8 : side === 't' ? v1 + 2 : H - v0 + 2;
      g[side] = Math.max(g[side], Math.min(need, 0.3 * Math.min(W, H)));
    }
    // and whatever the host says is not safe to draw under (its own bars, the status bar), side by side of the screen onto the frame's sides
    const sa = info.safeArea, ww = info.windowWidth || innerWidth, wh = info.windowHeight || innerHeight;
    if (sa && sa.right > sa.left && sa.bottom > sa.top) {
      const onto = (dx, dy) => { const a = (dx * ex[0] + dy * ex[1]) / W, b = (dx * ey[0] + dy * ey[1]) / H; return Math.abs(a) > Math.abs(b) ? (a < 0 ? 'l' : 'r') : (b < 0 ? 't' : 'b'); };
      for (const [dx, dy, inset] of [[0, -1, sa.top], [0, 1, wh - sa.bottom], [-1, 0, sa.left], [1, 0, ww - sa.right]]) {
        if (!(inset > 0) || inset > 0.3 * Math.min(ww, wh)) continue;
        const k = onto(dx, dy); g[k] = Math.max(g[k], inset);
      }
    }
    for (const s of ['l', 'r', 't', 'b']) app.style.setProperty('--x' + s, Math.round(g[s]) + 'px');
    X.gutters = g;
  }

  // ---- the menu: 分享 (a note, the photos, the author)
  const node = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  X.init = function () {
    if (!mt) return;
    gyro();
    const menu = document.getElementById('menu'); if (!menu) return;
    { const b = self.COLD_SMOKE && self.COLD_SMOKE.build, o = menu.querySelector('section[data-sec="opt"]');
      if (b && o) { const p = node('p', 'note', ''); p.style.opacity = '.6'; const f = () => { p.textContent = (EN() ? 'Build ' : '版本 ') + b; }; f(); I18N.on(f); o.appendChild(p); } }
    navB = menu.querySelector('nav [data-sec="share"]'); sec = menu.querySelector('section[data-sec="share"]');
    if (navB && sec && (has('postNote') || has('saveImageToPhotosAlbum') || has('followAuthor'))) {
      navB.hidden = false;
      sec.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); const a = b.dataset.x; if (a === 'note') note(b); else if (a === 'save') photo(b); else if (a === 'follow') follow(b); if (e.detail) b.blur(); });
      I18N.on(() => { if (sec.classList.contains('on')) X.show(); });
    }
    X.layout();
    addEventListener('resize', () => setTimeout(X.layout, 80));
  };

  // ---- the gyroscope (see the head of this file)
  function gyro() {
    if (!['startGyroscope', 'stopGyroscope', 'onGyroscopeChange', 'offGyroscopeChange'].every(has)) return;
    try { mt.onGyroscopeChange(Input.onGyro); } catch (e) { return; }
    try { Promise.resolve(mt.startGyroscope({ interval: 'ui' })).catch(e => { console.warn('no gyroscope', e && (e.errCode || e.errMsg)); try { mt.offGyroscopeChange(Input.onGyro); } catch (_) { } Input.gyro = null; }); }
    catch (e) { try { mt.offGyroscopeChange(Input.onGyro); } catch (_) { } }
  }

  let followSt = 0, msg = null;
  X.show = function () {
    if (!sec) return;
    sec.textContent = '';
    sec.appendChild(node('h4', null, T('SHARE · 分享')));
    const row = node('div', 'chips');
    const btn = (x, txt) => { const b = node('button', null, T(txt)); b.type = 'button'; b.dataset.x = x; row.appendChild(b); return b; };
    if (has('postNote') && has('writeTempFile')) btn('note', '发一篇笔记');
    if (has('saveImageToPhotosAlbum')) btn('save', '存到相册');
    let fb = null; if (has('followAuthor')) { fb = btn('follow', '关注作者'); paintFollow(fb); }
    sec.appendChild(row);
    msg = node('p', 'note', ''); sec.appendChild(msg);
    if (has('postNote')) sec.appendChild(node('p', 'note', T('把此刻的画面带进一篇笔记，速度、落差和这座山会写在正文里，发之前都可以改。')));
    if (fb) sec.appendChild(node('p', 'note', T('喜欢这座山，可以关注做它的人，新的版本会先在主页发。')));
    if (fb && has('getFollowStatus')) mt.getFollowStatus().then(r => { followSt = r && typeof r.follow_status === 'number' ? r.follow_status : followSt; paintFollow(fb); }, () => { });
  };
  function paintFollow(b) {
    if (!b) return;
    if (followSt === 2) { b.hidden = true; return; }          // (the author themself)
    b.textContent = T(followSt === 1 ? '已关注作者' : '关注作者'); b.classList.toggle('on', followSt === 1);
  }
  const tell = s => { if (msg) msg.textContent = T(s); };

  // the picture as it stands (the menu's shade and words are not in it: they are the page's, the picture is the canvas's)
  async function picture() {
    // read in the same frame the picture was drawn in, after the game's own drawing (WebGL keeps no buffer, WebGPU hands it to the screen):
    // the game's loop asked for this frame before we did, so it has drawn when we come; with the game set down, it is drawn again first
    const url = await new Promise((ok, no) => requestAnimationFrame(() => {
      try {
        if (App.paused && App.redraw) App.redraw();
        const v = document.getElementById('view'), c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
        c.getContext('2d').drawImage(v, 0, 0); ok(c.toDataURL('image/jpeg', 0.92));
      } catch (e) { no(e); }
    }));
    const r = await mt.writeTempFile({ data: url });
    return r && r.filePath;
  }
  function words() {
    const sp = typeof UI !== 'undefined' && UI.sp, run = sp && sp.run, seed = typeof Course !== 'undefined' ? Course.seed : 0;
    const en = EN(), out = [];
    out.push(en ? 'A run down a mountain in 雪迹 (Cold Smoke), a little game on 小红书.' : '在小红书小工具「雪迹」里滑了一趟。');
    if (run && run.t > 10) {
      const f = [];
      if (run.v > 1) f.push(en ? 'top speed ' + (run.v * 3.6).toFixed(0) + ' km/h' : '最快 ' + (run.v * 3.6).toFixed(0) + ' km/h');
      if (run.drop > 1) f.push(en ? 'drop ' + Math.round(run.drop) + ' m' : '落差 ' + Math.round(run.drop) + ' 米');
      if (run.air > 1) f.push(en ? 'longest flight ' + run.air.toFixed(1) + ' m' : '最远飞行 ' + run.air.toFixed(1) + ' 米');
      if (f.length) out.push(f.join(' · '));
    }
    const mtn = seed && typeof Course !== 'undefined' && typeof Course.mountainBySeed === 'function' && Course.mountainBySeed(seed);
    const named = mtn ? (en ? mtn.en : mtn.zh) : '';
    const daily = !named && seed && typeof UI !== 'undefined' && UI.dev && typeof App !== 'undefined' && App.isDaily && App.isDaily();
    if (named) out.push(named);
    else if (daily) out.push(en ? 'Today\'s mountain, ' + App.dayLabel(App.today(), true) + ' (no. ' + seed + '): the same one for everyone today' : '今日之山 · ' + App.dayLabel() + '（第 ' + seed + ' 号山），今天大家滑的都是这一座');
    else if (seed) out.push(en ? 'Mountain no. ' + seed : '第 ' + seed + ' 号山');
    out.push(daily ? '#雪迹 #滑雪 #今日之山' : '#雪迹 #滑雪');
    return { title: en ? '雪迹 · Cold Smoke' : '雪迹 · 一个人，一座山', content: out.join('\n') };
  }
  let busy = false;
  async function note(b) {
    if (busy) return; busy = true; b.disabled = true; tell('正在截图…');
    try { const f = await picture(); const w = words(); tell(''); await mt.postNote({ title: w.title, content: w.content, pageType: 'photo_publish', mediaInfo: { image_resources: [{ url: f }] } }); }
    catch (e) { const c = code(e); console.warn('postNote', e && e.errMsg, c); tell(c === 20002 ? '' : '没能打开发笔记'); }
    busy = false; b.disabled = false;
  }
  async function photo(b) {
    if (busy) return; busy = true; b.disabled = true; tell('正在截图…');
    try { const f = await picture(); await mt.saveImageToPhotosAlbum({ filePath: f }); tell('已存到相册'); }
    catch (e) { console.warn('saveImageToPhotosAlbum', e && e.errMsg, code(e)); tell('没能存到相册'); }
    busy = false; b.disabled = false;
  }
  // (拍照, 19d_photo.js: a picture taken in the photo mode, straight into the phone's album)
  X.saveShot = async function (url) {
    if (!has('writeTempFile') || !has('saveImageToPhotosAlbum')) return false;
    try { const r = await mt.writeTempFile({ data: url }); await mt.saveImageToPhotosAlbum({ filePath: r && r.filePath }); return true; }
    catch (e) { console.warn('saveShot', e && e.errMsg, code(e)); return false; }
  };
  async function follow(b) {
    if (busy || followSt === 1) return; busy = true;
    try { const r = await mt.followAuthor(); followSt = r && typeof r.follow_status === 'number' ? r.follow_status : followSt; paintFollow(b); if (followSt === 1) tell('已关注，谢谢'); }
    catch (e) { const c = code(e); if (c === 15404) tell('今天不能再提示关注了'); else if (c !== 20002 && c !== 10003) console.warn('followAuthor', e && e.errMsg, c); }
    busy = false;
  }
  return X;
})();
