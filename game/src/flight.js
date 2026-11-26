// The game's rules and state, with no drawing and no browser in it: the
// plane, the physics, the rings, the landings, the score, the fuel and the
// damage. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sounds, announcements) without the world
// knowing about screens or speakers.

import { FUEL, MISSIONS, MISSION_TIME, PLANE, RING, RUNWAYS, SCORE, STEP } from './config.js';
import { angleDiff, clamp, lerp, smoothstep } from './random.js';

export const EVENT_RING = 1;
export const EVENT_TOUCHDOWN = 2;
export const EVENT_CRASH = 4;
export const EVENT_LANDED = 8;
export const EVENT_LOW_FUEL = 16;
export const EVENT_STALL = 32;
export const EVENT_OVER = 64;

export const PHASE_GROUND = 'ground';
export const PHASE_FLYING = 'flying';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';

const G = 9.81;

/** A fresh plane parked at the threshold of home field, facing north. */
function freshPlane() {
  return {
    x: RUNWAYS.home.x,
    z: RUNWAYS.home.z + RUNWAYS.home.length / 2 - 30,
    alt: PLANE.runwayHeight + 1.6,
    heading: 0, // north, down the runway
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    gearDown: true,
    fuel: FUEL.start,
    damage: 0,
    phase: PHASE_GROUND,
    airborne: false,
    stall: false,
    lowFuelWarned: false,
    graceTimer: 0, // seconds after liftoff during which the ground cannot bite
  };
}

