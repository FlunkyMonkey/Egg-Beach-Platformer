import { useEffect, useRef, useCallback } from "react";
import lolaSpriteSrc from "../assets/lola_sprite.png";
import dawnSpriteSrc from "../assets/dawn_sprite.png";
import eggSpriteSrc from "../assets/egg_sprite.png";
import jellyfishSpriteSrc from "../assets/jellyfish_sprite.png";
import crabSpriteSrc from "../assets/crab_sprite.png";
import crabGreenSpriteSrc from "../assets/crab_green_sprite.png";
import titleArtSrc from "../assets/title_art.png";
import winScreenSrc from "../assets/win_screen.png";
import bgBeachSrc from "../assets/bg_beach.png";
import bgOceanSrc from "../assets/bg_ocean.png";
import bgForestSrc from "../assets/bg_forest.png";
import bgVolcanoSrc from "../assets/bg_volcano.png";

let _lolaSprite: HTMLImageElement | null = null;
let _dawnSprite: HTMLImageElement | null = null;
let _eggSprite: HTMLImageElement | null = null;
let _jellyfishSprite: HTMLImageElement | null = null;
let _crabSprite: HTMLImageElement | null = null;
let _crabGreenSprite: HTMLImageElement | null = null;
let _titleArt: HTMLImageElement | null = null;
let _winScreen: HTMLImageElement | null = null;
let _bgBeach: HTMLImageElement | null = null;
let _bgOcean: HTMLImageElement | null = null;
let _bgForest: HTMLImageElement | null = null;
let _bgVolcano: HTMLImageElement | null = null;

// =====================================================================
// TYPES
// =====================================================================
type GameState = "START" | "HOW_TO_PLAY" | "STORY" | "PLAYING" | "GAME_OVER" | "WIN";
type EggColor = "red" | "blue" | "green" | "yellow" | "purple";

interface Egg {
  id: number;
  x: number;
  y: number;
  color: EggColor;
  collected: boolean;
  bobOffset: number;
}

interface Crab {
  x: number; y: number; dir: number; speed: number;
  kind: number;          // 0 = her red crab, 1 = her green one
  phase: number;         // desynchronises the scuttling animation
  alert: number;         // 0..1, rises when the player is near
  pauseTimer: number;    // counts down a stop-and-look-around
  homeX: number;         // patrols around where he started
}
interface Jellyfish { x: number; startY: number; phase: number; speed: number; }
interface Branch { x: number; y: number; w: number; }
interface Root { x: number; }
interface Cloud { x: number; y: number; w: number; }
interface Acorn { x: number; y: number; vx: number; vy: number; }
interface LavaDrop { id: number; x: number; y: number; vy: number; }
interface FloatingHeart { x: number; y: number; vy: number; alpha: number; }

interface GameStateData {
  state: GameState;
  level: number;
  lives: number;
  eggsCollected: number;
  score: number;
  player: {
    x: number; y: number; vx: number; vy: number;
    onGround: boolean; jumpsLeft: number; crouching: boolean;
    facing: number; frameTime: number; frame: number;
    coyote: number;     // frames of grace left after walking off an edge
    jumpBuffer: number; // frames a just-pressed jump stays queued
    squash: number;     // landing squash, decays back to 0
    jumpHeld: boolean;
  };
  dawn: {
    x: number; y: number; vx: number; vy: number;
    onGround: boolean; dir: number; frameTime: number; frame: number;
    reverseCooldown: number;
  };
  cameraX: number;
  eggs: Egg[];
  crabs: Crab[];
  jellyfish: Jellyfish[];
  branches: Branch[];
  roots: Root[];
  clouds: Cloud[];
  acorns: Acorn[];
  lavaDrops: LavaDrop[];
  lavaDropNextId: number;
  lavaSpawnTimer: number;
  // FX
  hurtFlash: number;
  shake: number;
  hurtHearts: FloatingHeart[];
  eggBanner: { message: string; alpha: number } | null;
  // Meta
  bgScrollX: number;
  storyTimer: number;
  winAnimTime: number;
  lolaIdleFrame: number;
  lolaIdleTime: number;
}

// =====================================================================
// AUDIO PLACEHOLDERS
// =====================================================================
function playSoundEggCollect() { /* TODO: play egg collect sound */ }
function playSoundJump() { /* TODO: play jump sound */ }
function playSoundLifeLost() { /* TODO: play life lost sound */ }
function playSoundLevelComplete() { /* TODO: play level complete sound */ }

// =====================================================================
// CONSTANTS
// =====================================================================
const CANVAS_W = 800;
const CANVAS_H = 450;
const GROUND_Y = 360;
const GRAVITY = 0.55;
const UNDERWATER_GRAVITY = 0.18;
const JUMP_FORCE = -13;
const UNDERWATER_JUMP_FORCE = -7;
const PLAYER_SPEED = 4.8;
const LEVEL_LENGTH = 5000;
const EGG_COLORS: EggColor[] = ["red", "blue", "green", "yellow", "purple"];
const MAX_LEVELS = 4;

// --- Movement feel -----------------------------------------------------
// Instant velocity changes read as robotic, so the player accelerates into a
// run and skids to a stop instead of snapping between speeds.
const ACCEL = 0.9;
const AIR_ACCEL = 0.45;
const GROUND_FRICTION = 0.80;
const AIR_FRICTION = 0.94;
// Forgiveness windows, in frames. Coyote time keeps a jump alive briefly after
// walking off a ledge; the buffer remembers a jump pressed just before landing.
// Both make the controls feel responsive rather than strict, which matters a lot
// for a young player.
const COYOTE_FRAMES = 7;
const JUMP_BUFFER_FRAMES = 8;
// Releasing jump early cuts the rise short, so a tap is a hop and a hold is a leap.
const JUMP_CUTOFF = 0.45;

// Where the ground sits in each background drawing, as a fraction of the image
// height — the sea/sand line on the beach, the floor of the forest, and so on.
// The art is positioned so this lands exactly on GROUND_Y, which is what makes
// her horizon line up with the surface the player walks on.
const BG_GROUND_FRAC = [0.62, 0.78, 0.61, 0.75];
const BG_PARALLAX = [0.18, 0.15, 0.20, 0.09];
// How far to zoom into each drawing. The beach, ocean and forest are horizontal
// bands, so they repeat happily at their natural size. The volcano is a single
// object, and at that size it repeated three times across the screen and read as
// wallpaper — zoomed in it fills the view as one landmark, at the cost of some sky.
const BG_ZOOM = [1.0, 1.0, 1.0, 1.0];
// Horizontal spacing between repeats, as a multiple of the art's width. The band
// drawings repeat edge to edge and read as continuous scenery. Her volcano is one
// tall object on a portrait page, so fitting it on screen leaves it narrower than
// the canvas — repeated edge to edge it became wallpaper. Spacing the copies out
// over a matching terrain base turns it back into a landmark you travel past.
const BG_TILE_GAP = [1.0, 1.0, 1.0, 2.2];

const STORY_TEXTS = [
  "Lola loves eggs. Dawn the chicken\nhas the best eggs on the beach.\nBut Dawn won't share — she runs!\nChase her down and collect eggs\nbefore she escapes!",
  "Dawn fled into the sea! Lola dives in\nafter her, dodging jellyfish through\nthe waves...",
  "Dawn emerges in the forest!\nWatch out for roots and branches —\nand the acorns raining down!\nCatch her before time runs out!",
  "Dawn has reached the volcano!\nThe mountain is erupting — dodge\nthe lava and catch her before\nit's too late!",
];

const DAWN_SPEED = [2.8, 3.6, 4.4, 5.2];
const DAWN_JUMP_PROB = [0.005, 0.012, 0.022, 0.038];
const DAWN_REVERSE_PROB = [0.003, 0.008, 0.015, 0.028];

