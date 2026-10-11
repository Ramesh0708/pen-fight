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
const PEN_LEN = 168;
const PEN_RAD = 7.5;
const SAMPLES = 9;
const PAGES = "https://ramesh0708.github.io/pen-fight/";

const PENS = [
  penDef("reynolds-045", "Reynolds 045", "#1f5fbe", {
    style: "045", cap: "#1747a8", clip: "#d5dbe3", tube: "#1a4eaf",
    ink: "rgba(20, 60, 160, 0.5)", mark: "Reynolds 045", markColor: "#1747a8",
  }),
  penDef("reynolds-trimax", "Reynolds Trimax", "#161616", {
    style: "trimax", cap: "#111", clip: "#cfd5dc", tube: "#111",
    ink: "rgba(10, 10, 10, 0.45)", mark: "TRIMAX", markColor: "#e8eaee",
  }),
  penDef("reynolds-liquiflo", "Reynolds Liquiflo", "#16386e", {
    style: "liquiflo", cap: "#0d2858", clip: "#d5dbe3", tube: "#1a4f9a",
    ink: "rgba(12, 40, 100, 0.5)", mark: "Liquiflo", markColor: "#e7eef8",
  }),
  penDef("cello-gripper", "Cello Gripper", "#1f4fae", {
    style: "gripper", cap: "#1a4e9c", clip: "#e6ebf1", tube: "#1d4eae",
    ink: "rgba(20, 60, 160, 0.5)", mark: "cello Gripper", markColor: "#1a3f86",
  }),
  penDef("cello-butterflow", "Cello Butterflow", "#f7f8fb", {
    style: "butterflow", cap: "#1d4f9e", clip: "#9aafc8", tube: "#2458b0",
    ink: "rgba(30, 70, 160, 0.4)", mark: "Butterflow", markColor: "#1d4e9e",
  }),
  penDef("flair-writometer", "Flair Writometer", "#e10600", {
    style: "writometer", cap: "#e10600", clip: "#c40000", tube: "#c40000",
    ink: "rgba(180, 20, 20, 0.45)", mark: "Writometer", markColor: "#d10000",
  }),
  penDef("montex-megatop", "Montex Mega Top", "#111", {
    style: "megatop", cap: "#111", clip: "#e2b43a", tube: "#111",
    ink: "rgba(10, 10, 10, 0.45)", mark: "MEGA TOP", markColor: "#e2b43a",
  }),
  penDef("linc-pentonic", "Linc Pentonic", "#2a3f86", {
    style: "pentonic", cap: "#24356e", clip: "#2a3f86", tube: "#2450b0",
    ink: "rgba(30, 55, 140, 0.5)", mark: "PENTONIC", markColor: "#24356e",
  }),
];

