// The Kestrel herself, drawn in screen space at the centre of the chase
// view: a cream-and-teal single-engine prop plane seen from behind and
// above, banking with the roll, her prop a blur, her nav lights blinking.
// She is drawn big and readable on purpose — the plane is the picture.

import { FIELD } from './config.js';

/** Draw the plane at the chase-view anchor, banking with `roll`. `dy`
 * drops the whole drawing down the screen (the title screen wants her
 * below the mission cards, not behind them). */
export function drawPlane(ctx, plane, time, dy = 0) {
  const anchorX = FIELD.width / 2;
  const anchorY = FIELD.height / 2 + 46 + dy;
  const strobe = Math.sin(time * 6) > 0.4;

  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.rotate(plane.roll * 0.85);
  // A touch of pitch: nose-up lifts the drawing, nose-down drops it.
  ctx.translate(0, -plane.pitch * 60);

  // ---- Prop blur at the nose (far end, seen from behind-above). ----
  const propAngle = time * 34;
  ctx.save();
  ctx.translate(0, -118);
  ctx.rotate(propAngle);
  ctx.fillStyle = 'rgba(40,44,52,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 46, Math.PI / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(220,228,236,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -118, 13, 48, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Main wings: long, slightly tapered, teal tips. ----
  function wing(side) {
    ctx.beginPath();
    ctx.moveTo(side * 6, -52);
    ctx.lineTo(side * 168, -30);
    ctx.lineTo(side * 176, -14);
    ctx.lineTo(side * 150, -8);
    ctx.lineTo(side * 8, -34);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -52, 0, -8);
    g.addColorStop(0, '#f4ead2');
    g.addColorStop(1, '#d9c49a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,20,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Teal tip and nav light.
    ctx.fillStyle = '#1f7a6d';
    ctx.beginPath();
    ctx.moveTo(side * 138, -36);
    ctx.lineTo(side * 168, -30);
    ctx.lineTo(side * 176, -14);
    ctx.lineTo(side * 150, -8);
    ctx.lineTo(side * 138, -16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = side < 0 ? '#ff5d5d' : '#6ee7a0';
    ctx.beginPath();
    ctx.arc(side * 172, -21, strobe ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  wing(-1);
  wing(1);

  // ---- Fuselage: cream on top, teal belly, tapering to the tail. ----
  ctx.beginPath();
  ctx.moveTo(-13, -118);
  ctx.quadraticCurveTo(-20, -70, -17, -10);
  ctx.quadraticCurveTo(-15, 34, -9, 62);
  ctx.lineTo(9, 62);
  ctx.quadraticCurveTo(15, 34, 17, -10);
  ctx.quadraticCurveTo(20, -70, 13, -118);
  ctx.quadraticCurveTo(0, -128, -13, -118);
  const body = ctx.createLinearGradient(-18, 0, 18, 0);
  body.addColorStop(0, '#c9b489');
  body.addColorStop(0.35, '#f7efdb');
  body.addColorStop(0.65, '#f7efdb');
  body.addColorStop(1, '#c9b489');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,60,20,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Teal cheatline down the belly.
  ctx.fillStyle = '#1f7a6d';
  ctx.beginPath();
  ctx.moveTo(-15, -8);
  ctx.quadraticCurveTo(-13, 30, -8, 58);
  ctx.lineTo(8, 58);
  ctx.quadraticCurveTo(13, 30, 15, -8);
  ctx.quadraticCurveTo(0, 2, -15, -8);
  ctx.fill();
  // Registration on the rear fuselage, in cream on the teal cheatline.
  ctx.fillStyle = '#f7efdb';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N731KR', 0, 22);

  // ---- Canopy: sky-reflecting bubble over the nose. ----
  const canopy = ctx.createLinearGradient(-12, -108, 12, -62);
  canopy.addColorStop(0, '#bfe3f2');
  canopy.addColorStop(0.5, '#5d94b8');
  canopy.addColorStop(1, '#2c5a78');
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.moveTo(-11, -104);
  ctx.quadraticCurveTo(-13, -76, -8, -64);
  ctx.quadraticCurveTo(0, -58, 8, -64);
  ctx.quadraticCurveTo(13, -76, 11, -104);
  ctx.quadraticCurveTo(0, -112, -11, -104);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-7, -100);
  ctx.lineTo(-3, -70);
  ctx.stroke();

  // ---- Tailplane and fin. ----
  ctx.fillStyle = '#efe3c2';
  ctx.beginPath();
  ctx.moveTo(-8, 44);
  ctx.lineTo(-64, 62);
  ctx.lineTo(-58, 72);
  ctx.lineTo(-6, 58);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, 44);
  ctx.lineTo(64, 62);
  ctx.lineTo(58, 72);
  ctx.lineTo(6, 58);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1f7a6d';
  ctx.beginPath();
  ctx.moveTo(-9, 38);
  ctx.quadraticCurveTo(-12, 66, -7, 84);
  ctx.lineTo(7, 84);
  ctx.quadraticCurveTo(12, 66, 9, 38);
  ctx.quadraticCurveTo(0, 30, -9, 38);
  ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(-8, 52);
  ctx.lineTo(8, 52);
  ctx.lineTo(7, 60);
  ctx.lineTo(-7, 60);
  ctx.closePath();
  ctx.fill();
  // Tail strobe.
  if (strobe) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 86, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Landing gear, when it is down. ----
  if (plane.gearDown) {
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, -6);
    ctx.lineTo(-20, 26);
    ctx.moveTo(12, -6);
    ctx.lineTo(20, 26);
    ctx.stroke();
    ctx.fillStyle = '#22262b';
    ctx.beginPath();
    ctx.ellipse(-21, 30, 7, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(21, 30, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
