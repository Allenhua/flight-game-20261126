// The HUD and the instrument panel, and the title, pause and end screens.
// Everything here is drawn in the 1280x720 logical space, on top of the
// world: the big altitude / speed / heading readouts up top, the lit
// instruments along the bottom, and the messages in between.

import { FIELD, FONT, MONO, MISSIONS, PALETTE } from './config.js';
import { PHASE_CRASHED, PHASE_LANDED } from './flight.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL_Y = 612;
const PANEL_H = 108;

function text(ctx, value, x, y, size, color, align = 'left', font = MONO, weight = '') {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function formatAlt(alt) {
  return `${Math.round(alt * 3.28084).toLocaleString('en-US')} FT`;
}
function formatSpeed(speed) {
  return `${Math.round(speed * 1.94384)} KT`;
}
function formatHeading(heading) {
  const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
  return `${String(Math.round(deg)).padStart(3, '0')}°`;
}
function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dial(ctx, x, y, r, label, valueText, fraction, ticks) {
  // A round gauge: dark face, lit rim, tick marks, one needle, one number.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0f18';
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelGlow;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(87,230,201,0.12)';
  ctx.fill();
  for (let i = 0; i <= ticks; i += 1) {
    const a = -Math.PI * 0.75 + (i / ticks) * Math.PI * 1.5;
    const major = i % Math.max(1, Math.floor(ticks / 4)) === 0;
    ctx.strokeStyle = major ? '#cfe8e0' : 'rgba(207,232,224,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - (major ? 8 : 5)), y + Math.sin(a) * (r - (major ? 8 : 5)));
    ctx.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
    ctx.stroke();
  }
  const needleAngle = -Math.PI * 0.75 + clamp(fraction, 0, 1) * Math.PI * 1.5;
  ctx.strokeStyle = '#ffb454';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(needleAngle) * (r - 8), y + Math.sin(needleAngle) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  text(ctx, label, x, y + r + 16, 11, PALETTE.muted, 'center', FONT, 'bold');
  text(ctx, valueText, x, y + 5, 15, PALETTE.text, 'center');
}

function attitude(ctx, x, y, r, pitch, roll) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-roll);
  ctx.translate(0, pitch * r * 1.1);
  ctx.fillStyle = '#3f7fb8';
  ctx.fillRect(-r - 4, -r * 2 - 4, r * 2 + 8, r * 2 + 4);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-r - 4, 0, r * 2 + 8, r * 2 + 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  for (const off of [-18, 18]) {
    ctx.beginPath();
    ctx.moveTo(-12, off);
    ctx.lineTo(12, off);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol and the lit rim.
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 16, y);
  ctx.lineTo(x - 5, y);
  ctx.moveTo(x + 5, y);
  ctx.lineTo(x + 16, y);
  ctx.stroke();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.panelGlow;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, 'ATT', x, y + r + 16, 11, PALETTE.muted, 'center', FONT, 'bold');
}

function compassStrip(ctx, x, y, w, heading) {
  const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.save();
  roundRect(ctx, x, y, w, 44, 8);
  ctx.fillStyle = 'rgba(10,15,24,0.85)';
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x, y, w, 44);
  ctx.clip();
  const pxPerDeg = w / 120;
  const centre = x + w / 2;
  for (let d = Math.floor(deg - 60); d <= deg + 60; d += 5) {
    const dd = ((d % 360) + 360) % 360;
    const sx = centre + (d - deg) * pxPerDeg;
    const major = dd % 30 === 0;
    const cardinal = dd % 90 === 0;
    ctx.strokeStyle = major ? '#cfe8e0' : 'rgba(207,232,224,0.4)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, y + 6);
    ctx.lineTo(sx, y + (major ? 20 : 14));
    ctx.stroke();
    if (cardinal || dd % 30 === 0) {
      const label = cardinal ? ['N', 'E', 'S', 'W'][Math.floor(dd / 90) % 4] : String(dd).padStart(3, '0');
      text(ctx, label, sx, y + 38, cardinal ? 14 : 11, cardinal ? '#ffd34d' : PALETTE.text, 'center');
    }
  }
  ctx.restore();
  // Centre caret and the digital heading.
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y - 2);
  ctx.lineTo(x + w / 2 - 7, y - 12);
  ctx.lineTo(x + w / 2 + 7, y - 12);
  ctx.closePath();
  ctx.fill();
  text(ctx, `HDG ${formatHeading(heading)}`, x + w / 2, y + 62, 13, PALETTE.text, 'center');
}