function penDef(id, label, swatch, palette) {
  return { id, label, swatch, palette };
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const initialRoom = new URLSearchParams(location.search).get("room");

const canvas = document.getElementById("desk-canvas");
const ctx = canvas.getContext("2d");
const youScoreEl = document.getElementById("you-score");
const oppScoreEl = document.getElementById("opp-score");
const youNameEl = document.getElementById("you-name");
const oppNameEl = document.getElementById("opp-name");
const turnLabel = document.getElementById("turn-label");
const statusEl = document.getElementById("status");
const overlay = document.getElementById("overlay");
const noteTitle = document.getElementById("note-title");
const noteBody = document.getElementById("note-body");
const noteBtn = document.getElementById("note-btn");
const shareBtn = document.getElementById("share-btn");
const lobbyEl = document.getElementById("lobby");
const shareBox = document.getElementById("share-box");
const shareUrl = document.getElementById("share-url");
const copyLink = document.getElementById("copy-link");
const yourName = document.getElementById("your-name");
const yourPens = document.getElementById("your-pens");

let dpr = 1;
let player;
let ravi;
let phase = "menu";
let mode = initialRoom ? "guest" : "solo";
let starter = "ravi";
let score = { you: 0, ravi: 0 };
let names = { you: "You", opp: "Ramesh" };
let myPenId = "reynolds-045";
let rivalPenId = "cello-gripper";
let announcePen = false;
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
let noteState = null;
let banner = { host: "Period 4 · last bench", guest: "Period 4 · last bench" };
let peer = null;
let conn = null;
let syncAcc = 0;
let lastPhaseSent = "";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function penById(id) {
  return PENS.find((item) => item.id === id) || PENS[0];
}

function makePen(id, x, y, angle, palette) {
  return {
    id, x, y, angle,
    vx: 0, vy: 0, va: 0,
    len: PEN_LEN, rad: PEN_RAD, mass: 1,
    inertia: (PEN_LEN * PEN_LEN) / 12,
    falling: false, fallT: 0, fallFrom: null,
    palette,
  };
}

function resetPens() {
  player = makePen("you", 500, 412, -0.12, penById(myPenId).palette);
  ravi = makePen("ravi", 468, 198, Math.PI + 0.1, penById(rivalPenId).palette);
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

function mine() {
  return mode === "guest" ? ravi : player;
}

function samplesOf(pen) {
  const pts = [];
  const c = Math.cos(pen.angle);
  const s = Math.sin(pen.angle);
  for (let i = 0; i < SAMPLES; i++) {
    const t = -0.5 + i / (SAMPLES - 1);
    pts.push({ x: pen.x + c * pen.len * t, y: pen.y + s * pen.len * t });
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
  let x = ((e.clientX - r.left) * W) / r.width;
  let y = ((e.clientY - r.top) * H) / r.height;
  if (mode === "guest") y = H - y;
  return { x, y };
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
  } catch (err) { /* sound is optional */ }
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
  } catch (err) { /* sound is optional */ }
}

const sounds = {
  flick(power) { noise(0.09, 900 + power * 800, 0.08 + power * 0.05); },
  hit(impact) {
    const now = performance.now();
    if (now - lastSound < 70) return;
    lastSound = now;
    noise(0.06, 420, clamp(impact / 4000, 0.03, 0.12));
    tone(180 + Math.min(impact / 8, 220), 0.07, "triangle", 0.04);
  },
  clatter() { noise(0.12, 240, 0.09); tone(90, 0.18, "sine", 0.05); },
  chalk() { tone(520, 0.09, "triangle", 0.03); tone(780, 0.12, "triangle", 0.02, 0.08); },
  bell() { tone(880, 1.3, "sine", 0.05); tone(1175, 1.2, "sine", 0.04, 0.16); },
};

function setStatus(text) {
  statusEl.textContent = text;
}

function setTurn(hostText, guestText) {
  banner = { host: hostText, guest: guestText || hostText };
  turnLabel.textContent = mode === "guest" ? banner.guest : banner.host;
}

function updateBoard() {
  if (mode === "guest") {
    youNameEl.textContent = names.opp;
    oppNameEl.textContent = names.you;
    youScoreEl.textContent = String(score.ravi);
    oppScoreEl.textContent = String(score.you);
  } else {
    youNameEl.textContent = names.you;
    oppNameEl.textContent = names.opp;
    youScoreEl.textContent = String(score.you);
    oppScoreEl.textContent = String(score.ravi);
  }
}

function showNote(title, body, button, opts) {
  const options = opts || {};
  noteTitle.textContent = title;
  noteBody.textContent = body;
  noteBtn.hidden = !button;
  if (button) noteBtn.textContent = button;
  noteState = {
    title,
    body,
    button: button || "",
    guestTitle: options.guestTitle || title,
    guestBody: options.guestBody || body,
  };
  lobbyEl.hidden = !options.lobby;
  shareBtn.hidden = !options.share;
  if (!options.keepShare) shareBox.hidden = true;
  overlay.hidden = false;
  if (button) noteBtn.focus();
}

function hideNote() {
  noteState = null;
  overlay.hidden = true;
  lobbyEl.hidden = true;
}

function flicksLeft() {
  return Math.max(0, BELL_FLICKS - flickCount);
}

function beginPlayer() {
  phase = "aim";
  aiPlan = null;
  setTurn("Your flick", `${names.you}'s flick`);
  const brought = announcePen ? `${names.opp} brought a ${penById(rivalPenId).label}. ` : "";
  announcePen = false;
  setStatus(`${brought}Drag along the bench · ${flicksLeft()} flicks before the bell`);
  sendState(true);
}

function beginAi() {
  phase = "ai";
  aiPlan = planAiShot();
  aiTimer = 0.62;
  setTurn(`${names.opp}'s flick`, `${names.opp}'s flick`);
  const brought = announcePen ? ` He brought a ${penById(rivalPenId).label}.` : "";
  announcePen = false;
  setStatus(`${names.opp} is lining up his pen.${brought}`);
  sendState(true);
}

function beginRemote() {
  phase = "remote";
  aiPlan = null;
  setTurn(`${names.opp}'s flick`, "Your flick");
  setStatus(`Waiting for ${names.opp}…`);
  sendState(true);
}

function beginOpponent() {
  if (mode === "solo") beginAi();
  else beginRemote();
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
  setTurn(
    pen.id === "you" ? "Your pen is sliding" : `${names.opp}'s pen is sliding`,
    pen.id === "you" ? `${names.you}'s pen is sliding` : "Your pen is sliding"
  );
  setStatus("Listen for it on the bench.");
  sendState(true);
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
  const rival = names.opp;

  let outcome = "scratch";
  if (reason === "bell") {
    const gapYou = edgeGap(player);
    const gapOpp = edgeGap(ravi);
    if (Math.abs(gapYou - gapOpp) < 10) outcome = "scratch";
    else outcome = gapYou < gapOpp ? "ravi" : "you";
  } else if (player.falling && ravi.falling) outcome = "scratch";
  else if (ravi.falling) outcome = "you";
  else if (player.falling) outcome = "ravi";

  if (outcome === "you") score.you += 1;
  if (outcome === "ravi") score.ravi += 1;
  updateBoard();

  const matchOver = score.you >= WINS || score.ravi >= WINS;
  if (matchOver) {
    phase = "match";
    sounds.bell();
    if (score.you > score.ravi) {
      setTurn("The bench is yours", `${rival} keeps the bench`);
      showNote(
        "Bench is yours",
        `Three falls. ${rival} slides back on the seat and says he was only practising.`,
        "One more match",
        {
          guestTitle: `${names.you} keeps the bench`,
          guestBody: "Three falls. Your pen went off more often. There is always the period after lunch.",
        }
      );
    } else {
      setTurn(`${rival} keeps the bench`, "The bench is yours");
      showNote(
        `${rival} keeps the bench`,
        "One more flick, just to hear it on the wood. There is always the period after lunch.",
        "One more match",
        {
          guestTitle: "The bench is yours",
          guestBody: `Three falls. ${names.you} slides back on the seat and says they were only practising.`,
        }
      );
    }
    setStatus("The corridor bell.");
    sendState(true);
    return;
  }

  sounds.chalk();
  if (reason === "bell" && outcome === "you") {
    setTurn("Bell round · point to you", `Bell round · point to ${names.you}`);
    showNote("The bell is close", `Eight flicks and nobody on the floor. ${rival}'s pen was nearer the edge.`, "Next round", {
      guestTitle: "The bell is close",
      guestBody: "Eight flicks and nobody on the floor. Your pen was nearer the edge.",
    });
  } else if (reason === "bell" && outcome === "ravi") {
    setTurn(`Bell round · point to ${rival}`, "Bell round · point to you");
    showNote("The bell is close", "Eight flicks and nobody on the floor. Your pen was nearer the edge.", "Next round", {
      guestTitle: "The bell is close",
      guestBody: `Eight flicks and nobody on the floor. ${names.you}'s pen was nearer the edge.`,
    });
  } else if (outcome === "you") {
    setTurn("Point to you", `Point to ${names.you}`);
    showNote("Off the bench", `${rival}'s pen rolled off the far end. He blames the boy in the next row.`, "Next round", {
      guestTitle: "Yours fell",
      guestBody: "Your pen rolled off your end of the bench.",
    });
  } else if (outcome === "ravi") {
    setTurn(`Point to ${rival}`, "Point to you");
    showNote("Yours fell", `Your pen went off your end of the bench. ${rival} is already grinning.`, "Next round", {
      guestTitle: "Off the bench",
      guestBody: `${names.you}'s pen rolled off the far end.`,
    });
  } else {
    setTurn("Scratch", "Scratch");
    showNote("Scratch", "Both pens hit the floor. You scoop them up before Madam turns around.", "Next round");
  }
  setStatus("The bench is clear.");
  sendState(true);
}

function rameshPicks() {
  const pool = PENS.filter((item) => item.id !== myPenId);
  rivalPenId = pool[Math.floor(Math.random() * pool.length)].id;
}

function startMatch() {
  if (mode === "solo") {
    names.opp = "Ramesh";
    rameshPicks();
    announcePen = true;
  }
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
  else beginOpponent();
}

function spawnDust(x, y) {
  for (let i = 0; i < 4; i++) {
    dust.push({
      x, y,
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
      if (overlap > 0 && (!best || overlap > best.overlap)) best = { overlap, dist, pa, pb, dx, dy };
    }
  }
  if (!best) return 0;
  const dist = best.dist || 0.0001;
  const nx = best.dist === 0 ? 0 : best.dx / dist;
  const ny = best.dist === 0 ? 1 : best.dy / dist;
  const corr = Math.max(best.overlap - 0.4, 0) * 0.45;
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
    pen.vx = pen.vy = pen.va = 0;
    pen.x = 500;
    pen.y = pen.id === "you" ? 412 : 198;
  }
}

function integrate(pen, dt) {
  if (pen.falling) {
    pen.vy += (pen.fallFrom === "top" ? -1400 : 1400) * dt;
    pen.x += pen.vx * dt;
    pen.y += pen.vy * dt;
    pen.angle += pen.va * dt;
    pen.fallT += dt;
    return;
  }
  pen.vx *= Math.exp(-DRAG * dt);
  pen.vy *= Math.exp(-DRAG * dt);
  pen.va *= Math.exp(-ANG_DRAG * dt);
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
  if (mode === "guest") {
    shakeT += dt;
    shakeMag = Math.max(0, shakeMag - dt * 16);
    return;
  }
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
        else if (turnIsOppNext()) beginOpponent();
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
  maybeSync(dt);
}

function turnIsOppNext() {
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

function drawBench() {
  const wood = ctx.createLinearGradient(0, 0, 0, H);
  wood.addColorStop(0, "#c4894e");
  wood.addColorStop(0.45, "#a86b38");
  wood.addColorStop(1, "#8b552b");
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(70, 36, 12, 0.28)";
  ctx.lineWidth = 2;
  for (const y of [214, 426]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 226, 186, 0.13)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 28; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 18 + i * 22);
    ctx.bezierCurveTo(280, 10 + i * 22, 640, 28 + i * 22, W, 14 + i * 22);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(60, 30, 10, 0.28)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(120, 80);
  ctx.lineTo(210, 150);
  ctx.moveTo(760, 470);
  ctx.quadraticCurveTo(820, 520, 880, 500);
  ctx.stroke();

  ctx.fillStyle = "rgba(90, 48, 18, 0.18)";
  ctx.beginPath();
  ctx.ellipse(180, 500, 34, 16, -0.4, 0, Math.PI * 2);
  ctx.fill();

  [[46, 46], [954, 46], [46, 594], [954, 594]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#6d737a";
    ctx.fill();
    ctx.strokeStyle = "rgba(30, 20, 10, 0.45)";
    ctx.stroke();
  });

  ctx.save();
  ctx.fillStyle = "rgba(70, 36, 14, 0.45)";
  ctx.font = '22px "Patrick Hand", "Segoe Print", cursive';
  ctx.fillText("IV-B", 78, 78);
  ctx.font = '18px "Patrick Hand", "Segoe Print", cursive';
  ctx.fillText("last bench", 780, 590);
  ctx.restore();
}

