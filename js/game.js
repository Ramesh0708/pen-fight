"use strict";

const W = 1000;
const H = 640;
const LEFT = 34;
const RIGHT = 966;
const FALL_TOP = 18;
const FALL_BOT = H - 18;
const MAX_SPEED = 900;
const DRAG = 1.65;
const ANG_DRAG = 2.7;
const WINS = 3;
const BELL_FLICKS = 8;
const PEN_LEN = 140;
const PEN_RAD = 9;
const SAMPLES = 9;

const BLUE = {
  body: "#2d6adf",
  light: "#8eb6f7",
  dark: "#1b4eae",
  cap: "#15397a",
  clip: "#d7dbe2",
  ink: "rgba(28, 62, 150, 0.38)",
};

const RED = {
  body: "#d44848",
  light: "#f09a96",
  dark: "#a11f1f",
  cap: "#7c1515",
  clip: "#d7dbe2",
  ink: "rgba(160, 32, 32, 0.38)",
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.getElementById("desk-canvas");
const ctx = canvas.getContext("2d");
const youScoreEl = document.getElementById("you-score");
const raviScoreEl = document.getElementById("ravi-score");
const turnLabel = document.getElementById("turn-label");
const statusEl = document.getElementById("status");
const overlay = document.getElementById("overlay");
const noteTitle = document.getElementById("note-title");
const noteBody = document.getElementById("note-body");
const noteBtn = document.getElementById("note-btn");

let dpr = 1;
let player;
let ravi;
let phase = "menu";
let starter = "ravi";
let score = { you: 0, ravi: 0 };
let flickCount = 0;
let fallClock = null;
let roundLocked = false;
let stillTime = 0;
let shakeMag = 0;
let shakeT = 0;
let dragging = false;
let aim = { active: false, angle: -Math.PI / 2, power: 0 };
let aiPlan = null;
let aiTimer = 0;
let ink = [];
let dust = [];
let lastSound = 0;
let ac = null;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function makePen(id, x, y, angle, palette) {
  return {
    id,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    va: 0,
    len: PEN_LEN,
    rad: PEN_RAD,
    mass: 1,
    inertia: (PEN_LEN * PEN_LEN) / 12,
    falling: false,
    fallT: 0,
    fallFrom: null,
    palette,
  };
}

function resetPens() {
  player = makePen("you", 500, 412, -0.12, BLUE);
  ravi = makePen("ravi", 468, 198, Math.PI + 0.1, RED);
  ink = [];
  dust = [];
  fallClock = null;
  stillTime = 0;
  aim.active = false;
  aiPlan = null;
}

function pens() {
  return [player, ravi];
}

function samplesOf(pen) {
  const pts = [];
  const c = Math.cos(pen.angle);
  const s = Math.sin(pen.angle);
  for (let i = 0; i < SAMPLES; i++) {
    const t = -0.5 + i / (SAMPLES - 1);
    pts.push({
      x: pen.x + c * pen.len * t,
      y: pen.y + s * pen.len * t,
    });
  }
  return pts;
}

function fit() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * W) / r.width,
    y: ((e.clientY - r.top) * H) / r.height,
  };
}

function audio() {
  if (!ac) ac = new AudioContext();
  if (ac.state === "suspended") ac.resume();
  return ac;
}