function bar(ctx, x, y, w, h, fraction, color, label, valueText) {
  roundRect(ctx, x, y, w, h, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  if (fraction > 0) {
    roundRect(ctx, x, y, Math.max(4, w * clamp(fraction, 0, 1)), h, 4);
    ctx.fillStyle = color;
    ctx.fill();
  }
  text(ctx, label, x, y - 6, 11, PALETTE.muted, 'left', FONT, 'bold');
  if (valueText) text(ctx, valueText, x + w, y - 6, 11, PALETTE.text, 'right');
}

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');

  function drawTopHud(flightState, time, screen) {
    const p = flightState.plane;
    // A soft dark strip so the numbers read over any sky.
    const g = ctx.createLinearGradient(0, 0, 0, 76);
    g.addColorStop(0, 'rgba(8,12,20,0.72)');
    g.addColorStop(1, 'rgba(8,12,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, 76);

    const readouts = [
      ['ALT', formatAlt(p.alt)],
      ['SPD', formatSpeed(p.speed)],
      ['HDG', formatHeading(p.heading)],
    ];
    let x = 24;
    for (const [label, value] of readouts) {
      text(ctx, label, x, 26, 12, PALETTE.muted, 'left', FONT, 'bold');
      text(ctx, value, x, 58, 30, PALETTE.text, 'left', MONO, 'bold');
      x += ctx.measureText(value).width + 52;
    }

    const right = [
      ['SCORE', String(flightState.score)],
      ['RINGS', `${flightState.ringIndex}/${flightState.rings.length}`],
      ['TIME', formatTime(flightState.timeLeft)],
    ];
    let rx = FIELD.width - 24;
    for (let i = right.length - 1; i >= 0; i -= 1) {
      const [label, value] = right[i];
      text(ctx, label, rx, 26, 12, PALETTE.muted, 'right', FONT, 'bold');
      text(ctx, value, rx, 58, 30, PALETTE.text, 'right', MONO, 'bold');
      rx -= ctx.measureText(value).width + 52;
    }

    // Fuel bar under the score, and the mission name at the top centre.
    // (The title screen paints its own heading there instead.)
    const fuelColor = p.fuel < 20 ? PALETTE.red : p.fuel < 45 ? PALETTE.amber : PALETTE.green;
    bar(ctx, FIELD.width - 224, 66, 200, 8, p.fuel / 100, fuelColor, '', '');
    text(ctx, `FUEL ${Math.round(p.fuel)}%`, FIELD.width - 24, 62, 11, fuelColor, 'right', FONT, 'bold');
    if (screen !== SCREEN_TITLE) {
      text(ctx, flightState.mission.name.toUpperCase(), FIELD.width / 2, 30, 13, 'rgba(238,244,248,0.85)', 'center', FONT, 'bold');
      const ring = flightState.ringIndex < flightState.rings.length
        ? `NEXT RING ${flightState.ringIndex + 1} — FOLLOW THE GOLD HOOP`
        : 'COURSE CLEAR — LAND AT NORTH FIELD';
      text(ctx, ring, FIELD.width / 2, 52, 12, PALETTE.gold, 'center', FONT, 'bold');
    }

    // Warnings, centre stage.
    if (p.stall && (p.phase === 'flying')) {
      const blink = Math.sin(time * 10) > 0 ? 1 : 0.25;
      ctx.globalAlpha = blink;
      text(ctx, '⚠ STALL — NOSE DOWN, POWER UP', FIELD.width / 2, 116, 26, PALETTE.red, 'center', FONT, 'bold');
      ctx.globalAlpha = 1;
    } else if (p.fuel > 0 && p.fuel < 20 && p.phase === 'flying') {
      text(ctx, 'LOW FUEL', FIELD.width / 2, 116, 22, PALETTE.amber, 'center', FONT, 'bold');
    }
  }

  function drawPanel(flightState) {
    const p = flightState.plane;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, PANEL_Y, FIELD.width, PANEL_H);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, PANEL_Y, FIELD.width, 2);
    ctx.fillStyle = 'rgba(87,230,201,0.25)';
    ctx.fillRect(0, PANEL_Y + 2, FIELD.width, 1);

    attitude(ctx, 78, PANEL_Y + 46, 40, p.pitch, p.roll);
    dial(ctx, 196, PANEL_Y + 44, 36, 'AIRSPEED', formatSpeed(p.speed), p.speed / 95, 8);
    dial(ctx, 306, PANEL_Y + 44, 36, 'ALTITUDE', `${Math.round(p.alt * 3.28)}`, p.alt / 320, 8);
    compassStrip(ctx, 400, PANEL_Y + 18, 400, p.heading);

    // Fuel, throttle and damage on the right.
    const fuelColor = p.fuel < 20 ? PALETTE.red : p.fuel < 45 ? PALETTE.amber : PALETTE.green;
    bar(ctx, 860, PANEL_Y + 34, 150, 10, p.fuel / 100, fuelColor, 'FUEL', `${Math.round(p.fuel)}%`);
    bar(ctx, 860, PANEL_Y + 66, 150, 10, p.throttle, '#57b6e6', 'THROTTLE', `${Math.round(p.throttle * 100)}%`);
    bar(ctx, 1040, PANEL_Y + 34, 120, 10, 1 - p.damage / 100, p.damage > 60 ? PALETTE.red : PALETTE.green, 'AIRFRAME', `${100 - Math.round(p.damage)}%`);
    // Gear lights: three green when down, amber when up.
    text(ctx, 'GEAR', 1040, PANEL_Y + 72, 11, PALETTE.muted, 'left', FONT, 'bold');
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = p.gearDown ? PALETTE.green : PALETTE.amber;
      ctx.beginPath();
      ctx.arc(1096 + i * 18, PANEL_Y + 68, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, p.gearDown ? 'DOWN' : 'UP — G', 1160, PANEL_Y + 72, 11, p.gearDown ? PALETTE.green : PALETTE.amber, 'left', FONT, 'bold');
    text(ctx, 'M mute · P pause', 1180, PANEL_Y + 100, 11, PALETTE.muted, 'right', FONT);
  }

  function drawMessage(flightState) {
    if (flightState.messageTimer <= 0 || !flightState.message) return;
    ctx.save();
    ctx.globalAlpha = clamp(flightState.messageTimer, 0, 1);
    ctx.font = `bold 26px ${FONT}`;
    const w = ctx.measureText(flightState.message).width;
    roundRect(ctx, FIELD.width / 2 - w / 2 - 22, 148, w + 44, 46, 10);
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,211,77,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, flightState.message, FIELD.width / 2, 179, 26, PALETTE.text, 'center', FONT, 'bold');
    ctx.restore();
  }