export function createFlight(terrain) {
  const missionIndex = 0;
  const mission = MISSIONS[missionIndex];

  const state = {
    plane: freshPlane(),
    missionIndex,
    mission,
    rings: mission.rings.map(([x, alt, z]) => ({ x, alt, z, passed: false, flash: 0 })),
    ringIndex: 0,
    score: 0,
    timeLeft: MISSION_TIME,
    elapsed: 0,
    message: '',
    messageTimer: 0,
    crashReason: '',
    landingQuality: 0,
    best: 0,
    windGust: 0,
    gustTimer: 0,
  };

  function setMessage(text, seconds = 2.6) {
    state.message = text;
    state.messageTimer = seconds;
  }

  function loadMission(index) {
    state.missionIndex = index;
    state.mission = MISSIONS[index];
    state.plane = freshPlane();
    state.rings = state.mission.rings.map(([x, alt, z]) => ({ x, alt, z, passed: false, flash: 0 }));
    state.ringIndex = 0;
    state.score = 0;
    state.timeLeft = MISSION_TIME;
    state.elapsed = 0;
    state.crashReason = '';
    state.landingQuality = 0;
    state.windGust = 0;
    state.gustTimer = 0;
    setMessage(`${state.mission.name} — ${state.mission.brief}`, 4);
  }

  function reset() {
    loadMission(state.missionIndex);
  }

  /** The next ring to fly, or null once the course is done. */
  function nextRing() {
    return state.ringIndex < state.rings.length ? state.rings[state.ringIndex] : null;
  }

  function ringsLeft() {
    return state.rings.length - state.ringIndex;
  }

  /**
   * One fixed step. `ctl` is { pitch: -1..1, roll: -1..1, throttle: -1..1 }
   * from the keys or the mouse, already smoothed by the caller.
   */
  function step(dt, ctl, random) {
    const p = state.plane;
    let events = 0;
    state.elapsed += dt;
    if (p.phase === PHASE_FLYING || p.phase === PHASE_GROUND) {
      state.timeLeft = Math.max(0, state.timeLeft - dt);
    }
    if (state.messageTimer > 0) state.messageTimer -= dt;
    for (const ring of state.rings) if (ring.flash > 0) ring.flash -= dt;

    // Gusts on the windy sorties push the wings around.
    if (state.mission.gust > 0 && p.phase === PHASE_FLYING) {
      state.gustTimer -= dt;
      if (state.gustTimer <= 0) {
        state.gustTimer = 0.9 + random() * 1.6;
        state.windGust = (random() * 2 - 1) * state.mission.gust;
      }
    } else {
      state.windGust = lerp(state.windGust, 0, dt * 2);
    }

    // --- Controls: pitch and roll chase their targets; the wings level
    // themselves when the stick is centred. ---
    const targetPitch = clamp(ctl.pitch, -1, 1) * PLANE.maxPitch;
    const targetRoll = clamp(ctl.roll, -1, 1) * PLANE.maxRoll;
    p.pitch += clamp(targetPitch - p.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    p.roll += clamp(targetRoll - p.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
    if (Math.abs(ctl.roll) < 0.05 && p.phase === PHASE_FLYING) {
      p.roll = lerp(p.roll, 0, dt * 0.7);
    }
    p.roll += state.windGust * dt * 0.9;

    // --- Throttle and speed. ---
    p.throttle = clamp(p.throttle + ctl.throttle * dt * 0.55, 0, 1);
    if (p.fuel <= 0) p.throttle = 0;
    const targetSpeed = p.throttle * PLANE.maxSpeed;
    p.speed += (targetSpeed - p.speed) * Math.min(1, (PLANE.accel / PLANE.maxSpeed + PLANE.drag) * dt * 3);
    if (p.speed < 0) p.speed = 0;

    // --- Turning: a banked wing turns the nose. ---
    const turnRate = p.speed > 4 ? (G * Math.tan(p.roll)) / Math.max(p.speed, 12) : 0;
    p.heading += turnRate * dt;
    // A steady crosswind pushes the nose a touch.
    p.heading += state.mission.wind * 0.02 * dt;

    // --- Climb, sink and the stall. ---
    const ground = terrain.height(p.x, p.z);
    p.stall = p.airborne && p.speed < PLANE.stallSpeed;
    if (p.stall) {
      p.pitch = lerp(p.pitch, -0.3, dt * 1.4); // the nose drops on its own
      events |= EVENT_STALL;
    }
    const climbRate = p.speed * Math.sin(p.pitch) - (p.stall ? 6 : 0);
    p.verticalSpeed = climbRate;
    p.alt += climbRate * dt;
    // Drag bleeds speed in a steep climb.
    if (p.pitch > 0.25) p.speed -= p.pitch * 6 * dt;

    const forwardX = Math.sin(p.heading);
    const forwardZ = -Math.cos(p.heading);
    p.x += forwardX * p.speed * Math.cos(p.pitch) * dt;
    p.z += forwardZ * p.speed * Math.cos(p.pitch) * dt;

    // --- Fuel. ---
    if (p.phase !== PHASE_LANDED && p.phase !== PHASE_CRASHED) {
      p.fuel -= FUEL.drainPerSecond * (0.35 + 0.65 * p.throttle) * dt;
      if (p.fuel <= 0) {
        p.fuel = 0;
        if (!p.lowFuelWarned) {
          p.lowFuelWarned = true;
          setMessage('FUEL EMPTY — glide her in!', 3);
        }
      } else if (p.fuel < 20 && !p.lowFuelWarned) {
        p.lowFuelWarned = true;
        events |= EVENT_LOW_FUEL;
        setMessage('LOW FUEL — find the field', 3);
      }
    }

    // --- Takeoff: rolling fast enough with the nose up lifts off. The
    // climb from this step is kept — resetting the altitude to the ground
    // after liftoff would make the ground check below bite at once. ---
    if (p.phase === PHASE_GROUND) {
      if (p.speed > PLANE.rotateSpeed && p.pitch > 0.08) {
        p.phase = PHASE_FLYING;
        p.airborne = true;
        p.graceTimer = 1.2;
        setMessage('AIRBORNE — fly the rings!', 2.5);
      } else {
        p.alt = ground + 1.6;
      }
    }
    if (p.graceTimer > 0) p.graceTimer -= dt;

    // --- Rings: flying through the hoop scores, closer to the middle pays more. ---
    const ring = nextRing();
    if (ring && p.phase === PHASE_FLYING) {
      const dx = p.x - ring.x;
      const dy = p.alt - ring.alt;
      const dz = p.z - ring.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < RING.radius) {
        ring.passed = true;
        ring.flash = 1.2;
        state.ringIndex += 1;
        const centre = Math.max(0, 1 - dist / RING.radius);
        const points = RING.points + Math.round(centre * RING.centreBonus);
        state.score += points;
        p.fuel = Math.min(100, p.fuel + FUEL.ringBonus);
        events |= EVENT_RING;
        setMessage(
          state.ringIndex >= state.rings.length
            ? `LAST RING +${points} — now land at North Field!`
            : `RING ${state.ringIndex}/${state.rings.length}  +${points}`,
          2.4,
        );
      }
    }

    // --- The ground: a touchdown is a landing, a crash, or a bounce.
    // Only the airborne plane can touch down; while rolling on the runway
    // the takeoff block above owns the plane. The grace timer covers the
    // liftoff itself, and a climbing plane cannot touch down at all.
    if (p.phase === PHASE_FLYING && p.graceTimer <= 0 && p.verticalSpeed < 2) {
      const clearance = p.alt - ground;
      if (clearance <= 1.6) {
        p.alt = ground + 1.6;
        // The strip, plus the flat apron beside it: a landing there counts,
        // rougher the further off the centreline it is.
        const runway = terrain.onRunway(p.x, p.z, 40);
        const descent = -p.verticalSpeed;
        const gentle = descent < 4.5 && p.speed < 48;
        if (runway && gentle && p.gearDown && state.ringIndex >= state.rings.length) {
          // A proper landing on North Field ends the sortie.
          const centreError = terrain.runwayOffset(p.x, p.z, runway) / (runway.width / 2 + 40);
          const smooth = Math.max(0, 1 - descent / 4.5) * Math.max(0, 1 - centreError);
          state.landingQuality = smooth;
          const landingPoints = SCORE.landingBase + Math.round(smooth * SCORE.smoothBonus);
          state.score += landingPoints;
          const timeBonus = Math.round(state.timeLeft * SCORE.timeBonusPerSecond);
          state.score += timeBonus;
          p.phase = PHASE_LANDED;
          p.speed = Math.max(0, p.speed - 18);
          events |= EVENT_LANDED | EVENT_TOUCHDOWN | EVENT_OVER;
          setMessage(`LANDED +${landingPoints}  ·  time bonus +${timeBonus}`, 4);
        } else if (runway && gentle && p.gearDown) {
          // Touch-and-go on a runway mid-course: keep rolling, keep flying.
          p.phase = PHASE_GROUND;
          p.airborne = false;
          events |= EVENT_TOUCHDOWN;
          if (state.ringIndex < state.rings.length) setMessage('Touch-and-go — back in the air!', 2);
        } else if (runway && !p.gearDown && gentle && p.speed < 40) {
          // Belly landing: survivable, but the plane — and the score — hurt.
          p.damage += SCORE.bellyLandingDamage;
          p.phase = PHASE_LANDED;
          events |= EVENT_TOUCHDOWN;
          setMessage('BELLY LANDING — gear was up!', 3);
          if (p.damage >= 100) {
            p.phase = PHASE_CRASHED;
            state.crashReason = 'The airframe gave out after the belly landing.';
            events |= EVENT_CRASH | EVENT_OVER;
          } else if (state.ringIndex >= state.rings.length) {
            state.score = Math.max(0, state.score - SCORE.offFieldPenalty);
            events |= EVENT_LANDED | EVENT_OVER;
          }
        } else if (!runway && gentle && p.speed < 26 && descent < 3) {
          // A soft off-field landing in a meadow: counts, with a penalty.
          p.damage += 22;
          p.phase = PHASE_LANDED;
          state.score = Math.max(0, state.score - SCORE.offFieldPenalty);
          events |= EVENT_TOUCHDOWN | EVENT_LANDED | EVENT_OVER;
          setMessage('OFF-FIELD LANDING −150 — the field was right there!', 3);
        } else {
          // Anything else at ground level is a crash.
          p.phase = PHASE_CRASHED;
          p.damage = 100;
          if (!runway) state.crashReason = 'Flew into the hillside.';
          else if (!p.gearDown) state.crashReason = 'Came down gear-up on the runway.';
          else if (descent >= 4.5) state.crashReason = 'Hit the runway far too hard.';
          else state.crashReason = 'Came down too fast to stop.';
          events |= EVENT_CRASH | EVENT_OVER;
        }
      }
    }

    // --- Out of time, out of luck: the clock running out ends the sortie. ---
    if (state.timeLeft <= 0 && (p.phase === PHASE_FLYING || p.phase === PHASE_GROUND)) {
      p.phase = PHASE_CRASHED;
      state.crashReason = 'Out of time — the courier window closed.';
      events |= EVENT_CRASH | EVENT_OVER;
    }

    // Rolling on the ground after landing: bleed the rest of the speed.
    if (p.phase === PHASE_LANDED && p.speed > 0) {
      p.speed = Math.max(0, p.speed - 22 * dt);
      p.x += forwardX * p.speed * dt;
      p.z += forwardZ * p.speed * dt;
      p.alt = terrain.height(p.x, p.z) + 1.6;
    }
    return events;
  }

  return { state, reset, loadMission, step, nextRing, ringsLeft };
}