function tone(freq, dur, type, gainValue, delay) {
  try {
    const context = audio();
    const t = context.currentTime + (delay || 0);
    const o = context.createOscillator();
    const g = context.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainValue, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(context.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (err) {
    /* sound is optional */
  }
}

function noise(duration, freq, gainValue) {
  try {
    const context = audio();
    const n = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, n, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const g = context.createGain();
    g.gain.value = gainValue;
    src.connect(filter).connect(g).connect(context.destination);
    src.start();
  } catch (err) {
    /* sound is optional */
  }
}

const sounds = {
  flick(power) {
    noise(0.09, 900 + power * 800, 0.08 + power * 0.05);
  },
  hit(impact) {
    const now = performance.now();
    if (now - lastSound < 70) return;
    lastSound = now;
    noise(0.06, 420, clamp(impact / 4000, 0.03, 0.12));
    tone(180 + Math.min(impact / 8, 220), 0.07, "triangle", 0.04);
  },
  clatter() {
    noise(0.12, 240, 0.09);
    tone(90, 0.18, "sine", 0.05);
  },
  chalk() {
    tone(520, 0.09, "triangle", 0.03);
    tone(780, 0.12, "triangle", 0.02, 0.08);
  },
  bell() {
    tone(880, 1.3, "sine", 0.05);
    tone(1175, 1.2, "sine", 0.04, 0.16);
  },
};

function setStatus(text) {
  statusEl.textContent = text;
}

function setTurn(text) {
  turnLabel.textContent = text;
}

function updateBoard() {
  youScoreEl.textContent = String(score.you);
  raviScoreEl.textContent = String(score.ravi);
}

function showNote(title, body, button) {
  noteTitle.textContent = title;
  noteBody.textContent = body;
  noteBtn.textContent = button;
  overlay.hidden = false;
  noteBtn.focus();
}

function hideNote() {
  overlay.hidden = true;
}

function flicksLeft() {
  return Math.max(0, BELL_FLICKS - flickCount);
}

function beginPlayer() {
  phase = "aim";
  aiPlan = null;
  setTurn("Your flick");
  setStatus(`Drag to flick · ${flicksLeft()} flicks before the bell`);
}

function beginAi() {
  phase = "ai";
  aiPlan = planAiShot();
  aiTimer = 0.62;
  setTurn("Ravi's flick");
  setStatus("Ravi is lining up his pen…");
}

function planAiShot() {
  const dx = player.x - ravi.x;
  const dy = player.y - ravi.y;
  const dist = Math.hypot(dx, dy) || 1;
  const jitter = (Math.random() - 0.5) * 0.2;
  const angle = Math.atan2(dy, dx) + jitter;
  let power = clamp(0.5 + dist / 1100, 0.52, 0.86);
  if (Math.random() < 0.18) power *= 0.75;
  return { angle, power };
}

function shoot(pen, angle, power) {
  const speed = clamp(power, 0, 1) * MAX_SPEED;
  pen.vx = Math.cos(angle) * speed;
  pen.vy = Math.sin(angle) * speed;
  pen.va += (Math.random() - 0.5) * 1.4 * power;
  flickCount += 1;
  phase = "watch";
  stillTime = 0;
  aim.active = false;
  sounds.flick(power);
  setTurn(pen.id === "you" ? "Your pen is sliding" : "Ravi's pen is sliding");
  setStatus("Listen for the clatter.");
}

function edgeGap(pen) {
  return Math.min(pen.y - FALL_TOP, FALL_BOT - pen.y);
}

function finishRound(reason) {
  if (roundLocked) return;
  roundLocked = true;
  phase = "round";
  dragging = false;
  aim.active = false;

  let outcome = "scratch";
  if (reason === "bell") {
    const gapYou = edgeGap(player);
    const gapRavi = edgeGap(ravi);
    if (Math.abs(gapYou - gapRavi) < 10) outcome = "scratch";
    else outcome = gapYou < gapRavi ? "ravi" : "you";
  } else if (player.falling && ravi.falling) {
    outcome = "scratch";
  } else if (ravi.falling) {
    outcome = "you";
  } else if (player.falling) {
    outcome = "ravi";
  }

  if (outcome === "you") score.you += 1;
  if (outcome === "ravi") score.ravi += 1;
  updateBoard();

  const matchOver = score.you >= WINS || score.ravi >= WINS;
  if (matchOver) {
    phase = "match";
    sounds.bell();
    if (score.you > score.ravi) {
      setTurn("The desk is yours");
      showNote(
        "Desk is yours",
        "Three falls. Ravi slides the last sweet from his tiffin across the notebook and says he was only practising.",
        "One more match"
      );
    } else {
      setTurn("Ravi keeps the desk");
      showNote(
        "Ravi keeps the desk",
        "He flicks the red pen once more, just to hear it. There is always the period after lunch.",
        "One more match"
      );
    }
    setStatus("The corridor bell.");
    return;
  }

  sounds.chalk();
  if (reason === "bell" && outcome === "you") {
    setTurn("Bell round · point to you");
    showNote(
      "The bell is close",
      "Eight flicks and nobody on the floor. Ravi's pen was nearer the edge, so the round is yours.",
      "Next round"
    );
  } else if (reason === "bell" && outcome === "ravi") {
    setTurn("Bell round · point to Ravi");
    showNote(
      "The bell is close",
      "Eight flicks and nobody on the floor. Your pen was nearer the edge. Ravi takes the round.",
      "Next round"
    );
  } else if (outcome === "you") {
    setTurn("Point to you");
    showNote(
      "Off the desk",
      "Ravi's red pen rolled over the far edge. He blames a draft from the window.",
      "Next round"
    );
  } else if (outcome === "ravi") {
    setTurn("Point to Ravi");
    showNote(
      "Yours fell",
      "The blue pen went over your edge of the desk. Ravi is already grinning into his sleeve.",
      "Next round"
    );
  } else {
    setTurn("Scratch");
    showNote(
      "Scratch",
      "Both pens hit the floor. You nudge them back onto the notebook before Madam turns around.",
      "Next round"
    );
  }
  setStatus("The notebook is waiting.");
}

function startMatch() {
  score = { you: 0, ravi: 0 };
  starter = "ravi";
  updateBoard();
  nextRound();
}

function nextRound() {
  starter = starter === "you" ? "ravi" : "you";
  resetPens();
  flickCount = 0;
  roundLocked = false;
  hideNote();
  if (starter === "you") beginPlayer();
  else beginAi();
}

function spawnDust(x, y) {
  for (let i = 0; i < 4; i++) {
    dust.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 90,
      vy: (Math.random() - 0.5) * 90,
      life: 0.28 + Math.random() * 0.22,
      age: 0,
    });
  }
  if (dust.length > 70) dust.splice(0, dust.length - 70);
}

