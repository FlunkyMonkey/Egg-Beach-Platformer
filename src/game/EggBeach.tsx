import { useEffect, useRef, useCallback } from "react";
import * as Sfx from "./audio";
import { compile, groundAt, surfaceUnder, solidNear, BASE_GROUND, type Terrain } from "./terrain";
import { LEVEL_BEATS, CHECKPOINT_FRACS } from "./levels";
import lolaSpriteSrc from "../assets/lola_sprite.png";
import dawnSpriteSrc from "../assets/dawn_sprite.png";
import eggSpriteSrc from "../assets/egg_sprite.png";
import jellyfishSpriteSrc from "../assets/jellyfish_sprite.png";
import crabSpriteSrc from "../assets/crab_sprite.png";
import crabGreenSpriteSrc from "../assets/crab_green_sprite.png";
import introPageSrc from "../assets/intro_page.png";
import noteDawnSrc from "../assets/note_dawn.png";
import noteEggSrc from "../assets/note_egg.png";
import pageBeachSrc from "../assets/page_beach.png";
import pageOceanSrc from "../assets/page_ocean.png";
import pageForestSrc from "../assets/page_forest.png";
import pageVolcanoSrc from "../assets/page_volcano.png";
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
let _introPage: HTMLImageElement | null = null;
let _noteDawn: HTMLImageElement | null = null;
let _noteEgg: HTMLImageElement | null = null;
let _pageBeach: HTMLImageElement | null = null;
let _pageOcean: HTMLImageElement | null = null;
let _pageForest: HTMLImageElement | null = null;
let _pageVolcano: HTMLImageElement | null = null;
let _titleArt: HTMLImageElement | null = null;
let _winScreen: HTMLImageElement | null = null;
let _bgBeach: HTMLImageElement | null = null;
let _bgOcean: HTMLImageElement | null = null;
let _bgForest: HTMLImageElement | null = null;
let _bgVolcano: HTMLImageElement | null = null;

// =====================================================================
// TYPES
// =====================================================================
type GameState = "INTRO" | "START" | "HOW_TO_PLAY" | "STORY" | "PLAYING" | "GAME_OVER" | "WIN";
/**
 * What Dawn is doing.
 *
 * She used to run at a fixed speed and flip direction on a timer, so you trailed
 * her for four levels and catching her was a collision rather than an event. Her
 * own note is the design brief: "Runs the opisit Dreson then Lola. Dose not stop
 * chtie the end. Gose kinda Fast."
 */
type DawnMood = "run" | "taunt" | "bolt" | "tired" | "stumble";
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
    mood: DawnMood;
    moodTimer: number;
    stamina: number;   // 1 = fresh, 0 = winded
    tauntFlap: number;
  };
  cameraX: number;
  cameraY: number;
  terrain: Terrain;
  checkpoints: { x: number; y: number; reached: boolean }[];
  spawnX: number;
  spawnY: number;
  invuln: number;
  dashCharges: number;
  dashTime: number;     // frames of dash remaining
  dashCooldown: number;
  dashTrail: { x: number; y: number; life: number }[];
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
  tide: number;       // L1: water surface Y
  lavaFloor: number;  // L4: rising lava surface Y
  currentPhase: number; // L2
  // FX
  hurtFlash: number;
  shake: number;
  hurtHearts: FloatingHeart[];
  eggBanner: { message: string; alpha: number } | null;
  // Meta
  bgScrollX: number;
  storyTimer: number;
  introTime: number;
  winAnimTime: number;
  lolaIdleFrame: number;
  lolaIdleTime: number;
}

// =====================================================================
// AUDIO PLACEHOLDERS
// =====================================================================
const playSoundEggCollect = Sfx.playEggCollect;
const playSoundLifeLost = Sfx.playHurt;
const playSoundLevelComplete = Sfx.playLevelComplete;

/** Second jump gets its own brighter sound so the double-jump is audible. */
function playSoundJump(jumpsLeft: number) {
  if (jumpsLeft <= 0) Sfx.playDoubleJump();
  else Sfx.playJump();
}

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
const EGG_COLORS: EggColor[] = ["red", "blue", "green", "yellow", "purple"];
const MAX_LEVELS = 4;
// Per level, not per run. Five is plenty once a death costs you a checkpoint
// rather than the whole game.
const LIVES_PER_LEVEL = 5;
// How far a crab walks either side of where it starts. Short enough that you can
// see both ends of the patrol from one screen, which is what makes it learnable.
const CRAB_PATROL = 70;

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

// Lola's drawing, carved into limbs. Values are fractions of the sprite image, read
// off her artwork: hair and face down to the shoulders, the purple dress as the
// torso, an arm hanging either side of it, and two legs ending in her sandals.
// `px`/`py` place each part's pivot inside its own slice — a shoulder at the top of
// an arm, a hip at the top of a leg — so limbs rotate about a joint rather than
// sliding around.
interface LolaPart { sx: number; sy: number; sw: number; sh: number; px: number; py: number; }
const LOLA_HEAD: LolaPart  = { sx: 0.06, sy: 0.00, sw: 0.88, sh: 0.45, px: 0.50, py: 0.94 };
// The torso takes the whole dress, and each arm only the skin either side of it.
// Slicing the arms wider drags dress pixels along, and they smear across her chest
// as the arm swings.
const LOLA_TORSO: LolaPart = { sx: 0.21, sy: 0.39, sw: 0.58, sh: 0.47, px: 0.50, py: 0.08 };
const LOLA_ARM_L: LolaPart = { sx: 0.01, sy: 0.40, sw: 0.21, sh: 0.44, px: 0.55, py: 0.09 };
const LOLA_ARM_R: LolaPart = { sx: 0.78, sy: 0.40, sw: 0.21, sh: 0.44, px: 0.45, py: 0.09 };
const LOLA_LEG_L: LolaPart = { sx: 0.22, sy: 0.76, sw: 0.30, sh: 0.24, px: 0.50, py: 0.06 };
const LOLA_LEG_R: LolaPart = { sx: 0.48, sy: 0.76, sw: 0.30, sh: 0.24, px: 0.50, py: 0.06 };

const LOLA_W = 54, LOLA_H = 94;

