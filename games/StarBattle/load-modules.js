'use strict';

(() => {
  const loading = document.getElementById('loading');
  // These classic scripts share scene bindings; keep this list in dependency order.
  const modules = [
    'modules/core.js',
    'modules/backdrop.js',
    'modules/ships.js',
    'modules/effects.js',
    'modules/weapons.js',
    'modules/fighters.js',
    'modules/pilot.js',
    'modules/asteroids.js',
    'modules/camera.js',
    'modules/wrecks.js',
    'modules/lighting.js'
  ];

  function showFailure(message) {
    loading.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = message;
    loading.appendChild(text);
  }

  function loadModule(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const onExecutionError = event => {
        window.removeEventListener('error', onExecutionError);
        reject(event.error || new Error(event.message));
      };
      script.src = path;
      script.onload = () => {
        window.removeEventListener('error', onExecutionError);
        resolve();
      };
      script.onerror = () => {
        window.removeEventListener('error', onExecutionError);
        reject(new Error(`Unable to load ${path}`));
      };
      window.addEventListener('error', onExecutionError, { once: true });
      document.body.appendChild(script);
    });
  }

  async function start() {
    if (!window.THREE || !THREE.OrbitControls) {
      showFailure('Three.js failed to load (network?)');
      return;
    }

    try {
      for (const path of modules) await loadModule(path);
    } catch (error) {
      console.error('StarBattle initialization failed:', error);
      showFailure('The battle scene failed to initialize. See the console for details.');
    }
  }

  start();
})();