function resolveWall(pen, hit, nx, ny) {
  const rx = hit.s.x - pen.x;
  const ry = hit.s.y - pen.y;
  pen.x += nx * hit.depth;
  pen.y += ny * hit.depth;
  const vx = pen.vx - pen.va * ry;
  const vy = pen.vy + pen.va * rx;
  const rel = vx * nx + vy * ny;
  if (rel >= -8) return 0;
  const cross = rx * ny - ry * nx;
  const denom = 1 / pen.mass + (cross * cross) / pen.inertia;
  const j = -(1.4 * rel) / denom;
  pen.vx += (j * nx) / pen.mass;
  pen.vy += (j * ny) / pen.mass;
  pen.va += (rx * j * ny - ry * j * nx) / pen.inertia;
  return -rel;
}

function collideWalls(pen) {
  if (pen.falling) return;
  let bestL = null;
  let bestR = null;
  for (const s of samplesOf(pen)) {
    const leftDepth = LEFT + pen.rad - s.x;
    const rightDepth = s.x - (RIGHT - pen.rad);
    if (leftDepth > 0 && (!bestL || leftDepth > bestL.depth)) bestL = { depth: leftDepth, s };
    if (rightDepth > 0 && (!bestR || rightDepth > bestR.depth)) bestR = { depth: rightDepth, s };
  }
  let impact = 0;
  if (bestL) impact = Math.max(impact, resolveWall(pen, bestL, 1, 0));
  if (bestR) impact = Math.max(impact, resolveWall(pen, bestR, -1, 0));
  if (impact > 220) {
    sounds.hit(impact);
    shakeMag = Math.max(shakeMag, Math.min(7, impact / 180));
    const spot = bestL && bestL.depth > (bestR ? bestR.depth : 0) ? bestL.s : bestR.s;
    spawnDust(spot.x, spot.y);
  }
}