function drawAim(pen, angle, power) {
  if (power <= 0.02) return;
  const length = 26 + power * 150;
  ctx.save();
  ctx.translate(pen.x, pen.y);
  ctx.rotate(angle);
  ctx.strokeStyle = pen.palette.cap;
  ctx.fillStyle = pen.palette.cap;
  ctx.globalAlpha = 0.8;
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
}

function metalCone(tip, rad) {
  const g = ctx.createLinearGradient(0, -rad, 0, rad);
  g.addColorStop(0, "#f7f9fb");
  g.addColorStop(0.45, "#c5ced6");
  g.addColorStop(1, "#8e99a6");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(tip - 22, -(rad - 1.4));
  ctx.lineTo(tip - 5, -1.5);
  ctx.lineTo(tip - 5, 1.5);
  ctx.lineTo(tip - 22, rad - 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7d8792";
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tip - 3.4, 0, 1.7, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
}

function penClip(x, y, w, h, color) {
  ctx.fillStyle = color;
  roundRect(x, y, w, h, 1.2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 3.2, 1.15, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
}

function ribbedGrip(x, w, rad, color, ribs) {
  ctx.fillStyle = color;
  roundRect(x, -rad + 0.2, w, rad * 2 - 0.4, 2.4);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 0.8;
  const n = ribs || 6;
  for (let i = 1; i < n; i++) {
    const gx = x + (w * i) / n;
    ctx.beginPath();
    ctx.moveTo(gx, -rad + 1.4);
    ctx.lineTo(gx, rad - 1.4);
    ctx.stroke();
  }
}

function clearTube(x, w, rad, tint, tube) {
  ctx.fillStyle = tube;
  roundRect(x + 6, -1.55, Math.max(8, w - 14), 3.1, 1.4);
  ctx.fill();
  ctx.fillStyle = tint;
  roundRect(x, -rad + 0.3, w, rad * 2 - 0.6, rad);
  ctx.fill();
  ctx.strokeStyle = "rgba(20, 50, 110, 0.35)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4, -rad + 2.4);
  ctx.lineTo(x + w - 4, -rad + 2.4);
  ctx.stroke();
}

function solidBarrel(x, w, rad, light, mid, dark) {
  const g = ctx.createLinearGradient(0, -rad, 0, rad);
  g.addColorStop(0, light);
  g.addColorStop(0.42, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  roundRect(x, -rad + 0.2, w, rad * 2 - 0.4, rad);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 3, -rad + 2.3);
  ctx.lineTo(x + w - 3, -rad + 2.3);
  ctx.stroke();
}

function endCap(x, w, rad, color) {
  ctx.fillStyle = color;
  roundRect(x, -rad, w, rad * 2, 2.2);
  ctx.fill();
}

function drawPen(pen, ox, oy) {
  const { len, rad, palette } = pen;
  const tip = len / 2;
  const tail = -len / 2;
  const fade = pen.falling ? Math.max(0, 1 - pen.fallT * 1.15) : 1;
  const shrink = pen.falling ? Math.max(0.55, 1 - pen.fallT * 0.45) : 1;
  const style = palette.style;

  ctx.save();
  ctx.translate(pen.x + ox, pen.y + oy);
  ctx.rotate(pen.angle);
  ctx.globalAlpha = fade;
  ctx.scale(shrink, shrink);

  ctx.save();
  ctx.translate(5, 7);
  ctx.fillStyle = "rgba(40, 22, 8, 0.22)";
  roundRect(tail, -rad, len, rad * 2, rad);
  ctx.fill();
  ctx.restore();

  if (style === "045") {
    endCap(tail, 18, rad, palette.cap);
    penClip(tail + 3, -rad - 2.2, 5.2, 34, palette.clip);
    clearTube(tail + 16, len - 40, rad, "rgba(186, 214, 255, 0.28)", palette.tube);
    metalCone(tip, rad);
  } else if (style === "trimax") {
    endCap(tail, 10, rad - 0.4, "#d5dbe2");
    ctx.beginPath();
    ctx.arc(tail + 5, 0, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#9aa3ad";
    ctx.fill();
    solidBarrel(tail + 9, 62, rad, "#3a3a3a", "#161616", "#070707");
    ctx.fillStyle = "#c5ccd4";
    roundRect(tail + 70, -rad + 0.4, 3, rad * 2 - 0.8, 1);
    ctx.fill();
    ribbedGrip(tail + 74, 52, rad, "#101010", 8);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    for (let i = 0; i < 7; i++) {
      for (const row of [-3.1, 0, 3.1]) {
        ctx.beginPath();
        ctx.arc(tail + 80 + i * 6.4, row, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    metalCone(tip, rad);
  } else if (style === "liquiflo") {
    endCap(tail, 16, rad, palette.cap);
    penClip(tail + 3, -rad - 2, 4.6, 30, palette.clip);
    clearTube(tail + 14, len - 58, rad, "rgba(40, 90, 170, 0.28)", "#0d3f86");
    ribbedGrip(tip - 46, 24, rad, "#0e2c58", 5);
    metalCone(tip, rad);
  } else if (style === "gripper") {
    endCap(tail, 16, rad, palette.cap);
    penClip(tail + 3, -rad - 2.1, 4.8, 32, palette.clip);
    clearTube(tail + 14, len - 70, rad, "rgba(170, 205, 255, 0.34)", palette.tube);
    ribbedGrip(tip - 54, 32, rad + 0.6, "#1a1c22", 7);
    metalCone(tip, rad);
  } else if (style === "butterflow") {
    endCap(tail, 16, rad, palette.cap);
    penClip(tail + 3, -rad - 2, 4.6, 28, "#c5d2e4");
    solidBarrel(tail + 14, len - 66, rad, "#ffffff", "#f4f6fa", "#d5dbe6");
    ribbedGrip(tip - 50, 28, rad, "#1f57b8", 6);
    metalCone(tip, rad);
  } else if (style === "writometer") {
    endCap(tail, 20, rad, "#e10600");
    penClip(tail + 4, -rad - 2.3, 5, 40, "#c40000");
    solidBarrel(tail + 18, len - 46, rad, "#ffffff", "#f6f7f8", "#e1e4e8");
    ctx.fillStyle = "#e10600";
    roundRect(tip - 30, -rad + 0.3, 4, rad * 2 - 0.6, 1);
    ctx.fill();
    metalCone(tip, rad);
  } else if (style === "megatop") {
    endCap(tail, 12, rad, "#1a1a1a");
    ctx.beginPath();
    ctx.arc(tail + 6, 0, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = "#e2b43a";
    ctx.fill();
    penClip(tail + 8, -rad - 2.2, 4.4, 36, "#e2b43a");
    solidBarrel(tail + 12, len - 58, rad, "#2c2c2c", "#141414", "#050505");
    ctx.fillStyle = "#e2b43a";
    roundRect(tip - 48, -1.1, 16, 2.2, 1);
    ctx.fill();
    ribbedGrip(tip - 46, 22, rad, "#0c0c0c", 5);
    metalCone(tip, rad);
  } else if (style === "pentonic") {
    endCap(tail, 14, rad, "#24356e");
    penClip(tail + 3, -rad - 2, 4.4, 30, "#2a3f86");
    clearTube(tail + 12, len - 62, rad, "rgba(210, 220, 230, 0.38)", palette.tube);
    ribbedGrip(tip - 50, 28, rad + 0.3, "#24356e", 5);
    ctx.fillStyle = "#d7deea";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(tip - 44 + i * 6, 0, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    metalCone(tip, rad);
  } else {
    solidBarrel(tail + 16, len - 40, rad, "#ddd", "#aaa", "#888");
    metalCone(tip, rad);
  }

  ctx.restore();
}

function drawPenLabels() {
  for (const pen of pens()) {
    if (!pen.palette.mark) continue;
    const fade = pen.falling ? Math.max(0, 1 - pen.fallT * 1.15) : 1;
    const pos = mode === "guest" ? { x: pen.x, y: H - pen.y } : { x: pen.x, y: pen.y };
    let angle = mode === "guest" ? pen.angle + Math.PI : pen.angle;
    const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (norm > Math.PI / 2 && norm < (Math.PI * 3) / 2) angle += Math.PI;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.92 * fade;
    ctx.fillStyle = pen.palette.markColor;
    ctx.font = 'bold 11px "Patrick Hand", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pen.palette.mark, styleShift(pen.palette.style), 0.5);
    ctx.restore();
  }
}

function styleShift(style) {
  if (style === "gripper" || style === "liquiflo" || style === "pentonic") return -8;
  if (style === "trimax") return -18;
  return -2;
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const sx = reduceMotion ? 0 : Math.sin(shakeT * 42) * shakeMag;
  const sy = reduceMotion ? 0 : Math.cos(shakeT * 37) * shakeMag;
  ctx.save();
  ctx.translate(sx, sy);
  if (mode === "guest") {
    ctx.translate(0, H);
    ctx.scale(1, -1);
  }
  drawBench();
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

  const local = mine();
  let youShiftX = 0;
  let youShiftY = 0;
  let oppShiftX = 0;
  let oppShiftY = 0;
  if (aim.active) {
    const back = aim.power * 16;
    const ox = -Math.cos(aim.angle) * back;
    const oy = -Math.sin(aim.angle) * back;
    if (local === player) { youShiftX = ox; youShiftY = oy; }
    else { oppShiftX = ox; oppShiftY = oy; }
    drawAim(local, aim.angle, aim.power);
  }
  if (phase === "ai" && aiPlan && mode !== "guest") {
    const shown = aiPlan.power * (1 - clamp(aiTimer / 0.62, 0, 1));
    const back = shown * 16;
    oppShiftX = -Math.cos(aiPlan.angle) * back;
    oppShiftY = -Math.sin(aiPlan.angle) * back;
    drawAim(ravi, aiPlan.angle, shown);
  }
  drawPen(ravi, oppShiftX, oppShiftY);
  drawPen(player, youShiftX, youShiftY);
  for (const speck of dust) {
    const t = 1 - speck.age / speck.life;
    ctx.fillStyle = `rgba(70, 42, 18, ${0.4 * t})`;
    ctx.fillRect(speck.x, speck.y, 2.5, 2.5);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(sx, sy);
  drawPenLabels();
  ctx.restore();

  if (aim.active && aim.power > 0.05) {
    const label = aim.power < 0.34 ? "soft" : aim.power < 0.68 ? "firm" : "hard flick";
    const at = mode === "guest"
      ? { x: local.x, y: H - local.y }
      : { x: local.x, y: local.y };
    ctx.fillStyle = "rgba(255, 236, 214, 0.92)";
    ctx.font = '20px "Patrick Hand", "Segoe Print", cursive';
    ctx.fillText(label, at.x + 16, at.y - 22);
  }
}

function updateAim(e) {
  const pos = pointerPos(e);
  const pen = mine();
  const dx = pos.x - pen.x;
  const dy = pos.y - pen.y;
  aim.active = true;
  aim.angle = Math.atan2(dy, dx);
  aim.power = clamp((Math.hypot(dx, dy) - 18) / 190, 0, 1);
}

function endDrag() {
  if (!dragging) return;
  dragging = false;
  const power = aim.power;
  const angle = aim.angle;
  aim.active = false;
  if (phase !== "aim" || power <= 0.12) return;
  if (mode === "guest") {
    send({ type: "flick", angle, power });
    phase = "watch";
    setStatus("Listen for it on the bench.");
    return;
  }
  shoot(player, angle, power);
}

function readLobby() {
  const typed = yourName.value.trim().slice(0, 16);
  if (typed) names.you = typed;
}

function shareOrigin() {
  const host = location.hostname;
  if (location.protocol === "file:" || host === "localhost" || host === "127.0.0.1") return PAGES;
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function roomLink(id) {
  const url = new URL(shareOrigin());
  url.searchParams.set("room", id);
  return url.toString();
}

function send(msg) {
  if (conn && conn.open) conn.send(msg);
}

function pack(pen) {
  return {
    x: pen.x, y: pen.y, angle: pen.angle,
    vx: pen.vx, vy: pen.vy, va: pen.va,
    falling: pen.falling, fallT: pen.fallT, fallFrom: pen.fallFrom,
  };
}

function applyPack(pen, data) {
  if (!data) return;
  pen.x = data.x;
  pen.y = data.y;
  pen.angle = data.angle;
  pen.vx = data.vx;
  pen.vy = data.vy;
  pen.va = data.va;
  pen.falling = data.falling;
  pen.fallT = data.fallT;
  pen.fallFrom = data.fallFrom;
}

function sendState(force) {
  if (mode !== "host" || !conn || !conn.open) return;
  if (!force && phase === lastPhaseSent && phase !== "watch") return;
  lastPhaseSent = phase;
  send({
    type: "state",
    phase,
    flickCount,
    score,
    names,
    myPenId,
    rivalPenId,
    player: pack(player),
    opp: pack(ravi),
    ink,
    banner,
    note: noteState,
    status: statusEl.textContent,
  });
}

function maybeSync(dt) {
  if (mode !== "host") return;
  syncAcc += dt;
  if (phase !== lastPhaseSent || (phase === "watch" && syncAcc > 0.08) || syncAcc > 0.45) {
    syncAcc = 0;
    sendState(true);
  }
}

function applyState(msg) {
  myPenId = msg.myPenId;
  rivalPenId = msg.rivalPenId;
  player.palette = penById(myPenId).palette;
  ravi.palette = penById(rivalPenId).palette;
  applyPack(player, msg.player);
  applyPack(ravi, msg.opp);
  ink = msg.ink || [];
  score = msg.score;
  names = msg.names;
  flickCount = msg.flickCount;
  banner = msg.banner || banner;
  turnLabel.textContent = banner.guest;
  if (msg.status) statusEl.textContent = msg.status;
  updateBoard();
  if (msg.phase === "remote") {
    if (phase !== "aim") phase = "aim";
  } else {
    phase = msg.phase === "aim" ? "wait" : msg.phase;
    dragging = false;
    aim.active = false;
  }
  if (msg.note && (msg.phase === "round" || msg.phase === "match")) {
    showNote(msg.note.guestTitle || msg.note.title, msg.note.guestBody || msg.note.body, msg.note.button, { lobby: false, share: false });
  } else if (msg.phase !== "menu") {
    hideNote();
  }
}

function bindConn(c) {
  conn = c;
  c.on("data", (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "hello" && mode === "host") {
      names.opp = String(msg.name || "Friend").slice(0, 16) || "Friend";
      if (msg.pen) rivalPenId = msg.pen;
      updateBoard();
      shareBox.hidden = true;
      hideNote();
      startMatch();
    } else if (msg.type === "flick" && mode === "host" && phase === "remote") {
      shoot(ravi, msg.angle, msg.power);
    } else if (msg.type === "advance" && mode === "host") {
      if (phase === "match") startMatch();
      else if (phase === "round") nextRound();
    } else if (msg.type === "state" && mode === "guest") {
      applyState(msg);
    }
  });
  c.on("close", () => setStatus("They left the bench."));
}

function hostMatch(roomId) {
  if (typeof Peer === "undefined") {
    setStatus("Sharing needs an internet connection.");
    return;
  }
  mode = "host";
  peer = new Peer(roomId);
  peer.on("open", () => setStatus("Link is ready. Leave this page open."));
  peer.on("connection", (c) => {
    bindConn(c);
    c.on("open", () => setStatus(`${names.opp} is sitting down…`));
  });
  peer.on("error", (err) => {
    const taken = err && err.type === "unavailable-id";
    noteBtn.hidden = false;
    shareBtn.hidden = false;
    setStatus(taken ? "That bench code is taken. Try sharing again." : "Could not open the bench. Check your connection.");
  });
}

function joinMatch() {
  if (typeof Peer === "undefined") {
    setStatus("Joining needs an internet connection.");
    return;
  }
  mode = "guest";
  readLobby();
  showNote("Pull the bench in", `Waiting for the other end of the bench…`, "", { lobby: false, share: false });
  setStatus("Finding the bench…");
  peer = new Peer();
  peer.on("open", () => {
    conn = peer.connect(initialRoom, { reliable: true });
    bindConn(conn);
    conn.on("open", () => {
      send({ type: "hello", name: names.you, pen: myPenId });
      setStatus("You sat down. Their flick or yours — watch the board.");
    });
  });
  peer.on("error", () => setStatus("That bench is not open. Ask them to share a new link."));
}

function renderPicks(root, current, choose) {
  root.innerHTML = "";
  PENS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", item.id === current ? "true" : "false");
    button.innerHTML = `<span class="swatch" style="background:${item.swatch}"></span>${item.label}`;
    button.addEventListener("click", () => {
      choose(item.id);
      renderPicks(root, item.id, choose);
    });
    root.appendChild(button);
  });
}

canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "aim") return;
  e.preventDefault();
  try { audio(); } catch (err) { /* ignore */ }
  dragging = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  updateAim(e);
});
canvas.addEventListener("pointermove", (e) => { if (dragging) updateAim(e); });
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

noteBtn.addEventListener("click", () => {
  try { audio(); } catch (err) { /* ignore */ }
  readLobby();
  if (initialRoom && mode !== "host") {
    joinMatch();
    return;
  }
  if (mode === "guest") {
    send({ type: "advance" });
    return;
  }
  if (phase === "menu" || phase === "match") {
    mode = mode === "host" ? "host" : "solo";
    if (mode === "solo") names.opp = "Ramesh";
    startMatch();
  } else nextRound();
});

shareBtn.addEventListener("click", () => {
  try { audio(); } catch (err) { /* ignore */ }
  readLobby();
  names.opp = "Friend";
  const id = `bench${Math.random().toString(36).slice(2, 8)}`;
  const link = roomLink(id);
  shareUrl.value = link;
  shareBox.hidden = false;
  shareBtn.hidden = true;
  noteBtn.hidden = true;
  lobbyEl.hidden = true;
  noteTitle.textContent = "Share the bench";
  noteBody.textContent = "Your friend opens the link, picks a pen, and sits down. You stay on this page.";
  setStatus("Creating the link…");
  hostMatch(id);
});

copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copyLink.textContent = "Copied";
  } catch (err) {
    shareUrl.focus();
    shareUrl.select();
    copyLink.textContent = "Select the link";
  }
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

renderPicks(yourPens, myPenId, (id) => { myPenId = id; });

fit();
resetPens();
updateBoard();
setTurn("Period 4 · last bench");
setStatus(initialRoom ? "A seat is saved on this bench." : "The bench is empty. Recess just started.");
if (initialRoom) {
  showNote(
    "Someone saved you a seat",
    "Pick your pen and sit down. You will face them across the bench. First to knock a pen off 3 times wins.",
    "Sit down",
    { lobby: true, share: false }
  );
} else {
  showNote(
    "Recess on the last bench",
    "Pick your pen. Ramesh brings his own. Flick it up the wood and knock the other one off the far end. Sides bounce. First to 3. Or share the bench and play a friend.",
    "Play Ramesh",
    { lobby: true, share: true }
  );
}
requestAnimationFrame(frame);
