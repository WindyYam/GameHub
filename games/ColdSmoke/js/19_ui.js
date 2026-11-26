"use strict";
// ---------------------------------------------------------------- loading page, title page, and the little that is on screen during a run
const UI = (() => {
  const U = { state: 'load', segIdx: -1, hintT: 0, hintKind: null, acc: 0, shown: { spd: -1, drop: -1 }, tod: 'auto', open: false };
  const $ = id => document.getElementById(id);
  const T = s => I18N.t(s), EN = () => I18N.en();          // (the words shown: see 00a_i18n.js)
  const SEG_EN = { bowl: 'OPEN BOWL', steeps: 'THE STEEPS', glade: 'GLADE', rollers: 'ROLLERS', gully: 'GULLY', kickers: 'KICKERS', powder: 'DEEP POWDER', ridge: 'RIDGE', moguls: 'MOGULS', corridor: 'FOREST LANE' };
  // the hours the day can be turned to, in the order the sun goes through them (keys of Sky.times)
  const TIMES = [['day', '白天'], ['golden', '傍晚'], ['sunset', '日落'], ['dusk', '黄昏'], ['night', '夜晚'], ['dawn', '黎明']];
  const mq = q => !!(window.matchMedia && matchMedia(q).matches);
  // a thing held in the hands (finger, no mouse) or a thing on a desk (keys and a pointer)
  const handheld = () => mq('(pointer: coarse) and (hover: none)') || (!mq('(pointer: fine)') && 'ontouchstart' in window);
  let el = null, wake = null, fsT = -1e9;

  // ---- 菜单方案 B (用户 2026-11-22 15:59 UTC「直接按推荐来做」: 排行榜要好找、菜单更简单). Web and 小红书 only: the iPhone / Vision Pro
  // apps lay out their own native controls over these nodes, so there (COLD_SMOKE.advancedMenuKey) nothing here moves. What changes:
  //   the title: 自由滑 and 挑战 side by side, the same size (挑战 is put there by 92_rings.js), under them 排行榜 · 设置 (视角 and 操作 now
  //     lives inside 设置); a card of today's board stands at the top right (92_rings.js)
  //   the menu: 继续滑 · 挑战 (or 重来这条线) · 排行榜 · 拍照 · 回到山顶, then 设置 (· 分享) as small tiles (视角 is the first part of 设置). 操作说明 and
  //     滑过的山 are reached from 设置, so a phone on its side never has to scroll the column
  U.mb = false;
  function layoutB() {
    if (self.COLD_SMOKE && self.COLD_SMOKE.advancedMenuKey) return;
    U.mb = true; el.app.classList.add('mb');
    const nav = el.nav, q = s => nav.querySelector(s);
    // the title's small row: 排行榜 (小红书: shown by 19b_rank.js) · 视角 · 设置
    const keysB = el.more.querySelector('[data-sec="keys"]'); if (keysB) keysB.remove();
    const mkMore = (sec, icon, zh, id) => { const b = document.createElement('button'); b.type = 'button'; if (sec) b.dataset.sec = sec; if (id) b.id = id; b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true">' + icon + '</svg><span></span>'; I18N.live(b.lastChild, zh); return b; };
    const rankB = mkMore(null, '<path d="M6 3.5h8v4a4 4 0 0 1-8 0z"/><path d="M6 5H3.5v1.2A2.8 2.8 0 0 0 6.3 9M14 5h2.5v1.2A2.8 2.8 0 0 1 13.7 9M10 11.5v3M7 16.5h6"/>', '排行榜', 't-rank');
    rankB.hidden = true; rankB.dataset.board = '1';
    const optB = mkMore('opt', '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/>', '设置');
    const v = el.more.querySelector('[data-sec="view"]');
    el.more.insertBefore(rankB, v || el.more.firstChild); if (v) v.after(optB); else el.more.appendChild(optB);
    el.tRank = rankB;
    // (用户 2026-11-24 19:24 UTC「我从多人离开以后就看不到这个多人的入口了…刚开始跟滑开以后的设置是2套这个菜单」) the title and the menu
    //   offer the same ways to play, in the same order: 自由滑 (继续滑) · 挑战 · 一起滑. 一起滑 (#mpgo on the title, #m-mp in the menu) is put
    //   there by 99b_net.js where it runs (the web build): on the title it stands as the third big button beside 自由滑 and 挑战, and the row
    //   goes three wide when it shows. In the menu #m-mp follows #m-chal, which already stands after 继续滑
    const act = el.more.parentNode, mpOn = () => { const m = document.getElementById('mpgo'); act.classList.toggle('mp3', !!(m && !m.hidden && m.parentNode === act)); };
    const mpMove = () => { const m = document.getElementById('mpgo'); if (m && m.parentNode !== act) act.insertBefore(m, el.more); mpOn(); };
    mpMove();
    try { new MutationObserver(mpMove).observe(act, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); } catch (e) { }
    // and in the menu, whoever comes in when: 一起滑 right after 挑战 (or after 继续滑 where there is no 挑战)
    const mpNav = () => { const m = q('#m-mp'); if (!m) return; const a = q('#m-chal') || q('#m-go'); if (a && a.nextElementSibling !== m) a.after(m); };
    mpNav();
    try { new MutationObserver(mpNav).observe(nav, { childList: true }); } catch (e) { }
    // the menu's column, in the order of what a player reaches for
    const order = ['#m-back', '#m-k', '#m-go', '[data-sec="rank"]', '#m-photo', '#m-top'];
    for (const s of order) { const n = q(s); if (n) nav.appendChild(n); }
    const sep = document.createElement('i'); sep.className = 'msep'; nav.appendChild(sep);
    const row = document.createElement('div'); row.className = 'mrow'; nav.appendChild(row);          // (视角 · 设置 · 分享: small tiles side by side)
    for (const s of ['[data-sec="opt"]', '[data-sec="share"]']) { const n = q(s); if (n) { n.classList.add('mi'); n.classList.remove('sm'); row.appendChild(n); } }
    for (const s of ['[data-sec="keys"]', '[data-sec="mt"]']) { const n = q(s); if (n) { n.classList.add('mbsub'); nav.appendChild(n); } }
    for (const n of [...nav.querySelectorAll('.msep')]) if (n !== sep) n.remove();
    for (const s of ['[data-sec="sky"]', '[data-sec="seg"]', '[data-sec="ev"]', '[data-sec="vers"]']) { const n = q(s); if (n) nav.appendChild(n); }          // (developer mode only)
    // 设置 opens the way to the two pages that left the column
    const opt = el.pane.querySelector('section[data-sec="opt"]');
    // (用户 2026-11-22 21:13 UTC「设置里面就应该可以选视角」: 视角 is no button of its own on the title or in the menu, it is the first part
    //   of 设置. The page's own nodes move, so whatever fills the tiles (#sw-view) still finds them; U.menu('view') opens 设置, the V key still just steps to the next view)
    const vsec = el.pane.querySelector('section[data-sec="view"]');
    if (opt && vsec) { const g = document.createElement('div'); g.className = 'gap'; opt.insertBefore(g, opt.firstChild); while (vsec.lastChild) opt.insertBefore(vsec.lastChild, opt.firstChild); vsec.remove(); }
    if (opt) {
      const h = document.createElement('div'); h.className = 'gap'; opt.appendChild(h);
      const row = document.createElement('div'); row.className = 'chips mbgo';
      for (const [sec, zh] of [['keys', '操作说明'], ['mt', '滑过的山']]) { const b = document.createElement('button'); b.type = 'button'; b.dataset.gosec = sec; I18N.live(b, zh); row.appendChild(b); }
      opt.appendChild(row);
    }
    // and each of those two pages has its way back to 设置
    for (const sec of ['keys', 'mt']) {
      const s = el.pane.querySelector('section[data-sec="' + sec + '"]'); if (!s) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mbback'; b.dataset.gosec = 'opt';
      b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg><span></span>'; I18N.live(b.lastChild, '设置');
      s.insertBefore(b, s.firstChild);
    }
  }

  U.init = function () {
    el = { app: $('app'), veil: $('veil'), shade: $('shade'), load: $('load'), fill: $('load-fill'), stage: $('load-stage'), title: $('title'), go: $('go'), how: $('how'), hud: $('hud'),
      seg: $('seg'), segEn: $('seg-en'), segCn: $('seg-cn'), hint: $('hint'), hintT: $('hint-t'), spd: $('spd'), tach: $('tach'), drop: $('drop'), snd: $('snd'), fs: $('fs'),
      bar: $('bar'), mn: $('mn'), menu: $('menu'), nav: $('menu').querySelector('nav'), pane: $('mpane'), mk: $('m-k'), mGo: $('m-go'), mTop: $('m-top'), mBack: $('m-back'), oSnd: $('o-snd'), oFs: $('o-fs'), oLang: $('o-lang'), oQ: $('o-q'),
      time: $('sw-time'), kinds: $('sw-seg'), ev: $('sw-ev'), view: $('sw-view'), seed: $('sw-seed'), skied: $('sw-skied'), more: $('more'), drop2: $('drop2'), vw: $('vw'),
      say: $('say'), sayK: $('say-k'), sayV: $('say-v'), cut: $('cut'), jump: $('jump'), tuck: $('tuck'), cross: $('cross'),
      pause: $('pause'), pauseS: $('pause-s'), pauseT: $('pause-t'), steer: $('steer'), steerV: $('steer-v'), chg: $('chg'),
      clk: $('clock'), clkT: $('clk-t'), clkS: $('clk-s'), clkG: $('clk-g') };
    // developer mode (?dev, or a path ending in /dev; never in the 小红书 build). The time, the weather, the encounters and the versions
    // are only there. Taken out of the tree, not merely hidden, so a normal player cannot reach them.
    U.dev = !(self.COLD_SMOKE && self.COLD_SMOKE.noDev) && (typeof DEV !== 'undefined' && DEV);
    
    el.app.classList.toggle('dev', !!U.dev);
    if (!U.dev ) el.app.querySelectorAll('.dev-only').forEach(n => n.remove());
    el.moreView = el.more.querySelector('[data-sec="view"]'); el.moreDaily = el.more.querySelector('[data-daily]'); el.daily = $('sw-daily'); el.mtDaily = el.menu.querySelector('section[data-sec="mt"] [data-daily]');
    layoutB();
    I18N.capture(el.app); I18N.on(relang);
    U.layout();
    el.go.addEventListener('click', e => { e.stopPropagation(); U.go(); });
    // immersive mode, only where the browser can open a headset (Safari on Apple Vision Pro): 21_xr.js
    el.xr = $('xr');          // (shown by U.ready once start-up has asked the browser: XR.probe runs in boot, after this)
    el.xr.addEventListener('click', e => { e.stopPropagation(); XR.enter(); });
    // the whole picture is the button (the corner's glyphs, the title's other buttons and the menu keep their presses to themselves)
    el.app.addEventListener('click', e => { if (U.state !== 'title' || U.open || el.bar.contains(e.target) || el.menu.contains(e.target) || el.more.contains(e.target)) return; U.go(); });
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;     // (a number in the developer panel keeps its own keys)
      if (/^Arrow/.test(e.code) || e.code === 'Space') e.preventDefault();          // these would scroll a page; here they ski
      if (e.repeat) return;
      const on = sel => e.target && e.target.closest && e.target.closest(sel);      // (a control reached with the tab key takes its own Enter)
      if (U.gone) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); location.reload(); } return; }
      // the menu open: Esc puts it away (and the run goes on); Enter and space belong to the button that has the focus
      const mine = (e.code === 'Enter' || e.code === 'Space') && on('#menu button, #bar button, #more button');
      // (Esc closes the top layer, whatever it is (一起滑's 找谁 / name box, a panel a module opened without a key of its own), as 返回 and the
      //   phone's back do; only with no layer up does it open the menu. It used to open the menu over 找谁: 2026-11-24 check)
      if (e.code === 'Escape' && U.layerTop() && U.layerTop() !== 'menu') { e.preventDefault(); U.back(); return; }
      if (U.open && e.code === 'Escape') { e.preventDefault(); U.menu(false); return; }
      if (mine) { muteKey(e.code); return; }
      if (U.open && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); muteKey(e.code); el.mGo.click(); return; }          // (nothing in the menu has the focus: Enter, or space as the owner asked, is the top line, 继续滑 or 出发)
      if ((e.code === 'Enter' || e.code === 'Space') && U.state === 'title' && !U.open) { e.preventDefault(); muteKey(e.code); U.go(); }
      else if (e.code === 'KeyM') { U.sound(!Sound.on); if (U.open) paint(); }
      else if (e.code === 'KeyF') U.fullscreen();
      else if (U.state === 'title' || U.state === 'run') {
        const d = e.shiftKey ? -1 : 1;
        if (e.code === 'KeyT') { if (U.dev) U.nextTime(d); } else if (e.code === 'KeyN' && U.dev) U.nextKind(d); else if (e.code === 'KeyG') { if (U.dev) U.animal(); } else if (e.code === 'KeyP') { if (U.dev) U.plane(); }
        else if (e.code === 'KeyR' && U.dev) U.newMountain(); else if (e.code === 'Escape') U.menu(true);
        else if (e.code === 'KeyH') U.menu('keys'); else if (e.code === 'Backquote') { if (U.dev) U.menu('vers'); }
      }
    });
    function muteKey(c) { try { if (typeof Input !== 'undefined' && Input.keys) { Input.mute = c; Input.keys[c] = false; } } catch (err) { } }
    el.snd.addEventListener('click', e => { e.stopPropagation(); U.sound(!Sound.on); if (e.detail) el.snd.blur(); });
    el.fs.addEventListener('click', e => { e.stopPropagation(); U.fullscreen(); });
    /*web{*/ document.addEventListener('fullscreenchange', () => {
      const on = !!document.fullscreenElement, own = performance.now() - fsT < 1500; fsT = performance.now();
      el.fs.classList.toggle('full', on); el.fs.setAttribute('aria-pressed', on ? 'true' : 'false'); U.layout(); if (U.open) paint();
      // thrown out of the whole screen (the system's Esc, a back gesture): the run waits. With a panel up (找谁, the name box…) that Esc was
      //   meant for the panel, which the browser kept for itself: the panel closes and no menu goes over it (2026-11-24 WebKit check)
      if (!on && !own) { const top = U.layerTop(); if (top && top !== 'menu') U.back(); else U.pause(); }
    }); /*}web*/
    // nothing here scrolls or zooms
    el.app.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (!document.hidden && U.state === 'run') U.keepAwake(); });
    addEventListener('orientationchange', () => setTimeout(() => { U.layout(); if (App.ready && App.fit) App.fit(); if (App.redraw) App.redraw(); }, 60));
    Input.onFlip = () => U.layout();
    initSwitch();
    initSplits();
    initVariants();
    goldLine();
    // (Variants 'tmusic' b: the score plays under the title page, so the first touch anywhere there may start the sound, as browsers require)
    document.addEventListener('pointerdown', () => { try { if (U.state === 'title' && typeof Music !== 'undefined' && Music.titleOn() && !Sound.unlocked) Sound.unlock(); } catch (e) { } }, true);
    if (typeof Rank !== 'undefined') try { Rank.init(); } catch (e) { console.warn(e); }          // (the boards, inside 小红书 only: 19b_rank.js)
    if (typeof XHS !== 'undefined') try { XHS.init(el); } catch (e) { console.warn(e); }            // (the host's buttons, settings, notes, follow: 19c_xhs.js)
  };
  // how the frame lies: wide or tall, turned or not; the stylesheet does the rest
  U.layout = function () {
    if (!el) return;
    const V = View.measure(), c = el.app.classList, hh = handheld();
    c.toggle('rot', V.forced); c.toggle('flip', V.forced && V.flip); c.toggle('wide', V.wide); c.toggle('short', V.short); c.toggle('midh', V.h < 780); c.toggle('desk', !hh);          // (panels size themselves by these and by --cw / --ch, never by the browser's own vw / vh or @media height: with the picture turned by the game those are the other way round)
    c.toggle('hasfs', !hh && fsAvail());          // (a third glyph in the corner: the pill stands clear of it)
    el.app.style.width = V.forced ? V.w + 'px' : ''; el.app.style.height = V.forced ? V.h + 'px' : '';
    el.app.style.setProperty('--cw', V.w + 'px'); el.app.style.setProperty('--ch', V.h + 'px');
    // (inside a frame, as on claude.ai, the phone's tilt is refused: there the finger is the only way, so the title says only that)
    let framed = !!(self.COLD_SMOKE && self.COLD_SMOKE.noTilt); try { framed = framed || window.self !== window.top; } catch (e) { framed = true; }      // (no tilt in a frame, nor in the 小红书 小工具 container)
    U.hh = hh; U.framed = framed; howText();
    if (typeof XHS !== 'undefined') XHS.layout();
    fitTitle(); requestAnimationFrame(fitTitle);
  };
  // (用户 2026-11-19 19:29 UTC，iPhone 竖拿、小红书里: 标题页的按钮、说明挤在一起，最下一行被切掉) The title's column (name, buttons, the line on how
  // to ski) must stand between the top of the frame and the fine print at its foot. On a low frame (a phone on its side, most of all with
  // the host's buttons along one side) it is taller than that: then the name and the line under the buttons are drawn smaller, by one
  // factor, until it fits (the buttons keep their size). Measured in the frame's own px (offsets, which the quarter turn does not touch).
  function fitTitle() {
    if (!el || !el.title) return;
    const t = el.title, mk = t.querySelector('.mark'), cta = t.querySelector('.cta'); if (!mk || !cta) return;
    const parts = [mk, ...cta.children].filter(e => !e.classList.contains('fine') && !e.classList.contains('keys') && !e.classList.contains('act'));          // (the buttons are never shrunk: a finger needs them their full size)
    // (shrunk with the scale property (apart from the fade-in's transform) and the room it frees given back by a negative margin, not CSS zoom: Safari's engine measures a zoomed
    // box in its own unzoomed units, so the zoom it got there was wrong and the line under the buttons ran onto the foot line, 21:3x UTC)
    for (const e of parts) { e.style.scale = ''; e.style.transformOrigin = ''; e.style.marginBottom = ''; }
    const off = e => { let y = 0; for (let q = e; q && q !== el.app; q = q.offsetParent) y += q.offsetTop; return y; };
    const vis = parts.filter(e => e.offsetHeight > 0); if (!vis.length) return;
    const fine = cta.querySelector('.fine'), cs = getComputedStyle(el.app);
    const foot = fine && fine.offsetHeight && getComputedStyle(fine).position === 'absolute' ? off(fine) - 10 : el.app.offsetHeight - (parseFloat(cs.getPropertyValue('--gb')) || 18);
    const last = vis[vis.length - 1], over = off(last) + last.offsetHeight - foot;
    if (over > 0.5) {
      const tall = vis.reduce((a, e) => a + e.offsetHeight, 0), z = Math.max(0.62, 1 - over / tall);
      for (const e of vis) {
        const h = e.offsetHeight, mb = parseFloat(getComputedStyle(e).marginBottom) || 0;
        const P = e.parentNode, mid = P && Math.abs(e.offsetLeft + e.offsetWidth / 2 - P.clientWidth / 2) < 2 && e.offsetLeft > 2;          // (a centred column shrinks toward its middle)
        e.style.transformOrigin = mid ? '50% 0' : '0 0'; e.style.scale = z.toFixed(3); e.style.marginBottom = (mb - h * (1 - z)).toFixed(1) + 'px';
      }
    }
    // (how wide the column of buttons now is, in the frame: panels that open beside it, like the challenge's, stand clear of it)
    const act = cta.querySelector('.act'); if (act) { const r = act.getBoundingClientRect(); el.app.style.setProperty('--actw', Math.round(el.app.classList.contains('rot') ? r.height : r.width) + 'px'); }
  }
  // (the title's line of controls, and the controls page: with fore/aft on (Variants 'fa' b) up and down are the shovels and the tails, the tuck is Shift)
  const faOn = () => typeof Variants !== 'undefined' && Variants.val.fa === 'b';
  function howText() {
    const hh = U.hh, framed = U.framed, fa = faOn(); el.app.classList.toggle('fa', fa);
    if (!hh) {
      el.how.textContent = T(fa ? '← → 转弯 · 转弯时按 ↓ 压刃拐急 · ↑ 搓雪减速 · 空格 跳 · Shift 加速' : '← → 或 A D 转弯 · 空格 跳 · ↓ 或 S 加速');
      return;
    }
    // (where the phone can steer: the page's tilt outside a frame, or the 小工具's gyroscope once it reports, Input.onTiltOn)
    const tilt = !framed || Input.tiltLive();
    const steering = fa ? (tilt ? '左手左右推或倾斜手机转弯，转弯时往上推前压搓雪减速，往下推后压压刃拐急' : '左手左右推转弯，转弯时往上推前压搓雪减速，往下推后压压刃拐急') : !tilt ? '按住屏幕左右拖动转弯' : '倾斜手机或按住屏幕左右拖动转弯';
    
    el.how.textContent = T(steering) + ' · ' + T('右下角 跳 / 加速');
  }
  if (typeof Variants !== 'undefined') Variants.on(n => { if ((n === 'fa' || n === 'tilt') && el) howText(); });
  Input.onTiltOn = () => { if (el) howText(); };
  // the gold of the interface: a, the start button and the picked chip filled amber (as delivered); b, a hairline of gold round dark glass, the
  // way the rest of the interface wears it (the clock's rule, the view cards). The owner: the identity is the thin gold line, filled gold looked bad
  if (typeof Variants !== 'undefined') Variants.def('gold', '金色按钮', [['a', '实心'], ['b', '细描边']], 'b');
  if (typeof Variants !== 'undefined') Variants.def('tbtn', '标题按钮', [['a', '横排胶囊'], ['b', '竖排方块']], 'b');
  function goldLine() { if (el && typeof Variants !== 'undefined') { el.app.classList.toggle('line', Variants.val.gold !== 'a'); el.app.classList.toggle('vbtn', Variants.val.tbtn === 'b'); } }
  if (typeof Variants !== 'undefined') Variants.on(n => { if (n === 'gold' || n === 'tbtn') goldLine(); });
  U.stage = function (f, name) { if (!el) return; el.fill.style.transform = 'scaleX(' + f.toFixed(3) + ')'; if (name) el.stage.textContent = T(name); };
  // first frame is on the canvas: let it come up out of the dark, then set the title over it
  U.ready = function () {
    if (el && el.xr) el.xr.hidden = !XR.ok;
    if (!el) return; U.state = 'title';
    el.load.classList.remove('on'); el.veil.classList.add('lift'); el.shade.classList.add('on'); el.title.classList.add('on'); el.snd.classList.add('on');
    if (!U.hh && fsAvail()) el.fs.classList.add('on');
    el.bar.classList.add('on'); paint(); sayMountain();
  };
  U.sound = function (on) { Sound.setOn(on); el.snd.classList.toggle('mute', !on); el.snd.setAttribute('aria-pressed', on ? 'true' : 'false'); if (U.open) paint(); };
  U.keepAwake = function () { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; }, () => { }); } catch (e) { } };
  // the whole screen, where the browser allows it. On a phone that also lets us ask for the picture to be laid wide for real
  // (/*web{*/ … /*}web*/ is left out of the 小红书 小工具 build: the container manages the screen and forbids asking for it, tools/build-xhs.js)
  function fsAvail() { /*web{*/ return !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen; /*}web*/ return false; }
  U.fullscreen = function (on) {
    /*web{*/ try {
      const is = !!document.fullscreenElement; if (on == null) on = !is; if (on === is) return;
      fsT = performance.now();          // (asked for here: the change that follows, and any loss of focus it brings, is not the player leaving)
      if (!on) { document.exitFullscreen().catch(() => { }); return; }
      const d = document.documentElement; if (!d.requestFullscreen) return;
      d.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { if (U.hh && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }, () => { });
    } catch (e) { } /*}web*/
  };
  // pushing off, from the gate or from wherever a switch has just put the skier
  function launch() { Game.start(); Sound.kick(); }
  U.go = async function () {
    if (U.state !== 'title') return; U.state = 'starting';
    Sound.unlock();
    if (U.hh && !XR.active) U.fullscreen(true);      // a phone: take the whole screen if it will let us (asked for inside this tap)
    if (U.open) U.menu(false); el.title.classList.remove('on');
    // tilt has to be asked for from this tap (iOS shows its own prompt); where it is refused the finger takes over
    let asked = false; if (!XR.active) try { asked = await Promise.race([Input.requestTilt(), new Promise(r => setTimeout(() => r(false), 8000))]); } catch (e) { }
    Input.zeroPending = true; U.keepAwake();
    if (App.later) await App.later;      // (the shaders held back at start-up: almost always done long before; see boot in 99_main.js)
    launch();
    U.state = 'run'; U.t0 = performance.now(); U.segIdx = -1; U.hintT = 0; U.hintKind = null; U.tiltAsked = asked;
    newRun();
    el.shade.classList.add('run'); el.hud.classList.add('on'); el.app.classList.add('run');
  };
  function showHint(kind) {
    U.hintKind = kind; el.hint.className = kind + ' on';
    el.hintT.textContent = T(kind === 'tilt' ? '像握方向盘一样倾斜手机' : kind === 'drag' ? '按住屏幕，左右拖动' : kind === 'pace' ? '连着转弯，把雪扬起来'
      : kind === 'fa2' ? '左手往上推「前压」：转弯时搓雪减速 · 往下推「后压」：压刃拐急'
      : kind === 'moves' ? (U.hh ? '按住「跳」蓄力，松开起跳' : faOn() ? '转弯时按住 ↓ 压刃拐急 · ↑ 搓雪减速 · 空格 跳' : '空格 跳（按住蓄力） · ↓ 加速') : '← →  或  A D  转弯');
  }
  // per displayed frame
  U.frame = function (dt) {
    if (!el) return;
    if (U.state !== 'load') { switches(dt); clockFrame(); }
    if (U.state !== 'run') return;
    const S = Game.s, since = (performance.now() - U.t0) / 1000;
    // which way of steering to teach: wait a moment to see whether the phone is reporting its tilt
    if (!U.hintKind && since > 0.7) showHint(Input.tiltLive() ? 'tilt' : U.hh ? 'drag' : 'keys');
    // (once the first turns are made, an invitation: link them, and throw the snow up; and after that the two moves: the jump, and the
    // push or tuck that makes speed)
    // (held in the hands with fore/aft on: first what the thumb's up and down do, then the rest)
    else if (U.hintKind === 'gap' || U.hintKind === 'gap2' || U.hintKind === 'gap4') { U.hintT += dt; if (U.hintT > 1.0) { showHint(U.hintKind === 'gap' ? (U.hh && faOn() ? 'fa2' : 'pace') : U.hintKind === 'gap4' ? 'pace' : 'moves'); U.hintT = 0; } }
    else if (U.hintKind === 'pace' || U.hintKind === 'moves' || U.hintKind === 'fa2') { U.hintT += dt; if (U.hintT > (U.hintKind === 'fa2' ? 6.5 : 5.5)) { el.hint.classList.remove('on'); U.hintKind = U.hintKind === 'pace' ? 'gap2' : U.hintKind === 'fa2' ? 'gap4' : 'done'; U.hintT = 0; } }
    else if (U.hintKind && U.hintKind !== 'done') {
      if (U.hintKind !== 'tilt' && Input.tiltLive() && !Input.used) showHint('tilt');
      if (Input.used) U.hintT += dt;
      if (Input.used && U.hintT > 1.2 && since > 3.5) { el.hint.classList.remove('on'); U.hintKind = 'gap'; U.hintT = 0; }
      else if (since > 22) { el.hint.classList.remove('on'); U.hintKind = 'done'; }
    }
    // the name of each run, said as it comes into reach: two and a half seconds before the skier is in it (never twice: a skier who slows
    // short of the line has already been told; a skier put somewhere else altogether is told afresh)
    const sg = Course.segAt(-S.p[2] + 2.5 * Math.max(0, -S.v[2]));
    if (sg.idx < U.segIdx - 1) U.segIdx = -1;
    if (sg.idx > U.segIdx && since > 1.6 && !dayUp()) {
      U.segIdx = sg.idx; segCard(sg);
      // (on a phone held flat the card stands beside the speed, in the sky over the city, and goes sooner: the horizon is the picture there)
      segHold(el.app.classList.contains('short') && !el.app.classList.contains('desk') ? 2.5 : 3.6);
    }
    spFrame(dt);
    // numbers, ten times a second
    U.acc += dt; if (U.acc < 0.1) return; U.acc = 0;
    const kmh = Math.round(Math.hypot(S.v[0], S.v[1], S.v[2]) * 3.6), drop = Math.max(0, Math.round(Game.drop));
    // (the amber hairline under the number: how fast; or, in a build that keeps count of it, how well the turns are being linked: Game.flow, 0..1)
    const bar = typeof Game.flow === 'number' ? sat(Game.flow) : Math.min(1, kmh / 130);
    if (kmh !== U.shown.spd) { U.shown.spd = kmh; el.spd.textContent = kmh; }
    if (bar !== U.shown.bar) { U.shown.bar = bar; el.tach.style.transform = 'scaleX(' + bar.toFixed(3) + ')'; }
    if (drop !== U.shown.drop) { U.shown.drop = drop; el.drop.textContent = drop.toLocaleString('en-US'); el.drop2.textContent = '· ' + T('落差') + ' ' + drop.toLocaleString('en-US') + ' M'; }
  };
  // the corner clock. The digits change on the minute (one real second); the weather word can change between minutes, when the picture does.
  const CLK_ICON = {
    clear: '<circle cx="8" cy="8" r="2.4"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
    light: '<path d="M8 1.5v13M2.2 4.6l11.6 6.8M2.2 11.4L13.8 4.6"/>',
    heavy: '<path d="M8 1.2v13.6M1.6 4.2l12.8 7.6M1.6 11.8L14.4 4.2"/>',
    aurora: '<path d="M3.2 13.2c1.4-4.2 2.2-6.4 2.4-8.2M8 13.4c.7-5.2 1.3-7.6 1.5-9.4M12.6 13c.9-3.6 1.5-5.4 1.7-7.6"/>',
  };
  const WX_NAME = { clear: '晴', light: '小雪', heavy: '大雪', aurora: '极光' };
  function periodOf(min) {
    const m = ((min % 1440) + 1440) % 1440;
    if (m < 270) return '夜晚';          // 00:00–04:29
    if (m < 420) return '黎明';          // 04:30–06:59, sunrise at 06:00
    if (m < 690) return '上午';          // 07:00–11:29, the run opens at 10:20
    if (m < 810) return '中午';          // 11:30–13:29
    if (m < 960) return '下午';          // 13:30–15:59
    if (m < 1020) return '傍晚';         // 16:00–16:59, the golden hour
    if (m < 1230) return '黄昏';         // 17:00–20:29, sunset at 18:30
    return '夜晚';
  }
  let clkSig = '';
  function clockFrame() {
    if (!el || !el.clkT || typeof Sky === 'undefined') return;
    const C = Sky.cycle || 1440, min = Math.floor(((Sky.clock % C) + C) % C);
    const W = wxMod(); let wid = 'light';
    try { wid = W && W.shown ? W.shown() : (W && W.level) || 'light'; } catch (e) { }
    const per = periodOf(min), sig = min + '|' + wid + '|' + per + '|' + (EN() ? 'e' : 'z');
    if (sig === clkSig) { if (U.open) paintTune(); return; }
    clkSig = sig;
    const hh = Math.floor(min / 60), mm = min % 60;
    el.clkT.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    el.clkS.textContent = T(WX_NAME[wid] || '小雪') + ' · ' + T(per);
    if (el.clkG) el.clkG.innerHTML = CLK_ICON[wid] || CLK_ICON.light;
    if (U.open) paintTune();
  }

  // ================================================================ splits, and the day card
  // A run is given a shape. Each stretch of the mountain, once skied, leaves one quiet line under the name of the next: the time it took, the
  // fastest it was skied, the longest flight in it, and a small amber rise beside a figure that beats the best of that kind of run today (the
  // first of a kind sets its best without a word). At sunset and at sunrise a card sums up the run so far. The figures are the game's own,
  // gathered on its clock in App.onTick (so the slow motion of a jump and the tests' fast-forward count them right); when they show, and for how
  // long, is the interface's, on real time. Only skiing counts: a change of place (a switch, another mountain) carries nothing across it, so a
  // switch never makes a result, and a stretch counts only if it was skied from its top (the gate, or where a switch sets the skier down).
  // The bests of each kind last as long as the page (another mountain, the gate again: kept); the run so far starts again at 出发, and again
  // on another mountain, which keeps its own bests.
  const SP = U.sp = { cur: null, p: [0, 0, 0], seed: 0, air: false, to: null, best: {}, run: null, res: null, segT: -1, day: null, dayQ: null, days: 1, clock: null, nat: 0 };
  const JUMP_T = 0.75;          // s off the snow before a flight is a jump, not a hop off a bump (the slow motion of a jump takes hold from 0.6 s, whole at 1)
  const freshRun = () => ({ t: 0, dist: 0, drop: 0, v: 0, air: 0 });
  const fmt = (v, dp) => dp ? v.toFixed(dp) : Math.round(v).toLocaleString('en-US');
  const dayUp = () => !!SP.day && SP.day.t < 5;
  function initSplits() {
    el.split = $('split'); el.day = $('day'); el.dayK = $('day-k'); el.dayT = $('day-t'); el.dayF = $('day-f'); el.dayR = $('day-r');
    SP.run = freshRun(); App.onTick.push(spTick); App.onTick.push(dbTick); App.onTick.push(mtnTick);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { dbSave(true); mtnSave(true); } });
  }
  // 出发: a new run (the bests of each kind stay)
  function newRun() {
    Object.assign(SP, { run: freshRun(), cur: null, res: null, segT: -1, day: null, dayQ: null, days: 1, clock: null });
    el.day.classList.remove('on', 'held'); el.seg.classList.remove('res'); el.app.classList.remove('res', 'daycard', 'dayright');
  }
  // the skier has been put somewhere else: what was being measured goes, and so does a result not yet shown
  function spSettle() { SP.cur = null; SP.res = null; el.seg.classList.remove('res'); el.app.classList.remove('res'); }
  // the card of a run stays up t seconds from now (or longer, if it already would); brought up afresh, it comes without the last result
  function segHold(t) { if (SP.segT <= 0) { el.seg.classList.remove('res'); el.app.classList.remove('res'); } el.seg.classList.add('on'); SP.segT = Math.max(SP.segT, t); }

  // ---- on the game's clock, every step of it (dt is the world's time: slowed in the air, none while the run is set down)
  function spTick(dt) {
    if (!(dt > 0) || Game.mode === 'hold') return;          // (a run held by the menu: nothing goes by, and nothing is measured afresh)
    const S = Game.s, p = S.p, run = Game.mode === 'run';
    // sunset and sunrise, as the day reaches them by itself. A clock turned or held by a switch is not the day going by: a mark counts only
    // once the clock has run on its own for a second before it (so neither a switch nor letting the clock go again on the mark brings a card)
      { const ck = Sky.clock, C = Sky.cycle || 1440, own = run && Sky.rate !== 0 && U.tod === 'auto' && !ease;
      if (!own || SP.clock == null || ck < SP.clock || ck - SP.clock > 2) SP.nat = ck;
      else for (const rise of [false, true]) {
        const m0 = rise ? Sky.times.sunrise : Sky.times.sunset, m = m0 + C * Math.floor((ck - m0) / C);
        if (m > SP.clock && m >= SP.nat + 1) { if (rise) SP.days++; if (SP.run.t >= 20) SP.dayQ = { rise, day: SP.days, w: 0 }; }
      }
      SP.clock = ck; }
    if (!run) { SP.cur = null; return; }
    // put somewhere else (a switch, another mountain, a run begun): measure afresh from here
    if (!SP.cur || SP.seed !== Course.seed || Math.hypot(p[0] - SP.p[0], p[1] - SP.p[1], p[2] - SP.p[2]) > 6) { spBegin(); return; }
    const R = SP.run, c = SP.cur, v = Math.hypot(S.v[0], S.v[1], S.v[2]);
    R.t += dt; R.dist += SP.p[2] - p[2]; R.drop += SP.p[1] - p[1]; if (v > R.v) R.v = v;
    // a flight: from where the skis left the snow to where they came down, in a straight line
    if (S.air && !SP.air) SP.to = p.slice();
    else if (!S.air && SP.air && SP.to) { const d = Math.hypot(p[0] - SP.to[0], p[1] - SP.to[1], p[2] - SP.to[2]); if ((S.airT || 0) >= JUMP_T) { if (d > c.air) c.air = d; if (d > R.air) R.air = d; } SP.to = null; }
    SP.air = !!S.air; SP.p[0] = p[0]; SP.p[1] = p[1]; SP.p[2] = p[2];
    // over the line into the next run: the one left is done (if it was skied from its top, and for more than a moment)
    const sg = Course.segAt(-p[2]);
    if (sg.idx > c.idx) { if (sg.idx === c.idx + 1 && c.whole && c.t > 3) spFinish(c); SP.cur = { idx: sg.idx, type: sg.type, whole: sg.idx === c.idx + 1, t: 0, v: 0, air: 0 }; }
    const k = SP.cur; k.t += dt; if (v > k.v) k.v = v;
  }
  // (a stretch counts from its top: from within its first 80 m, which takes in the gate at 14 m and where a switch sets the skier down)
  function spBegin() {
    const S = Game.s, s = -S.p[2], sg = Course.segAt(s);
    const moved = SP.seed && SP.seed !== Course.seed;          // another mountain: the run so far is that mountain's, and starts again
    SP.cur = { idx: sg.idx, type: sg.type, whole: s - sg.s0 < 80, t: 0, v: 0, air: 0 };
    SP.p = S.p.slice(); SP.seed = Course.seed; SP.air = !!S.air; SP.to = null; SP.chain = null;
    if (moved) SP.run = freshRun();
  }
  // a best is a figure shown higher than the best shown before for that kind of run (time is not compared: no two runs of a kind are the same length)
  function spFinish(c) {
    const b = SP.best[c.type] || (SP.best[c.type] = { v: 0, air: 0 }), kv = Math.round(c.v * 3.6), ka = Math.round(c.air);
    SP.res = { type: c.type, t: c.t, kv, ka, upV: b.v > 0 && kv > Math.round(b.v * 3.6), upA: ka > 0 && b.air > 0 && ka > Math.round(b.air) };
    if (c.v > b.v) b.v = c.v; if (c.air > b.air) b.air = c.air;
    // 今日之山's race: the first three stretches of today's mountain skied in one go from the gate (each from its top, none skipped, no
    // switch between). Its figure is the average speed over them (the same length for everyone today, so faster = shorter time; the
    // boards keep the highest). SP.d3 holds the best of today for the boards to send.
    if (!isDaily()) { SP.chain = null; return; }
    if (c.idx === 0) SP.chain = { n: 1, t: c.t };
    else if (SP.chain && c.idx === SP.chain.n) { SP.chain.n++; SP.chain.t += c.t; }
    else SP.chain = null;
    if (SP.chain && SP.chain.n === D3) {
      const sg = Course.segs, len = sg[D3].s0 - sg[0].s0 - GATE_S, t = SP.chain.t, v = len / t, b3 = dbLoad();
      SP.res.d3 = { t, kv: v * 3.6, up: b3.v3 > 0 && v > b3.v3 }; SP.chain = null;
      if (v > b3.v3) { b3.v3 = v; b3.t3 = t; dbSave(true); }
      SP.d3 = { d: b3.d, v: b3.v3 };
    }
  }
  const D3 = 3, GATE_S = 14;

  // ---- per displayed frame of a run (real time)
  function spFrame(dt) {
    // the result of the run just left, under the name of the one being entered (named now if it has not been yet: a skier who slowed short of the line)
    if (SP.res && !dayUp()) {
      const r = SP.res, sg = Course.segAt(-Game.s.p[2]); SP.res = null;
      if (sg.idx > U.segIdx) { U.segIdx = sg.idx; segCard(sg); }
      splitLine(r); segHold(3.2); el.seg.classList.add('res'); el.app.classList.add('res');
    }
    if (SP.segT > -1) {
      const was = SP.segT; SP.segT -= dt;
      if (was > 0 && SP.segT <= 0) el.seg.classList.remove('on');
      if (SP.segT <= -1) { el.seg.classList.remove('res'); el.app.classList.remove('res'); }          // (closed again once the card has gone)
    }
    // the day card when its hour comes: once the name of a run is out of the way (eight seconds at the most), never over it
    if (SP.dayQ && !SP.day) { SP.dayQ.w += dt; if (SP.segT <= -1 || SP.dayQ.w > 8) { dayShow(SP.dayQ); SP.dayQ = null; } }
    if (SP.day) dayFrame(dt);
  }
  // 陡坡 · 28.4 s · 132 km/h ▲ · 飞行 38 m
  // the card of a run: its number and its name (in English the name is the big line, and the number stands alone over it)
  function segCard(sg) { const n = (sg.idx + 1 < 10 ? '0' : '') + (sg.idx + 1); el.segCn.textContent = T(SEG_NAMES[sg.type] || ''); el.segEn.textContent = EN() ? n : n + ' · ' + (SEG_EN[sg.type] || ''); }
  function splitLine(r) {
    const line = document.createElement('span'), add = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; line.appendChild(e); return e; };
    const fig = (lab, v, u) => { add('i', 'd', '·'); if (lab) add('em', 'k', lab); line.appendChild(document.createTextNode(v)); if (u) add('u', null, u); };
    add('em', 'k', T(SEG_NAMES[r.type] || ''));
    if (r.t < 60) fig('', r.t.toFixed(1), 's'); else fig('', Math.floor(r.t / 60) + ':' + (r.t % 60).toFixed(1).padStart(4, '0'), '');
    fig('', String(r.kv), 'km/h'); if (r.upV) add('i', 'up');
    if (r.ka > 0) { fig(T('飞行 '), String(r.ka), 'm'); if (r.upA) add('i', 'up'); }
    el.split.textContent = ''; el.split.appendChild(line);
    if (r.d3) { const l2 = document.createElement('span'); l2.className = 'd3'; const k = document.createElement('em'); k.className = 'k'; k.textContent = T('今日之山 · 前三段'); l2.appendChild(k);
      l2.appendChild(document.createTextNode(' ' + clock(r.d3.t) + ' · ' + r.d3.kv.toFixed(1) + ' km/h')); if (r.d3.up) { const u = document.createElement('i'); u.className = 'up'; l2.appendChild(u); }
      el.split.appendChild(document.createElement('br')); el.split.appendChild(l2); }
  }
  const clock = t => Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
  // DAY 1 · SUNSET / 日落 / the run so far: 落差, 距离, 极速, and the longest flight if there was one
  function dayShow(q) {
    const R = SP.run, F = [[Math.max(0, R.drop), 0, '落差 M'], R.dist < 1000 ? [Math.max(0, R.dist), 0, '距离 M'] : [R.dist / 1000, 1, '距离 KM'], [R.v * 3.6, 0, '极速 KM/H']];
    if (R.air > 0) F.push([R.air, 0, '飞行 M']);
    el.dayK.textContent = (isDaily() ? (EN() ? 'TODAY\'S MOUNTAIN · ' : '今日之山 · ') : '') + 'DAY ' + q.day + (EN() ? '' : ' · ' + (q.rise ? 'SUNRISE' : 'SUNSET'));
    if (isDaily()) dbSave(true); el.dayT.textContent = T(q.rise ? '日出' : '日落');
    el.dayF.textContent = ''; const d = SP.day = { t: 0, f: [] };
    for (const [v, dp, lab] of F) { const w = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span'); b.textContent = fmt(v, dp); s.textContent = T(lab); w.appendChild(b); w.appendChild(s); el.dayF.appendChild(w); d.f.push({ el: b, v, dp, k: -1 }); }
    // (each figure keeps the width of its whole value while it runs up to it, so nothing beside it moves)
    for (const f of d.f) f.el.style.minWidth = f.el.offsetWidth + 'px';
    for (const f of d.f) f.el.textContent = fmt(0, f.dp);
    // (held in the hands it stands high, out from under the thumbs: on the left, or mirrored on the right while the sun is in the left half)
    let r = false; if (U.hh) try { const g = Render.G, o = GOFF.sunScr; r = g[o + 2] > 0 && g[o] < 0.5; } catch (e) { }
    el.day.classList.toggle('r', r); el.app.classList.toggle('dayright', r);
    el.day.classList.remove('on', 'held'); void el.day.offsetWidth; el.day.classList.add('on'); el.app.classList.add('daycard');
    if (typeof Rank !== 'undefined' && Rank.on) Rank.onDay(); else if (el.dayR) el.dayR.textContent = '';
  }
  function dayFrame(dt) {
    const d = SP.day; d.t += dt;
    for (let i = 0; i < d.f.length; i++) { const f = d.f[i], k = sat((d.t - 0.95 - 0.12 * i) / 0.85); if (k !== f.k) { f.k = k; f.el.textContent = fmt(f.v * (1 - Math.pow(1 - k, 3)), f.dp); } }
    if (d.t >= 5 && el.day.classList.contains('on')) { el.day.classList.remove('on'); el.app.classList.remove('daycard', 'dayright'); }
    if (d.t >= 6.4) SP.day = null;
  }

  // ================================================================ the menu, and the direct switches
  // What the mountain otherwise shows only to those who ski long enough can be asked for: the views, and 滑过的山, the official mountains
  // that are released or already skied on this device. All of it lives in one menu. Developer mode adds the hour, the weather, each kind of
  // run, the animals and the airliner, a seed and today's mountain, and the versions. In a run the menu is the pause: the world holds
  // still where it is (Game.mode 'hold': nothing steps, but the picture is still drawn, so whatever is picked shows at once behind the shade).
  // On the title page the same menu opens from the buttons beside 出发. While skiing, V steps the view; N R T X G P and ` only in developer mode.
  // Everything the other modules own is reached through what they already expose, and read defensively: a part that is missing has no control.
  let ease = null, cut = null, back = null, pausedAt = 0, sayT = 0, swAcc = 0, faunaI = 0, evSig = null, hold = null, sec = 'view';
  const held = [], gy = { id: null, y: 0, on: false, over: false, neg: false };
  const live = () => U.state === 'title' || U.state === 'run';
  const fauna = () => { try { return typeof Fauna !== 'undefined' && Fauna && Fauna.spawn ? Fauna : null; } catch (e) { return null; } };
  const mkBtn = (txt, key, val) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.dataset[key] = val; return b; };
  // a small drawing for each view: where the lens stands round the figure
  const VIEW_ICON = {
    chase: '<circle cx="15" cy="6.5" r="2.4"/><path d="M15 9v6.5M11 19h8"/>', fp: '<path d="M3 11c4-6 20-6 24 0-4 6-20 6-24 0z"/><circle cx="15" cy="11" r="3"/>',
    tips: '<path d="M9 21l3-17M21 21l-3-17"/>', low: '<path d="M2 18h26"/><circle cx="18" cy="9" r="2"/><path d="M18 11v5M5 16l4-2"/>',
    high: '<path d="M15 2v6M12 5l3 3 3-3"/><circle cx="15" cy="15" r="2.4"/><path d="M8 20h14"/>', left: '<path d="M3 11h6M6 8l3 3-3 3"/><circle cx="19" cy="7" r="2.2"/><path d="M19 9v7M15 19h8"/>',
    right: '<path d="M27 11h-6M24 8l-3 3 3 3"/><circle cx="11" cy="7" r="2.2"/><path d="M11 9v7M7 19h8"/>', front: '<circle cx="15" cy="7" r="2.6"/><path d="M15 10v6M10 12l5-2 5 2M11 19h8"/>',
    far: '<circle cx="15" cy="11" r="7"/><path d="M15 2v4M15 16v4M6 11h4M20 11h4"/>' };
  // and for each hour (where the sun stands over the horizon) and each weather (how much snow is in the air)
  const AUTO_ICON = '<path d="M23 8.5A8.5 8.5 0 1 0 24.5 14"/><path d="M23.5 3.5V9H18"/>';
  const TIME_ICON = {
    auto: AUTO_ICON + '<circle cx="15" cy="12" r="2.2"/>',
    day: '<path d="M3 20h24"/><circle cx="15" cy="9" r="3.4"/><path d="M15 2.5v1.6M15 14v1.6M8.5 9h1.6M19.9 9h1.6M10.4 4.4l1.1 1.1M18.5 12.5l1.1 1.1M10.4 13.6l1.1-1.1M18.5 5.5l1.1-1.1"/>',
    golden: '<path d="M3 20h24"/><circle cx="15" cy="14" r="3.4"/><path d="M8 14h1.6M20.4 14h1.6M10.4 9.4l1.1 1.1M18.5 10.5l1.1-1.1M15 7.5v1.6"/>',
    sunset: '<path d="M3 20h24"/><path d="M9.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15 10.5v2M8.2 13.2l1.4 1.4M21.8 13.2l-1.4 1.4"/>',
    dusk: '<path d="M3 16h24"/><path d="M7 20h16" stroke-dasharray="1.5 2.5"/><path d="M21.5 5.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
    night: '<path d="M17.5 3.8a8 8 0 1 0 6.6 12.4A6.6 6.6 0 0 1 17.5 3.8z"/><path d="M6.5 5.5l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z"/>',
    dawn: '<path d="M3 20h24"/><path d="M10 20a5 5 0 0 1 10 0"/><path d="M15 6v6M12.5 8.5L15 6l2.5 2.5"/>' };
  const WX_ICON = {
    auto: AUTO_ICON + '<path d="M15 9v6M12.4 10.5l5.2 3M12.4 13.5l5.2-3"/>',
    clear: '<circle cx="15" cy="11" r="3.2"/><path d="M15 3.4v1.8M15 16.8v1.8M6.6 11h1.8M21.6 11h1.8M9 5l1.3 1.3M19.7 15.7l1.3 1.3M9 17l1.3-1.3M19.7 6.3l1.3-1.3"/>',
    light: '<path d="M9 7v5M6.8 8.2l4.4 2.6M6.8 10.8l4.4-2.6M21 10v5M18.8 11.2l4.4 2.6M18.8 13.8l4.4-2.6M15 16v4M13.3 17l3.4 2M13.3 19l3.4-2"/>',
    heavy: '<path d="M3 6h9M5 10h6"/><path d="M17 3.5v4M15.3 4.5l3.4 2M15.3 6.5l3.4-2M24 8v4M22.3 9l3.4 2M22.3 11l3.4-2M12 13v4M10.3 14l3.4 2M10.3 16l3.4-2M20 16v4M18.3 17l3.4 2M18.3 19l3.4-2M6 17v3M4.7 17.8l2.6 1.4M4.7 19.2l2.6-1.4"/>' };
  // a tile: the drawing over its name (the name is the last child, so it can be written again in another language)
  const iconBtn = (key, val, icon, label) => { const b = mkBtn('', key, val); b.innerHTML = '<svg viewBox="0 0 30 22" aria-hidden="true">' + icon + '</svg>'; const t = document.createElement('span'); t.textContent = label; b.appendChild(t); return b; };
  function initSwitch() {
    el.time.appendChild(iconBtn('time', 'auto', TIME_ICON.auto, T('自动'))); for (const [id, name] of TIMES) el.time.appendChild(iconBtn('time', id, TIME_ICON[id] || TIME_ICON.day, T(name)));
    for (const k of Object.keys(SEG_TYPES)) el.kinds.appendChild(mkBtn(T(SEG_NAMES[k] || k), 'seg', k));
    el.mn.addEventListener('click', e => { e.stopPropagation(); U.menu(); if (e.detail) el.mn.blur(); });
    el.more.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button'); if (!b) return; if (b.dataset.board) { if (self.__rings && __rings.pickOpen) __rings.pickOpen(true); if (e.detail) b.blur(); return; } if (b.dataset.daily) { U.daily(); if (e.detail) b.blur(); } else U.menu(b.dataset.sec); });
    // the column on the left: a part to open, or one of the ways out
    el.menu.addEventListener('click', e => {
      e.stopPropagation(); const b = e.target.closest('button'); if (!b) { if (e.target === el.menu || e.target.classList.contains('scrim')) U.menu(false); return; } const d = b.dataset;
      if (b === el.mBack) { U.menu(false); return; }          // (返回: the layer under it comes back, nothing starts)
      if (b === el.mGo) { if (U.state === 'title') U.go(); else U.menu(false); return; }
      if (b === el.mTop) { U.toTop(); return; }
      if (b.id === 'm-photo') { if (typeof Photo !== 'undefined') Photo.enter(); if (e.detail) b.blur(); return; }
      if (d.gosec) { show(d.gosec); if (e.detail) b.blur(); return; }
      if (d.sec && (b.parentNode === el.nav || (U.mb && el.nav.contains(b)))) { show(d.sec); return; }
      if (d.time) U.setTime(d.time); else if (d.seg) U.gotoKind(d.seg); else if (d.view) U.setView(d.view); else if (d.mtn) U.pickMountain(d.mtn); else if (d.new) U.newMountain(); else if (d.daily) U.daily();
      else if ('animal' in d) { U.animal(d.animal); U.menu(false); } else if (d.plane) { U.plane(); U.menu(false); }
      else if (b === el.oSnd) U.sound(!Sound.on); else if (b === el.oFs) U.fullscreen(); else if (b === el.oLang) I18N.set(EN() ? 'zh' : 'en'); else if (b === el.oQ) { Quality.cycle(); paint(); }
      else if (d.vn) { const V = varMod(); if (V) try { V.set(d.vn, d.vid); } catch (err) { console.warn(err); } paint(); }
      else if (d.vreset) { const V = varMod(); if (V && V.reset) try { V.reset(); } catch (err) { console.warn(err); } paint(); }
      else if (d.wx) U.setWeather(d.wx);
      if (e.detail) b.blur();          // chosen with a pointer: the keys go on belonging to the skier
    });
    // the one part of the page that scrolls: the page's own guard against it (on #app) is kept out of the pane
    el.pane.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
    el.nav.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
    $('view').addEventListener('pointerdown', e => { gy.id = e.pointerId; gy.y = View.y(e); });
    holdBtn(el.jump, 'jump'); holdBtn(el.tuck, 'tuck');
    // the next view, under the thumb (a press here never reaches the picture, where it would steer)
    el.vw.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
    el.vw.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); U.nextView(1); });
    // the run is set down by the menu glyph or Esc, and by itself whenever the player is taken away: another window, another app, a call
    el.pause.addEventListener('click', e => { e.stopPropagation(); if (U.gone) location.reload(); });
    addEventListener('blur', () => { letGo(); if (performance.now() - fsT > 1200) U.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { letGo(); U.pause(); if (hold) App.paused = true; }          // (out of sight nothing is drawn at all)
      else if (App.paused && !U.gone) App.paused = false;
    });
    // a mountain named in the address while the page is open (a link followed, the back button) is gone to as well. Outside dev the address cannot name one.
    addEventListener('hashchange', () => { if (!U.dev) return; const m = /^#seed-(\d{1,9})$/.exec(location.hash); if (m && +m[1] !== Course.seed) U.newMountain(+m[1]); });
    if (App.onMountain) App.onMountain.push(onMountain);          // (the page's own listener takes a link followed first: this hears of that change too)
  }
  // the two moves under the thumb. Each button keeps the finger that pressed it (captured: sliding off it neither lets go nor reaches the
  // picture, where a press would begin to steer); a tap shorter than a frame is held until one step of the game has seen it
  function holdBtn(b, key) {
    const h = { id: null, seen: true, drop: false, set(on) { Input.btn[key] = on; b.classList.toggle('down', on); } };
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (h.id != null) return; h.id = e.pointerId; h.seen = false; h.drop = false; try { b.setPointerCapture(e.pointerId); } catch (_) { } h.set(true); });
    const up = e => { if (e.pointerId !== h.id) return; h.id = null; if (h.seen) h.set(false); else h.drop = true; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    for (const t of ['click', 'touchstart', 'touchend']) b.addEventListener(t, e => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }, { passive: false });
    held.push(h);
  }
  // which part of the menu is open
  function show(s) {
    if (!U.dev && (s === 'sky' || s === 'ev' || s === 'vers' || s === 'seg')) s = 'view';
    if (!el.pane.querySelector('section[data-sec="' + s + '"]')) s = 'view';
    if (U.mb && s === 'view') s = 'opt';          // (菜单方案 B: 视角 lives inside 设置)
    sec = s;
    for (const b of el.nav.querySelectorAll('button[data-sec]')) b.classList.toggle('on', b.dataset.sec === s || (U.mb && b.dataset.sec === 'opt' && (s === 'keys' || s === 'mt')));
    for (const x of el.pane.children) x.classList.toggle('on', x.dataset.sec === s);
    el.pane.scrollTop = 0; paint();
    if (s === 'rank' && typeof Rank !== 'undefined') Rank.show();
    if (s === 'share' && typeof XHS !== 'undefined') XHS.show();
  }
  // layers (用户 2026-11-19 21:19 UTC：「菜单要有层级 modal 然后可以轻松退回去」). Every panel that opens over the page (菜单, 挑战, 路线卡) is
  // one layer: the page under it is dimmed and takes no tap, and 返回, a tap on the dimmed picture, Esc, or the phone's own back (Android's
  // key, the iPhone's edge swipe: one history step per layer, outside 小红书 whose host owns its back) close the top layer only, never
  // start a run. U.layer(name, true, close) when a panel opens, U.layer(name, false) when it closes, however it was closed
  const LY = []; let lyH = 0, lySkip = 0, lyPop = false;
  const lyHist = () => { try { return typeof history !== 'undefined' && history.pushState && !(typeof XHS !== 'undefined' && XHS.on); } catch (e) { return false; } };
  U.layer = function (name, on, close) {
    const i = LY.findIndex(l => l.name === name);
    if (on && i < 0) { LY.push({ name, close }); if (lyHist()) try { history.pushState({ csLayer: LY.length }, ''); lyH++; } catch (e) { } }
    else if (!on && i >= 0) { LY.splice(i, 1); if (!lyPop && lyH > 0) { lyH--; lySkip++; try { history.back(); } catch (e) { lySkip--; } } }
    if (el && el.app) el.app.classList.toggle('layered', LY.length > 0);
  };
  U.layerTop = () => LY.length ? LY[LY.length - 1].name : null;
  U.back = function () { const l = LY[LY.length - 1]; if (!l) return false; l.close(); return true; };
  if (typeof addEventListener !== 'undefined') addEventListener('popstate', () => {
    if (lySkip > 0) { lySkip--; return; }
    if (lyH <= 0) return; lyH--;
    const l = LY[LY.length - 1]; if (!l) return;
    lyPop = true; try { l.close(); } finally { lyPop = false; }
    if (LY[LY.length - 1] === l) LY.pop();          // (a close that did nothing still takes its layer off)
    if (el && el.app) el.app.classList.toggle('layered', LY.length > 0);
  });
  // U.menu(): open or close; U.menu('view'): open at that part (or, open at it already, close)
  U.menu = function (on) {
    if (!el || U.gone) return;
    if (typeof on === 'string') { if (U.open && sec === on) on = false; else { show(on); on = true; } }
    if (on == null) on = !U.open; if (on === U.open) return;
    if (on && !live()) return;
    if (on && U.state === 'run') holdOn();
    U.open = on; if (on) { if (!el.pane.querySelector('section.on')) show(sec); paint(); el.say.classList.remove('on'); sayT = 0; }
    const run = U.state === 'run';
    el.mk.textContent = T(run ? 'PAUSED · 暂停' : 'MENU · 菜单'); if (el.mBack) el.mBack.lastChild.textContent = T('返回'); el.mGo.textContent = T(run ? '继续滑' : '自由滑'); el.mTop.hidden = !run;
    el.menu.classList.toggle('on', on); el.menu.setAttribute('aria-hidden', on ? 'false' : 'true'); el.mn.setAttribute('aria-expanded', on ? 'true' : 'false');
    el.app.classList.toggle('menuopen', on);          // (the thumbs' buttons step aside under it)
    U.layer('menu', on, () => U.menu(false));
    if (U.state === 'title' && !U.mb) el.title.classList.toggle('on', !on);          // (the title's own words make way for it, and come back; 菜单方案 B clips them instead (template.html), so on its way back the title is there at once, its entrance not played again)
    try { if (!on && el.menu.contains(document.activeElement)) document.activeElement.blur(); } catch (e) { }
    if (!on && hold) holdOff();
  };
  // (the old name of the open/close, kept for anything that still calls it)
  U.openSwitch = function (on) { if (on === false || (on == null && U.open)) U.menu(false); else U.menu(true); };
  // what a key changed, said once (the open menu shows it itself)
  function say(k, v) { if (!el || U.open) return; el.sayK.textContent = EN() ? I18N.EN['say:' + k] || T(k) : k; el.sayV.textContent = T(v || ''); el.say.classList.add('on'); sayT = 2.4; }
  function flash(b) { if (!b) return; b.classList.add('hit'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('hit'), 1500); }
  // which of the named hours the clock is nearest to
  function hour() { const C = Sky.cycle, c = ((Sky.clock % C) + C) % C; let best = TIMES[0][0], bd = 1e9; for (const [id] of TIMES) { let d = Math.abs(c - Sky.times[id]); d = Math.min(d, C - d); if (d < bd) { bd = d; best = id; } } return best; }
  
  const views = () => Game.views && Game.views.length && Game.setView ? Game.views : null;
  const viewName = () => { const vs = views(); if (!vs) return ''; const v = vs.find(q => q.id === Game.view) || vs[0]; return v.name || String(v.id); };          // (said through T by say)
  // the menu as things stand: the hour held (or, with the clock running, the hour it has reached), the run being skied, the view, the
  // mountain, and whatever of animals, weather and versions this build has
  let vwSig = null;
  function paint() {
    if (!el) return;
    const now = U.tod === 'auto' ? hour() : null, kind = Course.segAt(-Game.s.p[2]).type;
    for (const b of el.time.children) { b.classList.toggle('on', b.dataset.time === U.tod); b.classList.toggle('now', b.dataset.time === now); }
    for (const b of el.kinds.children) b.classList.toggle('on', b.dataset.seg === kind);
    const F = fauna(), ks = F && F.kinds && F.kinds.length ? F.kinds : [{ id: '', name: '鹿' }], sig = ks.map(k => k.id + ':' + k.name).join();
    if (sig !== evSig) {
      evSig = sig; el.ev.textContent = '';
      for (const k of ks) el.ev.appendChild(mkBtn(T(k.name), 'animal', k.id));
      const s = document.createElement('i'); s.className = 'sep'; el.ev.appendChild(s);
      el.ev.appendChild(mkBtn(T('航班'), 'plane', '1'));
    }
    const vs = views(), vsig = vs ? vs.map(v => v.id).join() : '';
    if (vsig !== vwSig) {
      vwSig = vsig; el.view.textContent = '';
      for (const v of vs || []) { const b = mkBtn('', 'view', v.id); b.innerHTML = '<svg viewBox="0 0 30 22" aria-hidden="true">' + (VIEW_ICON[v.id] || VIEW_ICON.chase) + '</svg>'; const t = document.createElement('span'); t.textContent = T(v.name || v.id); b.appendChild(t); el.view.appendChild(b); }
      el.vw.hidden = !vs; el.nav.querySelector('[data-sec="view"]').hidden = !vs;
      if (el.moreView?.isConnected) el.moreView.hidden = !vs;
    }
    for (const b of el.view.children) b.classList.toggle('on', b.dataset.view === Game.view);
    const mt = typeof App.newMountain === 'function'; el.nav.querySelector('[data-sec="mt"]').hidden = !mt;
    if (mt && el.seed) { const n = '#' + Course.seed; if (el.seed.textContent !== n) el.seed.textContent = n; }
    paintDaily(); paintSkied();
    el.oSnd.textContent = T(Sound.on ? '声音 开' : '声音 关'); el.oSnd.classList.toggle('on', !!Sound.on); el.oSnd.setAttribute('aria-pressed', Sound.on ? 'true' : 'false');
    const fsOK = !U.hh && fsAvail(), full = !!document.fullscreenElement;
    el.oFs.hidden = !fsOK; el.oFs.classList.toggle('on', full); el.oFs.textContent = T(full ? '退出全屏' : '全屏');
    if (el.oLang) el.oLang.textContent = EN() ? '中文' : 'English';
    if (el.oQ) { const q = T(Quality.label()); if (el.oQ.textContent !== q) el.oQ.textContent = q; el.oQ.classList.toggle('on', Quality.pick !== 'auto'); }
    paintVariants();
  }
  // the language changed (the menu's own switch): the page's fixed words are I18N's; everything written from here is written again
  function relang() {
    for (const b of el.time.children) b.lastChild.textContent = T(b.dataset.time === 'auto' ? '自动' : (TIMES.find(q => q[0] === b.dataset.time) || [, b.dataset.time])[1]);
    for (const b of el.kinds.children) b.textContent = T(SEG_NAMES[b.dataset.seg] || b.dataset.seg);
    evSig = vwSig = vSig = wxSig = null;
    U.layout();
    const run = U.state === 'run'; el.mk.textContent = T(run ? 'PAUSED · 暂停' : 'MENU · 菜单'); el.mGo.textContent = T(run ? '继续滑' : '自由滑');
    if (U.hintKind && el.hint.classList.contains('on') && !/gap|done/.test(U.hintKind)) showHint(U.hintKind);
    if (U.state === 'run' && U.segIdx >= 0) { try { const sg = Course.segs[U.segIdx]; if (sg) segCard({ idx: U.segIdx, type: sg.type }); } catch (e) { } }
    if (el.tune) for (const n of el.tune.querySelectorAll('[data-zh]')) n.textContent = T(n.dataset.zh);
    paint();
    clkSig = ''; clockFrame();
  }

  // ---- the hour. It is turned to, not cut to: the clock is run the short way round to the hour asked for in a second or two (the sun
  // keeps its bearing all day, so run backwards a sunset is simply a sunrise), and held there until the day is let go again
  U.setTime = function (id) {
    if (id === 'auto') { U.tod = 'auto'; ease = null; Sky.rate = 1; }
    else {
      const to = Sky.times[id]; if (to == null) return;
      const C = Sky.cycle; let d = (((to - Sky.clock) % C) + C) % C; if (d > C / 2) d -= C;
      U.tod = id; Sky.rate = 0; ease = { from: Sky.clock, d, t: 0, dur: clamp(0.8 + Math.abs(d) / 140, 0.9, 2.4) };
    }
    paint(); say('时间', id === 'auto' ? '自动' : (TIMES.find(q => q[0] === id) || [])[1]);
  };
  U.nextTime = function (dir) { const i = TIMES.findIndex(q => q[0] === (U.tod === 'auto' ? hour() : U.tod)); U.setTime(TIMES[(i + (dir || 1) + TIMES.length) % TIMES.length][0]); };

  // ---- the weather (Weather, where this build has it: its own levels, eased by itself), beside the hour; X steps through it
  const wxMod = () => { try { return typeof Weather !== 'undefined' && Weather && Array.isArray(Weather.levels) && Weather.levels.length && typeof Weather.set === 'function' ? Weather : null; } catch (e) { return null; } };
  U.setWeather = function (id) {
    const W = wxMod(); if (!W || !live()) return;
    if (id === 'auto') { if (W.setAuto) W.setAuto(true); paint(); say('天气', '自动'); return; }
    const l = W.levels.find(q => q[0] === id); if (!l) return;
    try { W.set(id); } catch (e) { console.warn(e); }
    paint(); say('天气', l[1]);
  };
  U.nextWeather = function (dir) { const W = wxMod(); if (!W) return; const L = W.levels, i = Math.max(0, L.findIndex(q => q[0] === W.level)); U.setWeather(L[(i + (dir || 1) + L.length) % L.length][0]); };

  // ---- the versions the owner picks between: their own page of the menu, not part of the game. One row for each choice in Variants, in
  // groups (a choice this list does not know yet goes under 新加的), the current version filled, the recommended one marked with a grain of
  // amber. A press switches at once (each module eases its own change); 恢复推荐 puts every choice back to the recommended version
  const VGROUP = [['实验室人物（11 月 17 日）', ['rider', 'ride', 'rski', 'rboard', 'rtski', 'rtboard']], ['画面与音乐（11 月 16 日评审）', ['glint', 'gold', 'tbtn', 'nebday', 'nebnight', 'mlevel', 'tmusic', 'lsnow', 'plume', 'wbal', 'vary']], ['性能（11 月 17 日）', ['pslice', 'govjs', 'mbtap', 'patchd', 'bootq', 'tcull']], ['性能（11 月 19 日）', ['qtier']], ['人物动作（11 月 16 日评审）', ['mo1', 'medge', 'mo2', 'mo3', 'mo4', 'land', 'kring']], ['镜头', ['cam', 'wood', 'shots', 'tips', 'fptuck', 'edge', 'chatter', 'buffet']], ['人物与动作', ['body', 'cloth', 'poles', 'motion']],
    ['画面', ['ghost', 'hi', 'nspray', 'nsky', 'cu']], ['雪', ['spray', 'curtain', 'sparkle', 'clumps', 'lens', 'pdepth', 'drift']], ['场景与天气', ['tpass', 'tgrain', 'tvar', 'rock', 'moon', 'aurora', 'snow', 'rtree', 'flag', 'sink', 'wind']], ['手感', ['keys']]];
  let vSig = null, wxSig = null;
  const varMod = () => { try { return typeof Variants !== 'undefined' && Variants && Array.isArray(Variants.defs) ? Variants : null; } catch (e) { return null; } };
  function initVariants() {
    if (!VGROUP[VGROUP.length - 1][1].includes('feel')) VGROUP[VGROUP.length - 1][1].unshift('feel', 'fa', 'ebite');       // (滑行手感 and the rest of 07_game.js's feel, first under 手感)
    el.vrows = $('sw-vrows'); el.vreset = $('sw-vreset'); el.wx = $('sw-wx'); el.wxc = $('sw-wxc');
    const V = varMod(); if (V && V.on) V.on(() => { if (U.open) paint(); });          // (a choice registered or changed elsewhere: shown at once)
    addEventListener('keydown', e => { if (!U.dev || e.code !== 'KeyX' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || U.gone || !live()) return; const tag = e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return; U.nextWeather(e.shiftKey ? -1 : 1); });
    initTune();
  }
  function paintVariants() {
    if (!U.dev) return;
    const V = varMod(), defs = V ? V.defs : [];
    if (el.vrows) {
      const sig = defs.map(d => [d.name, d.label, d.def].concat(d.opts.map(o => o[0] + ':' + o[1])).join('|')).join(';');
      if (sig !== vSig) {
        vSig = sig; el.vrows.textContent = '';
        const known = new Set(VGROUP.flatMap(g => g[1])), groups = VGROUP.map(([n, ids]) => [n, ids.map(id => defs.find(d => d.name === id)).filter(Boolean)]);
        groups.push(['新加的', defs.filter(d => !known.has(d.name))]);
        for (const [gn, ds] of groups) {
          if (!ds.length) continue;
          const g = document.createElement('div'), h = document.createElement('i'); g.className = 'vgrp'; h.textContent = T(gn); g.appendChild(h);
          for (const d of ds) {
            const row = document.createElement('div'), lab = document.createElement('span'); row.className = 'vrow'; lab.textContent = T(d.label); row.appendChild(lab);
            for (const [id, name] of d.opts) { const b = mkBtn(T(name), 'vn', d.name); b.dataset.vid = id; if (id === d.def) { b.classList.add('rec'); b.title = T('推荐'); } row.appendChild(b); }
            g.appendChild(row);
          }
          el.vrows.appendChild(g);
        }
        const versBtn = el.nav.querySelector('[data-sec="vers"]'); if (versBtn) versBtn.hidden = !defs.length;
      }
      // how long the start-up took on this device, stage by stage (App.bootT, 99_main.js): for reading off a phone with a screenshot
      if (!el.vboot && el.vrows.parentNode) { el.vboot = document.createElement('p'); el.vboot.className = 'note'; el.vboot.style.cssText = 'opacity:.7;font-size:11px;line-height:1.5'; el.vrows.parentNode.insertBefore(el.vboot, el.vrows); }
      if (el.vboot && typeof App !== 'undefined' && App.bootT && App.bootT.length) {
        const B = App.bootT, r = B.find(x => x[0] === 'ready'), f = ms => (ms / 1000).toFixed(2) + 's';
        el.vboot.textContent = T('启动用时') + ' ' + (r ? f(r[1]) : '…') + ' · ' + B.map((x, i) => x[0] === 'ready' ? null : T(x[0].replace(/^后补:/, '')) + ' ' + (x[0].startsWith('后补:') ? '+' + f(x[1] - (r ? r[1] : 0)) : f((B[i + 1] ? B[i + 1][1] : x[1]) - x[1]))).filter(Boolean).join(' · ') + ' · ' + (App.gfx ? App.gfx.caps.backend : '');
      }
      let all = true;
      for (const b of el.vrows.querySelectorAll('button')) { const on = !!V && V.val[b.dataset.vn] === b.dataset.vid; b.classList.toggle('on', on); if (on && !b.classList.contains('rec')) all = false; }
      if (el.vreset) el.vreset.classList.toggle('idle', all);
    }
    if (!el.wxc) return;
    const W = wxMod(), ls = W ? W.levels : [], ws = ls.map(l => l[0] + ':' + l[1]).join();
    if (ws !== wxSig) { wxSig = ws; el.wxc.textContent = ''; if (W && W.setAuto) el.wxc.appendChild(iconBtn('wx', 'auto', WX_ICON.auto, T('自动'))); for (const [id, name] of ls) el.wxc.appendChild(iconBtn('wx', id, WX_ICON[id] || WX_ICON.light, T(name))); el.wx.hidden = !W; }
    if (W) for (const b of el.wxc.children) b.classList.toggle('on', W.auto ? b.dataset.wx === 'auto' : b.dataset.wx === W.level);
    paintTune();
  }
  // the seeded weather, edited only in developer mode. The fields are built once; painting them again would throw away a number being typed.
  function initTune() {
    el.tune = $('sw-tune'); if (!el.tune || !U.dev) return;
    const W = wxMod(); if (!W || !W.tune || !W.configure) return;
    const t = W.tune, lab = zh => { const s = document.createElement('span'); s.dataset.zh = zh; s.textContent = T(zh); return s; };
    const num = (key, val) => { const i = document.createElement('input'); i.type = 'number'; i.step = '1'; i.value = val; i.dataset.k = key; return i; };
    const row = (...nodes) => { const p = document.createElement('p'); p.className = 'trow'; for (const n of nodes) p.appendChild(n); el.tune.appendChild(p); };
    const h = document.createElement('h4'); h.dataset.zh = '随机天气'; h.textContent = T('随机天气'); el.tune.appendChild(h);
    row(lab('晴'), num('p.clear', Math.round(t.p.clear * 100)), lab('%'), lab('小雪'), num('p.light', Math.round(t.p.light * 100)), lab('%'), lab('大雪'), num('p.heavy', Math.round(t.p.heavy * 100)), lab('%'));
    for (const [id, name] of [['clear', '晴'], ['light', '小雪'], ['heavy', '大雪']]) row(lab(name), lab('最短'), num('dur.' + id + '.0', t.dur[id][0]), lab('最长'), num('dur.' + id + '.1', t.dur[id][1]), lab('秒'));
    row(lab('过渡'), num('ramp', t.ramp), lab('秒'), lab('种子'), num('seed', t.seed >>> 0));
    const ck = document.createElement('input'); ck.type = 'checkbox'; ck.checked = !!t.noRepeat; ck.dataset.k = 'noRepeat';
    row(ck, lab('不连着同一种'));
    const now = document.createElement('p'); now.className = 'now'; now.id = 'sw-now'; el.tune.appendChild(now);
    const note = document.createElement('p'); note.className = 'note'; note.dataset.zh = '开场先是小雪，之后按这些数字自己换。改一个，当前这一刻就按新的重算。'; note.textContent = T(note.dataset.zh); el.tune.appendChild(note);
    const onTune = () => {
      const g = k => el.tune.querySelector('[data-k="' + k + '"]'), val = k => { const i = g(k); if (!i || i.value === '') return null; const v = +i.value; return v === v ? v : null; };
      const o = { p: {}, dur: {} };
      for (const id of ['clear', 'light', 'heavy']) {
        const p = val('p.' + id); if (p != null) o.p[id] = p / 100;
        const a = val('dur.' + id + '.0'), b = val('dur.' + id + '.1');
        if (a != null || b != null) o.dur[id] = [a == null ? W.tune.dur[id][0] : a, b == null ? W.tune.dur[id][1] : b];
      }
      const ramp = val('ramp'); if (ramp != null) o.ramp = ramp;
      const seed = val('seed'); if (seed != null) o.seed = seed;
      const box = g('noRepeat'); if (box) o.noRepeat = box.checked;
      try { W.configure(o); } catch (e) { console.warn(e); }
      paint();
    };
    el.tune.addEventListener('input', onTune); el.tune.addEventListener('change', onTune);
  }
  function paintTune() {
    const n = $('sw-now'); if (!n || typeof Sky === 'undefined') return;
    const W = wxMod(); if (!W || !W.spellAt) return;
    let s; try { s = W.spellAt(Sky.clock); } catch (e) { return; }
    const name = (W.levels.find(l => l[0] === s.id) || [, s.id])[1];
    const line = (W.auto ? T('自动') + ' · ' : T('固定') + ' · ') + T(name) + ' · ' + Math.max(0, Math.round(s.left)) + T('秒');
    if (n.textContent !== line) n.textContent = line;
  }

  // ---- a change of place is a cut, and is shown as one: the picture dips to black, the skier is put there, the picture comes back.
  // (The black also covers the one long frame in which the snow of the new place is worked out.)
  function cutTo(fn) { if (cut || !el) return false; cut = { t: 0, stage: 0, n: 0, fn }; return true; }
  // after the skier has been put somewhere else: nothing of the old place comes along (and a run held by the menu pushes off afresh when it goes on)
  function settle() {
    try { if (Tracks.reset) Tracks.reset(); if (Spray.clear) Spray.clear(); } catch (e) { }
    try { const F = fauna(); if (F && F.reset) F.reset(); else if (Deer.herd) Deer.herd.length = 0; } catch (e) { }
    App.strides = null; App.lookYaw = null; U.segIdx = -1;
    if (hold) hold.moved = true;
    spSettle();
  }
  // the next run of a kind, ahead of where the skier is
  function nextOfKind(type) {
    let i = Course.segAt(-Game.s.p[2]).idx + 1;
    for (let n = 0; n < 48; n++, i++) {
      if (i >= Course.segs.length) { const l = Course.segs[Course.segs.length - 1]; Course.segAt(l.s0 + l.len + 1); if (i >= Course.segs.length) return null; }
      if (Course.segs[i].type === type) return Course.segs[i];
    }
    return null;
  }
  // where to stand in it: just past the blend out of the run before. Among the jumps: in the lane of the first one, a short run-in above
  // its lip (the fall line is straight down the mountain whichever way the valley bends, so it is the lip the skier is lined up with)
  function standIn(sg) {
    let s = sg.s0 + 30, x = null;
    if (sg.type === 'kickers') try {
      let f = null; for (let b = Math.floor(sg.s0 / 32); b <= Math.floor((sg.s0 + sg.len) / 32); b++) for (const q of Course.feats.get(b) || []) if (q.mark && q.s >= sg.s0 + 40 && (!f || q.s < f.s)) f = q;
      if (f) { s = Math.max(sg.s0 + 30, f.s - 40); x = Course.at(f.s + f.len * 0.94, {}).cx + f.u; }
    } catch (e) { }
    return { s, x };
  }
  U.gotoKind = function (type) {
    if (!U.dev || !live() || !SEG_TYPES[type]) return false;
    const sg = nextOfKind(type); if (!sg) return false;
    if (!cutTo(() => {
      const run = Game.mode === 'run', at = standIn(sg);
      Game.reset(at.s);
      if (at.x != null) { const S = Game.s, z = S.p[2], h = Course.height(at.x, z, 0.5), n = Course.normal(at.x, z, 0.35); S.p[0] = at.x; S.p[1] = S.h = Game.y0 = h; S.n[0] = n[0]; S.n[1] = n[1]; S.n[2] = n[2]; }
      settle(); if (run) launch();
    })) return false;
    if (U.state === 'title') say('路段', SEG_NAMES[type]);          // (in a run the name of the run comes up by itself)
    return true;
  };
  U.nextKind = function (dir) { if (!U.dev) return false; const ks = Object.keys(SEG_TYPES), i = ks.indexOf(Course.segAt(-Game.s.p[2]).type); return U.gotoKind(ks[(i + (dir || 1) + ks.length) % ks.length]); };

  // ---- another mountain (the seeding itself is the course's: App.newMountain). In dev the seed is written into the address as #seed-<n>
  function reflect(n) { if (!U.dev || n == null) return; const h = '#seed-' + n; try { if (location.hash !== h) history.replaceState(null, '', h); } catch (e) { try { location.hash = h; } catch (_) { } } }
  // The change is App.swap's own single transition: its veil closes over the last picture, the new mountain is made behind it, and it lifts
  // on the skier at the gate, pushing off again by itself if a run was on (no dip of ours on top of it: that showed the held picture between
  // the two). What follows a change, however it came (the key, the menu, a link followed), is onMountain's: App.onMountain calls it
  function newMountain(seed) {
    if (!live() || typeof App.newMountain !== 'function' || cut || App.swapping) return false;
    try { App.newMountain(seed); } catch (e) { console.warn(e); return false; }
    return true;
  }
  U.newMountain = seed => !!U.dev && newMountain(seed);
  function mtnWord(m) { return m ? (EN() ? m.en : m.zh) : ''; }
  function sayMountain(n) {
    const m = typeof Course.mountainBySeed === 'function' && Course.mountainBySeed(n);
    if (m) say('山', mtnWord(m)); else if (isDaily()) say('今日之山', dayLabel()); else say('山', '#' + (n == null ? Course.seed : n));
  }
  function onMountain(n) { mtnSave(true); settle(); reflect(n); sayMountain(n); paintDaily(); if (U.open) paint(); }

  // a named mountain from 滑过的山 (only one the list is showing). The same mountain again just says its name.
  U.pickMountain = function (id) {
    const m = mtnListed().find(q => q.id === id);
    if (!m || !live() || typeof App.newMountain !== 'function' || cut || App.swapping) return false;
    if (Course.seed === m.seed) { sayMountain(m.seed); return true; }
    try { App.newMountain(m.seed); } catch (e) { console.warn(e); return false; }
    return true;
  };

  // ---- 滑过的山: every official mountain that is released, or that this player has skied, kept on this device with their bests there
  // (the farthest in one go from 出发, the top speed, the longest flight). A later mountain is another entry in Course.mountains.
  const MKEY = 'coldsmoke.skied';
  let MB = null, mtnSaved = 0, mtnSig = '';
  function mtnAll() {
    if (MB) return MB; MB = {};
    try { const o = JSON.parse(localStorage.getItem(MKEY) || 'null'); if (o && typeof o === 'object' && !Array.isArray(o)) MB = o; } catch (e) { }
    return MB;
  }
  function mtnRec(all, id) { const b = all[id]; return b && typeof b === 'object' ? b : null; }
  function mtnSave(force) { if (!MB) return; const t = performance.now(); if (!force && t - mtnSaved < 10000) return; mtnSaved = t; try { localStorage.setItem(MKEY, JSON.stringify(MB)); } catch (e) { } }
  function mtnListed() { const all = mtnAll(), reg = (typeof Course !== 'undefined' && Course.mountains) || []; return reg.filter(m => m && m.id && (m.released || mtnRec(all, m.id))); }
  function mtnFigs(b) {
    if (!b) return ''; const dist = +b.dist || 0, v = +b.v || 0, air = +b.air || 0, f = [];
    if (dist > 1) f.push(T('最远') + ' ' + (dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km'));
    if (v > 1) f.push(T('极速') + ' ' + Math.round(v * 3.6) + ' km/h');
    if (air > 0) f.push(T('飞行') + ' ' + Math.round(air) + ' m');
    return f.join(' · ');
  }
  function mtnTick() {
    if (typeof Game === 'undefined' || Game.mode !== 'run' || !SP.run) return;
    const m = typeof Course.mountainBySeed === 'function' && Course.mountainBySeed(); if (!m) return;
    const all = mtnAll(); let b = mtnRec(all, m.id); if (!b) { b = { dist: 0, v: 0, air: 0 }; all[m.id] = b; }
    const R = SP.run; let up = !b.skied; b.skied = 1;
    if (R.dist > (+b.dist || 0)) { b.dist = R.dist; up = true; }
    if (R.v > (+b.v || 0)) { b.v = R.v; up = true; }
    if (R.air > (+b.air || 0)) { b.air = R.air; up = true; }
    if (up) mtnSave(false);
  }
  function paintSkied() {
    if (!el || !el.skied) return;
    const list = mtnListed(), all = mtnAll();
    const sig = (EN() ? 'en:' : 'zh:') + list.map(m => m.id + ':' + mtnWord(m) + ':' + mtnFigs(mtnRec(all, m.id))).join('|');
    if (sig !== mtnSig) {
      mtnSig = sig; el.skied.textContent = '';
      for (const m of list) {
        const row = document.createElement('div'), b = document.createElement('button'), p = document.createElement('p'), figs = mtnFigs(mtnRec(all, m.id));
        b.type = 'button'; b.className = 'pill'; b.dataset.mtn = m.id; b.textContent = mtnWord(m);
        p.className = 'daily'; p.textContent = figs || T('还没滑过');
        row.appendChild(b); row.appendChild(p); el.skied.appendChild(row);
      }
    }
    for (const b of el.skied.querySelectorAll('button')) { const m = list.find(q => q.id === b.dataset.mtn); b.classList.toggle('on', !!(m && Course.seed === m.seed)); }
  }

  // ---- 今日之山: today's mountain (App.dailySeed: the Beijing day hashed). Open it from the title shortcut or developer seed row.
  // Everything else is the mountain's as always (the splits,
  // the day card, the seed in the address). What it adds: the date beside the number, and this player's best on it today (the longest
  // distance skied in one go from 出发, the top speed, the longest flight), kept in this browser until the day turns
  const canPlayDaily = () => U.dev ;
  const isDaily = () => canPlayDaily() && typeof App.isDaily === 'function' && App.isDaily();
  const dayLabel = () => App.dayLabel(App.today(), EN());
  U.daily = function () {
    if (!canPlayDaily() || typeof App.dailySeed !== 'function') return false;
    if (isDaily()) { say('今日之山', dayLabel()); return true; }
    return newMountain(App.dailySeed());
  };
  const DKEY = 'coldsmoke.daily';
  let DB = null, dbSaved = 0;
  function dbLoad() { const d = App.today(); if (DB && DB.d === d) return DB; DB = { d, seed: App.dailySeed(d), dist: 0, v: 0, air: 0, v3: 0, t3: 0 }; try { const o = JSON.parse(localStorage.getItem(DKEY) || 'null'); if (o && o.d === d && o.seed === DB.seed) Object.assign(DB, { dist: +o.dist || 0, v: +o.v || 0, air: +o.air || 0, v3: +o.v3 || 0, t3: +o.t3 || 0 }); } catch (e) { } if (DB.v3 > 0) SP.d3 = { d, v: DB.v3 }; return DB; }
  function dbSave(force) { if (!DB) return; const t = performance.now(); if (!force && t - dbSaved < 10000) return; dbSaved = t; try { localStorage.setItem(DKEY, JSON.stringify(DB)); } catch (e) { } }
  // (from the run so far: while it is on today's mountain. A run is one go from 出发; a change of mountain starts measuring afresh)
  function dbTick() { if (!isDaily() || Game.mode !== 'run') return; const b = dbLoad(), R = SP.run; let up = false; if (R.dist > b.dist) { b.dist = R.dist; up = true; } if (R.v > b.v) { b.v = R.v; up = true; } if (R.air > b.air) { b.air = R.air; up = true; } if (up) dbSave(false); }
  function paintDaily() {
    const on = isDaily();
    if (el.moreDaily) el.moreDaily.classList.toggle('on', on);
    if (el.mtDaily) el.mtDaily.classList.toggle('on', on);
    if (!el.daily) return;
    el.daily.hidden = !on; if (!on) return;
    const b = dbLoad(), f = [];
    if (b.dist > 1) f.push(T('最远') + ' ' + (b.dist < 1000 ? Math.round(b.dist) + ' m' : (b.dist / 1000).toFixed(1) + ' km'));
    if (b.v > 1) f.push(T('极速') + ' ' + Math.round(b.v * 3.6) + ' km/h');
    if (b.air > 0) f.push(T('飞行') + ' ' + Math.round(b.air) + ' m');
    if (b.v3 > 0) f.push(T('前三段') + ' ' + clock(b.t3));
    const txt = '<em>' + T('今日之山') + ' · ' + dayLabel() + '</em>' + (f.length ? T('你今天在这座山上：') + f.join(' · ') : T('今天还没在这座山上滑过'));
    if (el.daily.innerHTML !== txt) el.daily.innerHTML = txt;
  }

  // ---- the things otherwise met by chance, sent for
  U.animal = function (id) {
    if (!live()) return; let name = '鹿', b = null;
    try {
      const F = fauna();
      if (F) {
        const ks = F.kinds || []; let i = id ? ks.findIndex(q => String(q.id) === String(id)) : -1;
        if (i < 0 && ks.length) i = faunaI % ks.length;          // no kind asked for: each in turn, so that all of them get seen
        const k = i >= 0 ? ks[i] : null; if (k) faunaI = i + 1;
        F.spawn(k ? k.id : undefined); name = k ? k.name : '动物'; b = k ? el.ev.querySelector('[data-animal="' + k.id + '"]') : null;
      } else { if (Deer.ready && Deer.enabled !== false && !Deer.herd.length) Deer.spawn(); b = el.ev.querySelector('[data-animal]'); }
    } catch (e) { console.warn(e); }
    flash(b); say('偶遇', name);
  };
  // (the airliner's own clock is simply told that its time has come; it then flies its pass as it always does)
  U.plane = function () {
    if (!live()) return; const P = Sky.plane; if (!P) return;
    let v = '航班 · 还在天上';
    if (!P.on && Sky.planes !== false) { v = '航班 · 看' + (P.n % 2 ? '右' : '左') + '上方'; P.next = 0; }
    flash(el.ev.querySelector('[data-plane]')); say('偶遇', v);
  };
  // ---- the views: picked by name in the menu, or stepped through (V, and the glyph over the jump)
  U.setView = function (id) { if (!live() || !Game.setView) return; try { Game.setView(id); } catch (e) { console.warn(e); } paint(); };
  U.nextView = function (dir) { if (!live() || !Game.nextView) return; try { Game.nextView(dir || 1); } catch (e) { console.warn(e); } paint(); say('视角', viewName()); };

  // ---- a run held, and taken up again. Held, nothing of the run steps (Game.mode 'hold': the skier, the clock of the day, the animals and
  // the counts all wait) while the picture is still drawn, so the menu's changes show behind it. The world is let go gently: at three
  // tenths of its speed, up to all of it over 0.8 s. That factor is the interface's own, App.resumeK, and scales the frame's time in the
  // loop; the slow motion of a jump (Game.timeScale) scales the same time again inside the step, so the two multiply. However the phone is
  // being held now is 'straight ahead' again. A skier put somewhere else meanwhile (a run, another mountain) pushes off from there
  function letGo() { for (const h of held) { h.id = null; h.drop = false; h.seen = true; h.set(false); } }
  function hush(level, tau) { try { if (Sound.rig && Sound.unlocked && Sound.ctx) Sound.rig.fade(level, Sound.ctx.currentTime, tau); } catch (e) { } }
  function holdOn() {
    if (hold || U.state !== 'run') return;
    hold = { moved: false }; U.paused = true; pausedAt = performance.now(); back = null; App.resumeK = 1;
    if (Game.mode === 'run') Game.mode = 'hold';
    letGo(); Input.drag = null; Input.keys = {}; gy.on = false; el.steer.classList.remove('on');
    hush(0, 0.05);          // (a time constant: all but gone in 0.15 s)
    el.day.classList.add('held');          // (the day card steps aside while the run is held; its clock stops with the run's, and it comes back for the rest)
  }
  function holdOff() {
    if (!hold) return; const moved = hold.moved; hold = null;
    U.paused = false; App.paused = false; U.t0 += performance.now() - pausedAt;
    if (App.swapping) App.swapping.run = true;          // (another mountain still being laid out pushes off once its veil lifts)
    else if (moved || Game.mode === 'title') launch();
    else if (Game.mode === 'hold') Game.mode = 'run';
    App.resumeK = 0.3; back = { t: 0 }; Input.zeroPending = true; Input.drag = null; Input.keys = {};
    el.day.classList.remove('held');
    Sound.refresh(); U.keepAwake();
  }
  // (not in the headset: the menu is a page on the canvas's side of the glass, out of sight in there. Going in can blur the window)
  U.pause = function () { if (!el || U.state !== 'run' || U.gone || XR.active) return false; if (!U.open) U.menu(true); return true; };
  U.resume = function () { if (!el || !U.open || U.gone) return false; U.menu(false); return true; };
  // back to the gate and the title page (the picture goes to black first; the menu's own clock times that)
  U.toTop = function () {
    if (!el || U.state !== 'run' || U.gone) return false;
    U.state = 'leaving';          // (neither a run nor the title until the black is down: no key does anything)
    hold = null; U.paused = false; U.open = false; el.menu.classList.remove('on'); el.menu.setAttribute('aria-hidden', 'true'); el.app.classList.remove('menuopen'); el.mn.setAttribute('aria-expanded', 'false');
    el.cut.classList.add('slow'); el.cut.style.opacity = 1; cut = { t: 0, stage: 9, n: 0, fn: null };
    setTimeout(() => {
      el.cut.classList.remove('slow');
      if (App.swapping) App.swapping.run = false;          // (another mountain still being laid out behind its veil must not set off down it under the title)
      try { Game.reset(); Game.mode = 'title'; } catch (e) { console.warn(e); }
      settle(); Input.drag = null; Input.keys = {}; U.state = 'title'; back = null; App.resumeK = 1; App.paused = false;
      el.app.classList.remove('run'); el.hud.classList.remove('on'); el.shade.classList.remove('run'); el.hint.classList.remove('on'); el.seg.classList.remove('on'); el.title.classList.add('on'); U.hintKind = null;
      el.day.classList.remove('held');
      cut = { t: 0, stage: 1, n: 0, fn: null }; hush(Sound.on ? Sound.level : 0, 0.4); paint();
    }, 300);
    return true;
  };
  // the picture itself is gone (the graphics device was taken away: the loop tells us). Nothing can be drawn again from here: say so, start over on a tap
  U.lost = function () {
    if (!el || U.gone) return; hold = null; if (U.open) U.menu(false); U.gone = true; U.paused = false; letGo(); hush(0, 0.05);
    el.pause.classList.add('lost', 'on'); el.pause.setAttribute('aria-hidden', 'false'); el.pauseS.textContent = T('画面断开了'); el.pauseT.textContent = T('点一下重新上山');
  };

  // per displayed frame, on the title page as in a run. dt is the frame's own (real) time: these are the interface's clocks, not the world's
  function switches(dt) {
    if (ease) { ease.t += dt; Sky.setClock(ease.from + ease.d * smoother(0, 1, ease.t / ease.dur)); if (ease.t >= ease.dur) ease = null; }
    if (cut) {
      cut.t += dt;
      if (cut.stage === 0) { const k = sat(cut.t / 0.16); el.cut.style.opacity = k; if (k >= 1) { cut.stage = 1; try { cut.fn(); } catch (e) { console.warn(e); } paint(); } }
      else if (cut.stage === 1) { if (++cut.n >= 2) { cut.stage = 2; cut.t = 0; } }          // two frames of the new place drawn unseen: the first is the long one
      else { const k = sat(cut.t / 0.45); el.cut.style.opacity = 1 - smooth(0, 1, k); if (k >= 1) { el.cut.style.opacity = ''; cut = null; } }
    }
    if (back) { back.t += dt; const k = sat(back.t / 0.8); App.resumeK = 0.3 + 0.7 * smooth(0, 1, k); if (k >= 1) { App.resumeK = 1; back = null; } }
    if (sayT > 0 && (sayT -= dt) <= 0) el.say.classList.remove('on');
    // the game has now stepped with whatever the thumbs were holding
    for (const h of held) { if (h.drop) { h.drop = false; h.set(false); } else h.seen = true; }
    // the steering finger: from where it came down to where it is (no further than full lock: past that nothing more happens), and whether
    // it is past the carve. The two numbers are Input's lock distance and the game's carve range (0.72 of full lock)
    { const d = U.state === 'run' && !hold ? Input.drag : null;
      if (U.hh && el.cross) crossFrame(d && gy.id === d.id ? d : null);
      else if (d && gy.id === d.id) {
        const L = Math.min(View.w || innerWidth, (View.h || innerHeight) * 1.4, 900) * 0.2, c = L * 0.72, dx = clamp(d.x - d.x0, -L, L), over = Math.abs(dx) > c, neg = dx < 0;
        if (!gy.on) { gy.on = true; el.steer.style.transform = 'translate(' + d.x0.toFixed(1) + 'px, ' + gy.y.toFixed(1) + 'px)'; el.steer.style.setProperty('--c', c.toFixed(1) + 'px'); el.steer.classList.add('on'); }
        el.steer.firstElementChild.style.transform = 'scaleX(' + dx.toFixed(1) + ')';
        if (faOn() && el.steerV) el.steerV.style.transform = 'scaleY(' + clamp(d.y - d.y0, -L, L).toFixed(1) + ')';
        if (over !== gy.over) { gy.over = over; el.steer.classList.toggle('over', over); } if (neg !== gy.neg) { gy.neg = neg; el.steer.classList.toggle('neg', neg); }
      } else if (gy.on) { gy.on = false; el.steer.classList.remove('on'); }
    }
    { const k = Input.btn.jump ? sat(Game.s.charge || 0) : 0; if (k !== (U.shown.k || 0)) { U.shown.k = k; el.jump.style.setProperty('--k', k.toFixed(3)); } }
    // (at a keyboard: the same ring, for the jump key. Shown from the first moment the legs fold, kept up a moment after the key is let go)
    if (el.chg && Variants.val.kring === 'b') { const on = !!Input.jump && !Input.btn.jump && Game.s.charge > 0, k = on ? sat(Game.s.charge || 0) : (U.shown.kk || 0);
      if (on !== !!U.shown.kon) { U.shown.kon = on; el.chg.classList.toggle('on', on); } if (k !== (U.shown.kk || 0)) { U.shown.kk = k; el.chg.style.setProperty('--k', k.toFixed(3)); } }
    swAcc += dt; if (U.open && swAcc > 0.25) { swAcc = 0; paint(); }
  }
  // the left thumb's cross (template #cross): carried to where the thumb came down, the dot and the lit arm follow it as far as full lock
  // (the same lock distance as Input), the word lit for the weight it asks for (past the same play as Input's)
  const cr = { on: false, up: false, dn: false };
  function crossFrame(d) {
    const c = el.cross, dot = c.querySelector('.dot'), arm = c.querySelector('.arm'), ub = c.querySelector('.up'), db = c.querySelector('.dn');
    if (!d) {
      if (cr.on) { cr.on = cr.up = cr.dn = false; c.classList.remove('held'); c.style.left = c.style.top = c.style.bottom = ''; dot.style.transform = ''; arm.style.transform = ''; ub.classList.remove('on'); db.classList.remove('on'); }
      return;
    }
    const L = Math.min(View.w || innerWidth, (View.h || innerHeight) * 1.4, 900) * 0.2, R = 34 / L;
    if (!cr.on) { cr.on = true; c.classList.add('held'); c.style.left = (d.x0 - 52).toFixed(1) + 'px'; c.style.top = (d.y0 - 52).toFixed(1) + 'px'; c.style.bottom = 'auto'; }
    const px = clamp(d.x - d.x0, -L, L) * R, py = faOn() ? clamp(d.y - d.y0, -L, L) * R : 0, len = Math.hypot(px, py);
    dot.style.transform = 'translate(' + px.toFixed(1) + 'px, ' + py.toFixed(1) + 'px) scale(1.5)';
    arm.style.transform = 'rotate(' + Math.atan2(py, px).toFixed(3) + 'rad) scaleX(' + len.toFixed(1) + ')';
    const up = py < -0.08 * 34, dn = py > 0.08 * 34;
    if (up !== cr.up) { cr.up = up; ub.classList.toggle('on', up); } if (dn !== cr.dn) { cr.dn = dn; db.classList.toggle('on', dn); }
  }
  return U;
})();