function collidePair(a, b) {
  if (a.falling || b.falling) return 0;
  let best = null;
  const as = samplesOf(a);
  const bs = samplesOf(b);
  const minDist = a.rad + b.rad;
  for (const pa of as) {
    for (const pb of bs) {
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.hypot(dx, dy);
      const overlap = minDist - dist;
      if (overlap > 0 && (!best || overlap > best.overlap)) {
        best = { overlap, dist, pa, pb, dx, dy };
      }
    }
  }
  if (!best) return 0;

  const dist = best.dist || 0.0001;
  const nx = best.dist === 0 ? 0 : best.dx / dist;
  const ny = best.dist === 0 ? 1 : best.dy / dist;
  const slop = 0.4;
  const corr = Math.max(best.overlap - slop, 0) * 0.45;
  a.x -= nx * corr;
  a.y -= ny * corr;
  b.x += nx * corr;
  b.y += ny * corr;

  const rax = best.pa.x - a.x;
  const ray = best.pa.y - a.y;
  const rbx = best.pb.x - b.x;
  const rby = best.pb.y - b.y;
  const vax = a.vx - a.va * ray;
  const vay = a.vy + a.va * rax;
  const vbx = b.vx - b.va * rby;
  const vby = b.vy + b.va * rbx;
  const rvx = vbx - vax;
  const rvy = vby - vay;
  const relN = rvx * nx + rvy * ny;
  if (relN > -6) return 0;

  const raN = rax * ny - ray * nx;
  const rbN = rbx * ny - rby * nx;
  const denom = 1 / a.mass + 1 / b.mass + (raN * raN) / a.inertia + (rbN * rbN) / b.inertia;
  const e = relN < -40 ? 0.78 : 0.08;
  const jn = -(1 + e) * relN / denom;

  const apply = (p, j, ix, iy, rx, ry) => {
    p.vx += (j * ix) / p.mass;
    p.vy += (j * iy) / p.mass;
    p.va += (rx * j * iy - ry * j * ix) / p.inertia;
  };
  apply(a, -jn, nx, ny, rax, ray);
  apply(b, jn, nx, ny, rbx, rby);

  const tx = -ny;
  const ty = nx;
  const relT = rvx * tx + rvy * ty;
  const raT = rax * ty - ray * tx;
  const rbT = rbx * ty - rby * tx;
  const denomT = 1 / a.mass + 1 / b.mass + (raT * raT) / a.inertia + (rbT * rbT) / b.inertia;
  let jt = -relT / denomT;
  const maxF = 0.18 * jn;
  jt = clamp(jt, -maxF, maxF);
  apply(a, -jt, tx, ty, rax, ray);
  apply(b, jt, tx, ty, rbx, rby);

  const impact = -relN;
  if (impact > 160 && ink.length < 26) {
    ink.push({
      x: (best.pa.x + best.pb.x) / 2,
      y: (best.pa.y + best.pb.y) / 2,
      r: 3 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      color: Math.random() < 0.5 ? a.palette.ink : b.palette.ink,
    });
  }
  return impact;
}

function limit(pen) {
  const sp = Math.hypot(pen.vx, pen.vy);
  if (sp > MAX_SPEED * 1.08) {
    pen.vx = (pen.vx / sp) * MAX_SPEED;
    pen.vy = (pen.vy / sp) * MAX_SPEED;
  }
  pen.va = clamp(pen.va, -12, 12);
  if (!Number.isFinite(pen.x) || !Number.isFinite(pen.y)) {
    pen.vx = 0;
    pen.vy = 0;
    pen.va = 0;
    pen.x = pen.id === "you" ? 500 : 500;
    pen.y = pen.id === "you" ? 412 : 198;
  }
}

function integrate(pen, dt) {
  if (pen.falling) {
    const gravity = pen.fallFrom === "top" ? -1400 : 1400;
    pen.vy += gravity * dt;
    pen.x += pen.vx * dt;
    pen.y += pen.vy * dt;
    pen.angle += pen.va * dt;
    pen.fallT += dt;
    return;
  }
  const lin = Math.exp(-DRAG * dt);
  const ang = Math.exp(-ANG_DRAG * dt);
  pen.vx *= lin;
  pen.vy *= lin;
  pen.va *= ang;
  pen.x += pen.vx * dt;
  pen.y += pen.vy * dt;
  pen.angle += pen.va * dt;
}

