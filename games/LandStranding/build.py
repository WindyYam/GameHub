"""
Zero-dependency single-file HTML bundler for LandStranding.
Bundles css/style.css and all modular js/*.js files directly into index.html
so the game runs cleanly BOTH via https://127.0.0.1:8443/?game=LandStranding
AND by opening games/LandStranding/index.html directly from file:// (zero CORS errors!).
"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))

MODULE_ORDER = [
    'noise.js',
    'world.js',
    'textures.js',
    'atmosphere.js',
    'weather_fx.js',
    'terrain.js',
    'water.js',
    'landmarks.js',
    'character.js',
    'audio.js',
    'main.js',
]

IMPORT_RE = re.compile(
    r'^\s*import\s+[\s\S]*?\s+from\s+[\'"]([^\'"]+)[\'"];?\s*$',
    re.MULTILINE,
)

EXPORT_DECL_RE = re.compile(
    r'^export\s+(?=(?:const|let|var|function|class)\b)',
    re.MULTILINE,
)


def strip_local_imports_and_collect_exports(code: str, mod_name: str):
    """Wrap each non-entry module in a dedicated IIFE scope returning its exported symbols
    so internal helper names (like _tmpSample, smoothstep, etc.) never collide across modules."""
    external_imports = []
    local_imports = []  # list of (spec_text, target_mod_id)

    def handle_import(match):
        full = match.group(0).strip()
        src = match.group(1)
        if src.startswith('./'):
            target = os.path.basename(src)
            # Extract destructured or namespace bindings
            m_named = re.search(r'import\s*\{([\s\S]*?)\}\s*from', full)
            if m_named:
                bindings = m_named.group(1).strip()
                # Convert `a as b` -> `a: b` for object destructuring
                bindings = re.sub(r'\b(\w+)\s+as\s+(\w+)\b', r'\1: \2', bindings)
                mod_id = '__mod_' + target.replace('.js', '')
                local_imports.append(f'const {{{bindings}}} = {mod_id};')
            return ''
        else:
            external_imports.append(full)
            return ''

    body = IMPORT_RE.sub(handle_import, code)

    if mod_name == 'main.js':
        body = EXPORT_DECL_RE.sub('', body)
        return external_imports, '\n'.join(local_imports) + '\n' + body

    # Collect all exported names
    exported_names = []
    for m in re.finditer(r'^export\s+(?:const|let|var|function|class)\s+(\w+)', body, re.MULTILINE):
        exported_names.append(m.group(1))

    body = EXPORT_DECL_RE.sub('', body)
    mod_id = '__mod_' + mod_name.replace('.js', '')
    ret_obj = ', '.join(exported_names)
    wrapped = (
        f'// --- {mod_name} ---\n'
        f'const {mod_id} = (() => {{\n'
        + '\n'.join(local_imports)
        + '\n'
        + body
        + f'\nreturn {{ {ret_obj} }};\n}})();\n'
    )
    return external_imports, wrapped


def build():
    with open(os.path.join(ROOT, 'css', 'style.css'), 'r', encoding='utf-8') as f:
        css_text = f.read()

    ext_imports_seen = []
    bundled_parts = []

    for mod in MODULE_ORDER:
        with open(os.path.join(ROOT, 'js', mod), 'r', encoding='utf-8') as f:
            src = f.read()
        exts, chunk = strip_local_imports_and_collect_exports(src, mod)
        for e in exts:
            if e not in ext_imports_seen:
                ext_imports_seen.append(e)
        bundled_parts.append(chunk)

    bundled_js = '\n'.join(ext_imports_seen) + '\n\n' + '\n'.join(bundled_parts)
    # Prevent accidental closing script tags inside string literals
    bundled_js = bundled_js.replace('</script>', '<\\/script>')

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>LandStranding — Icelandic Horizon</title>
  <link rel="icon" href="data:," />
  <style>
{css_text}
  </style>
  <script type="importmap">
    {{
      "imports": {{
        "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"
      }}
    }}
  </script>
</head>
<body>
  <div id="canvas-container"></div>

  <div id="hud">
    <div class="hud-top-left">
      <div class="brand-pill">
        <span class="brand-dot"></span>
        <span>LANDSTRANDING // ICELANDIC SECTOR</span>
      </div>
      <div class="telemetry" id="telemetry">SEED: ICELAND-01 · 13:24 · OVERCAST MIST · 0m, 0m</div>
    </div>

    <div class="hud-top-right">
      <div class="toolbar">
        <button id="btn-env" type="button">Env Controls</button>
        <button id="btn-vista" type="button">Vista (V)</button>
        <button id="btn-audio" type="button">Audio: Off</button>
        <button id="btn-hide-hud" type="button">Hide HUD (H)</button>
      </div>
      <div class="hud-panel collapsed" id="env-panel">
        <div class="row">
          <label>Time <span id="lbl-time">13:24</span></label>
          <input id="sl-time" type="range" min="0" max="24" step="0.05" value="13.4" />
        </div>
        <div class="btn-group">
          <button type="button" data-time="13.4" data-wx="overcast">Overcast</button>
          <button type="button" data-time="6.2" data-wx="clearing">Dawn</button>
          <button type="button" data-time="18.4" data-wx="clearing">Dusk</button>
          <button type="button" data-time="23.5" data-wx="clear" data-aurora="on">Aurora Night</button>
        </div>
        <div class="row">
          <label>Day Cycle</label>
          <div class="btn-group">
            <button id="btn-cycle" type="button">Paused</button>
            <button id="btn-aurora" type="button">Aurora: Auto</button>
          </div>
        </div>
        <div class="row">
          <label>Weather</label>
          <div class="btn-group" id="wx-btns">
            <button type="button" class="active" data-wx-set="overcast">Overcast</button>
            <button type="button" data-wx-set="rain">Rain</button>
            <button type="button" data-wx-set="storm">Storm</button>
            <button type="button" data-wx-set="clearing">Clearing</button>
            <button type="button" data-wx-set="clear">Clear</button>
          </div>
        </div>
        <div class="row">
          <label>World Seed</label>
          <div class="btn-group">
            <button id="btn-seed-rand" type="button">New Random Sector</button>
          </div>
        </div>
        <div class="row">
          <label>Quick Travel</label>
          <div class="btn-group">
            <button id="btn-visit-village" type="button">Village</button>
            <button id="btn-visit-waterfall" type="button">Waterfall</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hud-bottom-left">
      <div class="key-chip"><b>WASD</b> Walk</div>
      <div class="key-chip"><b>Shift</b> Sprint</div>
      <div class="key-chip"><b>Space</b> Jump</div>
      <div class="key-chip"><b>Q</b> Odradek Scan</div>
      <div class="key-chip"><b>Drag / Scroll</b> Orbit &amp; Zoom</div>
      <div class="key-chip"><b>V</b> Reset Vista</div>
    </div>

    <div class="hud-bottom-right">
      <div class="compass" title="North Heading">
        <div class="compass-needle" id="compass-needle"></div>
        <span>N</span>
      </div>
    </div>
  </div>

  <!-- BUNDLE_START -->
  <script type="module">
{bundled_js}
  </script>
  <!-- BUNDLE_END -->
</body>
</html>
"""

    out_path = os.path.join(ROOT, 'index.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"[LandStranding] Built self-contained index.html ({len(html):,} bytes)")


if __name__ == '__main__':
    build()
