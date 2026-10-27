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

export const APPROACH_TOUCHDOWN = new THREE.Vector3(3.5, 0, -98.0);
export const APPROACH_ENTRY = APPROACH_TOUCHDOWN.clone().addScaledVector(
    new THREE.Vector3(RUNWAY_DIR.x, 0, RUNWAY_DIR.y),
    -215.0
);
APPROACH_ENTRY.y = 32.0;
export const LAUNCH_ORBIT_POSITION = new THREE.Vector3(0, 42, 245);
export const LAUNCH_ORBIT_VELOCITY = new THREE.Vector3(145 * 0.2, 8 * 0.2, 0);
export const APPROACH_GLIDE_VELOCITY = new THREE.Vector3(
    RUNWAY_DIR.x * 58,
    -8,
    RUNWAY_DIR.y * 58
);
export const APPROACH_TOUCHDOWN_VELOCITY = new THREE.Vector3(
    RUNWAY_DIR.x * 58,
    0,
    RUNWAY_DIR.y * 58
);

// Orthographic Camera Frustum Size
export const ORTHO_FRUSTUM_HEIGHT = 165;

// Camera Presets (Calibrated to Match Reference Aerial Photograph)
export const CAMERA_PRESETS = {
    iso:    { pos: new THREE.Vector3(-245, 195, 235), target: new THREE.Vector3(-2, 12, 5),   zoom: 1.18 },
    bow:    { pos: new THREE.Vector3(-185, 138, 225), target: new THREE.Vector3(0, 12, 82),   zoom: 2.15 },
    island: { pos: new THREE.Vector3(-220, 148, 35),  target: new THREE.Vector3(-22, 22, -52), zoom: 2.35 },
    stern:  { pos: new THREE.Vector3(-210, 152, -165), target: new THREE.Vector3(6, 12, -60), zoom: 1.85 }
};

export function sampleHermiteMotion(start, end, startVelocity, endVelocity, duration, t, position, velocity) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    position.set(
        h00 * start.x + h10 * duration * startVelocity.x + h01 * end.x + h11 * duration * endVelocity.x,
        h00 * start.y + h10 * duration * startVelocity.y + h01 * end.y + h11 * duration * endVelocity.y,
        h00 * start.z + h10 * duration * startVelocity.z + h01 * end.z + h11 * duration * endVelocity.z
    );
    if (velocity) {
        const dh00 = (6 * t2 - 6 * t) / duration;
        const dh10 = 3 * t2 - 4 * t + 1;
        const dh01 = (-6 * t2 + 6 * t) / duration;
        const dh11 = 3 * t2 - 2 * t;
        velocity.set(
            dh00 * start.x + dh10 * startVelocity.x + dh01 * end.x + dh11 * endVelocity.x,
            dh00 * start.y + dh10 * startVelocity.y + dh01 * end.y + dh11 * endVelocity.y,
            dh00 * start.z + dh10 * startVelocity.z + dh01 * end.z + dh11 * endVelocity.z
        );
    }
}

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