function physics(dt) {
  const fastest = Math.max(Math.hypot(player.vx, player.vy), Math.hypot(ravi.vx, ravi.vy));
  const steps = fastest > 480 ? 5 : 3;
  const h = dt / steps;
  let impact = 0;
  for (let s = 0; s < steps; s++) {
    for (const pen of pens()) integrate(pen, h);
    for (const pen of pens()) {
      collideWalls(pen);
      limit(pen);
    }
    for (let n = 0; n < 4; n++) impact = Math.max(impact, collidePair(player, ravi));
    for (const pen of pens()) limit(pen);
  }
  if (impact > 200) {
    sounds.hit(impact);
    shakeMag = Math.max(shakeMag, Math.min(8, impact / 160));
  }
  for (const pen of pens()) {
    if (pen.falling) continue;
    if (Math.hypot(pen.vx, pen.vy) < 20) {
      pen.vx = 0;
      pen.vy = 0;
      if (Math.abs(pen.va) < 1.6) pen.va = 0;
    } else if (Math.abs(pen.va) < 0.35) pen.va = 0;
  }
}

function markFalls() {
  if (phase !== "watch" && phase !== "ai" && phase !== "aim") return;
  for (const pen of pens()) {
    if (pen.falling) continue;
    if (pen.y < FALL_TOP || pen.y > FALL_BOT) {
      pen.falling = true;
      pen.fallFrom = pen.y < FALL_TOP ? "top" : "bottom";
      pen.fallT = 0;
      sounds.clatter();
      shakeMag = Math.max(shakeMag, 5);
      if (fallClock == null) fallClock = 0;
    }
  }
}

function energy(pen) {
  return Math.hypot(pen.vx, pen.vy) + Math.abs(pen.va) * 6;
}

function update(dt) {
  if (phase === "ai") {
    aiTimer -= dt;
    if (aiTimer <= 0 && aiPlan) {
      const plan = aiPlan;
      aiPlan = null;
      shoot(ravi, plan.angle, plan.power);
    }
  }

  if (phase === "watch" || phase === "aim" || phase === "ai") physics(dt);

  markFalls();

  if (fallClock != null && !roundLocked) {
    fallClock += dt;
    const waiting = pens().some((pen) => pen.falling && pen.fallT < 0.42);
    if (fallClock > 0.9 || (!waiting && fallClock > 0.48)) finishRound("fall");
  }

  if (phase === "watch" && fallClock == null) {
    const moving = pens().some((pen) => energy(pen) > 18);
    if (moving) stillTime = 0;
    else {
      stillTime += dt;
      if (stillTime > 0.32) {
        stillTime = 0;
        if (flickCount >= BELL_FLICKS) finishRound("bell");
        else if (turnIsRaviNext()) beginAi();
        else beginPlayer();
      }
    }
  }

  shakeT += dt;
  shakeMag = Math.max(0, shakeMag - dt * 16);
  for (const speck of dust) {
    speck.age += dt;
    speck.x += speck.vx * dt;
    speck.y += speck.vy * dt;
  }
  dust = dust.filter((speck) => speck.age < speck.life);
}

