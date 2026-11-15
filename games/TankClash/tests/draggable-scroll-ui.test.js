const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('index.html contains cursor-grab styles and data-draggable-scroll on scrollable panels', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('.cursor-grab'), 'index.html must define .cursor-grab');
    assert.ok(html.includes('.cursor-grabbing'), 'index.html must define .cursor-grabbing');
    assert.ok(html.includes('id="combat-mini-hud" data-draggable-scroll="true"'), 'combat-mini-hud must have data-draggable-scroll');
    assert.ok(html.includes('id="settings-dialog-card" data-draggable-scroll="true"'), 'settings-dialog-card must have data-draggable-scroll');
    assert.ok(html.includes('id="spawn-dialog-card" data-draggable-scroll="true"'), 'spawn-dialog-card must have data-draggable-scroll');
});

test('controls.js exports makeDraggableScroll and initDraggableScrollUI', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'controls.js'), 'utf8');
    assert.ok(src.includes('function makeDraggableScroll'), 'controls.js must define makeDraggableScroll');
    assert.ok(src.includes('function initDraggableScrollUI'), 'controls.js must define initDraggableScrollUI');
    assert.ok(src.includes('window.makeDraggableScroll = makeDraggableScroll'), 'must export makeDraggableScroll');
    assert.ok(src.includes('window.initDraggableScrollUI = initDraggableScrollUI'), 'must export initDraggableScrollUI');
});

test('controls.js touchstart handler protects modal dialogs and draggable scroll elements from camera aim hijacking', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'controls.js'), 'utf8');
    assert.ok(src.includes('#settings-modal') || src.includes('#settings-dialog-card'), 'must filter settings modal from camera touch');
    assert.ok(src.includes('#spawn-modal') || src.includes('#spawn-dialog-card'), 'must filter spawn modal from camera touch');
    assert.ok(src.includes('[data-draggable-scroll]'), 'must filter [data-draggable-scroll] elements from camera touch');
});

