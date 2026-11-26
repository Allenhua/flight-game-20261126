// Keyboard and mouse input. Held keys give pitch, roll and throttle; the
// mouse steers too — hold the pointer off-centre and the plane follows it.
// One-shot presses (start, pause, gear, restart, mute) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_GEAR = 4;
export const ACTION_RESTART = 8;
export const ACTION_MUTE = 16;
export const ACTION_MISSION_1 = 32;
export const ACTION_MISSION_2 = 64;
export const ACTION_MISSION_3 = 128;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  // Mouse steering: where the pointer sits relative to the window centre,
  // -1..1 in each axis, and when it last moved.
  const mouse = { x: 0, y: 0, active: false, lastMove: 0 };

  function onKeyDown(event) {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyG') {
      if (!event.repeat) actions |= ACTION_GEAR;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'Digit1') {
      if (!event.repeat) actions |= ACTION_MISSION_1;
    } else if (event.code === 'Digit2') {
      if (!event.repeat) actions |= ACTION_MISSION_2;
    } else if (event.code === 'Digit3') {
      if (!event.repeat) actions |= ACTION_MISSION_3;
    } else {
      keys.add(event.code);
    }
    if (
      PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) ||
      ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) ||
      THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code) ||
      CONFIRM.has(event.code) || PAUSE.has(event.code)
    ) {
      event.preventDefault();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => keys.clear());

  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (event.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
    mouse.lastMove = performance.now();
  });
  target.addEventListener('pointermove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (event.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
    mouse.lastMove = performance.now();
  });

  function held(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** { pitch, roll, throttle } each in -1..1 for this frame. */
    control() {
      let pitch = 0;
      let roll = 0;
      if (held(PITCH_UP)) pitch += 1;
      if (held(PITCH_DOWN)) pitch -= 1;
      if (held(ROLL_LEFT)) roll -= 1;
      if (held(ROLL_RIGHT)) roll += 1;
      // The mouse steers when it moved recently and no key is steering.
      const mouseFresh = mouse.active && performance.now() - mouse.lastMove < 2500;
      if (mouseFresh && pitch === 0 && roll === 0) {
        roll = Math.max(-1, Math.min(1, mouse.x * 1.4));
        pitch = Math.max(-1, Math.min(1, -mouse.y * 1.1));
      }
      let throttle = 0;
      if (held(THROTTLE_UP)) throttle += 1;
      if (held(THROTTLE_DOWN)) throttle -= 1;
      return { pitch, roll, throttle };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
