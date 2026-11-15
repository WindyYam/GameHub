const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('index.html contains settings button in top right panel', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="btn-settings"'), 'index.html must include btn-settings element');
    assert.ok(html.includes('id="panel-views"'), 'index.html must include panel-views element');
    const panelViewsIdx = html.indexOf('id="panel-views"');
    const btnSettingsIdx = html.indexOf('id="btn-settings"');
    assert.ok(btnSettingsIdx > panelViewsIdx, 'btn-settings must be inside or follow panel-views in top right');
});

test('index.html contains settings modal dialog with resolution options and badge', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="settings-modal"'), 'index.html must include settings-modal');
    assert.ok(html.includes('id="current-res-badge"'), 'index.html must include current-res-badge');
    assert.ok(html.includes('data-res="default"'), 'must include default resolution option');
    assert.ok(html.includes('data-res="2k"'), 'must include 2k resolution option');
    assert.ok(html.includes('data-res="1080p"'), 'must include 1080p resolution option');
    assert.ok(html.includes('data-res="720p"'), 'must include 720p resolution option');
    assert.ok(html.includes('data-res="480p"'), 'must include 480p resolution option');
    assert.ok(html.includes('data-res="320p"'), 'must include 320p resolution option');
    assert.ok(html.includes('data-res="240p"'), 'must include 240p resolution option');
});

test('main.js defines RESOLUTION_PRESETS and exports setResolution and getResolution', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    assert.ok(mainSrc.includes('RESOLUTION_PRESETS'), 'main.js must define RESOLUTION_PRESETS');
    assert.ok(mainSrc.includes('setResolution'), 'main.js must define setResolution');
    assert.ok(mainSrc.includes('getResolution'), 'main.js must define getResolution');
    assert.ok(mainSrc.includes('initSettingsUI'), 'main.js must define initSettingsUI');
    assert.ok(mainSrc.includes('getInitialDefaultResolution'), 'main.js must define getInitialDefaultResolution');
});

test('getInitialDefaultResolution selects 720p if larger than 720p, otherwise default', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    // Extract getInitialDefaultResolution implementation
    const fnMatch = mainSrc.match(/function getInitialDefaultResolution\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'getInitialDefaultResolution function must exist');
    const fn = new Function(`${fnMatch[0]}; return getInitialDefaultResolution;`)();

    // Larger than 720p:
    assert.strictEqual(fn(2560, 1440), '720p', '2K (2560x1440) should default to 720p');
    assert.strictEqual(fn(1920, 1080), '720p', '1080p (1920x1080) should default to 720p');
    assert.strictEqual(fn(1600, 900), '720p', '1600x900 should default to 720p');
    assert.strictEqual(fn(1366, 768), '720p', '1366x768 should default to 720p');

    // 720p or smaller:
    assert.strictEqual(fn(1280, 720), 'default', '1280x720 should default to default (window size)');
    assert.strictEqual(fn(854, 480), 'default', '854x480 should default to default (window size)');
});
