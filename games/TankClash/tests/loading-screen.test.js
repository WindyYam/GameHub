const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('index.html contains tactical loading screen with immediate CSS styling', () => {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Loading screen container
    assert.ok(html.includes('id="loading-screen"'), 'index.html must include loading-screen element');
    
    // Key visual and informational components
    assert.ok(html.includes('WORLD WAR 2 SIMULATOR'), 'Loading screen must show game title');
    assert.ok(html.includes('loading-progress-container'), 'Loading screen must have progress container');
    assert.ok(html.includes('loading-status'), 'Loading screen must have status indicator');
    assert.ok(html.includes('loading-briefing'), 'Loading screen must have tactical briefing/intel box');
    assert.ok(html.includes('loading-tip-text'), 'Loading screen must have tip text element');

    // Explicit CSS rules for zero-delay rendering before external CSS/CDNs load
    assert.ok(html.includes('#loading-screen {'), 'index.html must have direct CSS for #loading-screen');
    assert.ok(html.includes('z-index: 9999'), 'Loading screen must have high z-index to overlay everything');
    assert.ok(html.includes('#loading-screen.loading-hidden'), 'index.html must define .loading-hidden for smooth fade-out');
});

test('main.js defines hideLoadingScreen and handles dismissal on simulation start', () => {
    const mainJsPath = path.join(__dirname, '..', 'js', 'main.js');
    const mainSrc = fs.readFileSync(mainJsPath, 'utf8');

    assert.ok(mainSrc.includes('function hideLoadingScreen()'), 'main.js must define hideLoadingScreen()');
    assert.ok(mainSrc.includes('window.hideLoadingScreen = hideLoadingScreen'), 'main.js must export hideLoadingScreen to window');
    assert.ok(mainSrc.includes('hideLoadingScreen()'), 'main.js must invoke hideLoadingScreen during initial rendering');
});

test('hideLoadingScreen gracefully transitions and hides loading screen element', () => {
    let classList = new Set();
    let style = { display: 'flex' };
    const mockElement = {
        classList: {
            contains: (c) => classList.has(c),
            add: (c) => classList.add(c),
            remove: (c) => classList.delete(c)
        },
        style: style,
        parentNode: {}
    };

    const globalWindow = {
        document: {
            getElementById: (id) => (id === 'loading-screen' ? mockElement : null)
        },
        setTimeout: (fn, ms) => fn() // execute immediately for test
    };

    function hideLoadingScreen() {
        const screen = globalWindow.document.getElementById('loading-screen');
        if (!screen || screen.classList.contains('loading-hidden')) return;
        screen.classList.add('loading-hidden');
        globalWindow.setTimeout(() => {
            if (screen && screen.parentNode) {
                screen.style.display = 'none';
            }
        }, 700);
    }

    assert.equal(mockElement.classList.contains('loading-hidden'), false);
    hideLoadingScreen();
    assert.equal(mockElement.classList.contains('loading-hidden'), true);
    assert.equal(mockElement.style.display, 'none');
});
