'use strict';

const PILOT_MODE = 6;
const PILOT_BOLT_SPEED = 360;
const PILOT_CAMERA_HEIGHT = 5;
const PILOT_CAMERA_DISTANCE = 32;
const PILOT_CAMERA_AIM_DISTANCE = 14;
const PILOT = {
  fighter: null,
  lastPosition: V3(),
  previousCameraPan: null,
  cameraReturnAt: 0,
  cameraReturning: true,
  keys: new Set(),
  touchYaw: 0,
  touchPitch: 0,
  fireHeld: false,
  boostHeld: false,
  rollLeftHeld: false,
  rollRightHeld: false,
  fireCooldown: 0,
  boost: false,
  input: { yaw: 0, pitch: 0, roll: 0, fire: false, boost: false }
};
const _pilotCamera = V3(), _pilotLook = V3(), _pilotUp = V3();

const pilotControls = document.createElement('div');
pilotControls.id = 'pilot-controls';
pilotControls.setAttribute('aria-label', 'Flight controls');
pilotControls.innerHTML = '<div id="pilot-stick" role="application" aria-label="Steering joystick"><div id="pilot-stick-knob"></div></div><div id="pilot-actions"><div id="pilot-roll"><button id="pilot-roll-left" type="button" aria-label="Roll left">Roll L</button><button id="pilot-roll-right" type="button" aria-label="Roll right">Roll R</button></div><button id="pilot-fire" type="button">Fire</button><button id="pilot-boost" type="button">Boost</button></div>';
document.body.appendChild(pilotControls);
if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) pilotControls.classList.add('touch');

const pilotStick = document.getElementById('pilot-stick');
const pilotKnob = document.getElementById('pilot-stick-knob');
const pilotHint = document.getElementById('hint');
const normalHint = pilotHint.textContent;

function schedulePilotCameraReturn() {
  if (!PILOT.fighter) return;
  PILOT.cameraReturnAt = performance.now() / 1000 + 3;
  PILOT.cameraReturning = false;
}

controls.addEventListener('start', () => {
  if (!PILOT.fighter) return;
  PILOT.cameraReturnAt = 0;
  PILOT.cameraReturning = false;
});
controls.addEventListener('end', schedulePilotCameraReturn);
renderer.domElement.addEventListener('wheel', schedulePilotCameraReturn, { passive: true });

function resetPilotStick() {
  PILOT.touchYaw = 0;
  PILOT.touchPitch = 0;
  pilotKnob.style.transform = 'translate(0, 0)';
}

function movePilotStick(event) {
  const rect = pilotStick.getBoundingClientRect();
  const max = (rect.width - pilotKnob.offsetWidth) * .5;
  const dx = event.clientX - (rect.left + rect.width * .5);
  const dy = event.clientY - (rect.top + rect.height * .5);
  const x = clamp(dx, -max, max), y = clamp(dy, -max, max);
  PILOT.touchYaw = x / max;
  PILOT.touchPitch = -y / max;
  pilotKnob.style.transform = `translate(${x}px, ${y}px)`;
}

pilotStick.addEventListener('pointerdown', event => {
  event.preventDefault();
  pilotStick.setPointerCapture(event.pointerId);
  movePilotStick(event);
});
pilotStick.addEventListener('pointermove', event => {
  if (pilotStick.hasPointerCapture(event.pointerId)) movePilotStick(event);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  pilotStick.addEventListener(name, resetPilotStick);
}

function bindHoldButton(id, field) {
  const button = document.getElementById(id);
  const release = () => {
    PILOT[field] = false;
    button.classList.remove('on');
  };
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    PILOT[field] = true;
    button.classList.add('on');
    button.setPointerCapture(event.pointerId);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, release);
}
bindHoldButton('pilot-fire', 'fireHeld');
bindHoldButton('pilot-boost', 'boostHeld');
bindHoldButton('pilot-roll-left', 'rollLeftHeld');
bindHoldButton('pilot-roll-right', 'rollRightHeld');

