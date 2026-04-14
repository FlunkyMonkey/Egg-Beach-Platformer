import { useEffect, useRef, useCallback } from "react";
import lolaSpriteSrc from "../assets/lola_sprite.png";
import dawnSpriteSrc from "../assets/dawn_sprite.png";
import eggSpriteSrc from "../assets/egg_sprite.png";
import jellyfishSpriteSrc from "../assets/jellyfish_sprite.png";
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

interface Crab { x: number; y: number; dir: number; speed: number; }
interface Jellyfish { x: number; startY: number; phase: number; speed: number; }
interface Wave { x: number; phase: number; amplitude: number; }
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
  waves: Wave[];
  branches: Branch[];
  roots: Root[];
  clouds: Cloud[];
  acorns: Acorn[];
  lavaDrops: LavaDrop[];
  lavaDropNextId: number;
  lavaSpawnTimer: number;
  // FX
  hurtFlash: number;
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
  frame: number, hurtFlash: number
) {
  ctx.save();
  ctx.translate(x, y + 34);
  ctx.scale(facing * 1.125, 1.125);
  ctx.translate(0, -34);

  const scaleY = crouching ? 0.7 : 1;
  ctx.scale(1, scaleY);
  const oy = crouching ? 10 : 0;

  if (_lolaSprite) {
    const sw = 52, sh = 90;
    const bodyH = sh * 0.78;
    const bodyY = 34 - sh + oy * 0.5;
    const legBob = Math.sin(frame * 0.8) * 5;
    const bodyTilt = Math.sin(frame * 0.8) * 0.04;

    ctx.save();
    ctx.rotate(bodyTilt);

    const armSwing = Math.sin(frame * 0.8) * 12;
    ctx.fillStyle = "#c07840";
    ctx.save();
    ctx.translate(-18, oy + 2);
    ctx.rotate(armSwing * 0.06);
    ctx.fillRect(-3, 0, 6, 14);
    ctx.fillStyle = "#e09050";
    ctx.beginPath(); ctx.arc(0, 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(18, oy + 2);
    ctx.rotate(-armSwing * 0.06);
    ctx.fillStyle = "#c07840";
    ctx.fillRect(-3, 0, 6, 14);
    ctx.fillStyle = "#e09050";
    ctx.beginPath(); ctx.arc(0, 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(-sw / 2 - 4, bodyY, sw + 8, bodyH);
    ctx.clip();
    ctx.drawImage(_lolaSprite, -sw / 2, bodyY, sw, sh);
    ctx.restore();

    ctx.fillStyle = "#5533bb";
    ctx.fillRect(-7, oy + 20 + legBob * 0.3, 5, 10 + legBob);
    ctx.fillRect(2, oy + 20 - legBob * 0.3, 5, 10 - legBob);
    ctx.fillStyle = "#2255dd";
    ctx.fillRect(-9, oy + 28 + legBob * 0.5, 8, 5);
    ctx.fillRect(1, oy + 28 - legBob * 0.5, 8, 5);

    ctx.restore();

    if (hurtFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = Math.min(hurtFlash * 2, 0.55);
      ctx.fillStyle = "#ff2200";
      ctx.fillRect(-sw / 2 - 20, bodyY - 5, sw + 40, sh + 20);
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
    const wingFlap = Math.sin(frame * 1.2) * 0.12;
    ctx.save();
    ctx.rotate(wingFlap);
    ctx.fillStyle = "#f4f0e8";
    ctx.beginPath(); ctx.ellipse(0, 2 + bodyBob, 16, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f8f4ee";
    ctx.beginPath(); ctx.ellipse(2, -12 + bodyBob, 10, 10, 0, 0, Math.PI * 2); ctx.fill();
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

function drawEgg(ctx: CanvasRenderingContext2D, egg: Egg) {
  if (egg.collected) return;
  const by = egg.y + Math.sin(egg.bobOffset) * 4;
  const glow = Math.sin(egg.bobOffset * 1.5) * 0.15 + 0.25;

  if (_eggSprite) {
    const ew = 22, eh = 26;
    ctx.save();
    ctx.globalAlpha = glow + 0.3;
    ctx.fillStyle = "#fff8cc";
    ctx.beginPath(); ctx.ellipse(egg.x, by, ew * 0.7, eh * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.arc(egg.x - 4, by - 6, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCrab(ctx: CanvasRenderingContext2D, crab: Crab) {
  ctx.save();
  ctx.translate(crab.x, crab.y);
  ctx.scale(crab.dir, 1);
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(0, 4, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Body
  ctx.fillStyle = "#dd3300";
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff5522";
  ctx.beginPath(); ctx.ellipse(-2, -3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(-5, -7, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -7, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-4.5, -7.5, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5.5, -7.5, 1, 0, Math.PI * 2); ctx.fill();
  // Claws
  ctx.fillStyle = "#cc2200";
  ctx.fillRect(-26, -9, 13, 7);
  ctx.fillRect(14, -9, 13, 7);
  ctx.beginPath(); ctx.ellipse(-24, -5, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(24, -5, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
  // Legs
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = "#ee4411";
    ctx.fillRect(-18 + i * 4, 5, 3, 11);
    ctx.fillRect(10 + i * 4, 5, 3, 11);
  }
  ctx.restore();
}

function drawJellyfish(ctx: CanvasRenderingContext2D, jf: Jellyfish, worldTime: number) {
  const y = jf.startY + Math.sin(worldTime * jf.speed + jf.phase) * 40;
  ctx.save();
  ctx.translate(jf.x, y);

  if (_jellyfishSprite) {
    const jw = 50, jh = 62;
    const pulse = 1 + Math.sin(worldTime * 2 + jf.phase) * 0.08;
    const sway = Math.sin(worldTime * 1.2 + jf.phase) * 0.1;
    ctx.save();
    ctx.rotate(sway);
    ctx.scale(pulse, 1 / pulse);
    ctx.drawImage(_jellyfishSprite, -jw / 2, -jh * 0.35, jw, jh);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(220,80,240,0.65)";
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,160,255,0.45)";
    ctx.beginPath(); ctx.ellipse(-5, -4, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
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

function drawWave(ctx: CanvasRenderingContext2D, wave: Wave, worldTime: number, cameraX: number) {
  const screenX = wave.x - cameraX;
  const y = GROUND_Y + 28 + Math.sin(worldTime * 2 + wave.phase) * wave.amplitude;
  ctx.fillStyle = "rgba(0,80,200,0.72)";
  ctx.beginPath();
  ctx.moveTo(screenX, CANVAS_H);
  ctx.bezierCurveTo(screenX + 22, y, screenX + 44, CANVAS_H - 18, screenX + 66, y - 12);
  ctx.bezierCurveTo(screenX + 88, CANVAS_H - 12, screenX + 110, y, screenX + 132, CANVAS_H);
  ctx.closePath(); ctx.fill();
  // Foam
  ctx.fillStyle = "rgba(200,230,255,0.4)";
  ctx.beginPath(); ctx.ellipse(screenX + 40, y - 5, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
}

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud) {
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.ellipse(cloud.x, cloud.y, cloud.w * 0.5, cloud.w * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cloud.x - cloud.w * 0.26, cloud.y + 4, cloud.w * 0.32, cloud.w * 0.19, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cloud.x + cloud.w * 0.26, cloud.y + 5, cloud.w * 0.36, cloud.w * 0.21, 0, 0, Math.PI * 2); ctx.fill();
}

function drawBranch(ctx: CanvasRenderingContext2D, branch: Branch, cameraX: number) {
  const sx = branch.x - cameraX;
  ctx.fillStyle = "#6b3a14";
  ctx.fillRect(sx, branch.y, branch.w, 15);
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(sx, branch.y, branch.w, 4);
  ctx.fillStyle = "#33aa22";
  ctx.beginPath();
  ctx.ellipse(sx + branch.w / 2, branch.y - 6, branch.w / 2 + 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#44cc33";
  ctx.beginPath();
  ctx.ellipse(sx + branch.w / 2 - 8, branch.y - 8, branch.w / 4, 9, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoot(ctx: CanvasRenderingContext2D, rx: number, cameraX: number) {
  const sx = rx - cameraX;
  ctx.fillStyle = "#5a3214";
  ctx.beginPath();
  ctx.moveTo(sx, GROUND_Y);
  ctx.bezierCurveTo(sx + 10, GROUND_Y - 22, sx + 22, GROUND_Y - 16, sx + 32, GROUND_Y);
  ctx.fill();
  ctx.fillStyle = "#7a4a28";
  ctx.beginPath();
  ctx.moveTo(sx + 4, GROUND_Y);
  ctx.bezierCurveTo(sx + 12, GROUND_Y - 14, sx + 18, GROUND_Y - 10, sx + 28, GROUND_Y);
  ctx.fill();
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
    ctx.globalAlpha = 0.35;
    ctx.drawImage(_bgVolcano, 0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  skyGrad.addColorStop(0, "rgba(26,10,10,0.8)");
  skyGrad.addColorStop(0.4, "rgba(45,8,8,0.75)");
  skyGrad.addColorStop(1, "rgba(85,16,16,0.7)");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Distant volcanic haze
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

  // Embers floating
  for (let i = 0; i < 12; i++) {
    const ex = ((i * 70 + worldTime * (20 + i * 5)) % (CANVAS_W + 50) + CANVAS_W + 50) % (CANVAS_W + 50) - 25;
    const ey = ((worldTime * 40 + i * 37) % (GROUND_Y + 20));
    ctx.fillStyle = `hsl(${20 + (i % 5) * 10}, 100%, ${50 + Math.sin(worldTime + i) * 15}%)`;
    ctx.beginPath(); ctx.arc(ex, ey, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
}

// =====================================================================
// BACKGROUNDS
// =====================================================================
function drawBackground(
  ctx: CanvasRenderingContext2D,
  level: number, bgScrollX: number, worldTime: number,
  clouds: Cloud[], cameraX: number
) {
  if (level === 1) {
    if (_bgBeach) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(_bgBeach, 0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, "rgba(68,170,255,0.75)");
    skyGrad.addColorStop(0.5, "rgba(136,221,255,0.7)");
    skyGrad.addColorStop(1, "rgba(204,240,255,0.65)");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Clouds
    clouds.forEach(c => {
      const px = ((c.x - bgScrollX * 0.3 + CANVAS_W * 3) % (CANVAS_W + 200)) - 100;
      drawCloud(ctx, { x: px, y: c.y, w: c.w });
    });

    // Distant hills
    for (let i = 0; i < 3; i++) {
      const hx = ((i * 320 + 60 - bgScrollX * 0.15) % (CANVAS_W + 400) + CANVAS_W + 400) % (CANVAS_W + 400) - 200;
      ctx.fillStyle = `hsl(190, 50%, ${70 + i * 5}%)`;
      ctx.beginPath();
      ctx.moveTo(hx - 120, GROUND_Y - 30);
      ctx.bezierCurveTo(hx - 60, GROUND_Y - 70, hx + 60, GROUND_Y - 70, hx + 120, GROUND_Y - 30);
      ctx.fill();
    }

    // Ocean band - rich blue
    const oceanGrad = ctx.createLinearGradient(0, GROUND_Y - 20, 0, GROUND_Y + 50);
    oceanGrad.addColorStop(0, "#1155cc");
    oceanGrad.addColorStop(1, "#0033aa");
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, GROUND_Y - 20, CANVAS_W, 70);
    // Wave highlights
    for (let i = 0; i < 6; i++) {
      const wx = ((i * 170 - bgScrollX * 0.5 + 30) % (CANVAS_W + 200) + CANVAS_W + 200) % (CANVAS_W + 200) - 100;
      ctx.fillStyle = `rgba(120,200,255,${0.35 + Math.sin(worldTime * 1.5 + i) * 0.12})`;
      ctx.beginPath(); ctx.ellipse(wx, GROUND_Y - 8, 50, 8, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Sandy ground - warm golden
    const sandGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
    sandGrad.addColorStop(0, "#f5d060");
    sandGrad.addColorStop(0.3, "#e8c040");
    sandGrad.addColorStop(1, "#c88a30");
    ctx.fillStyle = sandGrad;
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
    // Sand bumps
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 90 - bgScrollX * 0.2 + 20) % (CANVAS_W + 100) + CANVAS_W + 100) % (CANVAS_W + 100) - 50;
      ctx.fillStyle = "#f0d870";
      ctx.beginPath(); ctx.ellipse(bx, GROUND_Y + 6, 28, 9, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Pebbles
    for (let i = 0; i < 15; i++) {
      const px2 = ((i * 60 + 10 - bgScrollX * 0.25) % (CANVAS_W + 80) + CANVAS_W + 80) % (CANVAS_W + 80) - 40;
      ctx.fillStyle = `hsl(30, 50%, ${45 + (i % 4) * 5}%)`;
      ctx.beginPath(); ctx.ellipse(px2, GROUND_Y + 14 + (i % 3) * 5, 4 + (i % 3), 3, 0, 0, Math.PI * 2); ctx.fill();
    }

  } else if (level === 2) {
    if (_bgOcean) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(_bgOcean, 0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }
    const seaGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    seaGrad.addColorStop(0, "rgba(0,68,136,0.8)");
    seaGrad.addColorStop(0.4, "rgba(0,85,153,0.75)");
    seaGrad.addColorStop(1, "rgba(0,34,68,0.8)");
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Shimmering light rays
    for (let i = 0; i < 5; i++) {
      const rAlpha = 0.06 + Math.sin(worldTime * 0.8 + i) * 0.02;
      ctx.fillStyle = `rgba(100,200,255,${rAlpha})`;
      const rx = i * 190 - 30 + Math.sin(worldTime * 0.4 + i) * 25;
      ctx.beginPath();
      ctx.moveTo(rx, 0); ctx.lineTo(rx + 35, 0);
      ctx.lineTo(rx + 70, CANVAS_H); ctx.lineTo(rx + 35, CANVAS_H);
      ctx.closePath(); ctx.fill();
    }

    // Bubbles
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 100 - bgScrollX * 0.12 + 20) % (CANVAS_W + 60) + CANVAS_W + 60) % (CANVAS_W + 60) - 30;
      const by = GROUND_Y - ((worldTime * 28 + i * 42) % GROUND_Y);
      ctx.strokeStyle = `rgba(150,220,255,${0.3 + (i % 3) * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, by, 3 + (i % 4), 0, Math.PI * 2); ctx.stroke();
    }

    // Seafloor - rich warm sand
    const floorGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
    floorGrad.addColorStop(0, "#c8a860");
    floorGrad.addColorStop(1, "#a87840");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

    // Coral and seaweed
    for (let i = 0; i < 9; i++) {
      const cx2 = ((i * 120 + 40 - cameraX * 0.75) % (CANVAS_W + 130) + CANVAS_W + 130) % (CANVAS_W + 130) - 65;
      if (i % 3 === 0) {
        // Fan coral
        ctx.fillStyle = `hsl(${350 + (i * 15) % 40}, 85%, 55%)`;
        ctx.beginPath(); ctx.arc(cx2, GROUND_Y - 6, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(cx2 - 3, GROUND_Y - 28, 7, 24);
        ctx.beginPath(); ctx.arc(cx2 - 14, GROUND_Y - 24, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2 + 14, GROUND_Y - 22, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsl(${10 + (i * 15) % 30}, 90%, 70%)`;
        ctx.beginPath(); ctx.arc(cx2, GROUND_Y - 26, 6, 0, Math.PI * 2); ctx.fill();
      } else if (i % 3 === 1) {
        // Seaweed
        ctx.lineWidth = 5;
        for (let j = 0; j < 6; j++) {
          const sy = GROUND_Y - j * 11;
          const off = Math.sin(worldTime * 1.3 + j * 0.6 + i) * 9;
          const hue = 110 + (i * 20) % 40;
          ctx.strokeStyle = `hsl(${hue}, 70%, 38%)`;
          if (j === 0) { ctx.beginPath(); ctx.moveTo(cx2, sy); }
          else ctx.lineTo(cx2 + off, sy);
        }
        ctx.stroke();
      } else {
        // Sea star
        ctx.fillStyle = `hsl(${25 + i * 10}, 90%, 58%)`;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(cx2 + Math.cos(a) * 10, GROUND_Y + 8 + Math.sin(a) * 10, 5, 3, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = `hsl(${35 + i * 10}, 90%, 70%)`;
        ctx.beginPath(); ctx.arc(cx2, GROUND_Y + 8, 5, 0, Math.PI * 2); ctx.fill();
      }
    }

  } else if (level === 3) {
    if (_bgForest) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(_bgForest, 0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }
    const skyGrad2 = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad2.addColorStop(0, "rgba(136,204,85,0.7)");
    skyGrad2.addColorStop(1, "rgba(187,238,136,0.65)");
    ctx.fillStyle = skyGrad2;
    ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);

    // Background tree trunks (far)
    for (let i = 0; i < 12; i++) {
      const tx = ((i * 130 + 40 - bgScrollX * 0.4) % (CANVAS_W + 250) + CANVAS_W + 250) % (CANVAS_W + 250) - 125;
      ctx.fillStyle = `hsl(25, 45%, ${18 + (i % 3) * 4}%)`;
      ctx.fillRect(tx - 12, GROUND_Y - 260, 24, 260);
    }

    // Dense layered canopy
    const canopyGrad = ctx.createLinearGradient(0, 0, 0, 110);
    canopyGrad.addColorStop(0, "#1a6600");
    canopyGrad.addColorStop(1, "#338811");
    ctx.fillStyle = canopyGrad;
    ctx.fillRect(0, 0, CANVAS_W, 100);
    // Canopy bumps
    for (let i = 0; i < 9; i++) {
      const cx3 = ((i * 120 - bgScrollX * 0.55) % (CANVAS_W + 220) + CANVAS_W + 220) % (CANVAS_W + 220) - 110;
      ctx.fillStyle = `hsl(${115 + (i % 4) * 5}, 60%, ${22 + (i % 3) * 4}%)`;
      ctx.beginPath(); ctx.ellipse(cx3, 85, 85, 55, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Canopy lighter edge
    ctx.fillStyle = "rgba(80,200,40,0.15)";
    ctx.fillRect(0, 90, CANVAS_W, 20);

    // Dappled sunlight patches
    for (let i = 0; i < 5; i++) {
      const lx = ((i * 170 + 50 - cameraX * 0.7) % (CANVAS_W + 200) + CANVAS_W + 200) % (CANVAS_W + 200) - 100;
      ctx.fillStyle = `rgba(255,240,100,${0.07 + Math.sin(worldTime * 0.5 + i) * 0.03})`;
      ctx.beginPath(); ctx.ellipse(lx, GROUND_Y - 80, 60, GROUND_Y * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Ground - rich moss green
    const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
    groundGrad.addColorStop(0, "#55aa22");
    groundGrad.addColorStop(0.25, "#449911");
    groundGrad.addColorStop(1, "#2a6600");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
    // Ground detail grass tufts
    for (let i = 0; i < 14; i++) {
      const gx = ((i * 75 + 20 - cameraX * 0.85) % (CANVAS_W + 100) + CANVAS_W + 100) % (CANVAS_W + 100) - 50;
      ctx.fillStyle = `hsl(${115 + (i % 3) * 8}, 65%, ${32 + (i % 3) * 5}%)`;
      ctx.fillRect(gx - 3, GROUND_Y - 6, 3, 8);
      ctx.fillRect(gx + 2, GROUND_Y - 9, 3, 11);
      ctx.fillRect(gx + 6, GROUND_Y - 5, 3, 7);
    }

    // Colorful flowers
    const flowerColors = [["#ee4444","#ff8888"], ["#4488ff","#88bbff"], ["#44dd44","#88ff88"], ["#ff88aa","#ffaacc"]];
    for (let i = 0; i < 12; i++) {
      const fx = ((i * 95 + 50 - cameraX * 0.88) % (CANVAS_W + 110) + CANVAS_W + 110) % (CANVAS_W + 110) - 55;
      const [petal, center] = flowerColors[i % flowerColors.length];
      ctx.fillStyle = petal;
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(fx + Math.cos(pa) * 4, GROUND_Y - 7 + Math.sin(pa) * 4, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = center;
      ctx.beginPath(); ctx.arc(fx, GROUND_Y - 7, 3, 0, Math.PI * 2); ctx.fill();
    }

  } else if (level === 4) {
    drawVolcanoBackground(ctx, bgScrollX, worldTime);
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
function drawStartScreen(ctx: CanvasRenderingContext2D, lolaFrame: number) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  skyGrad.addColorStop(0, "#33aaff");
  skyGrad.addColorStop(0.55, "#88ddff");
  skyGrad.addColorStop(1, "#f5d060");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#1155cc";
  ctx.fillRect(0, 305, CANVAS_W, 75);
  ctx.fillStyle = "#aaddff";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.ellipse(80 + i * 160, 305, 55, 9, 0, 0, Math.PI * 2); ctx.fill();
  }
  const beachGrad = ctx.createLinearGradient(0, 340, 0, CANVAS_H);
  beachGrad.addColorStop(0, "#f5d060");
  beachGrad.addColorStop(1, "#c88830");
  ctx.fillStyle = beachGrad;
  ctx.fillRect(0, 340, CANVAS_W, CANVAS_H - 340);
  for (let i = 0; i < 4; i++) {
    drawCloud(ctx, { x: 100 + i * 210, y: 55 + (i % 2) * 22, w: 90 + (i % 3) * 20 });
  }

  if (_titleArt) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.drawImage(_titleArt, CANVAS_W / 2 - 200, 10, 400, 280);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.font = "bold 52px monospace";
  ctx.fillStyle = "#003a80";
  ctx.fillText("The Egg Beach", CANVAS_W / 2 + 3, 96);
  const titleGrad = ctx.createLinearGradient(0, 52, 0, 102);
  titleGrad.addColorStop(0, "#ffe840");
  titleGrad.addColorStop(0.5, "#ffaa00");
  titleGrad.addColorStop(1, "#ff6600");
  ctx.fillStyle = titleGrad;
  ctx.fillText("The Egg Beach", CANVAS_W / 2, 93);
  ctx.fillStyle = "#003a80";
  ctx.fillRect(CANVAS_W / 2 - 240, 105, 480, 3);

  ctx.strokeStyle = "#2244aa";
  ctx.lineWidth = 3;
  const waveY = 115;
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? 60 : CANVAS_W - 60;
    const dir = side === 0 ? 1 : -1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 6;
      const px = sx + Math.sin(angle) * 8 * dir;
      const py = waveY + i * 30;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px monospace";
  ctx.fillText("Chase the chicken. Collect the eggs!", CANVAS_W / 2, 140);
  ctx.font = "14px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("4 exciting levels! Beach · Ocean · Forest · Volcano", CANVAS_W / 2, 163);

  drawLola(ctx, CANVAS_W / 2 - 50, 328, 1, false, lolaFrame, 0);
  drawDawn(ctx, CANVAS_W / 2 + 55, 328, -1, lolaFrame);
  ctx.fillStyle = "#ff4400";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText("→", CANVAS_W / 2 + 2, 325);

  const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = "bold 20px monospace";
  ctx.fillText("Press ENTER or Tap to Start", CANVAS_W / 2, CANVAS_H - 26);
  ctx.textAlign = "left";
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
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 310);
  skyGrad.addColorStop(0, "#44aaff"); skyGrad.addColorStop(1, "#bbddff");
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const groundGrad = ctx.createLinearGradient(0, 300, 0, CANVAS_H);
  groundGrad.addColorStop(0, "#66cc33"); groundGrad.addColorStop(1, "#33aa11");
  ctx.fillStyle = groundGrad; ctx.fillRect(0, 300, CANVAS_W, CANVAS_H - 300);
  for (let i = 0; i < 4; i++) drawCloud(ctx, { x: 70 + i * 210, y: 50 + (i % 2) * 28, w: 80 + (i % 2) * 35 });

  if (_winScreen) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(_winScreen, CANVAS_W / 2 - 140, 155, 280, 290);
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    const bx = CANVAS_W / 2, by = 305;
    ctx.fillStyle = "#a05020"; ctx.fillRect(bx - 65, by - 40, 130, 85);
    ctx.fillStyle = "#cc3300";
    ctx.beginPath(); ctx.moveTo(bx - 80, by - 40); ctx.lineTo(bx, by - 95); ctx.lineTo(bx + 80, by - 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#6a3010"; ctx.fillRect(bx - 20, by + 5, 40, 40);
    ctx.beginPath(); ctx.arc(bx, by + 5, 20, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#a0ccee"; ctx.fillRect(bx - 50, by - 28, 24, 20); ctx.fillRect(bx + 26, by - 28, 24, 20);
  }

  for (let i = 0; i < 18; i++) {
    const sx = ((i * 55 + animTime * 90 * (i % 2 === 0 ? 1 : -0.7)) % (CANVAS_W + 60) + CANVAS_W + 60) % (CANVAS_W + 60) - 30;
    const sy = ((animTime * 45 + i * 35) % CANVAS_H);
    ctx.fillStyle = `hsl(${(i * 22 + animTime * 70) % 360}, 95%, 62%)`;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(animTime * 2 + i);
    ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  }

  const bounce = Math.sin(animTime * 3.5) * 10;
  ctx.textAlign = "center";
  ctx.fillStyle = "#003300"; ctx.font = "bold 56px monospace";
  ctx.fillText("YOU WIN!", CANVAS_W / 2 + 3, 84 + bounce);
  ctx.fillStyle = "#ffee22"; ctx.fillText("YOU WIN!", CANVAS_W / 2, 81 + bounce);
  ctx.fillStyle = "#1a4400"; ctx.font = "18px monospace";
  ctx.fillText("Lola catches Dawn just in time!", CANVAS_W / 2, 120);
  ctx.fillText("The eggs are safe!", CANVAS_W / 2, 145);
  const a = 0.5 + Math.sin(animTime * 3) * 0.5;
  ctx.fillStyle = `rgba(0,80,0,${a})`; ctx.font = "bold 18px monospace";
  ctx.fillText("Press ENTER or Tap to Play Again", CANVAS_W / 2, CANVAS_H - 18);
  ctx.textAlign = "left";
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

  gs.dawn.x = 360; gs.dawn.y = GROUND_Y - 35;
  gs.dawn.vx = DAWN_SPEED[level - 1]; gs.dawn.vy = 0;
  gs.dawn.onGround = true; gs.dawn.dir = 1;
  gs.dawn.frame = 0; gs.dawn.frameTime = 0; gs.dawn.reverseCooldown = 0;

  gs.cameraX = 0;
  gs.eggsCollected = 0;
  gs.hurtFlash = 0;
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
  gs.waves = [];
  gs.branches = [];
  gs.roots = [];

  if (level === 1) {
    for (let i = 0; i < 7; i++) gs.crabs.push({ x: 500 + i * 750, y: GROUND_Y - 10, dir: i % 2 === 0 ? 1 : -1, speed: 0.85 + Math.random() * 0.45 });
    for (let i = 0; i < 8; i++) gs.waves.push({ x: 550 + i * 560, phase: Math.random() * Math.PI * 2, amplitude: 18 + Math.random() * 16 });
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
      player: { x: 100, y: GROUND_Y - 40, vx: 0, vy: 0, onGround: true, jumpsLeft: 2, crouching: false, facing: 1, frameTime: 0, frame: 0 },
      dawn: { x: 360, y: GROUND_Y - 35, vx: 2.8, vy: 0, onGround: true, dir: 1, frameTime: 0, frame: 0, reverseCooldown: 0 },
      cameraX: 0, eggs: [], crabs: [], jellyfish: [], waves: [], branches: [], roots: [],
      clouds: [], acorns: [], lavaDrops: [], lavaDropNextId: 0, lavaSpawnTimer: 0,
      hurtFlash: 0, hurtHearts: [], eggBanner: null,
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
      const wantJump = keys["w"] || keys["ArrowUp"] || keys[" "] || justPressedRef.current.jump;
      const wantCrouch = keys["s"] || keys["ArrowDown"] || touch.crouch;
      justPressedRef.current.jump = false;

      const spd = wantCrouch ? PLAYER_SPEED * 0.5 : PLAYER_SPEED;
      if (movingLeft) { p.vx = -spd; p.facing = -1; }
      else if (movingRight) { p.vx = spd; p.facing = 1; }
      else p.vx *= 0.75;

      p.crouching = wantCrouch && p.onGround;

      if (wantJump && p.jumpsLeft > 0) {
        p.vy = jumpForce; p.jumpsLeft--;
        p.onGround = false; playSoundJump();
      }

      p.vy += gravity * dt;
      if (isUnderwater) p.vy *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt;

      const groundY = GROUND_Y - 40;
      if (p.y >= groundY) { p.y = groundY; p.vy = 0; p.onGround = true; p.jumpsLeft = 2; }
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
          crab.x += crab.speed * crab.dir * dt;
          if (crab.x < 60 || crab.x > LEVEL_LENGTH - 60) crab.dir *= -1;
          const cx = crab.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 12, p.y - 28, 24, 60, cx - 20, crab.y - 10, 40, 20)) loseLife();
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
      drawStartScreen(ctx, gs.lolaIdleFrame);
    } else if (gs.state === "HOW_TO_PLAY") {
      drawHowToPlay(ctx);
    } else if (gs.state === "STORY") {
      drawStoryCard(ctx, gs.level);
    } else if (gs.state === "GAME_OVER") {
      drawGameOver(ctx);
    } else if (gs.state === "WIN") {
      drawWinScreen(ctx, gs.winAnimTime);
    } else if (gs.state === "PLAYING") {
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
        if (!e.collected && esx > -25 && esx < CANVAS_W + 25) drawEgg(ctx, { ...e, x: esx });
      });

      // L1: waves + crabs
      if (gs.level === 1) {
        gs.waves.forEach(w => { if (w.x - gs.cameraX > -140 && w.x - gs.cameraX < CANVAS_W + 140) drawWave(ctx, w, worldTime, gs.cameraX); });
        gs.crabs.forEach(c => { const cx = c.x - gs.cameraX; if (cx > -40 && cx < CANVAS_W + 40) drawCrab(ctx, { ...c, x: cx }); });
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
      drawLola(ctx, psx, gs.player.y, gs.player.facing, gs.player.crouching, gs.player.frame, gs.hurtFlash);

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

  // Start loop
  useEffect(() => {
    gsRef.current = makeInitialState();
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
