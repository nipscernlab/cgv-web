// Runtime simulator for the cinema tour — replays the exact follower loop
// (SmoothDamp lag, speed profile, view guard, up assembly) against baked
// paths and reports the safety/quality metrics the cinema must hold:
//
//   worstDot     max |view·up| over the run (lookAt flips at 1.0; the
//                design floor keeps it ≤ ~0.90)
//   caloHits     frames where the rendered camera sits inside the calo
//                volume (r 0.2–4.8 m AND |z| < 6.4 m) — must be 0
//   maxCamSpeed  fastest rendered camera motion (m/s) — darts read as
//                "trancos"
//
// Run:  node tools/scripts/cinema-sim.mjs
//
// Keep the constants in sync with cinema.js when tuning.

import {
  bakeTourPath,
  samplePathPoint,
  samplePathSpeed,
  samplePathRollSC,
  samplePathDiveGate,
  DIVE_UP_LIFT,
} from '../../public/js/cinema/tourPath.js';

const TOUR_LOOP_MS = 72000;
const FOLLOW_SMOOTH = 0.8;
const DT = 1 / 60;
const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));

function smoothDamp(cur, tgt, vel, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const k of ['x', 'y', 'z']) {
    const change = cur[k] - tgt[k];
    const temp = (vel[k] + omega * change) * dt;
    vel[k] = (vel[k] - omega * temp) * exp;
    cur[k] = tgt[k] + (change + temp) * exp;
  }
}

const ZIGZAG = [
  { eta: 2.5, phi: 0.1, energyMev: 90000 },
  { eta: -2.4, phi: 0.6, energyMev: 80000 },
  { eta: 2.2, phi: 1.1, energyMev: 70000 },
  { eta: -1.8, phi: -2.0, energyMev: 60000 },
  { eta: 0.3, phi: 2.8, energyMev: 50000 },
];
const cases = [
  ['empty', bakeTourPath([])],
  ['zigzag', bakeTourPath(ZIGZAG)],
  ['arc-pole', bakeTourPath(ZIGZAG, { arc: { center: Math.PI / 2, halfWidth: 0.8 } })],
  ['hot-fwd', bakeTourPath([{ eta: 2.5, phi: 1.0, energyMev: 100000 }])],
  ['hot-bwd', bakeTourPath([{ eta: -2.5, phi: -2.0, energyMev: 100000 }])],
];

let failed = false;
for (const [name, path] of cases) {
  let phase = 0;
  const lead = { x: 0, y: 0, z: 0 };
  const leadT = { x: 0, y: 0, z: 0 };
  const cam = { x: 0, y: 0, z: 0 };
  const tgt = { x: 0, y: 0, z: 0 };
  const camV = { x: 0, y: 0, z: 0 };
  const tgtV = { x: 0, y: 0, z: 0 };
  samplePathPoint(path, 0, cam, tgt);

  let guardLift = 0;
  let guardLiftVel = 0;
  let guardSign = 0;
  const rollSC = { s: 0, c: 1 };

  let worstDot = 0;
  let worstU = 0;
  let caloHits = 0;
  let maxSpeed = 0;
  let prevCam = null;

  const frames = Math.round((3 * TOUR_LOOP_MS) / 1000 / DT);
  for (let f = 0; f < frames; f++) {
    phase = (phase + (DT * 1000 * samplePathSpeed(path, phase)) / TOUR_LOOP_MS) % 1;
    samplePathPoint(path, phase, lead, leadT);
    smoothDamp(cam, lead, camV, FOLLOW_SMOOTH, DT);
    smoothDamp(tgt, leadT, tgtV, FOLLOW_SMOOTH, DT);

    samplePathRollSC(path, phase, rollSC);
    const g = samplePathDiveGate(path, phase);
    let ux = rollSC.s;
    let uy = rollSC.c;
    let uz = DIVE_UP_LIFT * g;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;

    const vgx = tgt.x - cam.x;
    const vgy = tgt.y - cam.y;
    const vgz = tgt.z - cam.z;
    const vgl = Math.hypot(vgx, vgy, vgz) || 1;
    const aView = Math.abs((vgx * ux + vgy * uy + vgz * uz) / vgl);
    let liftTarget = 0;
    if (aView > 0.86) {
      const dzNow = cam.z - tgt.z;
      if (guardSign === 0) guardSign = dzNow >= 0 ? 1 : -1;
      else if (Math.abs(dzNow) > 1500) guardSign = dzNow > 0 ? 1 : -1;
      const rr = Math.hypot(cam.x, cam.y);
      const boreW = 1 - sstep((rr - 300) / 1200);
      const envW = sstep((rr - 9500) / 2500);
      liftTarget = guardSign * 6000 * Math.min(1, boreW + envW) * sstep((aView - 0.86) / 0.1);
    } else if (Math.abs(guardLift) < 1) {
      guardSign = 0;
    }
    {
      const crossing = liftTarget * guardLift < 0;
      const omega = 2 / (crossing ? 0.12 : 0.4);
      const x = omega * DT;
      const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = guardLift - liftTarget;
      const temp = (guardLiftVel + omega * change) * DT;
      guardLiftVel = (guardLiftVel - omega * temp) * exp;
      const prevLift = guardLift;
      guardLift = liftTarget + (change + temp) * exp;
      const maxStep = 5000 * DT;
      if (guardLift > prevLift + maxStep) guardLift = prevLift + maxStep;
      else if (guardLift < prevLift - maxStep) guardLift = prevLift - maxStep;
      if (guardLiftVel > 5000) guardLiftVel = 5000;
      else if (guardLiftVel < -5000) guardLiftVel = -5000;
    }

    const cz = cam.z + guardLift;
    const vx = tgt.x - cam.x;
    const vy = tgt.y - cam.y;
    const vz = tgt.z - cz;
    const vl = Math.hypot(vx, vy, vz) || 1;
    const dot = Math.abs((vx * ux + vy * uy + vz * uz) / vl);
    if (f > 600 && dot > worstDot) {
      worstDot = dot;
      worstU = phase;
    }

    const r = Math.hypot(cam.x, cam.y);
    if (f > 600 && r > 200 && r < 4800 && Math.abs(cz) < 6400) caloHits++;

    if (prevCam && f > 600) {
      const sp = Math.hypot(cam.x - prevCam.x, cam.y - prevCam.y, cz - prevCam.z) / DT / 1000;
      if (sp > maxSpeed) maxSpeed = sp;
    }
    prevCam = { x: cam.x, y: cam.y, z: cz };
  }

  const ok = worstDot < 0.93 && caloHits === 0 && maxSpeed < 8;
  if (!ok) failed = true;
  console.log(
    (ok ? 'OK  ' : 'FAIL') + ' ' + name.padEnd(9),
    'worstDot',
    worstDot.toFixed(3),
    'atU',
    worstU.toFixed(3),
    'caloHits',
    caloHits,
    'maxCamSpeed',
    maxSpeed.toFixed(2) + ' m/s',
  );
}
process.exit(failed ? 1 : 0);