function startPilot() {
  const available = F.filter(f => f.state === 1 && f.mode !== 3);
  const fighter = pick(available.length ? available : F);
  if (fighter.state !== 1) spawnFighter(fighter, true);

  PILOT.fighter = fighter;
  resetPilotOrientation(fighter);
  fighter.mode = PILOT_MODE;
  fighter.tgt = null;
  PILOT.keys.clear();
  PILOT.fireCooldown = 0;
  PILOT.boost = false;
  PILOT.cameraReturnAt = 0;
  PILOT.cameraReturning = true;
  PILOT.previousCameraPan = controls.enablePan;
  controls.enablePan = false;
  PILOT.rollLeftHeld = false;
  PILOT.rollRightHeld = false;
  resetPilotStick();
  _pilotUp.crossVectors(fighter.dir, fighter.right).normalize();
  camera.up.copy(_pilotUp);
  _pilotCamera.copy(fighter.pos).addScaledVector(fighter.dir, -PILOT_CAMERA_DISTANCE)
    .addScaledVector(_pilotUp, PILOT_CAMERA_HEIGHT);
  camera.position.copy(_pilotCamera);
  _pilotLook.copy(fighter.pos).addScaledVector(fighter.dir, PILOT_CAMERA_AIM_DISTANCE)
    .addScaledVector(_pilotUp, PILOT_CAMERA_HEIGHT);
  controls.target.copy(fighter.pos);
  PILOT.lastPosition.copy(fighter.pos);
  camera.lookAt(_pilotLook);
  controls.enabled = true;
  controls.update();
  camera.lookAt(_pilotLook);
  pilotControls.classList.add('active');
  pilotHint.textContent = pilotControls.classList.contains('touch')
    ? 'Joystick steer · Roll L/R · hold Fire / Boost · drag camera'
    : 'WASD / arrows steer · Q/E roll · Space fire · Shift boost · drag camera · Esc exit';
  const button = document.getElementById('pilot-mode-button');
  if (button) {
    button.textContent = 'Exit pilot mode';
    button.classList.add('on');
  }
  toast('Piloting a random interceptor');
}

function stopPilot() {
  const fighter = PILOT.fighter;
  if (!fighter) return;
  if (fighter.state === 1 && fighter.mode === PILOT_MODE) {
    fighter.mode = 2;
    randomGoal(fighter.goal);
    fighter.modeT = T + rr2(2, 4);
  }
  PILOT.fighter = null;
  PILOT.cameraReturnAt = 0;
  PILOT.cameraReturning = false;
  if (PILOT.previousCameraPan !== null) {
    controls.enablePan = PILOT.previousCameraPan;
    PILOT.previousCameraPan = null;
  }
  PILOT.keys.clear();
  PILOT.boost = false;
  PILOT.fireHeld = false;
  PILOT.boostHeld = false;
  PILOT.rollLeftHeld = false;
  PILOT.rollRightHeld = false;
  resetPilotStick();
  controls.enabled = true;
  camera.up.set(0, 1, 0);
  pilotControls.classList.remove('active');
  pilotHint.textContent = normalHint;
  const button = document.getElementById('pilot-mode-button');
  if (button) {
    button.textContent = 'Pilot · random interceptor';
    button.classList.remove('on');
  }
}

const pilotKeyCodes = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight'
]);
addEventListener('keydown', event => {
  if (!PILOT.fighter) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    stopPilot();
  } else if (pilotKeyCodes.has(event.code)) {
    event.preventDefault();
    PILOT.keys.add(event.code);
  }
});
addEventListener('keyup', event => PILOT.keys.delete(event.code));
addEventListener('blur', () => {
  PILOT.keys.clear();
  PILOT.fireHeld = false;
  PILOT.boostHeld = false;
  PILOT.rollLeftHeld = false;
  PILOT.rollRightHeld = false;
});

