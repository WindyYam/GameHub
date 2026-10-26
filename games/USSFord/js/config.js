import * as THREE from 'three';

// Flight Deck Boundaries & Dimensions
export const DECK_MIN_X = -40;
export const DECK_MAX_X = 44;
export const DECK_MIN_Z = -155;
export const DECK_MAX_Z = 155;
export const DECK_Y = 12.2;

// Angled Landing Runway Geometry
export const RUNWAY_START = new THREE.Vector2(-4.5, -152.0);
export const RUNWAY_END   = new THREE.Vector2(36.5, 42.0);
export const RUNWAY_DIR   = new THREE.Vector2(36.5 - (-4.5), 42.0 - (-152.0)).normalize();
export const RUNWAY_YAW   = Math.atan2(RUNWAY_DIR.x, RUNWAY_DIR.y);

// Orthographic Camera Frustum Size
export const ORTHO_FRUSTUM_HEIGHT = 165;

// Camera Presets (Calibrated to Match Reference Aerial Photograph)
export const CAMERA_PRESETS = {
    iso:    { pos: new THREE.Vector3(-245, 195, 235), target: new THREE.Vector3(-2, 12, 5),   zoom: 1.18 },
    bow:    { pos: new THREE.Vector3(-185, 138, 225), target: new THREE.Vector3(0, 12, 82),   zoom: 2.15 },
    island: { pos: new THREE.Vector3(-220, 148, 35),  target: new THREE.Vector3(-22, 22, -52), zoom: 2.35 },
    stern:  { pos: new THREE.Vector3(-210, 152, -165), target: new THREE.Vector3(6, 12, -60), zoom: 1.85 }
};

// Math Utilities
export function lerpYaw(a, b, t) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

export function angleDiff(a, b) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}
