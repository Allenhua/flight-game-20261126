// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens:
// title, play, paused and game over.
//
// ?seed=N fixes the valley and the flight. ?shot=start|play|ring|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { makeTerrain } from './terrain.js';
import { createFlight, EVENT_CRASH, EVENT_LANDED, EVENT_LOW_FUEL, EVENT_OVER, EVENT_RING, EVENT_STALL, EVENT_TOUCHDOWN, PHASE_CRASHED, PHASE_LANDED } from './flight.js';
import { ACTION_CONFIRM, ACTION_GEAR, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { drawPlane } from './plane.js';
import { createHud, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261126;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const terrain = makeTerrain(seed);
const flight = createFlight(terrain);
const renderer = createRenderer(canvas, terrain);
const hud = createHud(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit.
  }
}

function runShot(name) {
  renderer.snapCamera(flight.state.plane.heading);
  const scene = stageShot(name, flight, random);
  renderer.snapCamera(flight.state.plane.heading);
  let painted = 0;
  function paint() {
    renderer.drawWorld(flight.state, 6);
    drawPlane(canvas.getContext('2d'), flight.state.plane, 6, name === 'start' ? 110 : 0);
    hud.draw(flight.state, scene.screen, scene.best, 6);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let stallWarnedAt = -10;

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and the big moments.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.start();
    audio.click();
    flight.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying ${flight.state.mission.name}. ${flight.state.mission.brief}`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (flight.state.score > best) {
      best = flight.state.score;
      saveBest(best);
    }
    announce(
      flight.state.plane.phase === PHASE_LANDED
        ? `Mission complete. Score ${flight.state.score}.`
        : `Crashed. ${flight.state.crashReason} Score ${flight.state.score}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_MISSION_1) flight.loadMission(0);
    if (actions & ACTION_MISSION_2) flight.loadMission(1);
    if (actions & ACTION_MISSION_3) flight.loadMission(2);
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      flight.reset();
      screen = SCREEN_PLAY;
      announce('Sortie restarted.');
      return;
    }
    if (actions & ACTION_GEAR && screen === SCREEN_PLAY) {
      const p = flight.state.plane;
      if (!p.gearDown && p.speed > 62) {
        announce('Too fast for the gear.');
      } else {
        p.gearDown = !p.gearDown;
        audio.click();
        announce(p.gearDown ? 'Gear down.' : 'Gear up.');
      }
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) return; // the valley idles behind the title
    const ctl = input.control();
    const events = flight.step(STEP, ctl, random);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_TOUCHDOWN) audio.touchdown();
    if (events & EVENT_LANDED) audio.success();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_LOW_FUEL) audio.warning();
    if (events & EVENT_STALL && time - stallWarnedAt > 1.2) {
      stallWarnedAt = time;
      audio.warning();
    }
    if (events & EVENT_OVER) endGame();
    const p = flight.state.plane;
    audio.update(p.throttle, p.speed, p.phase !== 'ground', screen === SCREEN_PLAY);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    accumulator += dt;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.drawWorld(flight.state, time);
    drawPlane(canvas.getContext('2d'), flight.state.plane, time, screen === SCREEN_TITLE ? 110 : 0);
    hud.draw(flight.state, screen, best, time);
  }

  // Leaving the tab pauses a running game rather than flying on unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Kestrel Run. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
