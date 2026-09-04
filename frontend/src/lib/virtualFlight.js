/**
 * Virtual-flight authoring — feature-gap audit §"Virtual-flight / FPV
 * authoring". DJI's own mode flies a virtual aircraft over a real 3D
 * terrain/scene service this build has no dependency on; this is the scoped-
 * down version: discrete WASD/QE/CZ steps over the existing flat-ground
 * tilted view (Map3DOverlay.jsx / projection3d.js), which is what the app
 * already uses for altitude visualization elsewhere (feature-reference.md
 * §12 already documents that flat-ground assumption for the 3D view; this
 * reuses it rather than inventing a second one).
 *
 * Movement is step-based, not a continuous physics simulation: each keypress
 * moves a fixed distance/angle. That's a deliberate scope reduction, not an
 * oversight — a keyboard has no meaningful "hold" analog signal to test
 * against, so a smooth flight model would add complexity without adding
 * anything verifiable.
 */
import { offsetLatLng } from './geo.js';

export const MOVE_STEP_M = 5;
export const YAW_STEP_DEG = 15;
export const ALT_STEP_M = 5;
export const MIN_ALTITUDE_M = 1;
export const MAX_ALTITUDE_M = 1500;

/** The keys stepVirtualFlight understands, for callers that need to filter events. */
export const VIRTUAL_FLIGHT_KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'c', 'z'];

/**
 * One discrete step of virtual-flight movement.
 *
 * `key` is the lowercased keyboard key (w/a/s/d move and strafe relative to
 * the aircraft's own heading, matching the reference's own W/A/S/D — though
 * the reference maps A/D to roll rather than strafe on a real aircraft, the
 * effect on a top-down/tilted map is the same lateral movement). q/e yaw,
 * c/z change altitude. Pure and side-effect-free: MapCanvas.jsx only wires a
 * keydown listener to this and writes the result back to state.
 */
export function stepVirtualFlight(state, key) {
  const { lat, lng, height, heading } = state;

  const moveAt = (bearingOffset) => {
    const [nextLat, nextLng] = offsetLatLng(lat, lng, heading + bearingOffset, MOVE_STEP_M);
    return { ...state, lat: nextLat, lng: nextLng };
  };

  switch (key) {
    case 'w':
      return moveAt(0);
    case 's':
      return moveAt(180);
    case 'a':
      return moveAt(-90);
    case 'd':
      return moveAt(90);
    case 'q':
      return { ...state, heading: (((heading - YAW_STEP_DEG) % 360) + 360) % 360 };
    case 'e':
      return { ...state, heading: (heading + YAW_STEP_DEG) % 360 };
    case 'c':
      return { ...state, height: Math.min(MAX_ALTITUDE_M, height + ALT_STEP_M) };
    case 'z':
      return { ...state, height: Math.max(MIN_ALTITUDE_M, height - ALT_STEP_M) };
    default:
      return state;
  }
}