function pilotFlightControl(fighter, dt) {
  const keys = PILOT.keys;
  const right = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
  const left = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
  const up = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  const down = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
  const input = PILOT.input;
  input.yaw = clamp(right - left + PILOT.touchYaw, -1, 1);
  input.pitch = clamp(up - down + PILOT.touchPitch, -1, 1);
  const rollRight = keys.has('KeyE') || PILOT.rollRightHeld ? 1 : 0;
  const rollLeft = keys.has('KeyQ') || PILOT.rollLeftHeld ? 1 : 0;
  input.roll = clamp(rollRight - rollLeft, -1, 1);
  input.fire = PILOT.fireHeld || keys.has('Space');
  input.boost = PILOT.boostHeld || keys.has('ShiftLeft') || keys.has('ShiftRight');
  PILOT.boost = input.boost;

  PILOT.fireCooldown -= dt;
  if (input.fire && PILOT.fireCooldown <= 0) {
    fighterShoot(
      fighter,
      fighter.pos.x + fighter.dir.x * 1000,
      fighter.pos.y + fighter.dir.y * 1000,
      fighter.pos.z + fighter.dir.z * 1000,
      null,
      PILOT_BOLT_SPEED
    );
    PILOT.fireCooldown = .18;
  }
}

function resetPilotOrientation(fighter) {
  fighter.right.crossVectors(_u, fighter.dir);
  if (fighter.right.lengthSq() < 1e-4) {
    fighter.right.set(1, 0, 0).addScaledVector(fighter.dir, -fighter.dir.x);
  }
  fighter.right.normalize();
}

function steerPilotFighter(fighter, dt) {
  const { yaw, pitch, roll } = PILOT.input;
  const oldX = fighter.dir.x, oldZ = fighter.dir.z;
  fighter.right.applyAxisAngle(fighter.dir, -roll * 1.35 * dt);
  _pilotUp.crossVectors(fighter.dir, fighter.right).normalize();
  const yawAngle = -yaw * 1.35 * dt;
  fighter.dir.applyAxisAngle(_pilotUp, yawAngle);
  fighter.right.applyAxisAngle(_pilotUp, yawAngle);
  fighter.dir.applyAxisAngle(fighter.right, -pitch * 1.05 * dt);
  fighter.dir.normalize();
  fighter.right.addScaledVector(fighter.dir, -fighter.right.dot(fighter.dir)).normalize();
  fighter.goal.copy(fighter.pos).addScaledVector(fighter.dir, 100);
  return (fighter.dir.x * oldZ - fighter.dir.z * oldX) / Math.max(dt, 1e-4);
}

function updatePilotCamera(fighter, rdt) {
  _pilotLook.subVectors(fighter.pos, PILOT.lastPosition);
  camera.position.add(_pilotLook);
  controls.target.add(_pilotLook);
  PILOT.lastPosition.copy(fighter.pos);
  _pilotUp.crossVectors(fighter.dir, fighter.right).normalize();
  camera.up.copy(_pilotUp);
  _pilotLook.copy(fighter.pos).addScaledVector(fighter.dir, PILOT_CAMERA_AIM_DISTANCE)
    .addScaledVector(_pilotUp, PILOT_CAMERA_HEIGHT);
  if (!PILOT.cameraReturning && PILOT.cameraReturnAt && performance.now() / 1000 >= PILOT.cameraReturnAt) {
    PILOT.cameraReturning = true;
    PILOT.cameraReturnAt = 0;
  }
  if (PILOT.cameraReturning) {
    _pilotCamera.copy(fighter.pos).addScaledVector(fighter.dir, -PILOT_CAMERA_DISTANCE)
      .addScaledVector(_pilotUp, PILOT_CAMERA_HEIGHT);
    const blend = 1 - Math.exp(-3.5 * rdt);
    camera.position.lerp(_pilotCamera, blend);
  }
  camera.lookAt(_pilotLook);
}