// =====================================================================
// SPRITE DRAWING
// =====================================================================
function drawEggShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLola(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  facing: number, crouching: boolean,
  frame: number, hurtFlash: number,
  speed = 0, airborne = false, squash = 0
) {
  ctx.save();
  ctx.translate(x, y + 34);
  ctx.scale(facing * 1.125, 1.125);
  ctx.translate(0, -34);

  // Squash on landing, stretch on take-off. Conserving volume (widening as she
  // flattens) is what stops it looking like a glitch and starts it looking like
  // weight.
  const scaleY = (crouching ? 0.7 : 1) * (1 - squash);
  ctx.scale(1 + squash * 0.45, scaleY);
  const oy = crouching ? 10 : 0;

  if (_lolaSprite) {
    const sw = 52, sh = 90;
    const bodyY = 34 - sh + oy * 0.5;

    // How hard she is working, 0..1 — drives the whole gait so that standing
    // still, running and jumping all read differently.
    const effort = airborne ? 1 : Math.min(1, Math.abs(speed) / PLAYER_SPEED);
    const cycle = frame * 0.8;
    const legBob = Math.sin(cycle) * (2 + effort * 3.5);

    // Legs, behind the drawing.
    ctx.fillStyle = "#5533bb";
    ctx.fillRect(-6, oy + 24, 5, 8 + legBob);
    ctx.fillRect(1, oy + 24, 5, 8 - legBob);
    ctx.fillStyle = "#2255dd";
    ctx.fillRect(-8, oy + 30 + legBob * 0.4, 7, 4);
    ctx.fillRect(1, oy + 30 - legBob * 0.4, 7, 4);

    // Far arm goes behind her, near arm in front, so she has depth instead of
    // looking like a flat cut-out sliding around. Her drawing has both arms held
    // against her body, so these are drawn either side of it and swing opposite
    // to the legs, the way arms actually counterbalance a stride.
    const armSwing = Math.sin(cycle + Math.PI) * (0.25 + effort * 0.75);
    const drawArm = (side: number, swing: number, shade: string) => {
      ctx.save();
      ctx.translate(side * 11, oy - 6);
      // In the air both arms fly up; on the ground they pump.
      ctx.rotate(airborne ? side * -0.9 - 0.3 : swing * side);
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.roundRect(-2.5, 0, 5.5, 17, 2.6);
      ctx.fill();
      ctx.fillStyle = "#f0b183";
      ctx.beginPath();
      ctx.arc(0.3, 17, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    drawArm(-1, armSwing, "#c98a5f");   // far arm, shaded
    ctx.drawImage(_lolaSprite, -sw / 2, bodyY, sw, sh);
    drawArm(1, -armSwing, "#eda878");   // near arm, lit

    if (hurtFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = Math.min(hurtFlash * 2, 0.55);
      ctx.fillStyle = "#ff2200";
      ctx.fillRect(-sw / 2, bodyY, sw, sh);
      ctx.restore();
    }
  } else {
    if (hurtFlash > 0) {
      ctx.globalAlpha = Math.min(hurtFlash * 2, 0.65);
      ctx.fillStyle = "#ff2200";
      ctx.fillRect(-14, oy - 32, 28, 50);
      ctx.globalAlpha = 1;
    }
    const legBob = Math.sin(frame * 0.8) * 3;
    ctx.fillStyle = "#5533bb"; ctx.fillRect(-7, oy + 22, 6, 8 + legBob); ctx.fillRect(2, oy + 22, 6, 8 - legBob);
    ctx.fillStyle = "#2255dd"; ctx.fillRect(-9, oy + 28, 8, 6); ctx.fillRect(2, oy + 28, 8, 6);
    ctx.fillStyle = "#8844ee";
    ctx.beginPath(); ctx.moveTo(-10, oy + 14); ctx.lineTo(10, oy + 14); ctx.lineTo(13, oy + 27); ctx.lineTo(-13, oy + 27); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#9955ff"; ctx.fillRect(-8, oy - 2, 16, 18);
    const armBob = Math.sin(frame * 0.8) * 4;
    ctx.fillStyle = "#e09050"; ctx.fillRect(-13, oy + 1 + armBob, 6, 11); ctx.fillRect(7, oy + 1 - armBob, 6, 11);
    ctx.fillStyle = "#e09050"; ctx.fillRect(-4, oy - 8, 8, 8);
    ctx.beginPath(); ctx.ellipse(0, oy - 15, 10, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffdd11"; ctx.beginPath(); ctx.ellipse(0, oy - 22, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-11, oy - 22, 4, 13); ctx.fillRect(7, oy - 22, 4, 13);
    ctx.fillStyle = "#fff"; ctx.fillRect(-6, oy - 18, 5, 5); ctx.fillRect(2, oy - 18, 5, 5);
    ctx.fillStyle = "#2255ee"; ctx.fillRect(-5, oy - 17, 3, 3); ctx.fillRect(3, oy - 17, 3, 3);
  }

  ctx.restore();
}

function drawDawn(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, frame: number) {
  ctx.save();
  ctx.translate(x, y + 27);
  ctx.scale(dir * 1.5, 1.5);
  ctx.translate(0, -27);

  const legBob = Math.sin(frame * 1.2) * 4;

  if (_dawnSprite) {
    ctx.fillStyle = "#ffbb22";
    ctx.fillRect(-5, 18, 4, 8 + legBob);
    ctx.fillRect(1, 18, 4, 8 - legBob);
    ctx.fillRect(-7, 24 + legBob * 0.3, 8, 3);
    ctx.fillRect(1, 24 - legBob * 0.3, 8, 3);

    const dw = 48, dh = 48;
    const bodyBob = Math.sin(frame * 1.2) * 1.5;
    const wingFlap = Math.sin(frame * 1.2) * 0.08;
    ctx.save();
    ctx.rotate(wingFlap);
    ctx.drawImage(_dawnSprite, -dw / 2, -dh / 2 - 4 + bodyBob, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#ffbb22";
    ctx.fillRect(-5, 18, 4, 8 + legBob);
    ctx.fillRect(1, 18, 4, 8 - legBob);
    ctx.fillRect(-7, 24, 8, 3);
    ctx.fillRect(1, 24, 8, 3);
    ctx.fillStyle = "#f4f0e8";
    ctx.beginPath(); ctx.ellipse(0, 8, 13, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d8d4cc";
    ctx.beginPath(); ctx.ellipse(3, 11, 9, 11, 0.2, 0, Math.PI * 2); ctx.fill();
    const wingBob = Math.sin(frame * 1.2) * 5;
    ctx.fillStyle = "#e8e4dc";
    ctx.beginPath(); ctx.ellipse(7, 4 + wingBob, 6, 10, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f4f0e8";
    ctx.beginPath(); ctx.ellipse(3, -10, 9, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#dd1111";
    ctx.beginPath();
    ctx.moveTo(-2, -18); ctx.lineTo(0, -23); ctx.lineTo(3, -17); ctx.lineTo(5, -22);
    ctx.lineTo(7, -17); ctx.lineTo(8, -15); ctx.lineTo(-2, -15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#dd1111";
    ctx.beginPath(); ctx.ellipse(5, -5, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffdd00";
    ctx.beginPath(); ctx.moveTo(10, -11); ctx.lineTo(17, -9); ctx.lineTo(10, -7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(7, -12, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cc1111";
    ctx.beginPath(); ctx.arc(8, -12, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(8, -12, 0.8, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function drawEgg(ctx: CanvasRenderingContext2D, egg: Egg, worldTime: number) {
  if (egg.collected) return;
  const by = egg.y + Math.sin(egg.bobOffset) * 4;
  const twinkle = 0.5 + Math.sin(egg.bobOffset * 1.6) * 0.5;

  // Contact shadow, so the egg reads as sitting on the sand.
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.beginPath();
  ctx.ellipse(egg.x, egg.y + 15, 11 - Math.sin(egg.bobOffset) * 1.4, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warm halo. Her egg is drawn in pale marker on white paper, so against bright
  // sand it had almost no edge contrast — this is what makes it findable.
  const halo = ctx.createRadialGradient(egg.x, by, 3, egg.x, by, 24);
  halo.addColorStop(0, `rgba(255,225,120,${0.40 + twinkle * 0.22})`);
  halo.addColorStop(1, "rgba(255,215,90,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(egg.x, by, 24, 0, Math.PI * 2); ctx.fill();

  if (_eggSprite) {
    const ew = 26, eh = ew * (_eggSprite.height / _eggSprite.width);
    ctx.save();
    // A soft dark rim lifts her pale outline off any background.
    ctx.shadowColor = "rgba(90,50,0,0.55)";
    ctx.shadowBlur = 5;
    ctx.drawImage(_eggSprite, egg.x - ew / 2, by - eh / 2, ew, eh);
    ctx.restore();
  } else {
    const colors: Record<EggColor, [string, string]> = {
      red: ["#ee2222", "#ff8888"], blue: ["#2244ee", "#6699ff"],
      green: ["#11aa33", "#55ee77"], yellow: ["#ddbb00", "#ffee55"],
      purple: ["#8822cc", "#cc77ff"],
    };
    const [base, shine] = colors[egg.color];
    ctx.fillStyle = base;
    drawEggShape(ctx, egg.x, by, 9, 12);
    ctx.fillStyle = shine;
    ctx.beginPath(); ctx.ellipse(egg.x - 3, by - 5, 4, 5, -0.5, 0, Math.PI * 2); ctx.fill();
  }

  // Sparkle orbiting the egg, to catch the eye while scrolling past.
  const sa = worldTime * 2.2 + egg.bobOffset;
  const sx = egg.x + Math.cos(sa) * 13;
  const sy = by + Math.sin(sa) * 9;
  const s = 1.4 + twinkle * 1.5;
  ctx.fillStyle = `rgba(255,255,235,${0.55 + twinkle * 0.4})`;
  ctx.beginPath();
  ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s * 0.5, sy); ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s * 0.5, sy);
  ctx.closePath(); ctx.fill();
}

function drawCrab(ctx: CanvasRenderingContext2D, crab: Crab, worldTime: number) {
  const sprite = crab.kind === 1 ? _crabGreenSprite : _crabSprite;
  // Scuttling gait: a quick bob with a slight tilt, so he looks like he is
  // working at it rather than sliding along the sand.
  const gait = worldTime * 9 + crab.phase;
  const scuttling = Math.abs(crab.speed) > 0.05;
  const bob = scuttling ? Math.abs(Math.sin(gait)) * 2.5 : Math.sin(worldTime * 2 + crab.phase) * 0.8;
  const tilt = scuttling ? Math.sin(gait) * 0.09 : 0;

  ctx.save();
  ctx.translate(crab.x, crab.y - bob);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 6 + bob, 19 - bob * 1.6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(crab.dir, 1);
  ctx.rotate(tilt);

  // Legs are drawn behind her artwork and animated in two alternating sets, the
  // way a real crab moves — the drawing itself has no legs to animate.
  ctx.strokeStyle = crab.kind === 1 ? "#2f6b28" : "#8d1c08";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  for (let i = -1; i <= 1; i++) {
    for (const side of [-1, 1]) {
      const swing = Math.sin(gait + (i + (side > 0 ? 1.5 : 0)) * 1.1) * (scuttling ? 3.4 : 0.8);
      const hipX = side * (7 + Math.abs(i) * 3);
      const hipY = 2 + i * 1.5;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(hipX + side * 6, hipY + 5 - swing * 0.4);
      ctx.lineTo(hipX + side * 8 + swing, hipY + 11);
      ctx.stroke();
    }
  }

  // Claws raise when the player is close — the tell that he is about to be a problem.
  const alert = crab.alert;
  const clawLift = alert * 5;
  const clawSnap = alert > 0.15 ? Math.abs(Math.sin(worldTime * 14)) * 0.5 : 0;
  ctx.strokeStyle = crab.kind === 1 ? "#39802f" : "#a52208";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 13, -3 - clawLift);
    ctx.rotate(side * (0.5 + clawSnap) * -1);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(side * 7, -4); ctx.stroke();
    ctx.fillStyle = crab.kind === 1 ? "#3f8f33" : "#c22a0a";
    ctx.beginPath(); ctx.ellipse(side * 9, -5, 4.5, 3.4, side * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  if (sprite) {
    const cw = 40, ch = cw * (sprite.height / sprite.width);
    ctx.drawImage(sprite, -cw / 2, -ch * 0.62, cw, ch);
  } else {
    ctx.fillStyle = crab.kind === 1 ? "#3f8f33" : "#cc2f10";
    ctx.beginPath(); ctx.ellipse(0, -2, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Googly eyes on stalks, drawn on top so they read at any size. Her crab is a
  // loose marker blob, and these are what turn it into a character.
  const look = alert > 0.15 ? 1.6 : 0;
  for (const side of [-1, 1]) {
    const ex = side * 5.5;
    const ey = -13 - Math.sin(gait * 0.5 + side) * 0.6;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ex * 0.6, -7); ctx.lineTo(ex, ey + 2); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(ex, ey, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ex, ey, 3.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(ex + look, ey + (alert > 0.15 ? 0.4 : 0), 1.7, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function drawJellyfish(ctx: CanvasRenderingContext2D, jf: Jellyfish, worldTime: number) {
  const y = jf.startY + Math.sin(worldTime * jf.speed + jf.phase) * 40;
  ctx.save();
  ctx.translate(jf.x, y);

  if (_jellyfishSprite) {
    // Squash and stretch on the bell, in time with the drift — the up-beat is a
    // quick squeeze and the fall is a slow relax, which is how a jellyfish swims.
    const t = worldTime * 2 + jf.phase;
    const squeeze = Math.pow(Math.max(0, Math.sin(t)), 2);
    const pulse = 1 + squeeze * 0.16;
    const sway = Math.sin(worldTime * 1.2 + jf.phase) * 0.12;

    const jw = 46, jh = jw * (_jellyfishSprite.height / _jellyfishSprite.width);

    // Bioluminescent halo. Doubles as a readability aid in the dim water.
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
    glow.addColorStop(0, `rgba(210,130,255,${0.30 + squeeze * 0.25})`);
    glow.addColorStop(1, "rgba(180,90,240,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.rotate(sway);
    ctx.scale(pulse, 1 / pulse);
    ctx.drawImage(_jellyfishSprite, -jw / 2, -jh * 0.34, jw, jh);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(220,80,240,0.65)";
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5;
    for (let i = -3; i <= 3; i++) {
      const xOff = i * 5;
      ctx.strokeStyle = `hsl(${280 + i * 10},80%,${55 + Math.sin(worldTime + i) * 10}%)`;
      ctx.beginPath(); ctx.moveTo(xOff, 14);
      ctx.bezierCurveTo(xOff + 6, 22 + Math.sin(worldTime * 2.2 + i) * 6, xOff - 6, 30 + Math.sin(worldTime * 2 + i + 1) * 6, xOff + 3, 40);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud) {
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.ellipse(cloud.x, cloud.y, cloud.w * 0.5, cloud.w * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cloud.x - cloud.w * 0.26, cloud.y + 4, cloud.w * 0.32, cloud.w * 0.19, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cloud.x + cloud.w * 0.26, cloud.y + 5, cloud.w * 0.36, cloud.w * 0.21, 0, 0, Math.PI * 2); ctx.fill();
}

/**
 * Branch platforms.
 *
 * These sat almost invisible against the forest: her canopy is brown trunks over
 * yellow ground, and the platform was plain brown on top of it. Silhouette is
 * what fixes that, not colour — a hard dark outline, a bright mossy cap, and a
 * cast shadow underneath so it reads as something in front of the trees that you
 * can stand on.
 */
function drawBranch(ctx: CanvasRenderingContext2D, branch: Branch, cameraX: number) {
  const sx = branch.x - cameraX;
  const w = branch.w, y = branch.y;

  // Shadow on the forest floor, which also hints where to land.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(sx + w / 2, GROUND_Y - 2, w * 0.42, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.lineJoin = "round";

  // Dark underside first, so the lit top edge pops off it.
  ctx.fillStyle = "#3a1d08";
  ctx.beginPath();
  ctx.roundRect(sx - 3, y - 2, w + 6, 20, 6);
  ctx.fill();

  ctx.fillStyle = "#7c4a1e";
  ctx.beginPath();
  ctx.roundRect(sx, y - 4, w, 16, 5);
  ctx.fill();

  // Mossy top surface: the bright band is the actual standing line.
  const cap = ctx.createLinearGradient(0, y - 6, 0, y + 4);
  cap.addColorStop(0, "#8ede54");
  cap.addColorStop(1, "#3f9c22");
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.roundRect(sx - 1, y - 7, w + 2, 9, 4);
  ctx.fill();

  ctx.strokeStyle = "rgba(20,10,0,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(sx - 1, y - 7, w + 2, 19, 5);
  ctx.stroke();

  // A few tufts breaking the straight edge so it still feels hand-made.
  ctx.fillStyle = "#6ec73a";
  for (let i = 0; i < Math.max(3, Math.floor(w / 22)); i++) {
    const gx = sx + 8 + i * (w - 12) / Math.max(1, Math.floor(w / 22));
    ctx.beginPath();
    ctx.ellipse(gx, y - 8, 5, 3.5, Math.sin(gx) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Trip roots. Outlined and highlighted for the same reason as the branches. */
function drawRoot(ctx: CanvasRenderingContext2D, rx: number, cameraX: number) {
  const sx = rx - cameraX;
  ctx.save();
  ctx.lineJoin = "round";

  const hump = (inset: number) => {
    ctx.beginPath();
    ctx.moveTo(sx + inset, GROUND_Y + 2);
    ctx.bezierCurveTo(
      sx + 10 + inset * 0.5, GROUND_Y - 24 + inset,
      sx + 22 - inset * 0.5, GROUND_Y - 18 + inset,
      sx + 32 - inset, GROUND_Y + 2,
    );
  };

  hump(0);
  ctx.fillStyle = "#472208";
  ctx.fill();
  ctx.strokeStyle = "rgba(15,8,0,0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();

  hump(5);
  ctx.fillStyle = "#8a5426";
  ctx.fill();

  // Lit crest, so the bump is legible against the yellow floor she drew.
  ctx.strokeStyle = "rgba(220,180,110,0.75)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sx + 6, GROUND_Y - 8);
  ctx.bezierCurveTo(sx + 13, GROUND_Y - 20, sx + 20, GROUND_Y - 16, sx + 26, GROUND_Y - 7);
  ctx.stroke();
  ctx.restore();
}

function drawAcorn(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.5, 1.5);
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath(); ctx.ellipse(0, 10, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  // Cap
  ctx.fillStyle = "#6b4a1a";
  ctx.beginPath();
  ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
  ctx.bezierCurveTo(8, -8, -8, -8, -8, 0);
  ctx.fill();
  // Cap texture lines
  ctx.strokeStyle = "#503510";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(-5, -6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, -1); ctx.lineTo(5, -6); ctx.stroke();
  // Stem
  ctx.fillStyle = "#4a2c0a";
  ctx.fillRect(-1, -10, 3, 5);
  // Body
  ctx.fillStyle = "#b87a30";
  ctx.beginPath(); ctx.ellipse(0, 5, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
  // Highlight
  ctx.fillStyle = "#d4a060";
  ctx.beginPath(); ctx.ellipse(-3, 2, 4, 5, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawLavaDrop(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  // Outer glow
  ctx.shadowColor = "#ff4400";
  ctx.shadowBlur = 10;
  // Teardrop body
  ctx.fillStyle = "#ff3300";
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.bezierCurveTo(8, -6, 9, 4, 0, 10);
  ctx.bezierCurveTo(-9, 4, -8, -6, 0, -14);
  ctx.fill();
  // Orange core
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ff8800";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.bezierCurveTo(4, -3, 5, 3, 0, 7);
  ctx.bezierCurveTo(-5, 3, -4, -3, 0, -8);
  ctx.fill();
  // Highlight
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath(); ctx.ellipse(-2, -6, 2, 3, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawVolcanoBackground(ctx: CanvasRenderingContext2D, bgScrollX: number, worldTime: number) {
  if (_bgVolcano) {
    ctx.drawImage(_bgVolcano, 0, 0, CANVAS_W, CANVAS_H);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, "rgba(26,10,10,0.35)");
    skyGrad.addColorStop(0.4, "rgba(45,8,8,0.3)");
    skyGrad.addColorStop(1, "rgba(85,16,16,0.25)");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  } else {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, "#1a0a0a");
    skyGrad.addColorStop(0.4, "#2d0808");
    skyGrad.addColorStop(1, "#551010");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  if (_bgVolcano) ctx.globalAlpha = 0.3;

  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(200,50,0,${0.05 + Math.sin(worldTime * 0.5 + i) * 0.02})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Background volcano mountains
  for (let i = 0; i < 3; i++) {
    const mx = ((i * 300 + 80 - bgScrollX * 0.25) % (CANVAS_W + 300) + CANVAS_W + 300) % (CANVAS_W + 300) - 150;
    ctx.fillStyle = `hsl(0, 0%, ${8 + i * 4}%)`;
    ctx.beginPath();
    ctx.moveTo(mx - 80 - i * 30, GROUND_Y);
    ctx.lineTo(mx + i * 10, GROUND_Y - 160 - i * 30);
    ctx.lineTo(mx + 80 + i * 30, GROUND_Y);
    ctx.closePath(); ctx.fill();
    // Lava glow at crater
    const lavaAlpha = 0.3 + Math.sin(worldTime * 2 + i) * 0.1;
    ctx.fillStyle = `rgba(255,60,0,${lavaAlpha})`;
    ctx.beginPath(); ctx.ellipse(mx + i * 10, GROUND_Y - 158 - i * 30, 18, 10, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Main large volcano
  const vx = 500 - bgScrollX * 0.6;
  const vxS = ((vx % (CANVAS_W + 500) + CANVAS_W + 500) % (CANVAS_W + 500)) - 250;
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.moveTo(vxS - 160, GROUND_Y);
  ctx.lineTo(vxS, GROUND_Y - 260);
  ctx.lineTo(vxS + 160, GROUND_Y);
  ctx.closePath(); ctx.fill();
  // Lava streams
  const lavaColors = ["#ff3300", "#ff5500", "#ff7700"];
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = lavaColors[i % 3];
    ctx.lineWidth = 7 - i * 1.5;
    ctx.beginPath();
    const lsx = vxS + (-20 + i * 20);
    ctx.moveTo(lsx, GROUND_Y - 220 + i * 20);
    ctx.bezierCurveTo(
      lsx + 15, GROUND_Y - 150,
      lsx - 15 + Math.sin(worldTime + i) * 12, GROUND_Y - 80,
      lsx + 10, GROUND_Y
    );
    ctx.stroke();
  }
  // Crater
  ctx.fillStyle = "#ff2200";
  ctx.beginPath(); ctx.ellipse(vxS, GROUND_Y - 258, 28, 14, 0, 0, Math.PI * 2); ctx.fill();
  const craterGrad = ctx.createRadialGradient(vxS, GROUND_Y - 258, 5, vxS, GROUND_Y - 258, 70);
  craterGrad.addColorStop(0, `rgba(255,120,0,${0.5 + Math.sin(worldTime * 3) * 0.1})`);
  craterGrad.addColorStop(1, "rgba(255,40,0,0)");
  ctx.fillStyle = craterGrad;
  ctx.beginPath(); ctx.arc(vxS, GROUND_Y - 258, 70, 0, Math.PI * 2); ctx.fill();

  // Volcanic rock ground
  const rockGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
  rockGrad.addColorStop(0, "#1a0808");
  rockGrad.addColorStop(1, "#0d0404");
  ctx.fillStyle = rockGrad;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
  // Rock texture
  for (let i = 0; i < 10; i++) {
    const rx2 = ((i * 90 + 20 - bgScrollX * 0.8) % (CANVAS_W + 100) + CANVAS_W + 100) % (CANVAS_W + 100) - 50;
    ctx.fillStyle = `hsl(10, 30%, ${8 + (i % 3) * 3}%)`;
    ctx.beginPath(); ctx.ellipse(rx2, GROUND_Y + 12, 25 + (i % 3) * 8, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Lava cracks
    if (i % 2 === 0) {
      ctx.strokeStyle = `rgba(255,${60 + i * 10},0,${0.3 + Math.sin(worldTime + i) * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rx2 - 10, GROUND_Y + 5); ctx.lineTo(rx2 + 15, GROUND_Y + 20); ctx.stroke();
    }
  }

  for (let i = 0; i < 12; i++) {
    const ex = ((i * 70 + worldTime * (20 + i * 5)) % (CANVAS_W + 50) + CANVAS_W + 50) % (CANVAS_W + 50) - 25;
    const ey = ((worldTime * 40 + i * 37) % (GROUND_Y + 20));
    ctx.fillStyle = `hsl(${20 + (i % 5) * 10}, 100%, ${50 + Math.sin(worldTime + i) * 15}%)`;
    ctx.beginPath(); ctx.arc(ex, ey, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// =====================================================================
// BACKGROUNDS
// =====================================================================
function artBackgroundLayout(img: HTMLImageElement, level: number) {
  const groundFrac = BG_GROUND_FRAC[level - 1];
  // Big enough that her art still covers the canvas once its ground line is
  // pinned to GROUND_Y, both above and below that line.
  const h = Math.max(GROUND_Y / groundFrac, (CANVAS_H - GROUND_Y) / (1 - groundFrac)) * 1.02 * BG_ZOOM[level - 1];
  const w = h * (img.width / img.height);
  return { w, h, top: GROUND_Y - groundFrac * h };
}

/**
 * Draw one of her drawings as the actual scenery.
 *
 * The art is positioned so the horizon she painted lands exactly on the ground the
 * player walks on — that alignment is most of what stops it reading as a photo
 * pasted behind the game.
 *
 * It repeats plainly rather than mirrored. Mirroring sounds like the tidier way to
 * hide a seam, but her clouds are distinct shapes, so a mirrored repeat turns the
 * sky into an obvious symmetrical butterfly. A plain repeat just reads as more sky.
 */
function drawArtBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cameraX: number, level: number) {
  const { w, h, top } = artBackgroundLayout(img, level);
  const step = w * BG_TILE_GAP[level - 1];

  if (step > w + 1) {
    // Spaced landmarks: lay down the terrain the drawing sits on first, so the
    // gaps between copies are ground and sky rather than empty canvas.
    // Colours sampled from the edges of her volcano page, so the terrain either
    // side of a landmark is the same haze and ash she painted.
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, "#98bdc4");
    sky.addColorStop(0.45, "#a26d6f");
    sky.addColorStop(1, "#c78c76");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);
    const ground = ctx.createLinearGradient(0, GROUND_Y - 6, 0, CANVAS_H);
    ground.addColorStop(0, "#6f6662");
    ground.addColorStop(1, "#2f2b2c");
    ctx.fillStyle = ground;
    ctx.fillRect(0, GROUND_Y - 6, CANVAS_W, CANVAS_H - GROUND_Y + 6);
  }

  let x = -((cameraX * BG_PARALLAX[level - 1]) % step);
  if (x > 0) x -= step;

  // Overlap each repeat by a hair. Her pages are cropped to the drawn area, so
  // butting them together can leave a one-pixel light seam as the edges resample.
  for (; x < CANVAS_W; x += step) {
    ctx.drawImage(img, x, top, w + 1, h);
  }
}

/** A soft contact shadow so characters sit on the ground rather than float above it. */
function drawGroundContact(ctx: CanvasRenderingContext2D, tint: string) {
  const g = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GROUND_Y + 16);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.4, tint);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y - 10, CANVAS_W, 26);
}

/** Corner darkening — pushes the edges back and keeps the eye on the action. */
function drawVignette(ctx: CanvasRenderingContext2D, strength: number) {
  const g = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.35, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  level: number, bgScrollX: number, worldTime: number,
  clouds: Cloud[], cameraX: number
) {
  const art = [_bgBeach, _bgOcean, _bgForest, _bgVolcano][level - 1];

  if (!art) {
    // Only until the drawing loads — a flat wash in roughly her palette.
    const fallback = ["#9fd8f2", "#1f6fae", "#8fbf63", "#6b4a58"][level - 1];
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    return;
  }

  drawArtBackground(ctx, art, cameraX, level);

  // Everything below is atmosphere drawn *over* her art. The previous version
  // rendered a second, complete procedural scene at 30% opacity on top of the
  // drawing, which is what made every level look muddy — two pictures competing.
  // These are sparse accents that move, so the scene feels alive without hiding
  // anything she drew.
  if (level === 1) {
    // Surf sliding up the sand, right at the waterline.
    for (let i = 0; i < 5; i++) {
      const wx = ((i * 190 - cameraX * 0.45 + 40) % (CANVAS_W + 220) + CANVAS_W + 220) % (CANVAS_W + 220) - 110;
      const swell = Math.sin(worldTime * 1.4 + i) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.10 + swell * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(wx, GROUND_Y - 4 + swell * 3, 70 + swell * 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    clouds.forEach((c, i) => {
      const px = ((c.x - cameraX * 0.08 + CANVAS_W * 3) % (CANVAS_W + 260)) - 130;
      ctx.fillStyle = `rgba(255,255,255,${0.13 + (i % 3) * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(px, c.y * 0.65 + 12, c.w * 0.5, c.w * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    drawGroundContact(ctx, "rgba(150,90,20,0.20)");
    drawVignette(ctx, 0.16);

  } else if (level === 2) {
    // Underwater: cool depth tint, godrays, and bubbles rising.
    ctx.fillStyle = "rgba(10,60,120,0.20)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (let i = 0; i < 5; i++) {
      const rx = ((i * 210 - cameraX * 0.12) % (CANVAS_W + 260) + CANVAS_W + 260) % (CANVAS_W + 260) - 130;
      const drift = Math.sin(worldTime * 0.4 + i) * 22;
      ctx.fillStyle = `rgba(190,235,255,${0.05 + Math.sin(worldTime * 0.7 + i) * 0.025})`;
      ctx.beginPath();
      ctx.moveTo(rx + drift, 0); ctx.lineTo(rx + 46 + drift, 0);
      ctx.lineTo(rx + 96, CANVAS_H); ctx.lineTo(rx + 20, CANVAS_H);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 16; i++) {
      const bx = ((i * 97 - cameraX * 0.3 + 30) % (CANVAS_W + 80) + CANVAS_W + 80) % (CANVAS_W + 80) - 40;
      const by = GROUND_Y - ((worldTime * 34 + i * 61) % (GROUND_Y + 40));
      const r = 2 + (i % 4);
      ctx.strokeStyle = `rgba(220,245,255,${0.30 + (i % 3) * 0.12})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(bx + Math.sin(by * 0.05 + i) * 6, by, r, 0, Math.PI * 2); ctx.stroke();
    }
    drawGroundContact(ctx, "rgba(0,30,70,0.28)");
    drawVignette(ctx, 0.26);

  } else if (level === 3) {
    // Forest: shafts of light through the canopy plus drifting leaves.
    for (let i = 0; i < 4; i++) {
      const lx = ((i * 240 + 60 - cameraX * 0.5) % (CANVAS_W + 300) + CANVAS_W + 300) % (CANVAS_W + 300) - 150;
      ctx.fillStyle = `rgba(255,245,150,${0.06 + Math.sin(worldTime * 0.5 + i) * 0.025})`;
      ctx.beginPath();
      ctx.moveTo(lx, 0); ctx.lineTo(lx + 54, 0);
      ctx.lineTo(lx + 104, GROUND_Y); ctx.lineTo(lx + 26, GROUND_Y);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 12; i++) {
      const t = worldTime * 0.55 + i * 1.7;
      const lx = ((i * 128 - cameraX * 0.45 + Math.sin(t) * 40) % (CANVAS_W + 120) + CANVAS_W + 120) % (CANVAS_W + 120) - 60;
      const ly = ((t * 26) % (GROUND_Y + 60)) - 30;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(Math.sin(t * 1.3) * 0.9);
      ctx.fillStyle = ["rgba(190,120,40,0.55)", "rgba(150,170,40,0.5)", "rgba(120,80,30,0.5)"][i % 3];
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawGroundContact(ctx, "rgba(40,60,10,0.30)");
    drawVignette(ctx, 0.24);

  } else {
    // Volcano: hot haze, rising embers, and a slow pulse of eruption light.
    const pulse = 0.5 + Math.sin(worldTime * 0.9) * 0.5;
    ctx.fillStyle = `rgba(255,90,20,${0.05 + pulse * 0.06})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (let i = 0; i < 22; i++) {
      const ex = ((i * 73 - cameraX * 0.35 + 20) % (CANVAS_W + 60) + CANVAS_W + 60) % (CANVAS_W + 60) - 30;
      const ey = GROUND_Y - ((worldTime * 52 + i * 47) % (GROUND_Y + 60));
      const life = 1 - (GROUND_Y - ey) / (GROUND_Y + 60);
      ctx.fillStyle = `rgba(255,${150 + (i % 4) * 22},40,${0.55 * life})`;
      ctx.beginPath();
      ctx.arc(ex + Math.sin(ey * 0.06 + i) * 8, ey, 1.4 + (i % 3) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    drawGroundContact(ctx, "rgba(60,10,0,0.35)");
    drawVignette(ctx, 0.30);
  }
}

// =====================================================================
// HUD
// =====================================================================
function drawHUD(ctx: CanvasRenderingContext2D, lives: number, eggsCollected: number, level: number) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, CANVAS_W, 40);
  // Bottom edge glow
  ctx.fillStyle = "rgba(255,200,50,0.12)";
  ctx.fillRect(0, 38, CANVAS_W, 2);

  // Lives as heart icons (10 total, 2 rows of 5)
  for (let i = 0; i < 10; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const hx = 10 + col * 22;
    const hy = 9 + row * 14;
    const filled = i < lives;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(0.75, 0.75);
    if (filled) {
      ctx.fillStyle = "#ff3355";
      ctx.strokeStyle = "#cc1133";
    } else {
      ctx.fillStyle = "rgba(255,100,120,0.18)";
      ctx.strokeStyle = "rgba(255,100,120,0.35)";
    }
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-6, -2, -12, 0, -12, 5);
    ctx.bezierCurveTo(-12, 11, 0, 16, 0, 16);
    ctx.bezierCurveTo(0, 16, 12, 11, 12, 5);
    ctx.bezierCurveTo(12, 0, 6, -2, 0, 5);
    ctx.fill();
    ctx.stroke();
    if (filled) {
      ctx.fillStyle = "rgba(255,180,190,0.45)";
      ctx.beginPath(); ctx.ellipse(-4, 4, 3, 4, -0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Level label (centered)
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`LVL ${level}`, CANVAS_W / 2, 26);

  // Eggs collected (right side)
  ctx.fillStyle = eggsCollected >= 5 ? "#55ff55" : "#ffffff";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "right";
  ctx.fillText(`🥚 ${eggsCollected}/10`, CANVAS_W - 8, 26);

  ctx.textAlign = "left";
}

// =====================================================================
// ARROW INDICATOR
// =====================================================================
function drawArrowIndicator(ctx: CanvasRenderingContext2D, dawnWorldX: number, cameraX: number) {
  const dawnSX = dawnWorldX - cameraX;
  if (dawnSX >= -20 && dawnSX <= CANVAS_W + 20) return;
  const dir = dawnSX < 0 ? -1 : 1;
  const ax = dir < 0 ? 30 : CANVAS_W - 30;
  const ay = 200;
  ctx.save();
  ctx.fillStyle = "#ffcc00";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.translate(ax, ay);
  const pulse = 0.82 + Math.sin(Date.now() * 0.005) * 0.18;
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  if (dir < 0) {
    ctx.moveTo(0, 0); ctx.lineTo(20, -12); ctx.lineTo(13, -3);
    ctx.lineTo(28, -3); ctx.lineTo(28, 3); ctx.lineTo(13, 3); ctx.lineTo(20, 12);
  } else {
    ctx.moveTo(28, 0); ctx.lineTo(8, -12); ctx.lineTo(15, -3);
    ctx.lineTo(0, -3); ctx.lineTo(0, 3); ctx.lineTo(15, 3); ctx.lineTo(8, 12);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// =====================================================================
// EGG BANNER
// =====================================================================
function drawEggBanner(ctx: CanvasRenderingContext2D, banner: { message: string; alpha: number }) {
  if (banner.alpha <= 0) return;
  const a = Math.min(banner.alpha, 1);
  ctx.save();
  ctx.globalAlpha = a;
  // Ribbon body
  const bw = 300, bh = 38, bx = (CANVAS_W - bw) / 2, by = CANVAS_H / 2 - 70;
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.roundRect(bx + 3, by + 3, bw, bh, 8); ctx.fill();
  // Main ribbon
  const ribbonGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
  ribbonGrad.addColorStop(0, "#7744bb");
  ribbonGrad.addColorStop(1, "#5522aa");
  ctx.fillStyle = ribbonGrad;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
  // Top sheen
  ctx.fillStyle = "rgba(200,150,255,0.3)";
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh / 2, [8, 8, 0, 0]); ctx.fill();
  // Ribbon tails (notch left/right)
  ctx.fillStyle = "#5522aa";
  ctx.beginPath();
  ctx.moveTo(bx, by + bh * 0.3); ctx.lineTo(bx - 12, by + bh / 2); ctx.lineTo(bx, by + bh * 0.7);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bx + bw, by + bh * 0.3); ctx.lineTo(bx + bw + 12, by + bh / 2); ctx.lineTo(bx + bw, by + bh * 0.7);
  ctx.fill();
  // Border
  ctx.strokeStyle = "#aa77ff";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.stroke();
  // Text
  ctx.fillStyle = "#ffee88";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
  ctx.fillText(banner.message, CANVAS_W / 2, by + bh * 0.65);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.restore();
}

// =====================================================================
// FLOATING HEARTS
// =====================================================================
function drawFloatingHeart(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, filled: boolean) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(alpha, 1);
  ctx.fillStyle = filled ? "#ff3355" : "rgba(255,100,120,0.3)";
  ctx.strokeStyle = "#ff6688";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 5);
  ctx.bezierCurveTo(x - 6, y - 2, x - 12, y, x - 12, y + 5);
  ctx.bezierCurveTo(-12 + x, y + 11, x, y + 16, x, y + 16);
  ctx.bezierCurveTo(x, y + 16, x + 12, y + 11, x + 12, y + 5);
  ctx.bezierCurveTo(x + 12, y, x + 6, y - 2, x, y + 5);
  ctx.fill();
  if (filled) ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// =====================================================================
// STORY CARD
// =====================================================================
function drawStoryCard(ctx: CanvasRenderingContext2D, level: number) {
  const bgColors = ["#1a6aaa", "#003366", "#1a5a10", "#330808"];
  const accentColors = ["#3399ff", "#0055cc", "#44bb22", "#cc3300"];
  ctx.fillStyle = bgColors[level - 1];
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Stripe pattern
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * 50); ctx.lineTo(CANVAS_W, i * 50); ctx.stroke();
  }
  // Card
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.beginPath(); ctx.roundRect(70, 70, 660, 305, 18); ctx.fill();
  // Card top band
  ctx.fillStyle = accentColors[level - 1];
  ctx.beginPath(); ctx.roundRect(70, 70, 660, 46, [18, 18, 0, 0]); ctx.fill();
  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`⭐ Level ${level}`, CANVAS_W / 2, 101);
  // Story text
  ctx.fillStyle = "#2a2a2a";
  ctx.font = "15px monospace";
  const lines = STORY_TEXTS[level - 1].split("\n");
  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_W / 2, 140 + i * 28);
  });
  // Prompt
  const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.fillStyle = `rgba(30,80,180,${alpha})`;
  ctx.font = "bold 17px monospace";
  ctx.fillText("[ Tap / Press Enter to Start ]", CANVAS_W / 2, CANVAS_H - 28);
  ctx.textAlign = "left";
}

// =====================================================================
// HOW TO PLAY SCREEN
// =====================================================================
function drawHowToPlay(ctx: CanvasRenderingContext2D) {
  // Blue sky background matching beach level
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  skyGrad.addColorStop(0, "#33aaff");
  skyGrad.addColorStop(0.6, "#88ddff");
  skyGrad.addColorStop(1, "#cceeff");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Clouds
  for (let i = 0; i < 4; i++) {
    drawCloud(ctx, { x: 90 + i * 215, y: 45 + (i % 2) * 25, w: 85 + (i % 3) * 22 });
  }

  // Card background
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.beginPath(); ctx.roundRect(50, 28, 700, 390, 16); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath(); ctx.roundRect(50, 28, 700, 390, 16); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(50, 28, 700, 390, 16); ctx.stroke();

  ctx.textAlign = "center";

  // Title
  ctx.fillStyle = "#ffee44";
  ctx.font = "bold 38px monospace";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
  ctx.fillText("How To Play", CANVAS_W / 2, 80);
  ctx.shadowBlur = 0;

  // Tagline
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px monospace";
  ctx.fillText("Collect 5 eggs first — then you can catch Dawn!", CANVAS_W / 2, 112);

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(90, 125); ctx.lineTo(710, 125); ctx.stroke();

  // How to Move header
  ctx.fillStyle = "#aaddff";
  ctx.font = "bold 17px monospace";
  ctx.fillText("How To Move", CANVAS_W / 2, 152);

  // Desktop controls
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffcc55";
  ctx.font = "bold 14px monospace";
  ctx.fillText("🖥  Desktop:", 100, 186);
  ctx.fillStyle = "#ffffff";
  ctx.font = "13px monospace";
  ctx.fillText("A / D  or  ◀ ▶  —  Move left / right", 120, 210);
  ctx.fillText("W  or  ▲  —  Jump  (double-jump supported!)", 120, 232);
  ctx.fillText("S  or  ▼  —  Crouch / slow down", 120, 254);

  // Mobile controls
  ctx.fillStyle = "#ffcc55";
  ctx.font = "bold 14px monospace";
  ctx.fillText("📱  Mobile:", 100, 282);
  ctx.fillStyle = "#ffffff";
  ctx.font = "13px monospace";
  ctx.fillText("◀ ▶  buttons  —  Move left / right", 120, 306);
  ctx.fillText("▲  button  —  Jump  (tap twice for double-jump!)", 120, 328);
  ctx.fillText("▼  button  —  Crouch / slow down", 120, 350);

  // Prompt
  const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = "bold 17px monospace";
  ctx.fillText("Tap to Continue  /  Press Enter to Continue", CANVAS_W / 2, CANVAS_H - 20);

  ctx.textAlign = "left";
  ctx.shadowBlur = 0;
}

// =====================================================================
// START SCREEN
// =====================================================================
function drawStartScreen(ctx: CanvasRenderingContext2D, lolaFrame: number, worldTime: number) {
  // Her title card is the whole point of this screen, so it is shown as the
  // artwork it is — full size, full opacity, centred. The previous version faded
  // it to a watermark and printed a generated "The Egg Beach" over the top, which
  // hid her hand-lettering behind a font.
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, "#7ec8f0");
  sky.addColorStop(0.62, "#bfe6f7");
  sky.addColorStop(0.63, "#123f8f");
  sky.addColorStop(0.72, "#1f5fbf");
  sky.addColorStop(0.73, "#e8c86a");
  sky.addColorStop(1, "#c8974a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (_titleArt) {
    const maxH = CANVAS_H * 0.82;
    const h = maxH;
    const w = h * (_titleArt.width / _titleArt.height);
    const x = CANVAS_W / 2 - w / 2;
    const y = CANVAS_H * 0.06 + Math.sin(worldTime * 1.1) * 3;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(_titleArt, x, y, w, h);
    ctx.restore();

    // Lola and Dawn peek in from either side of the card.
    drawLola(ctx, x - 46, CANVAS_H - 86, 1, false, lolaFrame, 0);
    drawDawn(ctx, x + w + 44, CANVAS_H - 92, -1, lolaFrame * 1.4);
  } else {
    ctx.fillStyle = "#ffcc22";
    ctx.textAlign = "center";
    ctx.font = "bold 52px monospace";
    ctx.fillText("The Egg Beach", CANVAS_W / 2, 150);
  }

  const alpha = 0.55 + Math.sin(worldTime * 3) * 0.45;
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 4;
  ctx.font = "bold 20px monospace";
  ctx.strokeText("Press ENTER or Tap to Start", CANVAS_W / 2, CANVAS_H - 16);
  ctx.fillText("Press ENTER or Tap to Start", CANVAS_W / 2, CANVAS_H - 16);
}

// =====================================================================
// GAME OVER SCREEN
// =====================================================================
function drawGameOver(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, "#1a0505");
  grad.addColorStop(1, "#330808");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (_dawnSprite) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.drawImage(_dawnSprite, CANVAS_W / 2 - 60, 240, 120, 120);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  const t = Date.now() * 0.001;
  for (let i = 0; i < 8; i++) {
    const cx = ((i * 110 + t * 20) % (CANVAS_W + 40)) - 20;
    const cy = ((t * 15 + i * 55) % CANVAS_H);
    ctx.fillStyle = `rgba(255,60,0,${0.15 + Math.sin(t + i) * 0.08})`;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#550000";
  ctx.font = "bold 58px monospace";
  ctx.fillText("GAME OVER", CANVAS_W / 2 + 3, 134);
  ctx.fillStyle = "#ff4444";
  ctx.fillText("GAME OVER", CANVAS_W / 2, 131);
  ctx.fillStyle = "#ffaaaa";
  ctx.font = "22px monospace";
  ctx.fillText("The eggs got away...", CANVAS_W / 2, 185);

  if (_eggSprite) {
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      const ex = CANVAS_W / 2 - 80 + i * 40;
      ctx.drawImage(_eggSprite, ex - 10, 200, 20, 24);
      ctx.restore();
    }
  }

  const a = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.font = "bold 18px monospace";
  ctx.fillText("Press ENTER or Tap to Try Again", CANVAS_W / 2, 380);
  ctx.textAlign = "left";
}

// =====================================================================
// WIN SCREEN
// =====================================================================
function drawWinScreen(ctx: CanvasRenderingContext2D, animTime: number) {
  // Same treatment as the title: her "You win" drawing of the barn is the reward,
  // so it is shown full size and full opacity rather than faded behind a font.
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, "#63c0ef");
  sky.addColorStop(0.75, "#bfe8fb");
  sky.addColorStop(0.76, "#54b03a");
  sky.addColorStop(1, "#2f7c22");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (_winScreen) {
    const h = CANVAS_H * 0.80;
    const w = h * (_winScreen.width / _winScreen.height);
    const pop = Math.min(1, animTime * 0.05);
    const scale = 0.85 + pop * 0.15 + Math.sin(animTime * 0.06) * 0.012;
    ctx.save();
    ctx.translate(CANVAS_W / 2, CANVAS_H * 0.5);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 7;
    ctx.drawImage(_winScreen, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Confetti in her marker colours.
  for (let i = 0; i < 46; i++) {
    const t = animTime * 0.9 + i * 37;
    const cx = (i * 97 + Math.sin(t * 0.02 + i) * 40) % CANVAS_W;
    const cy = (t * 1.6 + i * 31) % (CANVAS_H + 40) - 20;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.05 + i);
    ctx.fillStyle = ["#e8434d", "#3f7fe0", "#f2c53d", "#7b46c4", "#3fae52"][i % 5];
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 4;
  ctx.font = "bold 17px monospace";
  ctx.strokeText("Lola caught Dawn. The eggs are safe!", CANVAS_W / 2, 30);
  ctx.fillText("Lola caught Dawn. The eggs are safe!", CANVAS_W / 2, 30);

  const alpha = 0.55 + Math.sin(animTime * 0.08) * 0.45;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = "bold 18px monospace";
  ctx.strokeText("Press ENTER or Tap to Play Again", CANVAS_W / 2, CANVAS_H - 14);
  ctx.fillText("Press ENTER or Tap to Play Again", CANVAS_W / 2, CANVAS_H - 14);
}

// =====================================================================
// WORLD INITIALIZATION
// =====================================================================
function initLevel(level: number, gs: GameStateData) {
  gs.player.x = 100; gs.player.y = GROUND_Y - 40;
  gs.player.vx = 0; gs.player.vy = 0;
  gs.player.onGround = true; gs.player.jumpsLeft = 2;
  gs.player.crouching = false; gs.player.facing = 1;
  gs.player.frame = 0; gs.player.frameTime = 0;
  gs.player.coyote = 0; gs.player.jumpBuffer = 0; gs.player.squash = 0; gs.player.jumpHeld = false;

  gs.dawn.x = 360; gs.dawn.y = GROUND_Y - 35;
  gs.dawn.vx = DAWN_SPEED[level - 1]; gs.dawn.vy = 0;
  gs.dawn.onGround = true; gs.dawn.dir = 1;
  gs.dawn.frame = 0; gs.dawn.frameTime = 0; gs.dawn.reverseCooldown = 0;

  gs.cameraX = 0;
  gs.eggsCollected = 0;
  gs.hurtFlash = 0;
  gs.shake = 0;
  gs.hurtHearts = [];
  gs.eggBanner = null;
  gs.acorns = [];
  gs.lavaDrops = [];
  gs.lavaDropNextId = 0;
  gs.lavaSpawnTimer = 0;

  // Eggs (10 per level)
  gs.eggs = [];
  const usedX = new Set<number>();
  for (let i = 0; i < 10; i++) {
    let ex = 0;
    do { ex = Math.floor(Math.random() * (LEVEL_LENGTH - 500)) + 250; }
    while (usedX.has(Math.floor(ex / 80)));
    usedX.add(Math.floor(ex / 80));
    gs.eggs.push({ id: i, x: ex, y: GROUND_Y - 16, color: EGG_COLORS[i % EGG_COLORS.length], collected: false, bobOffset: Math.random() * Math.PI * 2 });
  }

  // Level-specific entities
  gs.crabs = [];
  gs.jellyfish = [];
  gs.branches = [];
  gs.roots = [];

  if (level === 1) {
    for (let i = 0; i < 9; i++) {
      const cx = 500 + i * 560 + Math.random() * 120;
      gs.crabs.push({
        x: cx, y: GROUND_Y - 10, dir: i % 2 === 0 ? 1 : -1,
        speed: 0.75 + Math.random() * 0.5,
        kind: i % 3 === 2 ? 1 : 0,
        phase: Math.random() * Math.PI * 2,
        alert: 0, pauseTimer: Math.random() * 90, homeX: cx,
      });
    }
  }
  if (level === 2) {
    for (let i = 0; i < 9; i++) gs.jellyfish.push({ x: 380 + i * 510, startY: 140 + Math.random() * 160, phase: Math.random() * Math.PI * 2, speed: 0.75 + Math.random() * 0.6 });
  }
  if (level === 3) {
    for (let i = 0; i < 11; i++) gs.branches.push({ x: 500 + i * 400, y: GROUND_Y - 70 - Math.random() * 12, w: 80 + Math.random() * 60 });
    for (let i = 0; i < 16; i++) gs.roots.push({ x: 400 + i * 290 });
    // Pre-place acorns — wider spacing, lazier speed
    for (let i = 0; i < 10; i++) {
      const ax = 500 + i * 480 + Math.random() * 80;
      gs.acorns.push({ x: ax, y: GROUND_Y - 60 - Math.random() * 100, vx: (Math.random() - 0.5) * 1.5, vy: 0 });
    }
  }
  if (level === 4) {
    // Lava drops spawned dynamically in update loop
  }

  gs.clouds = [];
  for (let i = 0; i < 8; i++) gs.clouds.push({ x: i * 210 + Math.random() * 80, y: 50 + Math.random() * 80, w: 80 + Math.random() * 65 });
  gs.bgScrollX = 0;
}

// =====================================================================
// COLLISION
// =====================================================================
function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function EggBeach() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameStateData | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const touchRef = useRef<{ left: boolean; right: boolean; jump: boolean; crouch: boolean }>({ left: false, right: false, jump: false, crouch: false });
  const justPressedRef = useRef<{ jump: boolean }>({ jump: false });
  // Damage cooldown to avoid multi-hit per frame
  const damageCooldownRef = useRef<number>(0);

  function makeInitialState(): GameStateData {
    return {
      state: "START", level: 1, lives: 10,
      eggsCollected: 0, score: 0,
      player: { x: 100, y: GROUND_Y - 40, vx: 0, vy: 0, onGround: true, jumpsLeft: 2, crouching: false, facing: 1, frameTime: 0, frame: 0, coyote: 0, jumpBuffer: 0, squash: 0, jumpHeld: false },
      dawn: { x: 360, y: GROUND_Y - 35, vx: 2.8, vy: 0, onGround: true, dir: 1, frameTime: 0, frame: 0, reverseCooldown: 0 },
      cameraX: 0, eggs: [], crabs: [], jellyfish: [], branches: [], roots: [],
      clouds: [], acorns: [], lavaDrops: [], lavaDropNextId: 0, lavaSpawnTimer: 0,
      hurtFlash: 0, shake: 0, hurtHearts: [], eggBanner: null,
      bgScrollX: 0, storyTimer: 0, winAnimTime: 0, lolaIdleFrame: 0, lolaIdleTime: 0,
    };
  }

  const startGame = useCallback(() => {
    const gs = gsRef.current!;
    gs.state = "HOW_TO_PLAY";
  }, []);

  const startLevel = useCallback(() => {
    const gs = gsRef.current!;
    gs.state = "PLAYING";
    damageCooldownRef.current = 0;
    initLevel(gs.level, gs);
  }, []);

  const nextLevel = useCallback(() => {
    const gs = gsRef.current!;
    gs.level++;
    if (gs.level > MAX_LEVELS) {
      gs.state = "WIN"; gs.winAnimTime = 0;
      playSoundLevelComplete();
    } else {
      gs.state = "STORY"; gs.storyTimer = 0;
      playSoundLevelComplete();
    }
  }, []);

  const resetGame = useCallback(() => {
    Object.assign(gsRef.current!, makeInitialState());
    damageCooldownRef.current = 0;
  }, []);

  const loseLife = useCallback(() => {
    if (damageCooldownRef.current > 0) return;
    const gs = gsRef.current!;
    gs.lives--;
    playSoundLifeLost();
    damageCooldownRef.current = 90; // ~1.5s cooldown
    // Hurt flash
    gs.hurtFlash = 1.0;
    gs.shake = 9;
    // Spawn a single floating heart group anchored above the player
    const px = gs.player.x - gs.cameraX;
    const py = gs.player.y;
    gs.hurtHearts = [{
      x: px,
      y: py - 55,
      vy: -0.8,
      alpha: 1.3,
    }];
    if (gs.lives <= 0) {
      gs.state = "GAME_OVER";
    } else {
      gs.player.x = Math.max(gs.cameraX + 60, 120);
      gs.player.y = GROUND_Y - 40;
      gs.player.vx = 0; gs.player.vy = 0;
    }
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gs = gsRef.current!;

    const dt = Math.min((timestamp - lastTimeRef.current) / 16.667, 3);
    lastTimeRef.current = timestamp;
    const worldTime = timestamp / 1000;

    // Damage cooldown tick
    if (damageCooldownRef.current > 0) damageCooldownRef.current -= dt;

    // ============ UPDATE ============
    if (gs.state === "START") {
      gs.lolaIdleTime += dt;
      if (gs.lolaIdleTime > 8) { gs.lolaIdleTime = 0; gs.lolaIdleFrame = (gs.lolaIdleFrame + 1) % 8; }
    } else if (gs.state === "WIN") {
      gs.winAnimTime += dt * 0.016;
    } else if (gs.state === "PLAYING") {
      const keys = keysRef.current;
      const touch = touchRef.current;
      const p = gs.player;
      const dawn = gs.dawn;

      // Hurt flash decay
      if (gs.hurtFlash > 0) gs.hurtFlash = Math.max(0, gs.hurtFlash - dt * 0.04);
      if (gs.shake > 0) gs.shake = Math.max(0, gs.shake - dt * 0.65);

      // Floating hearts
      gs.hurtHearts = gs.hurtHearts.map(h => ({ ...h, y: h.y + h.vy * dt, alpha: h.alpha - dt * 0.022 })).filter(h => h.alpha > 0);

      // Egg banner fade
      if (gs.eggBanner) {
        gs.eggBanner.alpha -= dt * 0.018;
        if (gs.eggBanner.alpha <= 0) gs.eggBanner = null;
      }

      // Player input
      const isUnderwater = gs.level === 2;
      const gravity = isUnderwater ? UNDERWATER_GRAVITY : GRAVITY;
      const jumpForce = isUnderwater ? UNDERWATER_JUMP_FORCE : JUMP_FORCE;

      const movingLeft = keys["a"] || keys["ArrowLeft"] || touch.left;
      const movingRight = keys["d"] || keys["ArrowRight"] || touch.right;
      const holdingJump = !!(keys["w"] || keys["ArrowUp"] || keys[" "] || touch.jump);
      const wantJump = holdingJump || justPressedRef.current.jump;
      const wantCrouch = keys["s"] || keys["ArrowDown"] || touch.crouch;
      justPressedRef.current.jump = false;

      const spd = wantCrouch ? PLAYER_SPEED * 0.5 : PLAYER_SPEED;

      // Accelerate toward the target speed instead of snapping to it, and skid
      // to a halt when nothing is held. Under water everything is draggier.
      const accel = (p.onGround ? ACCEL : AIR_ACCEL) * (isUnderwater ? 0.6 : 1);
      const friction = p.onGround ? GROUND_FRICTION : AIR_FRICTION;
      if (movingLeft) { p.vx = Math.max(p.vx - accel * dt, -spd); p.facing = -1; }
      else if (movingRight) { p.vx = Math.min(p.vx + accel * dt, spd); p.facing = 1; }
      else p.vx *= Math.pow(friction, dt);
      if (Math.abs(p.vx) < 0.05) p.vx = 0;

      p.crouching = wantCrouch && p.onGround;

      // Buffer a jump pressed slightly too early, and keep coyote time ticking
      // down after she leaves the ground.
      if (wantJump) p.jumpBuffer = JUMP_BUFFER_FRAMES;
      else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
      p.coyote = p.onGround ? COYOTE_FRAMES : Math.max(0, p.coyote - dt);

      const canGroundJump = p.onGround || p.coyote > 0;
      if (p.jumpBuffer > 0 && (canGroundJump || p.jumpsLeft > 0)) {
        // A ground jump (real or via coyote time) never eats the double jump.
        if (canGroundJump) p.jumpsLeft = 1;
        else p.jumpsLeft--;
        p.vy = jumpForce;
        p.onGround = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.squash = -0.16;  // stretch upward out of the crouch
        playSoundJump();
      }

      // Variable height: letting go early cuts the rise, so a tap is a hop.
      if (!holdingJump && p.vy < 0 && !isUnderwater) p.vy *= Math.pow(JUMP_CUTOFF, dt * 0.5);
      p.jumpHeld = holdingJump;

      p.vy += gravity * dt;
      if (isUnderwater) p.vy *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt;

      p.squash += (0 - p.squash) * 0.18 * dt;

      const groundY = GROUND_Y - 40;
      if (p.y >= groundY) {
        // Squash proportional to impact, so a big drop lands heavier.
        if (!p.onGround && p.vy > 4) p.squash = Math.min(0.32, p.vy * 0.022);
        p.y = groundY; p.vy = 0; p.onGround = true; p.jumpsLeft = 2;
      }
      if (p.y < 40) { p.y = 40; p.vy = 0; }
      if (p.x < gs.cameraX - 50) { p.x = gs.cameraX - 50; p.vx = 0; }
      if (p.x > LEVEL_LENGTH - 30) { p.x = LEVEL_LENGTH - 30; p.vx = 0; }

      p.frameTime += dt; if (p.frameTime > 4) { p.frameTime = 0; p.frame++; }

      // Dawn AI
      dawn.reverseCooldown = Math.max(0, dawn.reverseCooldown - dt);
      const distAhead = (dawn.x - p.x) * dawn.dir;
      if (distAhead < 80 && dawn.reverseCooldown <= 0) {
        dawn.dir = p.x < dawn.x ? 1 : -1; dawn.reverseCooldown = 55;
      }
      if (Math.random() < DAWN_REVERSE_PROB[gs.level - 1] * dt && dawn.reverseCooldown <= 0) {
        dawn.dir *= -1; dawn.reverseCooldown = 110;
      }
      if (Math.random() < DAWN_JUMP_PROB[gs.level - 1] * dt && dawn.onGround) {
        dawn.vy = jumpForce * 0.8; dawn.onGround = false;
      }
      dawn.vx = DAWN_SPEED[gs.level - 1] * dawn.dir;
      dawn.vy += gravity * dt;
      dawn.x += dawn.vx * dt; dawn.y += dawn.vy * dt;
      if (dawn.y >= groundY) { dawn.y = groundY; dawn.vy = 0; dawn.onGround = true; }
      if (dawn.y < 40) { dawn.y = 40; dawn.vy = 0; }
      if (dawn.x < 50) { dawn.x = 50; dawn.dir = 1; dawn.reverseCooldown = 100; }
      if (dawn.x > LEVEL_LENGTH - 100) { dawn.x = LEVEL_LENGTH - 100; dawn.dir = -1; dawn.reverseCooldown = 100; }
      dawn.frameTime += dt; if (dawn.frameTime > 3) { dawn.frameTime = 0; dawn.frame++; }

      // Camera
      const targetCam = p.x - CANVAS_W * 0.35;
      gs.cameraX += (targetCam - gs.cameraX) * 0.12 * dt;
      gs.cameraX = Math.max(0, Math.min(gs.cameraX, LEVEL_LENGTH - CANVAS_W));
      gs.bgScrollX = gs.cameraX;

      // Egg collection
      for (const egg of gs.eggs) {
        if (egg.collected) continue;
        egg.bobOffset += 0.05 * dt;
        const esX = egg.x - gs.cameraX;
        if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, esX - 9, egg.y - 12, 18, 24)) {
          egg.collected = true;
          gs.eggsCollected++;
          playSoundEggCollect();
          const remaining = 10 - gs.eggsCollected;
          gs.eggBanner = { message: remaining > 0 ? `🥚 ${remaining} egg${remaining !== 1 ? "s" : ""} remaining!` : "🥚 All eggs collected!", alpha: 1.5 };
        }
      }

      // Catch Dawn
      if (Math.abs(p.x - dawn.x) < 40 && Math.abs(p.y - dawn.y) < 60 && gs.eggsCollected >= 5) {
        nextLevel();
      }

      // L1 obstacles
      if (gs.level === 1) {
        for (const crab of gs.crabs) {
          // Notice the player, and scurry away from her rather than trundling
          // back and forth on a fixed track. Being chased off is much more fun to
          // watch than a hazard that ignores you.
          const gap = p.x - crab.x;
          const near = Math.abs(gap) < 150;
          crab.alert += ((near ? 1 : 0) - crab.alert) * 0.08 * dt;

          if (near) {
            crab.dir = gap > 0 ? -1 : 1;
            crab.x += crab.speed * 1.9 * crab.dir * dt;
            crab.pauseTimer = 20;
          } else if (crab.pauseTimer > 0) {
            // Stopped, having a look around.
            crab.pauseTimer -= dt;
          } else {
            crab.x += crab.speed * crab.dir * dt;
            // Wander near home, and occasionally stop for a beat.
            if (Math.abs(crab.x - crab.homeX) > 110) crab.dir = crab.x > crab.homeX ? -1 : 1;
            if (Math.random() < 0.004 * dt) crab.pauseTimer = 40 + Math.random() * 70;
          }

          if (crab.x < 60) { crab.x = 60; crab.dir = 1; }
          if (crab.x > LEVEL_LENGTH - 60) { crab.x = LEVEL_LENGTH - 60; crab.dir = -1; }

          const cx = crab.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, cx - 18, crab.y - 10, 36, 20)) loseLife();
        }
        // Waves are visual-only; crabs are the L1 hazard
      }

      // L2 obstacles
      if (gs.level === 2) {
        for (const jf of gs.jellyfish) {
          const jy = jf.startY + Math.sin(worldTime * jf.speed + jf.phase) * 40;
          const jx = jf.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, jx - 18, jy - 14, 36, 54)) loseLife();
        }
      }

      // L3 obstacles: branches (platforms) + roots + acorns
      if (gs.level === 3) {
        // Branches are platforms — land on top, no damage
        for (const branch of gs.branches) {
          const pWorldX = p.x;
          if (pWorldX + 10 > branch.x && pWorldX - 10 < branch.x + branch.w) {
            const playerFeetY = p.y + 32;
            if (p.vy >= 0 && playerFeetY >= branch.y && playerFeetY <= branch.y + 22) {
              p.y = branch.y - 32;
              p.vy = 0;
              p.onGround = true;
              p.jumpsLeft = 2;
            }
          }
        }
        for (const root of gs.roots) {
          const rx = root.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, rx - 5, GROUND_Y - 24, 37, 24)) loseLife();
        }
        // Update acorns (bounce physics — lazy fall)
        for (const acorn of gs.acorns) {
          acorn.vy += GRAVITY * 0.48 * dt;
          acorn.x += acorn.vx * dt;
          acorn.y += acorn.vy * dt;
          if (acorn.y >= GROUND_Y - 15) {
            acorn.y = GROUND_Y - 15;
            acorn.vy *= -0.65;
            if (Math.abs(acorn.vy) < 0.6) acorn.vy = -(1.2 + Math.random() * 1.2);
            acorn.vx += (Math.random() - 0.5) * 0.5;
          }
          // Keep in world
          if (acorn.x < 50) { acorn.x = 50; acorn.vx = Math.abs(acorn.vx); }
          if (acorn.x > LEVEL_LENGTH - 50) { acorn.x = LEVEL_LENGTH - 50; acorn.vx = -Math.abs(acorn.vx); }
          // Collision
          const ax2 = acorn.x - gs.cameraX;
          if (ax2 > -20 && ax2 < CANVAS_W + 20) {
            if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, ax2 - 9, acorn.y - 9, 18, 18)) loseLife();
          }
        }
      }

      // L4 obstacles: lava drops
      if (gs.level === 4) {
        // Spawn new drops
        gs.lavaSpawnTimer -= dt;
        if (gs.lavaSpawnTimer <= 0) {
          gs.lavaSpawnTimer = 18 + Math.random() * 22;
          const spawnX = gs.cameraX + 60 + Math.random() * (CANVAS_W - 120);
          gs.lavaDrops.push({ id: gs.lavaDropNextId++, x: spawnX, y: -20, vy: 3 + Math.random() * 2.5 });
        }
        // Update drops
        gs.lavaDrops = gs.lavaDrops.filter(ld => {
          ld.vy += 0.12 * dt;
          ld.y += ld.vy * dt;
          if (ld.y > GROUND_Y + 20) return false; // remove on floor
          const ldSX = ld.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, ldSX - 9, ld.y - 14, 18, 28)) {
            loseLife();
            return false;
          }
          return true;
        });
      }
    }

    // ============ DRAW ============
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (gs.state === "START") {
      drawStartScreen(ctx, gs.lolaIdleFrame, worldTime);
    } else if (gs.state === "HOW_TO_PLAY") {
      drawHowToPlay(ctx);
    } else if (gs.state === "STORY") {
      drawStoryCard(ctx, gs.level);
    } else if (gs.state === "GAME_OVER") {
      drawGameOver(ctx);
    } else if (gs.state === "WIN") {
      drawWinScreen(ctx, gs.winAnimTime);
    } else if (gs.state === "PLAYING") {
      // Kick the whole scene on impact. Decays fast and alternates direction, so
      // it reads as a hit rather than as the game stuttering. Applied to the world
      // only — the HUD is drawn after this is restored, so lives and the egg count
      // stay rock steady while everything else rattles.
      const shaking = gs.shake > 0.05;
      if (shaking) {
        ctx.save();
        ctx.translate(
          Math.sin(worldTime * 51) * gs.shake,
          Math.cos(worldTime * 43) * gs.shake * 0.6,
        );
      }

      drawBackground(ctx, gs.level, gs.bgScrollX, worldTime, gs.clouds, gs.cameraX);

      // L3 overlays (branches, roots) — drawn before characters
      if (gs.level === 3) {
        gs.branches.forEach(b => {
          const bsx = b.x - gs.cameraX;
          if (bsx > -100 && bsx < CANVAS_W + 100) drawBranch(ctx, b, gs.cameraX);
        });
        gs.roots.forEach(r => {
          const rsx = r.x - gs.cameraX;
          if (rsx > -50 && rsx < CANVAS_W + 50) drawRoot(ctx, r.x, gs.cameraX);
        });
      }

      // Eggs
      gs.eggs.forEach(e => {
        const esx = e.x - gs.cameraX;
        if (!e.collected && esx > -25 && esx < CANVAS_W + 25) drawEgg(ctx, { ...e, x: esx }, worldTime);
      });

      // L1: waves + crabs
      if (gs.level === 1) {
        gs.crabs.forEach(c => { const cx = c.x - gs.cameraX; if (cx > -40 && cx < CANVAS_W + 40) drawCrab(ctx, { ...c, x: cx }, worldTime); });
      }

      // L2: jellyfish
      if (gs.level === 2) {
        gs.jellyfish.forEach(jf => { const jx = jf.x - gs.cameraX; if (jx > -50 && jx < CANVAS_W + 50) drawJellyfish(ctx, { ...jf, x: jx }, worldTime); });
      }

      // L3: acorns
      if (gs.level === 3) {
        gs.acorns.forEach(a => { const ax = a.x - gs.cameraX; if (ax > -20 && ax < CANVAS_W + 20) drawAcorn(ctx, ax, a.y); });
      }

      // L4: lava drops
      if (gs.level === 4) {
        gs.lavaDrops.forEach(ld => { const ldx = ld.x - gs.cameraX; if (ldx > -20 && ldx < CANVAS_W + 20) drawLavaDrop(ctx, ldx, ld.y); });
      }

      // Lola
      const psx = gs.player.x - gs.cameraX;
      drawLola(ctx, psx, gs.player.y, gs.player.facing, gs.player.crouching, gs.player.frame, gs.hurtFlash, gs.player.vx, !gs.player.onGround, gs.player.squash);

      // Dawn
      const dsx = gs.dawn.x - gs.cameraX;
      if (dsx > -45 && dsx < CANVAS_W + 45) drawDawn(ctx, dsx, gs.dawn.y, gs.dawn.dir, gs.dawn.frame);

      // Arrow
      drawArrowIndicator(ctx, gs.dawn.x, gs.cameraX);

      // Floating hearts (HUD-space, stays at screen position)
      gs.hurtHearts.forEach(h => {
        // 2 rows of 5, centred above player
        for (let i = 0; i < 10; i++) {
          const col = i % 5;
          const row = Math.floor(i / 5);
          const hx = h.x - 55 + col * 24;
          const hy = h.y + row * 18;
          drawFloatingHeart(ctx, hx, hy, h.alpha, i < gs.lives);
        }
      });

      if (shaking) ctx.restore();

      // HUD
      drawHUD(ctx, gs.lives, gs.eggsCollected, gs.level);

      // Egg collection banner
      if (gs.eggBanner) drawEggBanner(ctx, gs.eggBanner);

      // Bottom hint
      if (gs.eggsCollected < 5) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(CANVAS_W / 2 - 148, CANVAS_H - 34, 296, 28);
        ctx.fillStyle = "#ffcc00";
        ctx.font = "13px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`Collect ${5 - gs.eggsCollected} more egg(s) to be able to catch Dawn!`, CANVAS_W / 2, CANVAS_H - 14);
        ctx.textAlign = "left";
      }
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [nextLevel, loseLife]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key === " " ? " " : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current[k] = true;
      if (k === "w" || k === "ArrowUp" || k === " ") justPressedRef.current.jump = true;
      const gs = gsRef.current!;
      if (k === "Enter" || k === " ") {
        if (gs.state === "START") startGame();
        else if (gs.state === "HOW_TO_PLAY") { gs.state = "STORY"; gs.storyTimer = 0; }
        else if (gs.state === "STORY") startLevel();
        else if (gs.state === "GAME_OVER") resetGame();
        else if (gs.state === "WIN") resetGame();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key === " " ? " " : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current[k] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [startGame, startLevel, resetGame]);

  // Canvas scale
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => {
      const scale = Math.min(parent.clientWidth / CANVAS_W, parent.clientHeight / CANVAS_H);
      canvas.style.width = `${CANVAS_W * scale}px`;
      canvas.style.height = `${CANVAS_H * scale}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Jump straight to a screen for screenshots, e.g. ?state=PLAYING&level=3.
  // Lets a change to level 3 be looked at without playing through levels 1 and 2.
  // Ignored unless both params are valid, so normal players always get the title.
  function applyDebugState(gs: GameStateData) {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("state")?.toUpperCase();
    const level = Number(params.get("level") ?? 1);

    if (level >= 1 && level <= MAX_LEVELS) gs.level = level;
    if (wanted === "PLAYING") {
      gs.state = "PLAYING";
      initLevel(gs.level, gs);
    } else if (wanted === "HOW_TO_PLAY" || wanted === "STORY" || wanted === "GAME_OVER" || wanted === "WIN") {
      gs.state = wanted;
    }
  }

  // Start loop
  useEffect(() => {
    gsRef.current = makeInitialState();
    applyDebugState(gsRef.current);
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameLoop]);

  const makeTouchHandlers = (key: keyof typeof touchRef.current) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      touchRef.current[key] = true;
      if (key === "jump") {
        justPressedRef.current.jump = true;
        const gs = gsRef.current!;
        if (gs.state === "START") startGame();
        else if (gs.state === "HOW_TO_PLAY") { gs.state = "STORY"; gs.storyTimer = 0; }
        else if (gs.state === "STORY") startLevel();
        else if (gs.state === "GAME_OVER") resetGame();
        else if (gs.state === "WIN") resetGame();
      }
    },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); touchRef.current[key] = false; },
  });

  useEffect(() => {
    const load = (src: string, cb: (img: HTMLImageElement) => void) => {
      const img = new Image();
      img.onload = () => cb(img);
      img.src = src;
    };
    load(lolaSpriteSrc, i => { _lolaSprite = i; });
    load(dawnSpriteSrc, i => { _dawnSprite = i; });
    load(eggSpriteSrc, i => { _eggSprite = i; });
    load(jellyfishSpriteSrc, i => { _jellyfishSprite = i; });
    load(crabSpriteSrc, i => { _crabSprite = i; });
    load(crabGreenSpriteSrc, i => { _crabGreenSprite = i; });
    load(titleArtSrc, i => { _titleArt = i; });
    load(winScreenSrc, i => { _winScreen = i; });
    load(bgBeachSrc, i => { _bgBeach = i; });
    load(bgOceanSrc, i => { _bgOcean = i; });
    load(bgForestSrc, i => { _bgForest = i; });
    load(bgVolcanoSrc, i => { _bgVolcano = i; });
  }, []);

  const handleCanvasTap = () => {
    const gs = gsRef.current!;
    if (gs.state === "START") startGame();
    else if (gs.state === "HOW_TO_PLAY") { gs.state = "STORY"; gs.storyTimer = 0; }
    else if (gs.state === "STORY") startLevel();
    else if (gs.state === "GAME_OVER") resetGame();
    else if (gs.state === "WIN") resetGame();
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900 overflow-hidden select-none" style={{ touchAction: "none" }}>
      <div className="relative flex items-center justify-center w-full h-full">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          className="block cursor-pointer" style={{ imageRendering: "pixelated" }}
          onClick={handleCanvasTap}
        />
      </div>

      {/* Mobile Controls */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end px-4 pb-4 pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          {(["left", "right"] as const).map(dir => (
            <button key={dir}
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-bold select-none"
              style={{ background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.3)", WebkitTapHighlightColor: "transparent" }}
              {...makeTouchHandlers(dir)}
            >{dir === "left" ? "◀" : "▶"}</button>
          ))}
        </div>
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-bold select-none"
            style={{ background: "rgba(0,0,150,0.65)", border: "2px solid rgba(100,150,255,0.5)", WebkitTapHighlightColor: "transparent" }}
            {...makeTouchHandlers("jump")}>▲</button>
          <button className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-bold select-none"
            style={{ background: "rgba(0,100,0,0.65)", border: "2px solid rgba(100,255,100,0.5)", WebkitTapHighlightColor: "transparent" }}
            {...makeTouchHandlers("crouch")}>▼</button>
        </div>
      </div>
    </div>
  );
}