test('makeDraggableScroll allows dragging to scroll and suppresses accidental click after drag', () => {
    const controlsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'controls.js'), 'utf8');
    
    // Extract makeDraggableScroll function
    const fnMatch = controlsSrc.match(/function makeDraggableScroll\(el\) \{([\s\S]*?)\n\}/);
    assert.ok(fnMatch, 'makeDraggableScroll function must be found in controls.js');

    // Create mock DOM environment
    const listeners = {};
    const winListeners = {};

    class MockClassList {
        constructor() { this.classes = new Set(); }
        add(c) { this.classes.add(c); }
        remove(c) { this.classes.delete(c); }
        contains(c) { return this.classes.has(c); }
    }

    class MockElement {
        constructor() {
            this.dataset = {};
            this.classList = new MockClassList();
            this.scrollTop = 0;
            this.scrollLeft = 0;
            this.listeners = {};
        }
        addEventListener(event, handler, options) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push({ handler, options });
        }
        removeEventListener(event, handler, options) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(l => l.handler !== handler);
        }
        dispatchEvent(event) {
            const list = this.listeners[event.type] || [];
            for (const item of [...list]) {
                item.handler(event);
                if (item.options && item.options.once) {
                    this.removeEventListener(event.type, item.handler, item.options);
                }
            }
        }
    }

    const mockWindow = {
        addEventListener: (event, handler, options) => {
            if (!winListeners[event]) winListeners[event] = [];
            winListeners[event].push({ handler, options });
        },
        removeEventListener: (event, handler) => {
            if (!winListeners[event]) return;
            winListeners[event] = winListeners[event].filter(l => l.handler !== handler);
        },
        performance: { now: () => 1000 },
        requestAnimationFrame: (cb) => 1,
        cancelAnimationFrame: () => {}
    };

    const makeDraggable = new Function('window', 'cancelAnimationFrame', 'requestAnimationFrame', 'setTimeout', `
        ${fnMatch[0]};
        return makeDraggableScroll;
    `)(mockWindow, () => {}, () => 1, (cb, d) => setTimeout(cb, d));

    const el = new MockElement();
    makeDraggable(el);

    // Initial state: cursor-grab added
    assert.strictEqual(el.classList.contains('cursor-grab'), true);
    assert.strictEqual(el.dataset.draggableScrollInit, 'true');

    // 1. Simulate drag
    const pointerDown = el.listeners['pointerdown'][0].handler;
    const pointerMove = winListeners['pointermove'][0].handler;
    const pointerUp = winListeners['pointerup'][0].handler;

    pointerDown({ pointerType: 'touch', clientX: 100, clientY: 200, target: el });
    assert.strictEqual(el.classList.contains('cursor-grabbing'), true);

    // Drag vertically by 50px upward (moving content down)
    pointerMove({ clientX: 100, clientY: 150, cancelable: true, preventDefault: () => {} });
    assert.strictEqual(el.scrollTop, 50, 'scrollTop should increase by 50 when dragging up');

    // Drag horizontally by 30px leftward
    pointerMove({ clientX: 70, clientY: 150, cancelable: true, preventDefault: () => {} });
    assert.strictEqual(el.scrollLeft, 30, 'scrollLeft should increase by 30 when dragging left');

    // Pointer up after drag
    pointerUp({ pointerId: 1 });
    assert.strictEqual(el.classList.contains('cursor-grab'), true);
    assert.strictEqual(el.classList.contains('cursor-grabbing'), false);

    // Click suppression test: clicking immediately after drag should be suppressed
    let clickPropagated = true;
    const mockClickEvent = {
        type: 'click',
        stopPropagation: () => { clickPropagated = false; },
        preventDefault: () => {}
    };
    el.dispatchEvent(mockClickEvent);
    assert.strictEqual(clickPropagated, false, 'Click should be suppressed right after dragging');

    // 2. Simulate pure tap (<= 4px movement)
    pointerDown({ pointerType: 'touch', clientX: 100, clientY: 200, target: el });
    pointerMove({ clientX: 102, clientY: 201, cancelable: true, preventDefault: () => {} });
    pointerUp({ pointerId: 1 });

    // Pure tap should NOT suppress subsequent click
    clickPropagated = true;
    el.dispatchEvent(mockClickEvent);
    assert.strictEqual(clickPropagated, true, 'Click should NOT be suppressed after a simple tap without drag');

    // 3. PC mouse click on interactive button inside modal:
    const mockButton = {
        tagName: 'BUTTON',
        closest: (selector) => selector.includes('button') ? mockButton : null
    };
    // pointerdown from mouse on button should return immediately and not activate dragging
    pointerDown({ pointerType: 'mouse', button: 0, clientX: 150, clientY: 250, target: mockButton });
    assert.strictEqual(el.classList.contains('cursor-grabbing'), false, 'cursor-grabbing should not be activated on PC button click');

    // pointermove while button was clicked does not scroll
    pointerMove({ clientX: 150, clientY: 300, cancelable: true, preventDefault: () => {} });
    assert.strictEqual(el.scrollTop, 50, 'scrollTop should not change when clicking/dragging a button with mouse');
});

test('PC mouse interactions on interactive menu buttons do not trigger drag scrolling', () => {
    const controlsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'controls.js'), 'utf8');
    assert.ok(controlsSrc.includes('isInteractive'), 'controls.js must check isInteractive for mouse clicks');
    assert.ok(controlsSrc.includes('.spawn-tank-card'), 'controls.js must include spawn-tank-card in interactive elements');
    assert.ok(controlsSrc.includes('.soldier-type-card'), 'controls.js must include soldier-type-card in interactive elements');
    assert.ok(!controlsSrc.includes('setPointerCapture'), 'controls.js must not call setPointerCapture which blocks button click events');
});

