// The screenshot scenes behind ?shot=start|play|ring|end. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot —
// aim at the next ring, hold the speed, flare for the runway — so the frame
// is what a real flight looks like, and the same seed always gives the
// same frame.

import { PLANE, RING, STEP } from './config.js';
import { angleDiff, clamp } from './random.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { EVENT_LANDED, EVENT_OVER } from './flight.js';

/** Steer toward a point at an altitude, like a calm pilot would. */
function autopilot(state, targetX, targetAlt, targetZ, targetSpeed) {
  const p = state.plane;
  const desiredHeading = Math.atan2(targetX - p.x, -(targetZ - p.z));
  const turn = angleDiff(p.heading, desiredHeading);
  const roll = clamp(turn * 1.4, -1, 1);
  const altError = targetAlt - p.alt;
  // Close to the deck the pilot flies the numbers harder, or the plane
  // floats past the runway end without ever touching down.
  const gain = p.alt < 30 ? 0.06 : 0.02;
  let pitch = clamp(altError * gain, -1, 1) + (p.speed < 30 ? 0.25 : 0);
  // Never dive at the ground: close to the deck, the nose stays near level.
  if (p.alt < 35) pitch = Math.max(pitch, -0.25);
  let throttle = 0;
  if (p.speed < targetSpeed - 3) throttle = 1;
  else if (p.speed > targetSpeed + 3) throttle = -1;
  return { pitch: clamp(pitch, -1, 1), roll, throttle };
}

/** The autopilot's target right now: the next ring, or the final approach.
 * Rings are flown by path-following, not pure pursuit: the pilot chases a
 * carrot 260 m ahead of the plane's projection on the course line from the
 * last waypoint to the ring, so the plane joins the line early and arrives
 * lined up on the hoop instead of orbiting it. Close in, it slows down and
 * aims at the middle of the hoop itself. */
function autopilotTarget(state) {
  const p = state.plane;
  const ring = state.ringIndex < state.rings.length ? state.rings[state.ringIndex] : null;
  if (ring) {
    const prev = state.ringIndex === 0
      ? { x: 0, z: 200 }
      : state.rings[state.ringIndex - 1];
    const dx = ring.x - prev.x;
    const dz = ring.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const along = (p.x - prev.x) * ux + (p.z - prev.z) * uz;
    const distToRing = Math.hypot(p.x - ring.x, p.alt - ring.alt, p.z - ring.z);
    if (distToRing < 90) return { x: ring.x, alt: ring.alt, z: ring.z, speed: 42 };
    const carrot = Math.min(along + 260, len);
    return {
      x: prev.x + ux * carrot,
      alt: ring.alt,
      z: prev.z + uz * carrot,
      speed: distToRing < 350 ? 42 : 56,
    };
  }
  // Final: join a long final for North Field from the west, low and slow.
  const runway = { x: 900, z: -2400 };
  const join = { x: 380, alt: 80, z: -2400 };
  const distToField = Math.hypot(p.x - runway.x, p.z - runway.z);
  const distToJoin = Math.hypot(p.x - join.x, p.alt - join.alt, p.z - join.z);
  if ((distToField > 500 || p.alt > 70) && distToJoin > 120) {
    // Still far out or still high: get to circuit height west of the field.
    return { x: join.x, alt: join.alt, z: join.z, speed: 46 };
  }
  // On final: follow the runway centreline with a carrot ahead of the
  // plane, descending on a steady slope to the numbers, then settling.
  const planeAlong = p.x - (runway.x - 230);
  const alongLine = clamp(p.x - 380, 0, 620);
  const carrotX = Math.min(380 + alongLine + 130, 1000);
  // On the slope, glide to the numbers; over the strip, aim just below the
  // ground so the plane settles onto it instead of floating past the end.
  const targetAlt = planeAlong < -30 ? 13.6 + (-planeAlong) * 0.09 + 2 : 12.5;
  return { x: carrotX, alt: targetAlt, z: runway.z, speed: 36 };
}

/** One autopilot step for a flight state: the control for this frame. */
export function autopilotControl(state) {
  const target = autopilotTarget(state);
  return autopilot(state, target.x, target.alt, target.z, target.speed);
}

function flyFor(state, random, seconds, stopAt) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = state.flight.step(STEP, autopilotControl(state), random);
    if (stopAt && stopAt(state, events)) break;
    if (events & EVENT_OVER) break;
  }
}

/**
 * Set `flight` to the named scene (start, play, ring or end) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, flight, random) {
  flight.reset();
  const state = flight.state;
  state.flight = flight;
  if (name === 'start') {
    // Parked on the threshold at dawn, engines idling, instruments lit.
    state.plane.throttle = 0.25;
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Take off, climb out and close on the second ring, hoop still ahead.
    flyFor(state, random, 42, (s) => {
      const ring = s.ringIndex < s.rings.length ? s.rings[s.ringIndex] : null;
      if (!ring) return true;
      const d = Math.hypot(s.plane.x - ring.x, s.plane.alt - ring.alt, s.plane.z - ring.z);
      return s.ringIndex >= 1 && d < 260;
    });
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'ring') {
    // A close pass: the third hoop fills the windscreen.
    flyFor(state, random, 120, (s) => {
      const ring = s.ringIndex < s.rings.length ? s.rings[s.ringIndex] : null;
      if (!ring) return false;
      const d = Math.hypot(s.plane.x - ring.x, s.plane.alt - ring.alt, s.plane.z - ring.z);
      return s.ringIndex >= 2 && d < 130;
    });
    return { screen: SCREEN_PLAY, best: state.score };
  }
  // end: fly the whole sortie and land it.
  flyFor(state, random, 300, (s, events) => Boolean(events & EVENT_LANDED));
  return { screen: SCREEN_OVER, best: state.score };
}