function wrapText(ctx, value, maxWidth) {
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawTitle(flightState, best) {
    ctx.fillStyle = 'rgba(8,12,20,0.35)';
    ctx.fillRect(0, 0, FIELD.width, 76);
    text(ctx, 'SKYLINE COURIER  ·  ALDER VALLEY', FIELD.width / 2, 44, 15, PALETTE.gold, 'center', FONT, 'bold');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    text(ctx, 'KESTREL RUN', FIELD.width / 2, 128, 84, '#ffffff', 'center', FONT, 'bold');
    ctx.restore();
    text(ctx, best > 0 ? `Fly the rings. Mind the fuel. Bring her home.  ·  Best ${best}` : 'Fly the rings. Mind the fuel. Bring her home.', FIELD.width / 2, 164, 20, '#e8eef4', 'center', FONT);

    // Mission cards, one per sortie; press 1, 2 or 3.
    const cardW = 330;
    const gap = 24;
    const total = cardW * 3 + gap * 2;
    let x = (FIELD.width - total) / 2;
    for (let i = 0; i < MISSIONS.length; i += 1) {
      const m = MISSIONS[i];
      const selected = i === flightState.missionIndex;
      roundRect(ctx, x, 210, cardW, 150, 14);
      ctx.fillStyle = selected ? 'rgba(20,34,52,0.92)' : 'rgba(10,16,26,0.78)';
      ctx.fill();
      ctx.strokeStyle = selected ? PALETTE.gold : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.stroke();
      text(ctx, `${i + 1} · ${m.name.toUpperCase()}`, x + 20, 246, 19, selected ? PALETTE.gold : PALETTE.text, 'left', FONT, 'bold');
      ctx.font = `14px ${FONT}`;
      const briefLines = wrapText(ctx, m.brief, cardW - 40);
      briefLines.slice(0, 2).forEach((line, li) => {
        text(ctx, line, x + 20, 274 + li * 20, 14, '#c8d4de', 'left', FONT);
      });
      text(ctx, `${m.rings.length} rings  ·  ${m.sky === 'dawn' ? 'dawn' : m.sky === 'day' ? 'midday' : 'dusk'}${m.gust > 0.3 ? '  ·  gusty' : ''}`, x + 20, 322, 13, PALETTE.muted, 'left', FONT);
      text(ctx, selected ? '◉ SELECTED — press Space to fly' : 'press ' + (i + 1) + ' to select', x + 20, 344, 13, selected ? PALETTE.green : PALETTE.muted, 'left', FONT, 'bold');
      x += cardW + gap;
    }
    text(ctx, '↑ ↓ pitch   ← → bank   Shift / Ctrl throttle   G gear   Mouse steers too', FIELD.width / 2, 374, 17, '#dfe8f0', 'center', FONT);
    text(ctx, 'Take off from Alder Field, thread every gold hoop, land at North Field.', FIELD.width / 2, 398, 17, '#dfe8f0', 'center', FONT);
    text(ctx, 'Press Space or click to start', FIELD.width / 2, 188, 20, '#ffffff', 'center', FONT, 'bold');
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(8,12,20,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    roundRect(ctx, FIELD.width / 2 - 260, 250, 520, 200, 16);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, 'PAUSED', FIELD.width / 2, 322, 44, PALETTE.text, 'center', FONT, 'bold');
    text(ctx, 'The valley waits. Press P to keep flying.', FIELD.width / 2, 366, 17, PALETTE.muted, 'center', FONT);
    text(ctx, 'R restarts the sortie', FIELD.width / 2, 398, 15, PALETTE.muted, 'center', FONT);
  }

  function drawOver(flightState, best) {
    const p = flightState.plane;
    const landed = flightState.plane.phase === PHASE_LANDED;
    ctx.fillStyle = 'rgba(8,12,20,0.5)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    roundRect(ctx, FIELD.width / 2 - 300, 168, 600, 300, 16);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = landed ? PALETTE.gold : PALETTE.red;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (landed) {
      text(ctx, 'MISSION COMPLETE', FIELD.width / 2, 236, 40, PALETTE.gold, 'center', FONT, 'bold');
      text(ctx, 'The Kestrel is down safe at North Field.', FIELD.width / 2, 272, 17, PALETTE.muted, 'center', FONT);
      const lines = [
        ['Rings flown', `${flightState.ringIndex}/${flightState.rings.length}`],
        ['Landing', flightState.landingQuality > 0.7 ? 'Silky smooth' : flightState.landingQuality > 0.4 ? 'A little firm' : 'Down in one piece'],
        ['Fuel left', `${Math.round(p.fuel)}%`],
        ['Score', String(flightState.score)],
      ];
      let y = 312;
      for (const [label, value] of lines) {
        text(ctx, label, FIELD.width / 2 - 190, y, 18, PALETTE.muted, 'left', FONT);
        text(ctx, value, FIELD.width / 2 + 190, y, 18, PALETTE.text, 'right', MONO, 'bold');
        y += 30;
      }
    } else {
      text(ctx, 'CRASHED', FIELD.width / 2, 236, 44, PALETTE.red, 'center', FONT, 'bold');
      text(ctx, flightState.crashReason || 'The flight ended badly.', FIELD.width / 2, 276, 18, PALETTE.text, 'center', FONT);
      text(ctx, `Score ${flightState.score}  ·  Rings ${flightState.ringIndex}/${flightState.rings.length}`, FIELD.width / 2, 322, 18, PALETTE.muted, 'center', MONO);
      text(ctx, 'Every courier bends one eventually. The valley keeps the plane.', FIELD.width / 2, 356, 16, PALETTE.muted, 'center', FONT);
    }
    text(ctx, 'Press Space to fly again  ·  R to restart  ·  1/2/3 to change sortie', FIELD.width / 2, 436, 16, '#ffffff', 'center', FONT, 'bold');
  }

  /** Paint the HUD, the panel and whichever screen is up. */
  function draw(flightState, screen, best, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const ox = (canvas.width - FIELD.width * scale) / 2;
    const oy = (canvas.height - FIELD.height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    drawTopHud(flightState, time, screen);
    drawPanel(flightState);
    if (screen !== SCREEN_TITLE && screen !== SCREEN_OVER) drawMessage(flightState);
    if (screen === SCREEN_TITLE) drawTitle(flightState, best);
    else if (screen === SCREEN_PAUSED) drawPause();
    else if (screen === SCREEN_OVER) drawOver(flightState, best);
  }

  return { draw };
}