/** Draw one slice of her drawing, rotated about its joint. */
function drawLolaPart(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  part: LolaPart, angle: number, dx = 0, dy = 0, alpha = 1,
) {
  const sx = part.sx * img.width;
  const sy = part.sy * img.height;
  const sw = part.sw * img.width;
  const sh = part.sh * img.height;

  // Where the slice sits when the figure is at rest, with her feet at y = 0.
  const x = part.sx * LOLA_W - LOLA_W / 2;
  const y = part.sy * LOLA_H - LOLA_H;
  const w = part.sw * LOLA_W;
  const h = part.sh * LOLA_H;

  const jointX = x + w * part.px;
  const jointY = y + h * part.py;

  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(jointX + dx, jointY + dy);
  ctx.rotate(angle);
  ctx.translate(-jointX, -jointY);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/**
 * Lola, as an articulated figure rather than a single flat image.
 *
 * Her drawing is the texture for every limb — the head, dress, arms and legs are
 * slices of the same picture — so it still reads as her artwork, but the parts
 * swing from real joints. The previous version pasted the whole drawing down and
 * waggled a couple of procedural capsules beside it for arms, which is what looked
 * like a wobbling Twinkie stuck to her side.
 */
function drawLola(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  facing: number, crouching: boolean,
  frame: number, hurtFlash: number,
  speed = 0, airborne = false, squash = 0,
) {
  if (!_lolaSprite) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = hurtFlash > 0 ? "#ff5533" : "#9955ff";
    ctx.fillRect(-13, -46, 26, 46);
    ctx.restore();
    return;
  }

  const effort = Math.min(1, Math.abs(speed) / PLAYER_SPEED);
  const cycle = frame * 0.62;

  // Legs and arms swing in opposite phase, the way a stride actually balances.
  const stride = effort * 0.72;
  const legSwing = Math.sin(cycle) * stride;
  const armSwing = -Math.sin(cycle) * (0.14 + stride * 0.62);

  // Body rises and falls twice per stride, and leans into the run.
  const bounce = airborne ? 0 : -Math.abs(Math.sin(cycle)) * effort * 3.2;
  const lean = airborne ? 0.06 : effort * 0.13;

  ctx.save();
  ctx.translate(x, y + 40);
  ctx.scale(facing * 1.06, 1.06);

  const crouchScale = crouching ? 0.74 : 1;
  ctx.scale(1 + squash * 0.45, crouchScale * (1 - squash));

  if (hurtFlash > 0) {
    // Tint by drawing her twice; the second pass is clipped to her own pixels.
    ctx.globalAlpha = 1;
  }

  ctx.translate(0, bounce);
  ctx.rotate(lean * (airborne ? 1 : 1));

  if (airborne) {
    // Tuck one leg, trail the other, and throw both arms up.
    drawLolaPart(ctx, _lolaSprite, LOLA_ARM_L, -1.15);
    drawLolaPart(ctx, _lolaSprite, LOLA_LEG_L, -0.55);
    drawLolaPart(ctx, _lolaSprite, LOLA_LEG_R, 0.32);
    drawLolaPart(ctx, _lolaSprite, LOLA_TORSO, 0);
    drawLolaPart(ctx, _lolaSprite, LOLA_HEAD, -0.02);
    drawLolaPart(ctx, _lolaSprite, LOLA_ARM_R, 1.05);
  } else {
    // Far side first so the near arm and leg overlap the body.
    drawLolaPart(ctx, _lolaSprite, LOLA_ARM_L, -armSwing, 0, 0, 0.82);
    drawLolaPart(ctx, _lolaSprite, LOLA_LEG_L, -legSwing, 0, 0, 0.86);
    drawLolaPart(ctx, _lolaSprite, LOLA_TORSO, 0);
    drawLolaPart(ctx, _lolaSprite, LOLA_LEG_R, legSwing);
    drawLolaPart(ctx, _lolaSprite, LOLA_HEAD, Math.sin(cycle * 2) * effort * 0.02, 0, -Math.abs(Math.sin(cycle)) * effort * 0.6);
    drawLolaPart(ctx, _lolaSprite, LOLA_ARM_R, armSwing);
  }

  if (hurtFlash > 0) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = Math.min(hurtFlash * 2, 0.55);
    ctx.fillStyle = "#ff2200";
    ctx.fillRect(-LOLA_W, -LOLA_H - 10, LOLA_W * 2, LOLA_H + 20);
  }

  ctx.restore();
}

