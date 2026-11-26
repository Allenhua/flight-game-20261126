// The valley itself: one height function for the whole world, plus the
// things that sit on it — the river, the two runways, the town, the trees,
// the clouds. Everything is placed from the seed, so the valley never moves.

import { PLANE, RUNWAYS } from './config.js';
import { createRandom, makeNoise, smoothstep } from './random.js';

/** The Alder River snakes down the valley: its centreline x at height z. */
export function riverX(z) {
  return 420 * Math.sin(z * 0.00045) - 150;
}

export function makeTerrain(seed) {
  const { fbm } = makeNoise(seed);
  const rand = createRandom(seed ^ 0x9e3779b9);

  /** Distance from (x, z) to a runway's centreline segment. */
  function runwayDistance(x, z, runway) {
    const half = runway.length / 2;
    if (runway.along === 'z') {
      const dz = Math.max(0, Math.abs(z - runway.z) - half);
      return Math.hypot(x - runway.x, dz);
    }
    const dx = Math.max(0, Math.abs(x - runway.x) - half);
    return Math.hypot(z - runway.z, dx);
  }

  /** Ground height in metres at world (x, z): the raw shape, sampled once
   * into a grid below so the renderer can read it without any trig. */
  function rawHeight(x, z) {
    let h = 6 + 26 * fbm(x * 0.0011, z * 0.0011) + 10 * fbm(x * 0.004 + 11, z * 0.004 + 5);
    // The west ridge rises into hills; the far north rises into mountains.
    h += smoothstep(600, 2400, -x) * (30 + 34 * fbm(x * 0.001 + 4, z * 0.001 + 9));
    h += smoothstep(2600, 3600, -z) * 85;
    h += smoothstep(2400, 3400, z) * 40; // gentle high ground behind home field
    // The river carves a low channel through the valley floor.
    const carve = 1 - smoothstep(25, 95, Math.abs(x - riverX(z)));
    h = h * (1 - carve * 0.85) + 1.5 * carve;
    // Both runways sit on flat aprons.
    for (const runway of [RUNWAYS.home, RUNWAYS.north]) {
      const d = runwayDistance(x, z, runway);
      const flat = 1 - smoothstep(55, 260, d);
      h = h * (1 - flat) + PLANE.runwayHeight * flat;
    }
    return h;
  }

  // Sample the raw shape onto a 50 m grid once: the renderer reads heights
  // hundreds of times a frame, and a bilinear lookup costs nothing.
  const GRID_STEP = 50;
  const GRID_X0 = -3200;
  const GRID_Z0 = -3800;
  const GRID_NX = 129; // x: -3200..3200
  const GRID_NZ = 93; // z: -3800..800
  const grid = new Float32Array(GRID_NX * GRID_NZ);
  for (let iz = 0; iz < GRID_NZ; iz += 1) {
    for (let ix = 0; ix < GRID_NX; ix += 1) {
      grid[iz * GRID_NX + ix] = rawHeight(GRID_X0 + ix * GRID_STEP, GRID_Z0 + iz * GRID_STEP);
    }
  }

  /** Ground height in metres at world (x, z), bilinear from the grid. */
  function height(x, z) {
    const gx = (x - GRID_X0) / GRID_STEP;
    const gz = (z - GRID_Z0) / GRID_STEP;
    const ix = Math.max(0, Math.min(GRID_NX - 2, Math.floor(gx)));
    const iz = Math.max(0, Math.min(GRID_NZ - 2, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - ix));
    const fz = Math.max(0, Math.min(1, gz - iz));
    const a = grid[iz * GRID_NX + ix];
    const b = grid[iz * GRID_NX + ix + 1];
    const c = grid[(iz + 1) * GRID_NX + ix];
    const d = grid[(iz + 1) * GRID_NX + ix + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  // True when (x, z) is on a runway strip (for landings and the apron).
  // `margin` widens the strip: the flat apron beside it counts as a rough
  // landing, not a crash.
  function onRunway(x, z, margin = 0) {
    for (const runway of [RUNWAYS.home, RUNWAYS.north]) {
      const half = runway.length / 2 + margin;
      if (runway.along === 'z') {
        if (Math.abs(x - runway.x) <= runway.width / 2 + margin && Math.abs(z - runway.z) <= half) return runway;
      } else if (Math.abs(z - runway.z) <= runway.width / 2 + margin && Math.abs(x - runway.x) <= half) return runway;
    }
    return null;
  }

  /** Metres off the runway's centreline (0 on the numbers), for landing quality. */
  function runwayOffset(x, z, runway) {
    if (runway.along === 'z') return Math.abs(x - runway.x);
    return Math.abs(z - runway.z);
  }

  // Trees: scattered where the ground is low, green and clear of the
  // runways, the river and the town. Each is {x, z, size, shade}.
  const trees = [];
  for (let i = 0; i < 520 && trees.length < 340; i += 1) {
    const x = (rand() * 2 - 1) * 2600;
    const z = 400 - rand() * 3400;
    const h = height(x, z);
    if (h < 4 || h > 42) continue;
    if (onRunway(x, z)) continue;
    if (Math.abs(x - riverX(z)) < 30) continue;
    if (Math.abs(x - 520) < 180 && Math.abs(z + 520) < 180) continue; // the town
    trees.push({ x, z, size: 7 + rand() * 9, shade: 0.75 + rand() * 0.25 });
  }

  // The town of Alder: a grid of little houses east of home field.
  const houses = [];
  for (let gx = 0; gx < 6; gx += 1) {
    for (let gz = 0; gz < 5; gz += 1) {
      if (rand() < 0.2) continue;
      const x = 430 + gx * 34 + (rand() * 10 - 5);
      const z = -680 + gz * 34 + (rand() * 10 - 5);
      houses.push({ x, z, w: 12 + rand() * 8, d: 10 + rand() * 8, h: 6 + rand() * 7, hue: rand() });
    }
  }

  // Hangars and the tower beside home field.
  const buildings = [
    { x: -70, z: 60, w: 34, d: 26, h: 12, roof: '#b8452f' },
    { x: -70, z: 110, w: 30, d: 24, h: 11, roof: '#2f6db8' },
    { x: -64, z: -60, w: 10, d: 10, h: 26, roof: '#e8e8e8' }, // tower
  ];

  // Clouds drift high over the valley.
  const clouds = [];
  for (let i = 0; i < 18; i += 1) {
    clouds.push({
      x: (rand() * 2 - 1) * 3200,
      z: 600 - rand() * 4200,
      y: 300 + rand() * 130,
      size: 90 + rand() * 160,
      puff: 0.6 + rand() * 0.4,
    });
  }

  // Far mountain ridge silhouettes, drawn at the horizon around the camera.
  const ridge = [];
  for (let a = 0; a < 48; a += 1) {
    ridge.push(0.5 + 0.5 * fbm(a * 0.35 + 3, 8.2));
  }

  return { height, onRunway, runwayOffset, runwayDistance, trees, houses, buildings, clouds, ridge, fbm };
}
