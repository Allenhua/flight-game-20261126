// Drawing only: the 3D world in, pixels out. A chase camera follows the
// plane; the valley is drawn far-to-near as projected quads, then the
// runways, the rings, the trees and the town, then the plane's shadow.
// The sky, the sun, the far ridge and the clouds set the light.

import { FIELD, PALETTE, RING, RUNWAYS, SKIES } from './config.js';
import { riverX } from './terrain.js';
import { clamp, lerp } from './random.js';

const FOV = (55 * Math.PI) / 180;
const CELL = 100; // terrain cell size in metres
const VIEW_DIST = 1150; // how far the terrain grid reaches

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function mixRgb(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function css(rgb, alpha = 1) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

export function createRenderer(canvas, terrain) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let camYaw = 0;
  let camPitch = 0;
  let snapped = false;

  // The camera basis for this frame, filled by computeCamera.
  const cam = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };
  const focal = (FIELD.height / 2) / Math.tan(FOV / 2);
  const cx = FIELD.width / 2;
  const cy = FIELD.height / 2;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Point the camera at the plane at once (screenshot staging). */
  function snapCamera(heading) {
    camYaw = heading;
    camPitch = 0;
    snapped = true;
  }

  /** Project a world point to logical screen space; null when behind us. */
  function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const xc = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const yc = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    const zc = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (zc < 2) return null;
    return { x: cx + (xc * focal) / zc, y: cy - (yc * focal) / zc, z: zc };
  }

  function computeCamera(plane) {
    const fwdX = Math.sin(plane.heading);
    const fwdZ = -Math.cos(plane.heading);
    cam.x = plane.x - fwdX * 21;
    cam.y = plane.alt + 7;
    cam.z = plane.z - fwdZ * 21;
    // Look a little ahead of the plane, slightly down at it.
    const lookX = plane.x + fwdX * 34;
    const lookY = plane.alt - 1;
    const lookZ = plane.z + fwdZ * 34;
    const dx = lookX - cam.x;
    const dy = lookY - cam.y;
    const dz = lookZ - cam.z;
    const targetYaw = Math.atan2(dx, -dz);
    const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (!snapped) {
      camYaw = lerp(camYaw, camYaw + ((targetYaw - camYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI), 0.12);
      camPitch = lerp(camPitch, targetPitch, 0.12);
    } else {
      camYaw = targetYaw;
      camPitch = targetPitch;
      snapped = false;
    }
    const cp = Math.cos(camPitch);
    const sp = Math.sin(camPitch);
    const cyaw = Math.cos(camYaw);
    const syaw = Math.sin(camYaw);
    cam.fx = syaw * cp;
    cam.fy = sp;
    cam.fz = -cyaw * cp;
    // Right = forward x world-up, then rolled with the plane a touch.
    // Up = right x forward, so the basis stays orthonormal.
    let rx = -cam.fz;
    let rz = cam.fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    let ux = -rz * cam.fy;
    let uy = rz * cam.fx - rx * cam.fz;
    let uz = rx * cam.fy;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const roll = plane.roll * 0.35;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    cam.rx = rx * cr + ux * sr;
    cam.ry = 0 * cr + uy * sr;
    cam.rz = rz * cr + uz * sr;
    cam.ux = ux * cr - rx * sr;
    cam.uy = uy * cr - 0 * sr;
    cam.uz = uz * cr - rz * sr;
  }

  const grassLight = hexToRgb(PALETTE.grassLight);
  const grassDark = hexToRgb(PALETTE.grassDark);
  const wheat = hexToRgb(PALETTE.fieldWheat);
  const rock = hexToRgb(PALETTE.rock);
  const snow = hexToRgb(PALETTE.snow);
  const water = hexToRgb(PALETTE.water);
  const sand = hexToRgb(PALETTE.sand);

  function terrainColor(x, z, h, dist) {
    const patch = terrain.fbm(x * 0.008 + 3, z * 0.008 + 7);
    let base = mixRgb(grassDark, grassLight, patch);
    if (patch > 0.78 && h < 30) base = mixRgb(base, wheat, (patch - 0.78) * 2.4);
    if (h < 3.2 && Math.abs(x - riverX(z)) < 26) base = mixRgb(base, water, 0.9);
    else if (h < 4.5 && Math.abs(x - riverX(z)) < 40) base = mixRgb(base, sand, 0.6);
    if (h > 46) base = mixRgb(base, rock, clamp((h - 46) / 22, 0, 1));
    if (h > 74) base = mixRgb(base, snow, clamp((h - 74) / 14, 0, 1));
    // Sun shading from the local slope.
    const dhdx = (terrain.height(x + 40, z) - terrain.height(x - 40, z)) / 80;
    const dhdz = (terrain.height(x, z + 40) - terrain.height(x, z - 40)) / 80;
    const shade = 0.78 + 0.22 * clamp(1 - (dhdx * 0.5 + dhdz * 0.35), 0, 1.4);
    const shaded = [base[0] * shade, base[1] * shade, base[2] * shade];
    return shaded;
  }

  function drawSky(sky, time) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.45, sky.mid);
    g.addColorStop(0.72, sky.horizon);
    g.addColorStop(1, sky.haze);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // The sun hangs in a fixed world direction, so it swings with the heading.
    const sunAz = (sky.sunX - 0.5) * Math.PI * 1.2;
    const sunDir = { x: Math.sin(sunAz), y: 0.55, z: -Math.cos(sunAz) };
    const sun = project(cam.x + sunDir.x * 3000, cam.y + sunDir.y * 3000, cam.z + sunDir.z * 3000);
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      glow.addColorStop(0, sky.sun);
      glow.addColorStop(0.25, css(hexToRgb(sky.sun), 0.55));
      glow.addColorStop(1, css(hexToRgb(sky.sun), 0));
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
      ctx.fillStyle = sky.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few high birds, for scale and life.
    ctx.strokeStyle = 'rgba(30,30,40,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      const bx = ((time * 12 + i * 380) % 1400) - 60;
      const by = 120 + i * 46 + Math.sin(time * 0.7 + i * 2) * 8;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by);
      ctx.quadraticCurveTo(bx - 3, by - 6, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 6, bx + 9, by);
      ctx.stroke();
    }
  }

  function drawFarGround(sky) {
    // Below the horizon: a hazy wash the terrain quads paint over.
    const horizonY = cy - Math.tan(camPitch) * focal;
    const g = ctx.createLinearGradient(0, Math.max(0, horizonY), 0, FIELD.height);
    g.addColorStop(0, sky.haze);
    g.addColorStop(0.25, sky.groundFar);
    g.addColorStop(1, '#4c6b3e');
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.max(0, horizonY), FIELD.width, FIELD.height - Math.max(0, horizonY));
  }

  function drawMountains(sky) {
    // Far ridge silhouettes ringing the horizon.
    ctx.beginPath();
    let started = false;
    const topPoints = [];
    for (let a = -78; a <= 78; a += 3) {
      const ang = camYaw + (a * Math.PI) / 180;
      const dx = Math.sin(ang);
      const dz = -Math.cos(ang);
      const bucket = ((Math.round((ang / (Math.PI * 2)) * 48) % 48) + 48) % 48;
      const peak = 55 + terrain.ridge[bucket] * 170;
      const p = project(cam.x + dx * 3400, cam.y + peak, cam.z + dz * 3400);
      if (!p) continue;
      topPoints.push(p);
      if (!started) {
        ctx.moveTo(p.x, FIELD.height);
        ctx.lineTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    if (!started) return;
    const last = topPoints[topPoints.length - 1];
    ctx.lineTo(last.x, FIELD.height);
    ctx.closePath();
    ctx.fillStyle = css(mixRgb(hexToRgb(sky.haze), hexToRgb(sky.mid), 0.55), 0.9);
    ctx.fill();
    // Snow caps: the same ridge, higher and whiter.
    ctx.beginPath();
    started = false;
    for (let a = -78; a <= 78; a += 3) {
      const ang = camYaw + (a * Math.PI) / 180;
      const dx = Math.sin(ang);
      const dz = -Math.cos(ang);
      const bucket = ((Math.round((ang / (Math.PI * 2)) * 48) % 48) + 48) % 48;
      const peak = 55 + terrain.ridge[bucket] * 170;
      if (terrain.ridge[bucket] < 0.55) continue;
      const p = project(cam.x + dx * 3400, cam.y + peak * 0.96, cam.z + dz * 3400);
      if (!p) continue;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    if (started) {
      ctx.fillStyle = 'rgba(240,244,247,0.5)';
      ctx.fill();
    }
  }

  function drawClouds(sky) {
    ctx.fillStyle = sky.cloud;
    for (const cloud of terrain.clouds) {
      const p = project(cloud.x, cloud.y, cloud.z);
      if (!p || p.z > 4200) continue;
      const s = (cloud.size * focal) / p.z;
      const alpha = clamp(1 - p.z / 4200, 0.15, 0.85);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.55, p.y + s * 0.08, s * 0.62, s * 0.24, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.58, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTerrain(sky) {
    const hazeRgb = hexToRgb(sky.haze);
    const gx0 = Math.floor((cam.x - VIEW_DIST) / CELL) * CELL;
    const gz0 = Math.floor((cam.z - VIEW_DIST) / CELL) * CELL;
    const cells = [];
    for (let gz = gz0; gz < cam.z + VIEW_DIST; gz += CELL) {
      for (let gx = gx0; gx < cam.x + VIEW_DIST; gx += CELL) {
        const ccx = gx + CELL / 2 - cam.x;
        const ccz = gz + CELL / 2 - cam.z;
        const dist = Math.hypot(ccx, ccz);
        if (dist > VIEW_DIST) continue;
        const h00 = terrain.height(gx, gz);
        const h10 = terrain.height(gx + CELL, gz);
        const h01 = terrain.height(gx, gz + CELL);
        const h11 = terrain.height(gx + CELL, gz + CELL);
        const p00 = project(gx, h00, gz);
        const p10 = project(gx + CELL, h10, gz);
        const p01 = project(gx, h01, gz + CELL);
        const p11 = project(gx + CELL, h11, gz + CELL);
        // A cell straddling the camera plane blows up to a giant polygon:
        // only draw cells fully in front of us, with some depth to spare.
        if (!p00 || !p10 || !p01 || !p11) continue;
        if (Math.min(p00.z, p10.z, p01.z, p11.z) < 6) continue;
        const pts = [p00, p10, p11, p01];
        const avgZ = (p00.z + p10.z + p01.z + p11.z) / 4;
        cells.push({ pts, avgZ, color: terrainColor(gx + CELL / 2, gz + CELL / 2, (h00 + h10 + h01 + h11) / 4, dist), dist });
      }
    }
    cells.sort((a, b) => b.avgZ - a.avgZ);
    for (const cell of cells) {
      const hazed = mixRgb(cell.color, hazeRgb, clamp(cell.dist / VIEW_DIST, 0, 1) * 0.35);
      ctx.fillStyle = css(hazed);
      ctx.beginPath();
      ctx.moveTo(cell.pts[0].x, cell.pts[0].y);
      for (let i = 1; i < cell.pts.length; i += 1) ctx.lineTo(cell.pts[i].x, cell.pts[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRunway(runway, time) {
    const half = runway.length / 2;
    const w2 = runway.width / 2;
    const y = PLANE_RUNWAY_Y(runway);
    // The strip in short segments: the near end can sit behind the camera
    // on the threshold, and a segment is simply skipped when it does.
    const SEGMENTS = 12;
    ctx.fillStyle = '#454b54';
    for (let s = 0; s < SEGMENTS; s += 1) {
      const t0 = -half + (s * runway.length) / SEGMENTS;
      const t1 = -half + ((s + 1) * runway.length) / SEGMENTS;
      let corners;
      if (runway.along === 'z') {
        corners = [
          [runway.x - w2, runway.z + t0],
          [runway.x + w2, runway.z + t0],
          [runway.x + w2, runway.z + t1],
          [runway.x - w2, runway.z + t1],
        ];
      } else {
        corners = [
          [runway.x + t0, runway.z - w2],
          [runway.x + t1, runway.z - w2],
          [runway.x + t1, runway.z + w2],
          [runway.x + t0, runway.z + w2],
        ];
      }
      const pts = corners.map(([x, z]) => project(x, y, z));
      if (pts.some((p) => p === null)) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
    }
    // Centreline dashes and threshold bars.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const steps = Math.floor(runway.length / 36);
    for (let i = 0; i < steps; i += 1) {
      const t = -half + 18 + i * 36;
      let a;
      let b;
      if (runway.along === 'z') {
        a = project(runway.x - 1.2, y + 0.1, runway.z + t - 7);
        b = project(runway.x + 1.2, y + 0.1, runway.z + t + 7);
      } else {
        a = project(runway.x + t - 7, y + 0.1, runway.z - 1.2);
        b = project(runway.x + t + 7, y + 0.1, runway.z + 1.2);
      }
      if (!a || !b) continue;
      const w = Math.max(1, Math.abs(b.x - a.x));
      const h = Math.max(1, Math.abs(b.y - a.y));
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(w, 1.5), Math.max(h, 1.5));
    }
    // Edge lights, warm amber, blinking gently.
    const blink = 0.55 + 0.45 * Math.sin(time * 2);
    ctx.fillStyle = `rgba(255,180,84,${blink})`;
    for (let t = -half + 10; t <= half; t += 46) {
      for (const side of [-1, 1]) {
        const p = runway.along === 'z'
          ? project(runway.x + side * w2, y + 0.4, runway.z + t)
          : project(runway.x + t, y + 0.4, runway.z + side * w2);
        if (!p || p.z > 900) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.2, 90 / p.z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function PLANE_RUNWAY_Y() {
    return 12.15;
  }

  function drawRings(flightState, time) {
    const rings = flightState.rings;
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      if (ring.passed) continue;
      const isNext = i === flightState.ringIndex;
      // The hoop faces the course: its normal points from the previous
      // waypoint toward the next one.
      const prev = i === 0
        ? { x: RUNWAYS.home.x, z: RUNWAYS.home.z - 100 }
        : rings[i - 1];
      const nxt = i + 1 < rings.length ? rings[i + 1] : { x: RUNWAYS.north.x, z: RUNWAYS.north.z };
      let nx = nxt.x - prev.x;
      let nz = nxt.z - prev.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      // Basis in the hoop's plane: up, and the horizontal across it.
      const ux = -nz;
      const uz = nx;
      const points = [];
      let ok = true;
      for (let a = 0; a <= 24; a += 1) {
        const th = (a / 24) * Math.PI * 2;
        const px = ring.x + ux * Math.cos(th) * RING.radius;
        const py = ring.alt + Math.sin(th) * RING.radius;
        const pz = ring.z + uz * Math.cos(th) * RING.radius;
        const p = project(px, py, pz);
        if (!p) {
          ok = false;
          break;
        }
        points.push(p);
      }
      if (!ok) continue;
      const color = isNext ? PALETTE.ringNext : PALETTE.ringLater;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 4) : 0.8;
      ctx.save();
      ctx.globalAlpha = pulse * 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = pulse * 0.14;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      if (isNext) {
        // A bobbing chevron above the next hoop, and a faint guide line
        // down to the ground so the pilot can judge the height.
        const bob = Math.sin(time * 3) * 3;
        const tip = project(ring.x, ring.alt + 24 + bob, ring.z);
        const ground = project(ring.x, terrain.height(ring.x, ring.z), ring.z);
        if (tip) {
          ctx.fillStyle = PALETTE.ringNext;
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y + 8);
          ctx.lineTo(tip.x - 9, tip.y - 6);
          ctx.lineTo(tip.x + 9, tip.y - 6);
          ctx.closePath();
          ctx.fill();
        }
        if (tip && ground) {
          ctx.strokeStyle = 'rgba(255,211,77,0.28)';
          ctx.setLineDash([6, 8]);
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(ground.x, ground.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  function drawTree(tree) {
    const base = project(tree.x, terrain.height(tree.x, tree.z), tree.z);
    if (!base || base.z > 700 || base.z < 4) return;
    const h = (tree.size * focal) / base.z;
    const w = h * 0.55;
    ctx.fillStyle = `rgba(38,84,44,${tree.shade})`;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y - h);
    ctx.lineTo(base.x - w / 2, base.y);
    ctx.lineTo(base.x + w / 2, base.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(52,110,58,${tree.shade})`;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y - h * 1.25);
    ctx.lineTo(base.x - w * 0.36, base.y - h * 0.45);
    ctx.lineTo(base.x + w * 0.36, base.y - h * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  function drawBox(b, roofColor) {
    // A box from its 8 corners; only the faces that face the camera show.
    const y0 = terrain.height(b.x, b.z);
    const corners = [];
    for (const [dx, dy, dz] of [
      [-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1],
      [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
    ]) {
      const p = project(b.x + (dx * b.w) / 2, y0 + dy * b.h, b.z + (dz * b.d) / 2);
      if (!p) return;
      corners.push(p);
    }
    function face(idx, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(corners[idx[0]].x, corners[idx[0]].y);
      for (let i = 1; i < idx.length; i += 1) ctx.lineTo(corners[idx[i]].x, corners[idx[i]].y);
      ctx.closePath();
      ctx.fill();
    }
    face([0, 1, 2, 3], 'rgba(0,0,0,0.12)'); // base, barely visible
    face([1, 2, 6, 5], '#8a7a68'); // side wall
    face([0, 1, 5, 4], '#a08b74'); // front wall
    face([4, 5, 6, 7], roofColor); // roof
  }

  function drawShadow(plane) {
    const groundY = terrain.height(plane.x, plane.z);
    const p = project(plane.x, groundY + 0.4, plane.z);
    if (!p || p.z < 4) return;
    const alt = Math.max(0, plane.alt - groundY);
    const rx = (30 * focal) / p.z;
    ctx.fillStyle = `rgba(10,14,10,${clamp(0.42 - alt / 900, 0.05, 0.42)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, rx * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Paint the world for this frame: sky down to the plane's shadow. */
  function drawWorld(flightState, time) {
    const plane = flightState.plane;
    const sky = SKIES[flightState.mission.sky];
    computeCamera(plane);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky(sky, time);
    drawFarGround(sky);
    drawMountains(sky);
    drawClouds(sky);
    drawTerrain(sky);
    drawRunway(RUNWAYS.home, time);
    drawRunway(RUNWAYS.north, time);
    drawRings(flightState, time);
    for (const tree of terrain.trees) drawTree(tree);
    for (const house of terrain.houses) {
      const roof = ['#b8452f', '#3f6db8', '#5d8a44', '#c98a3f'][Math.floor(house.hue * 4) % 4];
      drawBox(house, roof);
    }
    for (const b of terrain.buildings) drawBox(b, b.roof);
    drawShadow(plane);
  }

  resize();
  window.addEventListener('resize', resize);
  return { drawWorld, snapCamera, project, focal, cx, cy };
}