function drawDawn(
  ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, frame: number,
  mood: DawnMood = "run", worldTime = 0,
) {
  ctx.save();
  ctx.translate(x, y + 27);

  // Her mood has to be readable at a glance or the chase AI is invisible.
  if (mood === "stumble") {
    // Tipped over, legs in the air.
    ctx.rotate(Math.sin(worldTime * 22) * 0.12 - dir * 0.55);
  } else if (mood === "bolt") {
    ctx.rotate(dir * 0.20);              // leaning into the sprint
  } else if (mood === "tired") {
    ctx.translate(0, Math.abs(Math.sin(worldTime * 5)) * 2);  // panting
  }

  // Taunting means turning round to look at you, so the flip is deliberate.
  const facing = mood === "taunt" ? -dir : dir;
  ctx.scale(facing * 1.5, 1.5);
  ctx.translate(0, -27);

  const legBob = Math.sin(frame * 1.2) * 4;

  if (_dawnSprite) {
    ctx.fillStyle = "#ffbb22";
    ctx.fillRect(-5, 18, 4, 8 + legBob);
    ctx.fillRect(1, 18, 4, 8 - legBob);
    ctx.fillRect(-7, 24 + legBob * 0.3, 8, 3);
    ctx.fillRect(1, 24 - legBob * 0.3, 8, 3);

    const dw = 48, dh = dw * (_dawnSprite.height / _dawnSprite.width);
    const bodyBob = Math.sin(frame * 1.2) * 1.5;
    const wingFlap = mood === "taunt"
      ? Math.sin(worldTime * 16) * 0.34      // gloating flap
      : mood === "bolt"
        ? Math.sin(frame * 2.6) * 0.16
        : Math.sin(frame * 1.2) * 0.08;
    ctx.save();
    ctx.rotate(wingFlap);

    // Dawn is a white hen drawn as an open outline — the strokes never close, so
    // there is no enclosed region to fill when her sprite is cut out, and she came
    // out as a see-through wireframe over the scenery. Her body is painted here
    // instead, behind the strokes, which keeps the drawing exactly as she made it.
    const by = -dh / 2 - 4 + bodyBob;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#fdfbf3";
    ctx.beginPath();
    ctx.ellipse(-1, by + dh * 0.52, dw * 0.34, dh * 0.26, -0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-dw * 0.20, by + dh * 0.34, dw * 0.17, dh * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(_dawnSprite, -dw / 2, by, dw, dh);
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

  // Halo. Her egg is pale marker on white paper, so on bright sand it had almost
  // no edge contrast. A warm glow alone does not solve it — warm on yellow sand is
  // still low contrast — so the halo is paired with a hard dark rim below, which
  // works on sand, water, bark and ash alike.
  const halo = ctx.createRadialGradient(egg.x, by, 3, egg.x, by, 26);
  halo.addColorStop(0, `rgba(255,248,205,${0.42 + twinkle * 0.24})`);
  halo.addColorStop(1, "rgba(255,240,170,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(egg.x, by, 26, 0, Math.PI * 2); ctx.fill();

  if (_eggSprite) {
    const ew = 30, eh = ew * (_eggSprite.height / _eggSprite.width);

    // Sticker outline: a dark oval a little larger than the egg, so its silhouette
    // separates from whatever is behind it.
    ctx.fillStyle = "rgba(58,34,8,0.92)";
    ctx.beginPath();
    ctx.ellipse(egg.x, by, ew * 0.53, eh * 0.53, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(_eggSprite, egg.x - ew / 2, by - eh / 2, ew, eh);
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
// Ground colours per level, sampled from her drawings so the solid terrain reads
// as part of the same picture rather than as a grey box sitting on top of it.
const TERRAIN_COLOURS = [
  { top: "#e8c451", face: "#c99a34", edge: "#8a6417" },  // beach sand
  { top: "#cbb072", face: "#9a8350", edge: "#6a5833" },  // sea floor
  { top: "#7fbf3a", face: "#5b8a26", edge: "#33511a" },  // forest floor
  { top: "#5a4a45", face: "#33282a", edge: "#170f10" },  // volcanic rock
];

/**
 * The solid ground, drawn as a foreground layer over her backdrop.
 *
 * The background art still supplies the horizon, but the surface the player
 * actually stands on now has shape — ledges, steps and holes — so it has to be
 * drawn rather than implied by the drawing behind it.
 */
function drawTerrain(ctx: CanvasRenderingContext2D, gs: GameStateData) {
  const c = TERRAIN_COLOURS[gs.level - 1];
  const camX = gs.cameraX;
  const camY = 0;  // vertical scroll is applied by a transform around the world

  for (const span of gs.terrain.spans) {
    const x0 = span.x0 - camX;
    const x1 = span.x1 - camX;
    if (x1 < -40 || x0 > CANVAS_W + 40) continue;

    if (span.top === null) {
      // A hole: darkness, so it reads as somewhere you must not be.
      const g = ctx.createLinearGradient(0, BASE_GROUND - camY, 0, CANVAS_H);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = g;
      ctx.fillRect(x0, BASE_GROUND - camY - 4, x1 - x0, CANVAS_H);
      continue;
    }

    const top = span.top - camY;

    // Part-transparent body, so the sand and forest floor she painted still show
    // through the solid ground instead of being covered by a flat slab.
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = c.face;
    ctx.fillRect(x0, top, x1 - x0, CANVAS_H - top + camY + 40);
    ctx.restore();

    // The cap is opaque: this is the line the eye reads as "stand here", and it
    // is the one part that must not be ambiguous.
    ctx.fillStyle = c.top;
    ctx.fillRect(x0, top, x1 - x0, 8);
    ctx.fillStyle = c.edge;
    ctx.fillRect(x0, top + 8, x1 - x0, 2);

    // Loose speckle along the surface so the cap is not a ruler-straight bar.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.edge;
    for (let sx = Math.max(x0, -20); sx < Math.min(x1, CANVAS_W + 20); sx += 17) {
      const j = ((Math.sin(sx * 12.9898) * 43758.5453) % 1 + 1) % 1;
      ctx.fillRect(sx + j * 6, top + 11 + j * 4, 3, 2);
    }
    ctx.restore();

    // Vertical sides where the height steps, so ledges have a silhouette.
    ctx.fillStyle = c.edge;
    ctx.fillRect(x0 - 1, top, 2, 6);
    ctx.fillRect(x1 - 1, top, 2, 6);
  }
}

/** The tide (level 1) and the rising lava (level 4), drawn over the world. */
function drawLevelHazardSurface(ctx: CanvasRenderingContext2D, gs: GameStateData, worldTime: number) {
  if (gs.level === 1) {
    const y = gs.tide;
    const g = ctx.createLinearGradient(0, y - 10, 0, y + 160);
    g.addColorStop(0, "rgba(60,150,225,0.46)");
    g.addColorStop(1, "rgba(15,60,140,0.70)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, CANVAS_W, CANVAS_H + 200);

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= CANVAS_W; x += 8) {
      const wy = y + Math.sin(x * 0.035 + worldTime * 2.4) * 3;
      if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  } else if (gs.level === 4) {
    const y = gs.lavaFloor;
    if (y > CANVAS_H + 320) return;
    const g = ctx.createLinearGradient(0, y - 14, 0, y + 130);
    g.addColorStop(0, "rgba(255,220,90,0.95)");
    g.addColorStop(0.25, "rgba(240,90,20,0.95)");
    g.addColorStop(1, "rgba(120,15,5,0.98)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, CANVAS_W, CANVAS_H + 320);

    ctx.strokeStyle = "rgba(255,240,170,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= CANVAS_W; x += 7) {
      const wy = y + Math.sin(x * 0.05 + worldTime * 3.4) * 4;
      if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    for (let i = 0; i < 10; i++) {
      const ex = ((i * 91 + worldTime * 22) % (CANVAS_W + 40)) - 20;
      const ey = y - 6 - ((worldTime * 34 + i * 29) % 70);
      ctx.fillStyle = `rgba(255,${140 + (i % 4) * 20},50,${0.7 - (y - ey) / 100})`;
      ctx.beginPath(); ctx.arc(ex, ey, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Checkpoint nests. Bright once banked, so progress is legible at a glance. */
function drawCheckpoint(ctx: CanvasRenderingContext2D, x: number, y: number, reached: boolean, worldTime: number) {
  ctx.save();
  ctx.translate(x, y);
  const bob = reached ? Math.sin(worldTime * 3) * 2 : 0;

  ctx.strokeStyle = reached ? "#7a4a1c" : "#6a5a52";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -6, 16, 7, 0, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = reached ? "#8a5a24" : "#6f625b";
  ctx.beginPath();
  ctx.ellipse(0, -5, 16, 8, 0, 0, Math.PI);
  ctx.fill();

  if (_eggSprite) {
    const w = reached ? 22 : 18;
    const h = w * (_eggSprite.height / _eggSprite.width);
    ctx.globalAlpha = reached ? 1 : 0.45;
    ctx.drawImage(_eggSprite, -w / 2, -h - 2 + bob, w, h);
    ctx.globalAlpha = 1;
  }

  if (reached) {
    const glow = ctx.createRadialGradient(0, -14, 2, 0, -14, 30);
    glow.addColorStop(0, "rgba(255,235,150,0.35)");
    glow.addColorStop(1, "rgba(255,225,120,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, -14, 30, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, lives: number, eggsCollected: number, level: number, dashCharges = 0) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, CANVAS_W, 40);
  // Bottom edge glow
  ctx.fillStyle = "rgba(255,200,50,0.12)";
  ctx.fillRect(0, 38, CANVAS_W, 2);

  // Dash charges, so the reward for collecting is visible while you play.
  if (dashCharges > 0) {
    ctx.save();
    ctx.textAlign = "left";
    for (let i = 0; i < dashCharges; i++) {
      const bx = CANVAS_W / 2 - 108 + i * 17;
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.moveTo(bx + 6, 10); ctx.lineTo(bx, 21); ctx.lineTo(bx + 5, 21);
      ctx.lineTo(bx + 2, 30); ctx.lineTo(bx + 11, 18); ctx.lineTo(bx + 6, 18);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Muted indicator, so a silent game is obviously a choice and not a fault.
  if (Sfx.isMuted()) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "bold 11px monospace";
    ctx.fillText("MUTED (M)", CANVAS_W / 2 + 74, 24);
    ctx.restore();
  }

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
const LEVEL_NAMES = ["Beach", "Ocean", "Forest", "Volcano"];

/**
 * The card before each level: the page she drew it from, then the story.
 *
 * Showing the source sketch here is the same idea as the intro — the levels are
 * her drawings, so the drawing goes on screen right before you walk into it. On
 * level one her own instruction for the eggs is shown alongside, because it is a
 * real gameplay hint and she wrote it.
 */
function drawStoryCard(ctx: CanvasRenderingContext2D, level: number) {
  const page = [_pageBeach, _pageOcean, _pageForest, _pageVolcano][level - 1];
  const accent = ["#3399ff", "#0055cc", "#44bb22", "#cc5500"][level - 1];

  ctx.fillStyle = "#12101a";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // The page again, blurred and dimmed, as the backdrop it is sitting on.
  if (page) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.filter = "blur(24px) brightness(0.42)";
    const bw = CANVAS_W * 1.25;
    const bh = bw * (page.height / page.width);
    ctx.drawImage(page, CANVAS_W / 2 - bw / 2, CANVAS_H / 2 - bh / 2, bw, bh);
    ctx.restore();
  }

  // The sketch itself, pinned slightly askew like it is lying on a desk.
  let pageRight = 60;
  if (page) {
    const ph = 316;
    const pw = ph * (page.width / page.height);
    const cx = 40 + pw / 2;
    ctx.save();
    ctx.translate(cx, CANVAS_H / 2 - 12);
    ctx.rotate(-0.03);
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(page, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();
    pageRight = 40 + pw;
  }

  const tx = pageRight + 34;
  const tw = CANVAS_W - tx - 34;

  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "bold 12px monospace";
  ctx.fillText("THE DRAWING THIS LEVEL CAME FROM", tx, 74);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px monospace";
  ctx.fillText(`${level}. ${LEVEL_NAMES[level - 1]}`, tx, 110);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tx, 122); ctx.lineTo(tx + 92, 122); ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "13px monospace";
  STORY_TEXTS[level - 1].split("\n").forEach((line, i) => {
    ctx.fillText(line, tx, 154 + i * 21);
  });

  // Her own note about the eggs, shown once, on the level where it applies.
  if (level === 1 && _noteEgg) {
    const nw = Math.min(tw, 250);
    const nh = nw * (_noteEgg.height / _noteEgg.width);
    const ny = CANVAS_H - 108;
    ctx.save();
    ctx.translate(tx + nw / 2, ny);
    ctx.rotate(0.02);
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(_noteEgg, -nw / 2, -nh / 2, nw, nh);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "11px monospace";
    ctx.fillText("— her rule for the eggs", tx, ny + nh / 2 + 16);
  }

  const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = "bold 15px monospace";
  ctx.fillText("Tap  /  Press Enter to Start", CANVAS_W / 2, CANVAS_H - 16);
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

  ctx.fillStyle = "#ffcc55";
  ctx.font = "bold 13px monospace";
  ctx.fillText("🔊  M  —  mute / unmute the sound", 100, 378);

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
// Beat boundaries for the intro, in seconds.
const INTRO_PAGE_IN = 1.0;
const INTRO_NOTE_IN = 1.5;
const INTRO_NOTE_OUT = 4.2;
const INTRO_RISE = 4.4;
const INTRO_RISE_END = 6.0;
const INTRO_DISSOLVE = 6.4;
const INTRO_END = 7.8;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Ease in and out, so nothing in the intro starts or stops abruptly. */
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * The opening: her sketchbook, and then her drawing getting up off the page.
 *
 * The whole point is to show that the game is literally made of her paper — so it
 * opens on the unretouched photograph, binding and paper edge included, holds long
 * enough to be recognised, shows the rules she wrote in her own handwriting, and
 * only then lets the drawing peel off and become a character.
 */
function drawIntro(ctx: CanvasRenderingContext2D, t: number, frame: number) {
  ctx.fillStyle = "#0d0b14";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const pageIn = smooth(0, INTRO_PAGE_IN, t);
  const dissolve = smooth(INTRO_DISSOLVE, INTRO_END, t);

  // The beach bleeds through underneath as the page dissolves away.
  if (dissolve > 0) {
    ctx.save();
    ctx.globalAlpha = dissolve;
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, "#7ec8f0");
    sky.addColorStop(0.62, "#bfe6f7");
    sky.addColorStop(0.63, "#123f8f");
    sky.addColorStop(0.73, "#e8c86a");
    sky.addColorStop(1, "#c8974a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }

  if (!_introPage) return;

  // The page is portrait and the screen is wide, so there is always space either
  // side. Filling it with a blurred, darkened copy of the same photo reads as a
  // table the sketchbook is lying on, rather than as black bars.
  ctx.save();
  ctx.globalAlpha = pageIn * 0.55 * (1 - dissolve * 0.7);
  ctx.filter = "blur(26px) brightness(0.45)";
  const bw = CANVAS_W * 1.2;
  const bh = bw * (_introPage.height / _introPage.width);
  ctx.drawImage(_introPage, CANVAS_W / 2 - bw / 2, CANVAS_H / 2 - bh / 2, bw, bh);
  ctx.restore();

  // Slow push in across the whole sequence — barely perceptible, but it stops the
  // held photograph feeling like a frozen error.
  const zoom = 1.0 + 0.06 * clamp01(t / INTRO_END);
  const ph = CANVAS_H * 0.92 * zoom;
  const pw = ph * (_introPage.width / _introPage.height);
  const px = CANVAS_W / 2 - pw / 2;
  const py = CANVAS_H / 2 - ph / 2;

  // Deliberately NOT faded out: the start screen shows this same card, so holding
  // the page through the dissolve makes the hand-off continuous instead of the art
  // blinking away and immediately reappearing.
  ctx.save();
  ctx.globalAlpha = pageIn;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  ctx.drawImage(_introPage, px, py, pw, ph);
  ctx.restore();

  // Her note, laid on the page like a scrap of paper.
  const noteIn = smooth(INTRO_NOTE_IN, INTRO_NOTE_IN + 0.7, t);
  const noteOut = smooth(INTRO_NOTE_OUT, INTRO_NOTE_OUT + 0.6, t);
  if (_noteDawn && noteIn > 0 && noteOut < 1) {
    const nw = CANVAS_W * 0.56;
    const nh = nw * (_noteDawn.height / _noteDawn.width);
    ctx.save();
    ctx.globalAlpha = noteIn * (1 - noteOut);
    ctx.translate(CANVAS_W / 2, CANVAS_H * 0.78 + (1 - noteIn) * 40);
    ctx.rotate(-0.035);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(_noteDawn, -nw / 2, -nh / 2, nw, nh);
    ctx.restore();
  }

  // The drawing gets up. She starts flattened onto the paper and stands into the
  // rig, so the moment reads as the picture becoming the character.
  const rise = smooth(INTRO_RISE, INTRO_RISE_END, t);
  if (rise > 0 && _lolaSprite) {
    const feetY = py + ph * 0.86;
    const lx = CANVAS_W / 2 - pw * 0.16;

    ctx.save();
    ctx.globalAlpha = 1 - dissolve * 0.35;
    ctx.fillStyle = `rgba(0,0,0,${0.10 + rise * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(lx, feetY + 2, 20 * rise + 8, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(lx, feetY);
    ctx.scale(1, 0.08 + 0.92 * rise);
    ctx.translate(-lx, -feetY);
    drawLola(ctx, lx, feetY - 40, 1, false, frame, 0, rise * PLAYER_SPEED, false, 0);
    ctx.restore();
  }

  // Dawn breaks away and flaps off the top of the page — the chase starting.
  const flee = smooth(INTRO_RISE_END - 0.5, INTRO_END, t);
  if (flee > 0 && _dawnSprite) {
    ctx.save();
    ctx.globalAlpha = 1 - flee * 0.85;
    drawDawn(
      ctx,
      CANVAS_W / 2 + pw * 0.10 + flee * 210,
      py + ph * 0.80 - flee * 190,
      1,
      frame * 2.2,
    );
    ctx.restore();
  }

  // A crab scuttles across the paper and off the edge.
  const scuttle = smooth(INTRO_RISE - 0.6, INTRO_END - 0.4, t);
  if (scuttle > 0 && scuttle < 1 && _crabSprite) {
    drawCrab(
      ctx,
      {
        x: px + pw * 0.12 + scuttle * pw * 0.95,
        y: py + ph * 0.90,
        dir: 1, speed: 1, kind: 0, phase: 0, alert: 0, pauseTimer: 0, homeX: 0,
      },
      t,
    );
  }

  const prompt = 0.4 + Math.sin(t * 4) * 0.25;
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(255,255,255,${prompt * (1 - dissolve)})`;
  ctx.font = "bold 12px monospace";
  ctx.fillText("press any key to skip", CANVAS_W / 2, CANVAS_H - 12);
}

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
  // Terrain first: everything else is placed relative to where the ground is.
  gs.terrain = compile(LEVEL_BEATS[level - 1]);
  gs.checkpoints = CHECKPOINT_FRACS.map(f => {
    const spot = solidNear(gs.terrain, gs.terrain.length * f);
    return { x: spot ? spot.x : gs.terrain.length * f, y: spot ? spot.top : BASE_GROUND, reached: false };
  });
  gs.spawnX = 100;
  gs.spawnY = (groundAt(gs.terrain, 100) ?? BASE_GROUND) - 40;
  gs.invuln = 0;
  gs.cameraY = 0;
  gs.dashCharges = 0; gs.dashTime = 0; gs.dashCooldown = 0; gs.dashTrail = [];
  gs.lives = LIVES_PER_LEVEL;

  gs.player.x = gs.spawnX; gs.player.y = gs.spawnY;
  gs.player.vx = 0; gs.player.vy = 0;
  gs.player.onGround = true; gs.player.jumpsLeft = 2;
  gs.player.crouching = false; gs.player.facing = 1;
  gs.player.frame = 0; gs.player.frameTime = 0;
  gs.player.coyote = 0; gs.player.jumpBuffer = 0; gs.player.squash = 0; gs.player.jumpHeld = false;

  gs.dawn.x = 360; gs.dawn.y = (groundAt(gs.terrain, 360) ?? BASE_GROUND) - 35;
  gs.dawn.vx = DAWN_SPEED[level - 1]; gs.dawn.vy = 0;
  gs.dawn.onGround = true; gs.dawn.dir = 1;
  gs.dawn.frame = 0; gs.dawn.frameTime = 0; gs.dawn.reverseCooldown = 0;
  gs.dawn.mood = "run"; gs.dawn.moodTimer = 0; gs.dawn.stamina = 1; gs.dawn.tauntFlap = 0;

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
  gs.tide = BASE_GROUND + 40;
  // Starts well below the level and climbs. Reset per life so a checkpoint is a
  // genuine reprieve rather than dropping you back into the fire.
  gs.lavaFloor = BASE_GROUND + 120;
  gs.currentPhase = 0;

  // Eggs. Every other one goes on a platform, so collecting is a reason to climb
  // rather than something that happens while walking. Her note says to collect
  // them by jumping on them, which only becomes true once they are off the floor.
  gs.eggs = [];
  const plats = [...gs.terrain.platforms];
  for (let i = 0; i < 10; i++) {
    const wantPlatform = i % 2 === 1 && plats.length > 0;
    let ex: number, ey: number;
    if (wantPlatform) {
      const pl = plats.splice(Math.floor(Math.random() * plats.length), 1)[0];
      ex = (pl.x0 + pl.x1) / 2;
      ey = pl.top - 18;
    } else {
      const target = 300 + (i / 10) * (gs.terrain.length - 700) + Math.random() * 160;
      const spot = solidNear(gs.terrain, target);
      ex = spot ? spot.x : target;
      ey = (spot ? spot.top : BASE_GROUND) - 16;
    }
    gs.eggs.push({ id: i, x: ex, y: ey, color: EGG_COLORS[i % EGG_COLORS.length], collected: false, bobOffset: Math.random() * Math.PI * 2 });
  }

  // Level-specific entities
  gs.crabs = [];
  gs.jellyfish = [];
  gs.branches = [];
  gs.roots = [];

  if (level === 1) {
    for (let i = 0; i < 9; i++) {
      const want = 500 + i * (gs.terrain.length - 900) / 9 + Math.random() * 90;
      const spot = solidNear(gs.terrain, want);
      // Skip anywhere too narrow to pace back and forth in.
      const span = gs.terrain.spans.find(sp => spot && sp.x0 <= spot.x && sp.x1 > spot.x);
      if (!spot || !span || span.x1 - span.x0 < CRAB_PATROL * 2 + 60) continue;
      const cx = spot ? spot.x : want;
      gs.crabs.push({
        x: cx, y: (spot ? spot.top : BASE_GROUND) - 10, dir: i % 2 === 0 ? 1 : -1,
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
    // The branches ARE the platforms — drawing them from the terrain is what makes
    // the forest climbable instead of decorated.
    for (const pl of gs.terrain.platforms) {
      gs.branches.push({ x: pl.x0, y: pl.top, w: pl.x1 - pl.x0 });
    }
    for (let i = 0; i < 14; i++) {
      const spot = solidNear(gs.terrain, 400 + i * (gs.terrain.length - 700) / 14);
      if (spot) gs.roots.push({ x: spot.x });
    }
    // Pre-place acorns — wider spacing, lazier speed
    for (let i = 0; i < 10; i++) {
      const ax = 500 + i * 480 + Math.random() * 80;
      gs.acorns.push({ x: ax, y: -40 - Math.random() * 320, vx: (Math.random() - 0.5) * 1.2, vy: 0 });
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
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const dashBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastTimeRef = useRef<number>(0);
  const touchRef = useRef<{ left: boolean; right: boolean; jump: boolean; crouch: boolean; dash: boolean }>({ left: false, right: false, jump: false, crouch: false, dash: false });
  const justPressedRef = useRef<{ jump: boolean }>({ jump: false });
  // Damage cooldown to avoid multi-hit per frame
  const damageCooldownRef = useRef<number>(0);

  function makeInitialState(): GameStateData {
    return {
      state: "INTRO", level: 1, lives: LIVES_PER_LEVEL,
      eggsCollected: 0, score: 0,
      player: { x: 100, y: GROUND_Y - 40, vx: 0, vy: 0, onGround: true, jumpsLeft: 2, crouching: false, facing: 1, frameTime: 0, frame: 0, coyote: 0, jumpBuffer: 0, squash: 0, jumpHeld: false },
      dawn: { x: 360, y: GROUND_Y - 35, vx: 2.8, vy: 0, onGround: true, dir: 1, frameTime: 0, frame: 0, reverseCooldown: 0, mood: "run", moodTimer: 0, stamina: 1, tauntFlap: 0 },
      cameraX: 0, cameraY: 0,
      terrain: compile(LEVEL_BEATS[0]),
      checkpoints: [], spawnX: 100, spawnY: BASE_GROUND - 40, invuln: 0,
      dashCharges: 0, dashTime: 0, dashCooldown: 0, dashTrail: [],
      eggs: [], crabs: [], jellyfish: [], branches: [], roots: [],
      clouds: [], acorns: [], lavaDrops: [], lavaDropNextId: 0, lavaSpawnTimer: 0,
      tide: BASE_GROUND + 40, lavaFloor: BASE_GROUND + 120, currentPhase: 0,
      hurtFlash: 0, shake: 0, hurtHearts: [], eggBanner: null,
      bgScrollX: 0, storyTimer: 0, introTime: 0, winAnimTime: 0, lolaIdleFrame: 0, lolaIdleTime: 0,
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
      Sfx.playWin();
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
    const gs = gsRef.current!;
    if (damageCooldownRef.current > 0 || gs.invuln > 0) return;
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
      Sfx.playGameOver();
    } else {
      // Back to the last checkpoint, not to wherever you happened to be — falling
      // down a hole used to drop you at the camera edge, which could be over the
      // same hole.
      gs.player.x = gs.spawnX;
      gs.player.y = gs.spawnY;
      gs.player.vx = 0; gs.player.vy = 0;
      gs.player.jumpsLeft = 2;
      gs.invuln = 110;
      // Give the lava back the ground it took, or a respawn is instant death.
      gs.lavaFloor = Math.max(gs.lavaFloor, gs.spawnY + 150);
      gs.cameraX = Math.max(0, Math.min(gs.spawnX - CANVAS_W * 0.35, gs.terrain.length - CANVAS_W));
    }
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gs = gsRef.current!;

    // Clamped at both ends. The upper bound stops a long stall teleporting
    // everything through walls; the lower bound matters because a timestamp that
    // arrives behind the last one yields a negative dt, which runs every lerp in
    // the game backwards — the camera drove itself off down the level.
    const dt = Math.max(0, Math.min((timestamp - lastTimeRef.current) / 16.667, 3));
    lastTimeRef.current = timestamp;
    const worldTime = timestamp / 1000;

    // Damage cooldown tick
    if (damageCooldownRef.current > 0) damageCooldownRef.current -= dt;

    // ============ UPDATE ============
    if (gs.state === "INTRO") {
      const was = gs.introTime;
      gs.introTime += dt / 60;
      const crossed = (mark: number) => was < mark && gs.introTime >= mark;
      if (crossed(0.15)) Sfx.playPaperRustle();
      if (crossed(INTRO_NOTE_IN)) Sfx.playPaperRustle();
      if (crossed(INTRO_RISE)) Sfx.playMagic();
      if (crossed(INTRO_RISE_END - 0.4)) Sfx.playCluck();
      if (gs.introTime >= INTRO_END) gs.state = "START";
    } else if (gs.state === "START") {
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
      if (gs.invuln > 0) gs.invuln = Math.max(0, gs.invuln - dt);

      // Bank progress on reaching a checkpoint.
      for (const cp of gs.checkpoints) {
        if (!cp.reached && gs.player.x >= cp.x) {
          cp.reached = true;
          gs.spawnX = cp.x;
          gs.spawnY = cp.y - 40;
          gs.eggBanner = { message: "✓ Checkpoint!", alpha: 1.5 };
          Sfx.playLevelComplete();
        }
      }

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
      const wantDash = keys["Shift"] || keys["e"] || touch.dash;
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

      p.crouching = wantCrouch && p.onGround && gs.dashTime <= 0;

      // Dash: a burst that closes distance on Dawn. Spending a charge is the
      // decision the eggs now buy you.
      gs.dashCooldown = Math.max(0, gs.dashCooldown - dt);
      if (wantDash && gs.dashCharges > 0 && gs.dashTime <= 0 && gs.dashCooldown <= 0) {
        gs.dashCharges--;
        gs.dashTime = 17;
        gs.dashCooldown = 34;
        p.vx = p.facing * PLAYER_SPEED * 2.9;
        Sfx.playMagic();
      }
      if (gs.dashTime > 0) {
        gs.dashTime -= dt;
        p.vx = p.facing * PLAYER_SPEED * 2.9;
        p.vy = Math.min(p.vy, 1.2);      // hold her up a little so it reads as a lunge
        gs.dashTrail.push({ x: p.x, y: p.y, life: 1 });
      }
      gs.dashTrail = gs.dashTrail
        .map(t => ({ ...t, life: t.life - dt * 0.055 }))
        .filter(t => t.life > 0);

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
        playSoundJump(p.jumpsLeft);
      }

      // Variable height: letting go early cuts the rise, so a tap is a hop.
      if (!holdingJump && p.vy < 0 && !isUnderwater) p.vy *= Math.pow(JUMP_CUTOFF, dt * 0.5);
      p.jumpHeld = holdingJump;

      p.vy += gravity * dt;
      if (isUnderwater) p.vy *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt;

      p.squash += (0 - p.squash) * 0.18 * dt;

      // Land on whatever surface is under her — terrain or a one-way platform.
      const surf = surfaceUnder(gs.terrain, p.x, p.y + 40, p.vy);
      const wasAirborne = !p.onGround;
      if (surf !== null && p.y >= surf - 40) {
        if (wasAirborne && p.vy > 4) {
          p.squash = Math.min(0.32, p.vy * 0.022);
          Sfx.playLand();
        }
        p.y = surf - 40; p.vy = 0; p.onGround = true; p.jumpsLeft = 2;
      } else {
        p.onGround = false;
      }

      // Fallen down a hole.
      if (p.y > CANVAS_H + 120) loseLife();
      if (p.y < 40) { p.y = 40; p.vy = 0; }
      // Keep her inside the level, not inside the camera. Clamping to the camera
      // meant that any time the view drifted ahead it shoved the player forward,
      // which fed back into the camera and walked her across the level on her own
      // with no input at all.
      if (p.x < 24) { p.x = 24; if (p.vx < 0) p.vx = 0; }
      if (p.x > gs.terrain.length - 40) { p.x = gs.terrain.length - 40; p.vx = 0; }

      p.frameTime += dt; if (p.frameTime > 4) { p.frameTime = 0; p.frame++; }

      // --- Dawn, the rival --------------------------------------------------
      // She reads the distance to Lola and picks a mood, rather than running a
      // fixed speed on a timer. The point is that the chase has a shape: she gets
      // away, she gloats about it, you close in, she panics and bolts, and the
      // bolt costs her — which is the window you actually catch her in.
      dawn.reverseCooldown = Math.max(0, dawn.reverseCooldown - dt);
      dawn.moodTimer = Math.max(0, dawn.moodTimer - dt);
      const gapToLola = Math.abs(dawn.x - p.x);
      const baseSpeed = DAWN_SPEED[gs.level - 1];

      if (dawn.mood === "stumble") {
        if (dawn.moodTimer <= 0) { dawn.mood = "run"; dawn.stamina = Math.min(1, dawn.stamina + 0.25); }
      } else if (dawn.mood === "taunt") {
        dawn.tauntFlap += dt;
        // Caught mid-gloat if you close the gap — she bolts, but you gained ground.
        if (gapToLola < 150 || dawn.moodTimer <= 0) {
          dawn.mood = gapToLola < 150 ? "bolt" : "run";
          dawn.moodTimer = 70;
          if (gapToLola < 150) Sfx.playCluck();
        }
      } else if (dawn.mood === "bolt") {
        dawn.stamina = Math.max(0, dawn.stamina - dt * 0.010);
        if (dawn.stamina <= 0.05 || dawn.moodTimer <= 0) { dawn.mood = "tired"; dawn.moodTimer = 90; }
      } else if (dawn.mood === "tired") {
        dawn.stamina = Math.min(1, dawn.stamina + dt * 0.006);
        if (dawn.moodTimer <= 0) dawn.mood = "run";
      } else {
        // Running. Close in and she panics; get too far behind and she stops to
        // wait for you, which keeps a struggling player in the chase.
        if (gapToLola < 190 && dawn.stamina > 0.25) { dawn.mood = "bolt"; dawn.moodTimer = 110; Sfx.playCluck(); }
        else if (gapToLola > 430 && dawn.moodTimer <= 0) { dawn.mood = "taunt"; dawn.moodTimer = 100; dawn.tauntFlap = 0; }
      }

      // Trip on a ledge she has to climb — the terrain doing her a disservice.
      if (dawn.onGround && dawn.mood !== "stumble") {
        const ahead = groundAt(gs.terrain, dawn.x + dawn.dir * 34);
        const here = groundAt(gs.terrain, dawn.x);
        if (ahead !== null && here !== null && here - ahead > 34 && Math.random() < 0.05 * dt) {
          dawn.mood = "stumble"; dawn.moodTimer = 46; Sfx.playCluck();
        }
      }

      // Turn away from Lola, and away from holes she would otherwise run into.
      if (dawn.mood !== "stumble") {
        const distAhead = (dawn.x - p.x) * dawn.dir;
        if (distAhead < 80 && dawn.reverseCooldown <= 0) {
          dawn.dir = p.x < dawn.x ? 1 : -1; dawn.reverseCooldown = 55;
          Sfx.playCluck();
        }
        if (dawn.onGround && groundAt(gs.terrain, dawn.x + dawn.dir * 60) === null) {
          // Jump the hole, or think better of it and turn round.
          if (Math.random() < 0.5) { dawn.vy = jumpForce * 0.95; dawn.onGround = false; }
          else if (dawn.reverseCooldown <= 0) { dawn.dir *= -1; dawn.reverseCooldown = 40; }
        }
      }
      if (Math.random() < DAWN_JUMP_PROB[gs.level - 1] * dt && dawn.onGround && dawn.mood !== "stumble") {
        dawn.vy = jumpForce * 0.8; dawn.onGround = false;
      }

      const moodSpeed =
        dawn.mood === "stumble" ? 0 :
        dawn.mood === "taunt" ? 0 :
        dawn.mood === "bolt" ? baseSpeed * 1.55 :
        dawn.mood === "tired" ? baseSpeed * 0.45 :
        baseSpeed;
      dawn.vx = moodSpeed * dawn.dir;
      dawn.vy += gravity * dt;
      dawn.x += dawn.vx * dt; dawn.y += dawn.vy * dt;
      const dSurf = surfaceUnder(gs.terrain, dawn.x, dawn.y + 35, dawn.vy);
      if (dSurf !== null && dawn.y >= dSurf - 35) {
        dawn.y = dSurf - 35; dawn.vy = 0; dawn.onGround = true;
      } else {
        dawn.onGround = false;
      }
      if (dawn.y < 40) { dawn.y = 40; dawn.vy = 0; }
      if (dawn.x < 50) { dawn.x = 50; dawn.dir = 1; dawn.reverseCooldown = 100; }
      if (dawn.x > gs.terrain.length - 120) { dawn.x = gs.terrain.length - 120; dawn.dir = -1; dawn.reverseCooldown = 100; }
      dawn.frameTime += dt; if (dawn.frameTime > 3) { dawn.frameTime = 0; dawn.frame++; }

      // Camera
      const targetCam = p.x - CANVAS_W * 0.35;
      gs.cameraX += (targetCam - gs.cameraX) * 0.12 * dt;
      gs.cameraX = Math.max(0, Math.min(gs.cameraX, gs.terrain.length - CANVAS_W));

      // Follow upward once she climbs above the middle of the screen, and never
      // scroll below the base ground so the horizon stays put while running.
      const camTargetY = Math.min(0, p.y - CANVAS_H * 0.56);
      gs.cameraY += (camTargetY - gs.cameraY) * 0.09 * dt;
      gs.cameraY = Math.max(-460, Math.min(0, gs.cameraY));
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
          // Every third egg is a dash. This is what joins collecting to catching:
          // the eggs were previously a counter with a threshold and nothing else.
          if (gs.eggsCollected % 3 === 0) {
            gs.dashCharges++;
            gs.eggBanner = { message: "⚡ Dash ready! (SHIFT)", alpha: 1.8 };
            Sfx.playDoubleJump();
          } else {
            const remaining = 10 - gs.eggsCollected;
            gs.eggBanner = { message: remaining > 0 ? `🥚 ${remaining} egg${remaining !== 1 ? "s" : ""} remaining!` : "🥚 All eggs collected!", alpha: 1.5 };
          }
        }
      }

      // Catch Dawn
      if (Math.abs(p.x - dawn.x) < 40 && Math.abs(p.y - dawn.y) < 60 && gs.eggsCollected >= 5) {
        nextLevel();
      }

      // --- Level verbs -------------------------------------------------------
      // Each level gets one idea of its own. Before this they differed only in
      // which sprite hurt you.
      if (gs.level === 1) {
        // The tide breathes in and out across her painted sea. Standing in it is
        // slow going, so the raised ledges stop being optional.
        gs.tide = BASE_GROUND + 22 + Math.sin(worldTime * 0.28) * 62;
        const feet = p.y + 40;
        if (feet > gs.tide + 6) {
          p.vx *= Math.pow(0.90, dt);
          if (p.vy < 0) p.vy *= Math.pow(0.94, dt);
        }
      } else if (gs.level === 2) {
        // Real swimming: hold up or down to move vertically, and a slow current
        // pushes you along. No jumping — this is the level's whole character.
        gs.currentPhase += dt * 0.01;
        const swimUp = keys["w"] || keys["ArrowUp"] || touch.jump;
        const swimDown = keys["s"] || keys["ArrowDown"] || touch.crouch;
        if (swimUp) p.vy -= 0.34 * dt;
        if (swimDown) p.vy += 0.26 * dt;
        p.vy *= Math.pow(0.93, dt);
        p.vx += Math.sin(gs.currentPhase + p.x * 0.0012) * 0.05 * dt;
        if (p.y < 30) { p.y = 30; p.vy = Math.max(0, p.vy); }
      } else if (gs.level === 4) {
        // Rising lava. The level is a staircase of ledges, so the pressure is to
        // keep climbing rather than to keep running.
        gs.lavaFloor -= dt * 0.085;
        if (p.y + 40 > gs.lavaFloor) loseLife();
      }

      // L1 obstacles
      if (gs.level === 1) {
        for (const crab of gs.crabs) {
          // A crab walks its patrol and nothing else.
          //
          // They used to notice Lola and scurry away at nearly double speed, which
          // was fun to watch and horrible to play against: you could not learn
          // where one would be, because where it went depended on where you were.
          // The patrol is fixed now, so level one is something you read rather
          // than something you react to. The claws and eye-stalks still track her,
          // which keeps the character without making the movement unpredictable.
          const near = Math.abs(p.x - crab.x) < 150;
          crab.alert += ((near ? 1 : 0) - crab.alert) * 0.08 * dt;

          crab.x += crab.speed * crab.dir * dt;

          // Turn at the ends of the patrol.
          if (crab.x > crab.homeX + CRAB_PATROL) { crab.x = crab.homeX + CRAB_PATROL; crab.dir = -1; }
          if (crab.x < crab.homeX - CRAB_PATROL) { crab.x = crab.homeX - CRAB_PATROL; crab.dir = 1; }

          // And turn at an edge, so they never walk out over a hole. A hazard
          // hovering in mid-air above a gap you are trying to jump is unreadable.
          const ahead = groundAt(gs.terrain, crab.x + crab.dir * 20);
          const here = groundAt(gs.terrain, crab.x);
          if (ahead === null || (here !== null && Math.abs(ahead - here) > 24)) {
            crab.dir *= -1;
            crab.x += crab.speed * crab.dir * dt;
          }

          // Sit on whatever surface is actually under them.
          const surf = groundAt(gs.terrain, crab.x);
          if (surf !== null) crab.y = surf - 10;

          if (crab.x < 60) { crab.x = 60; crab.dir = 1; }
          if (crab.x > gs.terrain.length - 60) { crab.x = gs.terrain.length - 60; crab.dir = -1; }

          const cx = crab.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, cx - 16, crab.y - 10, 32, 18)) loseLife();
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
        // Acorns rain down and land. They used to bounce off a hard-coded flat
        // line at the old GROUND_Y, which on this level is nowhere near the real
        // surface — so one could sit forever on top of a branch you had to land
        // on, hurting you every time with no way to avoid it.
        //
        // They now fall past the branches, land on the actual ground, and are
        // immediately recycled to the canopy somewhere else near the player. That
        // makes them weather you dodge rather than mines you memorise.
        for (const acorn of gs.acorns) {
          acorn.vy += GRAVITY * 0.48 * dt;
          acorn.x += acorn.vx * dt;
          acorn.y += acorn.vy * dt;

          const floor = groundAt(gs.terrain, acorn.x);
          const landed = floor !== null && acorn.y >= floor - 12;
          if (landed || acorn.y > CANVAS_H + 200) {
            acorn.x = gs.cameraX - 80 + Math.random() * (CANVAS_W + 260);
            acorn.y = -30 - Math.random() * 90;
            acorn.vy = 0;
            acorn.vx = (Math.random() - 0.5) * 1.2;
          }
          // Keep in world
          if (acorn.x < 50) { acorn.x = 50; acorn.vx = Math.abs(acorn.vx); }
          if (acorn.x > gs.terrain.length - 50) { acorn.x = gs.terrain.length - 50; acorn.vx = -Math.abs(acorn.vx); }
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
    // Hide the on-screen pad during the intro so the opening reads as a film.
    // Driven straight from the loop because the game state lives in a ref and
    // never triggers a React re-render.
    if (controlsRef.current) {
      const hide = gs.state === "INTRO";
      controlsRef.current.style.opacity = hide ? "0" : "1";
      controlsRef.current.style.pointerEvents = hide ? "none" : "";
    }
    if (dashBtnRef.current) {
      dashBtnRef.current.style.opacity = gs.dashCharges > 0 ? "1" : "0.35";
    }

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (gs.state === "INTRO") {
      drawIntro(ctx, gs.introTime, gs.lolaIdleFrame + worldTime * 6);
    } else if (gs.state === "START") {
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

      // Everything from here on is world space. Vertical scroll is one transform
      // rather than a `- cameraY` on every draw call, which is how the forest and
      // volcano can be climbed without touching each entity's renderer.
      ctx.save();
      ctx.translate(0, -gs.cameraY);

      drawTerrain(ctx, gs);
      gs.checkpoints.forEach(cp => {
        const cx = cp.x - gs.cameraX;
        if (cx > -40 && cx < CANVAS_W + 40) drawCheckpoint(ctx, cx, cp.y, cp.reached, worldTime);
      });

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
      gs.dashTrail.forEach(t => {
        ctx.save();
        ctx.globalAlpha = t.life * 0.45;
        ctx.fillStyle = "#ffe9a0";
        ctx.beginPath();
        ctx.ellipse(t.x - gs.cameraX, t.y + 14, 15 * t.life, 22 * t.life, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      drawLola(ctx, psx, gs.player.y, gs.player.facing, gs.player.crouching, gs.player.frame, gs.hurtFlash, gs.player.vx, !gs.player.onGround, gs.player.squash);

      // Dawn
      const dsx = gs.dawn.x - gs.cameraX;
      if (dsx > -45 && dsx < CANVAS_W + 45) drawDawn(ctx, dsx, gs.dawn.y, gs.dawn.dir, gs.dawn.frame, gs.dawn.mood, worldTime);

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

      drawLevelHazardSurface(ctx, gs, worldTime);

      ctx.restore();   // end world space

      if (shaking) ctx.restore();

      // HUD
      drawHUD(ctx, gs.lives, gs.eggsCollected, gs.level, gs.dashCharges);


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
      Sfx.unlockAudio();
      if (k === "m" || k === "M") { Sfx.toggleMute(); return; }
      if (gs.state === "INTRO") { gs.state = "START"; return; }
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

    // ?run=1 holds "move right" down, so a screenshot catches her mid-stride
    // instead of standing still. Without it every capture shows the idle pose and
    // the walk cycle can only be checked by playing.
    if (params.get("run") === "1") keysRef.current["d"] = true;
    if (wanted === "PLAYING") {
      gs.state = "PLAYING";
      initLevel(gs.level, gs);
    } else if (wanted === "HOW_TO_PLAY" || wanted === "STORY" || wanted === "GAME_OVER" || wanted === "WIN" || wanted === "START") {
      gs.state = wanted;
    } else if (wanted === "INTRO") {
      gs.state = "INTRO";
      gs.introTime = Number(params.get("t") ?? 0);
    }
  }

  // Start loop
  useEffect(() => {
    gsRef.current = makeInitialState();
    applyDebugState(gsRef.current);
    lastTimeRef.current = performance.now();

    // ?warp=N simulates N frames before the first real one.
    //
    // Needed because headless Chrome's --virtual-time-budget fast-forwards timers
    // but fires requestAnimationFrame only a couple of times, so a screenshot
    // otherwise always captures frame 2 or 3 — the level as it looks before
    // anything has happened. Driving the loop by hand is the only way to
    // screenshot a level mid-play, which is what authoring terrain needs.
    const warp = Number(new URLSearchParams(window.location.search).get("warp") ?? 0);
    if (warp > 0) {
      let t = performance.now();
      for (let i = 0; i < Math.min(warp, 20000); i++) {
        t += 16.667;
        gameLoop(t);
        cancelAnimationFrame(rafRef.current);
      }
      // Hand back a real clock, or the first true frame sees a negative delta.
      lastTimeRef.current = performance.now();
    }

    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameLoop]);

  const makeTouchHandlers = (key: keyof typeof touchRef.current) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      touchRef.current[key] = true;
      if (key === "jump") {
        justPressedRef.current.jump = true;
        Sfx.unlockAudio();
        const gs = gsRef.current!;
        if (gs.state === "INTRO") { gs.state = "START"; return; }
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
    load(introPageSrc, i => { _introPage = i; });
    load(noteDawnSrc, i => { _noteDawn = i; });
    load(noteEggSrc, i => { _noteEgg = i; });
    load(pageBeachSrc, i => { _pageBeach = i; });
    load(pageOceanSrc, i => { _pageOcean = i; });
    load(pageForestSrc, i => { _pageForest = i; });
    load(pageVolcanoSrc, i => { _pageVolcano = i; });
    load(titleArtSrc, i => { _titleArt = i; });
    load(winScreenSrc, i => { _winScreen = i; });
    load(bgBeachSrc, i => { _bgBeach = i; });
    load(bgOceanSrc, i => { _bgOcean = i; });
    load(bgForestSrc, i => { _bgForest = i; });
    load(bgVolcanoSrc, i => { _bgVolcano = i; });
  }, []);

  const handleCanvasTap = () => {
    Sfx.unlockAudio();
    const gs = gsRef.current!;
    if (gs.state === "INTRO") { gs.state = "START"; return; }
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
      <div ref={controlsRef} className="absolute bottom-0 left-0 right-0 flex justify-between items-end px-4 pb-4 pointer-events-none" style={{ transition: "opacity 350ms ease" }}>
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
          {/* Dash. Without this the power every third egg buys is unreachable on a
              tablet, which is where this is most likely to be played. It is always
              visible so it can be discovered, and dims when there is no charge. */}
          <button
            ref={dashBtnRef}
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-bold select-none"
            style={{ background: "rgba(150,110,0,0.65)", border: "2px solid rgba(255,210,80,0.6)", WebkitTapHighlightColor: "transparent", opacity: 0.35, transition: "opacity 150ms ease" }}
            {...makeTouchHandlers("dash")}
          >⚡</button>
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
