// Every tuning number, colour and mission in one place. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window, so no
// rule below depends on the screen size. Distances are metres, speeds m/s,
// altitudes metres; the HUD converts them to feet and knots for display.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The courier plane: a single-engine prop "Kestrel" run by Skyline Courier. */
export const PLANE = {
  maxSpeed: 88, // m/s at full throttle, level flight
  cruiseSpeed: 58,
  stallSpeed: 26, // below this the wing quits and the nose drops
  rotateSpeed: 34, // liftoff speed on the runway
  maxPitch: 0.42, // radians, about 24 degrees
  maxRoll: 1.15, // radians, about 66 degrees
  pitchRate: 1.5,
  rollRate: 3.0,
  accel: 14, // how fast speed chases the throttle's target
  drag: 0.12,
  gearSpeedLimit: 62, // above this the gear cannot come down
  runwayHeight: 12, // the valley floor the runways sit on
};

export const FUEL = {
  start: 100,
  drainPerSecond: 0.62, // at full throttle; half that at cruise
  ringBonus: 6, // fuel topped up by flying a ring cleanly
};

export const RING = { radius: 16, points: 100, centreBonus: 60 };

export const SCORE = {
  landingBase: 500,
  smoothBonus: 300, // gentle touchdown, gear down, on the centreline
  timeBonusPerSecond: 4, // seconds left on the mission clock
  offFieldPenalty: 150,
  hardLandingDamage: 34,
  bellyLandingDamage: 45,
};

export const MISSION_TIME = 300; // seconds on the clock for every sortie

/** The valley's two runways. `along` is the runway axis: 'z' runs north-south,
 * 'x' runs east-west. Home is where every sortie starts; North Field is
 * where every sortie ends. */
export const RUNWAYS = {
  home: { name: 'ALDER FIELD', x: 0, z: 0, along: 'z', length: 460, width: 30, heading: 0 },
  north: { name: 'NORTH FIELD', x: 900, z: -2400, along: 'x', length: 460, width: 30, heading: Math.PI / 2 },
};

/**
 * Three sorties over the same valley, each with its own rings, light and
 * weather. Ring entries are [x, altitude, z]: fly through the glowing hoop.
 */
export const MISSIONS = [
  {
    id: 1,
    name: 'First Light',
    brief: 'Dawn run. Five rings over the valley, then land at North Field.',
    sky: 'dawn',
    wind: 0,
    gust: 0,
    rings: [
      [0, 120, -420],
      [170, 150, -900],
      [-140, 185, -1380],
      [260, 165, -1860],
      [620, 150, -2280],
    ],
  },
  {
    id: 2,
    name: 'River Run',
    brief: 'Low and fast down the Alder River. Seven rings, hug the water.',
    sky: 'day',
    wind: 0.15,
    gust: 0.1,
    rings: [
      [120, 70, -480],
      [330, 60, -900],
      [180, 75, -1300],
      [-60, 65, -1680],
      [120, 80, -2020],
      [420, 90, -2280],
      [700, 110, -2400],
    ],
  },
  {
    id: 3,
    name: 'Storm Ridge',
    brief: 'Dusk, gusting wind over the west ridge. Eight rings. Mind the gusts.',
    sky: 'dusk',
    wind: 0.35,
    gust: 0.55,
    rings: [
      [-260, 190, -500],
      [-420, 230, -980],
      [-180, 260, -1420],
      [-480, 240, -1840],
      [-120, 210, -2160],
      [240, 180, -2360],
      [560, 150, -2420],
      [780, 120, -2400],
    ],
  },
];

/** Sky palettes per mission light. */
export const SKIES = {
  dawn: {
    top: '#2e4a7a', mid: '#7fa3c8', horizon: '#f7c98a', sun: '#ffd9a0',
    haze: '#e8c9a0', groundFar: '#7d9a6a', cloud: '#ffe9c9', sunX: 0.72, sunY: 0.30,
  },
  day: {
    top: '#2f6fc4', mid: '#7fb2e8', horizon: '#cfe6f7', sun: '#fff3c4',
    haze: '#cfe0ea', groundFar: '#6f9a58', cloud: '#ffffff', sunX: 0.22, sunY: 0.18,
  },
  dusk: {
    top: '#241f4e', mid: '#7a4a72', horizon: '#ff9a5c', sun: '#ffb37a',
    haze: '#d98a6a', groundFar: '#5d6b52', cloud: '#ffc9a3', sunX: 0.3, sunY: 0.34,
  },
};

export const PALETTE = {
  panel: '#0e1420',
  panelEdge: '#2a3648',
  panelGlow: '#57e6c9',
  text: '#eef4f8',
  muted: '#93a5b8',
  amber: '#ffb454',
  red: '#ff5d5d',
  green: '#6ee7a0',
  gold: '#ffd34d',
  ringNext: '#ffd34d',
  ringLater: '#7fe7ff',
  asphalt: '#33383f',
  grassLight: '#7fae5a',
  grassDark: '#5d8a44',
  fieldWheat: '#c9a95c',
  rock: '#8a7d6d',
  snow: '#f2f5f7',
  water: '#3f7fb8',
  sand: '#d9c48f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'kestrel-run.best';