function turnIsRaviNext() {
  return flickCount % 2 === (starter === "you" ? 1 : 0);
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPaper() {
  ctx.fillStyle = "#f3eee1";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(92, 142, 176, 0.38)";
  ctx.lineWidth = 1;
  for (let y = 86; y < H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(214, 96, 96, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 58);
  ctx.lineTo(70, H);
  ctx.stroke();

  ctx.fillStyle = "rgba(48, 58, 88, 0.62)";
  ctx.font = '22px "Patrick Hand", "Segoe Print", cursive';
  ctx.fillText("Name   You", 86, 40);
  ctx.fillText("Date   12 / 4", 430, 40);
  ctx.fillText("Subject   Recess", 690, 40);
  ctx.strokeStyle = "rgba(48, 58, 88, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(150, 46);
  ctx.lineTo(390, 46);
  ctx.moveTo(510, 46);
  ctx.lineTo(650, 46);
  ctx.moveTo(800, 46);
  ctx.lineTo(960, 46);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = "rgba(120, 78, 40, 0.16)";
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.arc(860, 230, 34, 0.2, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(36, 64, 130, 0.33)";
  ctx.fillStyle = "rgba(36, 64, 130, 0.38)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(86, 548, 56, 56);
  ctx.beginPath();
  ctx.moveTo(104, 548);
  ctx.lineTo(104, 604);
  ctx.moveTo(123, 548);
  ctx.lineTo(123, 604);
  ctx.moveTo(86, 566);
  ctx.lineTo(142, 566);
  ctx.moveTo(86, 585);
  ctx.lineTo(142, 585);
  ctx.stroke();
  ctx.strokeStyle = "rgba(170, 50, 50, 0.45)";
  ctx.beginPath();
  ctx.moveTo(90, 552);
  ctx.lineTo(100, 562);
  ctx.moveTo(100, 552);
  ctx.lineTo(90, 562);
  ctx.moveTo(110, 572);
  ctx.arc(114, 576, 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(36, 64, 130, 0.4)";
  ctx.font = '20px "Patrick Hand", "Segoe Print", cursive';
  ctx.fillText("bored!!!", 800, 590);
  ctx.font = '16px "Patrick Hand", "Segoe Print", cursive';
  ctx.save();
  ctx.translate(28, 390);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("pass the note", 0, 0);
  ctx.restore();

  ctx.strokeStyle = "rgba(170, 50, 70, 0.4)";
  ctx.beginPath();
  ctx.moveTo(900, 520);
  ctx.bezierCurveTo(912, 500, 930, 500, 928, 522);
  ctx.bezierCurveTo(926, 544, 904, 548, 900, 528);
  ctx.bezierCurveTo(896, 508, 880, 508, 886, 526);
  ctx.stroke();
  ctx.restore();
}

function drawAim(pen, angle, power) {
  if (power <= 0.02) return;
  const length = 26 + power * 150;
  ctx.save();
  ctx.translate(pen.x, pen.y);
  ctx.rotate(angle);
  ctx.strokeStyle = pen.id === "you" ? "rgba(28, 70, 160, 0.75)" : "rgba(160, 40, 40, 0.75)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 7]);
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(length + 2, 0);
  ctx.lineTo(length - 10, -6);
  ctx.lineTo(length - 10, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const label = power < 0.34 ? "soft" : power < 0.68 ? "firm" : "hard flick";
  ctx.save();
  ctx.fillStyle = "rgba(40, 40, 60, 0.72)";
  ctx.font = '20px "Patrick Hand", "Segoe Print", cursive';
  ctx.fillText(label, pen.x + 18, pen.y - 26);
  ctx.restore();
}

function drawPen(pen, ox, oy) {
  const { len, rad, palette } = pen;
  const fade = pen.falling ? Math.max(0, 1 - pen.fallT * 1.15) : 1;
  const shrink = pen.falling ? Math.max(0.55, 1 - pen.fallT * 0.45) : 1;
  ctx.save();
  ctx.translate(pen.x + ox, pen.y + oy);
  ctx.rotate(pen.angle);
  ctx.globalAlpha = fade;
  ctx.scale(shrink, shrink);

  ctx.save();
  ctx.translate(6, 8);
  ctx.fillStyle = "rgba(70, 45, 20, 0.16)";
  roundRect(-len / 2, -rad, len, rad * 2, rad);
  ctx.fill();
  ctx.restore();

  const barrel = ctx.createLinearGradient(0, -rad, 0, rad);
  barrel.addColorStop(0, palette.light);
  barrel.addColorStop(0.45, palette.body);
  barrel.addColorStop(1, palette.dark);
  ctx.fillStyle = barrel;
  roundRect(-len / 2 + 16, -rad + 1.2, len - 36, rad * 2 - 2.4, rad);
  ctx.fill();

  ctx.fillStyle = palette.cap;
  roundRect(-len / 2, -rad, 24, rad * 2, 3);
  ctx.fill();

  ctx.fillStyle = palette.clip;
  roundRect(-len / 2 + 7, -rad - 1.5, 7, rad + 4, 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(len / 2 - 26, -rad + 2);
  ctx.lineTo(len / 2 - 4, 0);
  ctx.lineTo(len / 2 - 26, rad - 2);
  ctx.closePath();
  ctx.fillStyle = "#d5dae1";
  ctx.fill();
  ctx.strokeStyle = "#9aa3ad";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(len / 2 - 6, 0, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = "#1c1c1c";
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-len / 2 + 30, -rad + 3.2);
  ctx.lineTo(len / 2 - 34, -rad + 3.2);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const sx = reduceMotion ? 0 : Math.sin(shakeT * 42) * shakeMag;
  const sy = reduceMotion ? 0 : Math.cos(shakeT * 37) * shakeMag;
  ctx.save();
  ctx.translate(sx, sy);
  drawPaper();

  for (const stain of ink) {
    ctx.save();
    ctx.translate(stain.x, stain.y);
    ctx.rotate(stain.rot);
    ctx.fillStyle = stain.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, stain.r, stain.r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  let youShiftX = 0;
  let youShiftY = 0;
  let raviShiftX = 0;
  let raviShiftY = 0;
  if (aim.active) {
    const back = aim.power * 16;
    youShiftX = -Math.cos(aim.angle) * back;
    youShiftY = -Math.sin(aim.angle) * back;
    drawAim(player, aim.angle, aim.power);
  }
  if (phase === "ai" && aiPlan) {
    const shown = aiPlan.power * (1 - clamp(aiTimer / 0.62, 0, 1));
    const back = shown * 16;
    raviShiftX = -Math.cos(aiPlan.angle) * back;
    raviShiftY = -Math.sin(aiPlan.angle) * back;
    drawAim(ravi, aiPlan.angle, shown);
  }

  drawPen(ravi, raviShiftX, raviShiftY);
  drawPen(player, youShiftX, youShiftY);

  for (const speck of dust) {
    const t = 1 - speck.age / speck.life;
    ctx.fillStyle = `rgba(90, 62, 36, ${0.35 * t})`;
    ctx.fillRect(speck.x, speck.y, 2.5, 2.5);
  }
  ctx.restore();
}

function updateAim(e) {
  const pos = pointerPos(e);
  const dx = pos.x - player.x;
  const dy = pos.y - player.y;
  const dist = Math.hypot(dx, dy);
  aim.active = true;
  aim.angle = Math.atan2(dy, dx);
  aim.power = clamp((dist - 18) / 190, 0, 1);
}

function endDrag() {
  if (!dragging) return;
  dragging = false;
  const power = aim.power;
  const angle = aim.angle;
  aim.active = false;
  if (phase === "aim" && power > 0.12) shoot(player, angle, power);
}

canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "aim") return;
  e.preventDefault();
  try {
    audio();
  } catch (err) {
    /* ignore */
  }
  dragging = true;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    /* synthetic events and some browsers refuse capture */
  }
  updateAim(e);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  updateAim(e);
});

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

noteBtn.addEventListener("click", () => {
  try {
    audio();
  } catch (err) {
    /* ignore */
  }
  if (phase === "menu" || phase === "match") startMatch();
  else nextRound();
});

window.addEventListener("resize", fit);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

fit();
resetPens();
updateBoard();
setTurn("Period 4 · Desk 12");
setStatus("The notebook is open. The corridor is quiet.");
showNote(
  "Recess rules",
  "Blue pen is yours. Red is Ravi's, from the other side of the desk. Drag the way you want to flick, then let go. Knock his pen off the far edge. If yours falls, the point is his. The long sides bounce. First to 3.",
  "Open the notebook"
);
requestAnimationFrame(frame);
