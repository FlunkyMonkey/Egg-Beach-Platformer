import { useEffect, useRef, useCallback } from "react";

// =====================================================================
// TYPES
// =====================================================================
type GameState = "START" | "STORY" | "PLAYING" | "GAME_OVER" | "WIN";
type EggColor = "red" | "blue" | "green" | "yellow" | "purple";
type PowerUp = { color: EggColor; endTime: number };

interface Vec2 { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }

interface Egg {
  id: number;
  x: number;
  y: number;
  color: EggColor;
  collected: boolean;
  bobOffset: number;
}

interface Crab {
  x: number;
  y: number;
  dir: number;
  speed: number;
}

interface Jellyfish {
  x: number;
  startY: number;
  phase: number;
  speed: number;
}

interface Wave {
  x: number;
  phase: number;
  amplitude: number;
}

interface Branch {
  x: number;
  y: number;
  w: number;
}

interface Root {
  x: number;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
}

interface GameStateData {
  state: GameState;
  level: number; // 1, 2, 3
  lives: number;
  timer: number; // seconds remaining
  eggsCollected: number;
  score: number;
  // player
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    onGround: boolean;
    jumpsLeft: number;
    crouching: boolean;
    facing: number; // 1 = right, -1 = left
    frameTime: number;
    frame: number;
    powerUps: PowerUp[];
  };
  // dawn (chicken)
  dawn: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    onGround: boolean;
    dir: number;
    frameTime: number;
    frame: number;
    reverseCooldown: number;
  };
  // world
  cameraX: number;
  eggs: Egg[];
  crabs: Crab[];
  jellyfish: Jellyfish[];
  waves: Wave[];
  branches: Branch[];
  roots: Root[];
  clouds: Cloud[];
  // parallax
  bgScrollX: number;
  storyTimer: number;
  winAnimTime: number;
  lolaIdleFrame: number;
  lolaIdleTime: number;
}

// =====================================================================
// AUDIO PLACEHOLDERS
// =====================================================================
// Sound effect: egg collected
function playSoundEggCollect() { /* TODO: play egg collect sound */ }
// Sound effect: jump
function playSoundJump() { /* TODO: play jump sound */ }
// Sound effect: life lost
function playSoundLifeLost() { /* TODO: play life lost sound */ }
// Sound effect: level complete
function playSoundLevelComplete() { /* TODO: play level complete sound */ }
// Sound effect: power-up activated
function playSoundPowerUp() { /* TODO: play power-up activation sound */ }

// =====================================================================
// CONSTANTS
// =====================================================================
const CANVAS_W = 800;
const CANVAS_H = 450;
const GROUND_Y = 360; // y of ground surface
const GRAVITY = 0.55;
const UNDERWATER_GRAVITY = 0.18;
const JUMP_FORCE = -13;
const UNDERWATER_JUMP_FORCE = -7;
const PLAYER_SPEED = 4.8;
const PLAYER_SPEED_BOOST = 7.5;
const TIMER_SECONDS = 60;
const LEVEL_LENGTH = 5000; // world width per level
const EGG_COLORS: EggColor[] = ["red", "blue", "green", "yellow", "purple"];
const POWERUP_DURATION = 10000; // ms

const STORY_TEXTS = [
  "Lola loves eggs. Dawn the chicken\nhas the best eggs on the beach.\nBut Dawn won't share — she runs!\nChase her down before she reaches\nthe volcano!",
  "Dawn fled into the sea! Lola dives in\nafter her, dodging jellyfish through\nthe waves...",
  "Dawn emerges in the forest, sprinting\nfor the volcano! Lola must catch her\nNOW before it's too late!",
];

const DAWN_SPEED = [2.8, 3.6, 4.4];
const DAWN_JUMP_PROB = [0.005, 0.012, 0.022];
const DAWN_REVERSE_PROB = [0.003, 0.008, 0.015];

// =====================================================================
// DRAWING HELPERS
// =====================================================================
function drawEggShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLola(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, crouching: boolean, frame: number, powerUps: PowerUp[]) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);

  const scaleY = crouching ? 0.7 : 1;
  ctx.scale(1, scaleY);
  const offsetY = crouching ? 10 : 0;

  // Power-up glow
  const activeColors: string[] = [];
  const now = Date.now();
  for (const pu of powerUps) {
    if (pu.endTime > now) {
      if (pu.color === "red") activeColors.push("#ff4444");
      else if (pu.color === "blue") activeColors.push("#4488ff");
      else if (pu.color === "green") activeColors.push("#44cc44");
      else if (pu.color === "yellow") activeColors.push("#ffcc00");
      else if (pu.color === "purple") activeColors.push("#aa44ff");
    }
  }
  if (activeColors.length > 0) {
    ctx.shadowColor = activeColors[0];
    ctx.shadowBlur = 15;
  }

  // Legs
  const legBob = Math.sin(frame * 0.8) * 3;
  ctx.fillStyle = "#6644cc"; // purple skirt bottom
  ctx.fillRect(-7, offsetY + 22, 6, 8 + legBob); // left leg
  ctx.fillRect(2, offsetY + 22, 6, 8 - legBob); // right leg

  // Blue shoes
  ctx.fillStyle = "#3366ee";
  ctx.fillRect(-9, offsetY + 28, 7, 5);
  ctx.fillRect(2, offsetY + 28, 7, 5);

  // Skirt
  ctx.fillStyle = "#7744dd";
  ctx.beginPath();
  ctx.moveTo(-10, offsetY + 14);
  ctx.lineTo(10, offsetY + 14);
  ctx.lineTo(12, offsetY + 26);
  ctx.lineTo(-12, offsetY + 26);
  ctx.closePath();
  ctx.fill();

  // Body / purple top
  ctx.fillStyle = "#8855ee";
  ctx.fillRect(-8, offsetY - 2, 16, 18);

  // Arms
  const armBob = Math.sin(frame * 0.8) * 4;
  ctx.fillStyle = "#dd8844";
  ctx.fillRect(-13, offsetY + 1 + armBob, 6, 10); // left arm
  ctx.fillRect(7, offsetY + 1 - armBob, 6, 10); // right arm

  // Neck
  ctx.fillStyle = "#dd8844";
  ctx.fillRect(-4, offsetY - 8, 8, 8);

  // Head
  ctx.fillStyle = "#dd8844"; // orange skin
  ctx.beginPath();
  ctx.ellipse(0, offsetY - 15, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair (blonde)
  ctx.fillStyle = "#ffdd00";
  ctx.beginPath();
  ctx.ellipse(0, offsetY - 22, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hair sides
  ctx.fillRect(-10, offsetY - 22, 4, 12);
  ctx.fillRect(6, offsetY - 22, 4, 12);

  // Eyes (blue)
  ctx.fillStyle = "#fff";
  ctx.fillRect(-6, offsetY - 18, 4, 4);
  ctx.fillRect(2, offsetY - 18, 4, 4);
  ctx.fillStyle = "#3366ff";
  ctx.fillRect(-5, offsetY - 17, 2, 2);
  ctx.fillRect(3, offsetY - 17, 2, 2);
  ctx.fillStyle = "#000";
  ctx.fillRect(-5, offsetY - 17, 1, 1);
  ctx.fillRect(3, offsetY - 17, 1, 1);

  // Orange flower on head
  ctx.fillStyle = "#ff8800";
  ctx.beginPath(); ctx.arc(-3, offsetY - 29, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffdd00";
  ctx.beginPath(); ctx.arc(-3, offsetY - 29, 2, 0, Math.PI * 2); ctx.fill();
  // petals
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    ctx.fillStyle = "#ff6600";
    ctx.beginPath();
    ctx.arc(-3 + Math.cos(angle) * 4, offsetY - 29 + Math.sin(angle) * 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawDawn(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, frame: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);

  const legBob = Math.sin(frame * 1.2) * 3;

  // Legs
  ctx.fillStyle = "#ffaa00";
  ctx.fillRect(-5, 18, 4, 8 + legBob);
  ctx.fillRect(1, 18, 4, 8 - legBob);
  // Feet
  ctx.fillRect(-7, 24, 7, 3);
  ctx.fillRect(1, 24, 7, 3);

  // Body (black chicken)
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(0, 8, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing
  const wingBob = Math.sin(frame * 1.2) * 5;
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.ellipse(7, 4 + wingBob, 5, 9, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(3, -10, 9, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Red comb
  ctx.fillStyle = "#cc0000";
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.lineTo(0, -22);
  ctx.lineTo(3, -17);
  ctx.lineTo(5, -21);
  ctx.lineTo(7, -17);
  ctx.lineTo(8, -15);
  ctx.lineTo(-2, -15);
  ctx.closePath();
  ctx.fill();

  // Wattle
  ctx.fillStyle = "#cc0000";
  ctx.beginPath();
  ctx.ellipse(5, -6, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Yellow beak
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.moveTo(10, -11);
  ctx.lineTo(16, -9);
  ctx.lineTo(10, -7);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(7, -12, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cc0000";
  ctx.beginPath();
  ctx.arc(8, -12, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(8, -12, 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawEgg(ctx: CanvasRenderingContext2D, egg: Egg) {
  if (egg.collected) return;
  const colors: Record<EggColor, string> = {
    red: "#ee3333",
    blue: "#3355ee",
    green: "#22aa44",
    yellow: "#ddcc00",
    purple: "#9933cc",
  };
  ctx.fillStyle = colors[egg.color];
  drawEggShape(ctx, egg.x, egg.y + Math.sin(egg.bobOffset) * 3, 8, 11);
  // shine
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(egg.x - 3, egg.y - 4 + Math.sin(egg.bobOffset) * 3, 3, 4, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrab(ctx: CanvasRenderingContext2D, crab: Crab) {
  ctx.save();
  ctx.translate(crab.x, crab.y);
  ctx.scale(crab.dir, 1);

  ctx.fillStyle = "#cc3300";
  // body
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.arc(-5, -6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -6, 2, 0, Math.PI * 2); ctx.fill();
  // claws
  ctx.fillStyle = "#dd4400";
  ctx.fillRect(-24, -8, 12, 6);
  ctx.fillRect(13, -8, 12, 6);
  ctx.fillStyle = "#cc3300";
  ctx.beginPath(); ctx.ellipse(-22, -5, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(22, -5, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  for (let i = -1; i <= 1; i += 1) {
    ctx.fillStyle = "#dd4400";
    ctx.fillRect(-16 + i * 4, 4, 4, 10);
    ctx.fillRect(8 + i * 4, 4, 4, 10);
  }

  ctx.restore();
}

function drawJellyfish(ctx: CanvasRenderingContext2D, jf: Jellyfish, worldTime: number) {
  const y = jf.startY + Math.sin(worldTime * jf.speed + jf.phase) * 40;
  ctx.save();
  ctx.translate(jf.x, y);

  // dome
  ctx.fillStyle = "rgba(200,100,220,0.7)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(230,150,250,0.5)";
  ctx.beginPath();
  ctx.ellipse(-5, -3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // tentacles
  ctx.strokeStyle = "rgba(180,80,200,0.7)";
  ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    const xOff = i * 5;
    ctx.beginPath();
    ctx.moveTo(xOff, 12);
    ctx.bezierCurveTo(
      xOff + 5, 20 + Math.sin(worldTime * 2 + i) * 5,
      xOff - 5, 28 + Math.sin(worldTime * 2 + i + 1) * 5,
      xOff + 2, 36
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawWave(ctx: CanvasRenderingContext2D, wave: Wave, worldTime: number, cameraX: number) {
  const screenX = wave.x - cameraX;
  const y = GROUND_Y + 30 + Math.sin(worldTime * 2 + wave.phase) * wave.amplitude;
  ctx.fillStyle = "rgba(0, 50, 180, 0.7)";
  ctx.beginPath();
  ctx.moveTo(screenX, CANVAS_H);
  ctx.bezierCurveTo(screenX + 20, y, screenX + 40, CANVAS_H - 20, screenX + 60, y - 10);
  ctx.bezierCurveTo(screenX + 80, CANVAS_H - 15, screenX + 100, y, screenX + 120, CANVAS_H);
  ctx.closePath();
  ctx.fill();
}

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud) {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(cloud.x, cloud.y, cloud.w * 0.5, cloud.w * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cloud.x - cloud.w * 0.25, cloud.y + 3, cloud.w * 0.3, cloud.w * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cloud.x + cloud.w * 0.25, cloud.y + 5, cloud.w * 0.35, cloud.w * 0.2, 0, 0, Math.PI * 2); ctx.fill();
}

function drawBranch(ctx: CanvasRenderingContext2D, branch: Branch, cameraX: number) {
  const sx = branch.x - cameraX;
  ctx.fillStyle = "#5a3010";
  ctx.fillRect(sx, branch.y, branch.w, 14);
  // leaves
  ctx.fillStyle = "#2a7a1a";
  ctx.beginPath();
  ctx.ellipse(sx + branch.w / 2, branch.y - 5, branch.w / 2 + 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoot(ctx: CanvasRenderingContext2D, rx: number, cameraX: number) {
  const sx = rx - cameraX;
  ctx.fillStyle = "#4a2810";
  ctx.beginPath();
  ctx.moveTo(sx, GROUND_Y);
  ctx.bezierCurveTo(sx + 10, GROUND_Y - 20, sx + 20, GROUND_Y - 15, sx + 30, GROUND_Y);
  ctx.fill();
}

function drawVolcano(ctx: CanvasRenderingContext2D, cameraX: number, worldTime: number) {
  const vx = LEVEL_LENGTH - 200 - cameraX;
  // mountain body
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.moveTo(vx, GROUND_Y);
  ctx.lineTo(vx + 100, GROUND_Y - 200);
  ctx.lineTo(vx + 200, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  // lava streams
  const lavaColors = ["#ff4400", "#ff6600", "#ff8800"];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = lavaColors[i % lavaColors.length];
    ctx.beginPath();
    const startX = vx + 80 + i * 15;
    ctx.moveTo(startX, GROUND_Y - 150 + i * 10);
    ctx.bezierCurveTo(
      startX + 10, GROUND_Y - 100,
      startX - 10 + Math.sin(worldTime + i) * 8, GROUND_Y - 50,
      startX + 5, GROUND_Y
    );
    ctx.lineWidth = 8;
    ctx.strokeStyle = lavaColors[i % lavaColors.length];
    ctx.stroke();
    ctx.fill();
  }
  // crater
  ctx.fillStyle = "#ff2200";
  ctx.beginPath();
  ctx.ellipse(vx + 100, GROUND_Y - 198, 25, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // lava glow
  const grad = ctx.createRadialGradient(vx + 100, GROUND_Y - 198, 5, vx + 100, GROUND_Y - 198, 60);
  grad.addColorStop(0, `rgba(255, 100, 0, ${0.4 + Math.sin(worldTime * 3) * 0.1})`);
  grad.addColorStop(1, "rgba(255, 50, 0, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(vx + 100, GROUND_Y - 198, 60, 0, Math.PI * 2);
  ctx.fill();
}

function drawBarn(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Barn body
  ctx.fillStyle = "#8B4513";
  ctx.fillRect(cx - 60, cy - 40, 120, 80);
  // Roof
  ctx.fillStyle = "#cc3300";
  ctx.beginPath();
  ctx.moveTo(cx - 75, cy - 40);
  ctx.lineTo(cx, cy - 90);
  ctx.lineTo(cx + 75, cy - 40);
  ctx.closePath();
  ctx.fill();
  // Door
  ctx.fillStyle = "#5a2d0c";
  ctx.fillRect(cx - 18, cy - 5, 36, 45);
  ctx.beginPath(); ctx.arc(cx, cy - 5, 18, Math.PI, 0); ctx.fill();
  // Window
  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(cx - 45, cy - 30, 22, 18);
  ctx.fillRect(cx + 23, cy - 30, 22, 18);
  // Grass
  ctx.fillStyle = "#44aa22";
  ctx.fillRect(cx - 90, cy + 40, 180, 20);
  // Window panes
  ctx.strokeStyle = "#5a2d0c"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 34, cy - 30); ctx.lineTo(cx - 34, cy - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 45, cy - 21); ctx.lineTo(cx - 23, cy - 21); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 34, cy - 30); ctx.lineTo(cx + 34, cy - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 23, cy - 21); ctx.lineTo(cx + 45, cy - 21); ctx.stroke();
}

// =====================================================================
// BACKGROUND DRAWING
// =====================================================================
function drawBackground(ctx: CanvasRenderingContext2D, level: number, bgScrollX: number, worldTime: number, clouds: Cloud[], cameraX: number) {
  if (level === 1) {
    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, "#87CEEB");
    skyGrad.addColorStop(1, "#d0eeff");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Clouds (parallax)
    clouds.forEach(c => {
      const parallaxX = c.x - bgScrollX * 0.3;
      drawCloud(ctx, { x: ((parallaxX % (CANVAS_W + 200)) + CANVAS_W + 200) % (CANVAS_W + 200) - 100, y: c.y, w: c.w });
    });

    // Ocean band
    ctx.fillStyle = "#1a3a8a";
    ctx.fillRect(0, GROUND_Y - 15, CANVAS_W, 80);
    // Ocean wave highlights
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(100,160,255,${0.3 + Math.sin(worldTime + i) * 0.1})`;
      const wx = ((i * 200 - bgScrollX * 0.5) % (CANVAS_W + 200) + CANVAS_W + 200) % (CANVAS_W + 200) - 100;
      ctx.beginPath();
      ctx.ellipse(wx, GROUND_Y - 5, 60, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sandy ground
    ctx.fillStyle = "#f0d060";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 40);
    // Orange stripe
    ctx.fillStyle = "#c87830";
    ctx.fillRect(0, GROUND_Y + 35, CANVAS_W, 15);
    // Sand texture bumps
    ctx.fillStyle = "#e8c850";
    for (let i = 0; i < 12; i++) {
      const bx = ((i * 80 - bgScrollX * 0.2 + 20) % (CANVAS_W + 100) + CANVAS_W + 100) % (CANVAS_W + 100) - 50;
      ctx.beginPath(); ctx.ellipse(bx, GROUND_Y + 5, 25, 8, 0, 0, Math.PI * 2); ctx.fill();
    }

  } else if (level === 2) {
    // Deep blue underwater
    const seaGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    seaGrad.addColorStop(0, "#003366");
    seaGrad.addColorStop(1, "#001a33");
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Bubbles
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 120 - bgScrollX * 0.15) % (CANVAS_W + 50) + CANVAS_W + 50) % (CANVAS_W + 50) - 25;
      const by = ((worldTime * 30 + i * 60) % 380);
      ctx.fillStyle = `rgba(100,180,255,${0.15 + Math.sin(worldTime + i) * 0.05})`;
      ctx.beginPath(); ctx.arc(bx, by, 4 + (i % 3) * 2, 0, Math.PI * 2); ctx.fill();
    }

    // Light rays from above
    ctx.fillStyle = "rgba(100,180,255,0.04)";
    for (let i = 0; i < 4; i++) {
      const rx = i * 220 - 50 + Math.sin(worldTime * 0.5 + i) * 20;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + 30, 0);
      ctx.lineTo(rx + 60, CANVAS_H);
      ctx.lineTo(rx + 30, CANVAS_H);
      ctx.closePath();
      ctx.fill();
    }

    // Sandy seafloor
    ctx.fillStyle = "#b8a870";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 90);

    // Coral and seaweed
    for (let i = 0; i < 8; i++) {
      const cx2 = ((i * 120 + 40 - cameraX * 0.8) % (CANVAS_W + 100) + CANVAS_W + 100) % (CANVAS_W + 100) - 50;
      if (i % 2 === 0) {
        // Coral
        ctx.fillStyle = `hsl(${0 + (i * 20)}, 80%, 55%)`;
        ctx.beginPath(); ctx.arc(cx2, GROUND_Y - 5, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(cx2 - 3, GROUND_Y - 25, 6, 22);
        ctx.beginPath(); ctx.arc(cx2 - 12, GROUND_Y - 22, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2 + 12, GROUND_Y - 20, 8, 0, Math.PI * 2); ctx.fill();
      } else {
        // Seaweed
        ctx.strokeStyle = "#228B22";
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const sy = GROUND_Y - j * 12;
          const sxOff = Math.sin(worldTime * 1.5 + j * 0.5 + i) * 8;
          if (j === 0) ctx.moveTo(cx2, sy);
          else ctx.lineTo(cx2 + sxOff, sy);
        }
        ctx.stroke();
      }
    }

  } else if (level === 3) {
    // Forest sky
    ctx.fillStyle = "#aaddaa";
    ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);

    // Tree trunks (parallax)
    for (let i = 0; i < 10; i++) {
      const tx = ((i * 140 + 30 - bgScrollX * 0.6) % (CANVAS_W + 200) + CANVAS_W + 200) % (CANVAS_W + 200) - 100;
      ctx.fillStyle = "#5a3010";
      ctx.fillRect(tx - 15, GROUND_Y - 250, 30, 250);
    }

    // Dense canopy
    const canopyGrad = ctx.createLinearGradient(0, 0, 0, 100);
    canopyGrad.addColorStop(0, "#1a5c00");
    canopyGrad.addColorStop(1, "#2d8020");
    ctx.fillStyle = canopyGrad;
    ctx.fillRect(0, 0, CANVAS_W, 90);
    // Canopy bumps
    for (let i = 0; i < 8; i++) {
      const cx3 = ((i * 130 - bgScrollX * 0.6) % (CANVAS_W + 200) + CANVAS_W + 200) % (CANVAS_W + 200) - 100;
      ctx.fillStyle = "#2a7a10";
      ctx.beginPath(); ctx.ellipse(cx3, 80, 80, 50, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Ground
    ctx.fillStyle = "#88bb44";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 40);
    ctx.fillStyle = "#66aa22";
    ctx.fillRect(0, GROUND_Y + 35, CANVAS_W, 15);

    // Flowers
    const flowerColors = ["#ee4444", "#3366ee", "#44cc44"];
    for (let i = 0; i < 10; i++) {
      const fx = ((i * 100 + 50 - cameraX * 0.9) % (CANVAS_W + 100) + CANVAS_W + 100) % (CANVAS_W + 100) - 50;
      const fc = flowerColors[i % flowerColors.length];
      ctx.fillStyle = fc;
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(fx + Math.cos(pa) * 4, GROUND_Y - 5 + Math.sin(pa) * 4, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#ffee00";
      ctx.beginPath(); ctx.arc(fx, GROUND_Y - 5, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// =====================================================================
// HUD
// =====================================================================
function drawHUD(ctx: CanvasRenderingContext2D, lives: number, timer: number, eggsCollected: number, level: number, powerUps: PowerUp[]) {
  // HUD background
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, CANVAS_W, 38);

  // Lives (egg icons)
  for (let i = 0; i < 5; i++) {
    const ex = 12 + i * 24;
    const alive = i < lives;
    ctx.fillStyle = alive ? "#f5c518" : "rgba(255,255,255,0.2)";
    drawEggShape(ctx, ex, 19, 7, 10);
    if (!alive) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(ex, 19, 7, 10, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Timer
  const timeColor = timer <= 10 ? "#ff4444" : "#ffffff";
  ctx.fillStyle = timeColor;
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.ceil(timer)}s`, CANVAS_W / 2, 25);

  // Level indicator
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px monospace";
  ctx.fillText(`LVL ${level}`, CANVAS_W / 2, 36);

  // Eggs collected
  const eggCount = `🥚 ${eggsCollected}/10`;
  ctx.fillStyle = eggsCollected >= 5 ? "#44ee44" : "#ffffff";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "right";
  ctx.fillText(eggCount, CANVAS_W - 10, 25);

  // Power-up indicators
  const now = Date.now();
  let puX = CANVAS_W - 15;
  const puColors: Record<EggColor, string> = { red: "#ff4444", blue: "#4488ff", green: "#44cc44", yellow: "#ffcc00", purple: "#aa44ff" };
  for (const pu of powerUps) {
    if (pu.endTime > now) {
      const remaining = (pu.endTime - now) / POWERUP_DURATION;
      ctx.fillStyle = puColors[pu.color];
      ctx.beginPath(); ctx.arc(puX, 30, 5, 0, Math.PI * 2 * remaining); ctx.fill();
      puX -= 14;
    }
  }

  ctx.textAlign = "left";
}

// =====================================================================
// ARROW INDICATOR
// =====================================================================
function drawArrowIndicator(ctx: CanvasRenderingContext2D, playerScreenX: number, dawnWorldX: number, cameraX: number) {
  const dawnScreenX = dawnWorldX - cameraX;
  if (dawnScreenX >= 0 && dawnScreenX <= CANVAS_W) return; // on screen

  const dir = dawnScreenX < 0 ? -1 : 1;
  const ax = dir < 0 ? 30 : CANVAS_W - 30;
  const ay = 200;

  ctx.save();
  ctx.fillStyle = "#ffcc00";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.translate(ax, ay);
  // pulse
  const pulse = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
  ctx.scale(pulse, pulse);

  ctx.beginPath();
  if (dir < 0) {
    ctx.moveTo(0, 0);
    ctx.lineTo(20, -12);
    ctx.lineTo(12, -3);
    ctx.lineTo(12, -3);
    ctx.lineTo(28, -3);
    ctx.lineTo(28, 3);
    ctx.lineTo(12, 3);
    ctx.lineTo(20, 12);
  } else {
    ctx.moveTo(28, 0);
    ctx.lineTo(8, -12);
    ctx.lineTo(16, -3);
    ctx.lineTo(0, -3);
    ctx.lineTo(0, 3);
    ctx.lineTo(16, 3);
    ctx.lineTo(8, 12);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// =====================================================================
// STORY CARD
// =====================================================================
function drawStoryCard(ctx: CanvasRenderingContext2D, level: number, _timer: number) {
  // Background
  const bgColors = ["#1a6aaa", "#003366", "#1a4a1a"];
  ctx.fillStyle = bgColors[level - 1];
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Decorative horizontal lines
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 50);
    ctx.lineTo(CANVAS_W, i * 50);
    ctx.stroke();
  }

  // Card
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  const rx2 = 80, ry2 = 80, rw = 640, rh = 290;
  ctx.roundRect(rx2, ry2, rw, rh, 20);
  ctx.fill();

  // Title
  ctx.fillStyle = bgColors[level - 1];
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`Level ${level}`, CANVAS_W / 2, ry2 + 45);

  // Story text
  ctx.fillStyle = "#333";
  ctx.font = "16px monospace";
  const lines = STORY_TEXTS[level - 1].split("\n");
  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_W / 2, ry2 + 90 + i * 28);
  });

  // "Tap to continue" prompt
  const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.fillStyle = `rgba(0,80,180,${alpha})`;
  ctx.font = "bold 18px monospace";
  ctx.fillText("[ Tap / Press Enter to Start ]", CANVAS_W / 2, CANVAS_H - 30);

  ctx.textAlign = "left";
}

// =====================================================================
// START SCREEN
// =====================================================================
function drawStartScreen(ctx: CanvasRenderingContext2D, lolaFrame: number) {
  // Beach background
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  skyGrad.addColorStop(0, "#4a9de0");
  skyGrad.addColorStop(0.6, "#87CEEB");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Ocean
  ctx.fillStyle = "#1a3a8a";
  ctx.fillRect(0, 300, CANVAS_W, 80);

  // Beach
  ctx.fillStyle = "#f0d060";
  ctx.fillRect(0, 340, CANVAS_W, 110);

  // Clouds
  for (let i = 0; i < 3; i++) {
    drawCloud(ctx, { x: 120 + i * 250, y: 60 + i * 20, w: 90 + i * 20 });
  }

  // Title "Egg Beach"
  ctx.textAlign = "center";
  // Shadow
  ctx.fillStyle = "#003366";
  ctx.font = "bold 72px monospace";
  ctx.fillText("EGG BEACH", CANVAS_W / 2 + 4, 134);
  // Main text with gradient
  const titleGrad = ctx.createLinearGradient(0, 70, 0, 140);
  titleGrad.addColorStop(0, "#ffee00");
  titleGrad.addColorStop(0.5, "#ffaa00");
  titleGrad.addColorStop(1, "#ff6600");
  ctx.fillStyle = titleGrad;
  ctx.fillText("EGG BEACH", CANVAS_W / 2, 130);
  // Underline
  ctx.fillStyle = "#003366";
  ctx.fillRect(CANVAS_W / 2 - 200, 140, 400, 5);

  // Tagline
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px monospace";
  ctx.fillText("Chase the chicken. Collect the eggs!", CANVAS_W / 2, 170);

  // Lola idle on start screen
  drawLola(ctx, CANVAS_W / 2 - 40, 325, 1, false, lolaFrame, []);
  // Dawn on start screen
  drawDawn(ctx, CANVAS_W / 2 + 40, 325, -1, lolaFrame);

  // Arrow between them
  ctx.fillStyle = "#ff4400";
  ctx.font = "bold 28px monospace";
  ctx.fillText("→", CANVAS_W / 2 - 5, 325);

  // Press to start
  const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = "bold 20px monospace";
  ctx.fillText("Press ENTER or Tap to Start", CANVAS_W / 2, CANVAS_H - 30);

  ctx.textAlign = "left";
}

// =====================================================================
// GAME OVER SCREEN
// =====================================================================
function drawGameOver(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ff4444";
  ctx.font = "bold 60px monospace";
  ctx.fillText("GAME OVER", CANVAS_W / 2, 180);

  ctx.fillStyle = "#fff";
  ctx.font = "22px monospace";
  ctx.fillText("The eggs got away!", CANVAS_W / 2, 240);

  const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = "bold 18px monospace";
  ctx.fillText("Press ENTER or Tap to Try Again", CANVAS_W / 2, 320);
  ctx.textAlign = "left";
}

// =====================================================================
// WIN SCREEN
// =====================================================================
function drawWinScreen(ctx: CanvasRenderingContext2D, animTime: number) {
  // Green meadow background
  ctx.fillStyle = "#7dd67d";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#aee87a";
  ctx.fillRect(0, 300, CANVAS_W, CANVAS_H - 300);
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, CANVAS_W, 300);

  // Clouds
  for (let i = 0; i < 4; i++) {
    drawCloud(ctx, { x: 80 + i * 200, y: 50 + (i % 2) * 30, w: 80 + (i % 2) * 30 });
  }

  // Barn
  drawBarn(ctx, CANVAS_W / 2, 300);

  // Celebrate text
  const bounce = Math.sin(animTime * 3) * 8;
  ctx.textAlign = "center";
  ctx.fillStyle = "#003300";
  ctx.font = "bold 56px monospace";
  ctx.fillText("YOU WIN! 🎉", CANVAS_W / 2 + 3, 123 + bounce);
  ctx.fillStyle = "#ffee00";
  ctx.fillText("YOU WIN! 🎉", CANVAS_W / 2, 120 + bounce);

  ctx.fillStyle = "#1a3300";
  ctx.font = "18px monospace";
  ctx.fillText("Lola catches Dawn just in time!", CANVAS_W / 2, 162);
  ctx.fillText("The eggs are safe! 🥚", CANVAS_W / 2, 188);

  // Stars / confetti
  for (let i = 0; i < 15; i++) {
    const sx = ((i * 60 + animTime * 80 * (i % 2 === 0 ? 1 : -0.7)) % (CANVAS_W + 50) + CANVAS_W + 50) % (CANVAS_W + 50) - 25;
    const sy = ((animTime * 40 + i * 40) % CANVAS_H);
    ctx.fillStyle = `hsl(${(i * 25 + animTime * 60) % 360}, 90%, 60%)`;
    ctx.fillRect(sx, sy, 8, 8);
  }

  const alpha = 0.5 + Math.sin(animTime * 3) * 0.5;
  ctx.fillStyle = `rgba(0,80,0,${alpha})`;
  ctx.font = "bold 18px monospace";
  ctx.fillText("Press ENTER or Tap to Play Again", CANVAS_W / 2, CANVAS_H - 20);

  ctx.textAlign = "left";
}

// =====================================================================
// WORLD INITIALIZATION
// =====================================================================
function initLevel(level: number, gs: GameStateData) {
  // Player
  gs.player.x = 100;
  gs.player.y = GROUND_Y - 40;
  gs.player.vx = 0;
  gs.player.vy = 0;
  gs.player.onGround = true;
  gs.player.jumpsLeft = 2;
  gs.player.crouching = false;
  gs.player.facing = 1;
  gs.player.frame = 0;
  gs.player.frameTime = 0;
  gs.player.powerUps = [];

  // Dawn
  gs.dawn.x = 350;
  gs.dawn.y = GROUND_Y - 35;
  gs.dawn.vx = DAWN_SPEED[level - 1];
  gs.dawn.vy = 0;
  gs.dawn.onGround = true;
  gs.dawn.dir = 1;
  gs.dawn.frame = 0;
  gs.dawn.frameTime = 0;
  gs.dawn.reverseCooldown = 0;

  gs.cameraX = 0;
  gs.timer = TIMER_SECONDS;
  gs.eggsCollected = 0;

  // Generate eggs
  gs.eggs = [];
  const eggPositions = new Set<number>();
  for (let i = 0; i < 10; i++) {
    let ex = 0;
    do { ex = Math.floor(Math.random() * (LEVEL_LENGTH - 400)) + 200; }
    while (eggPositions.has(ex));
    eggPositions.add(ex);
    gs.eggs.push({
      id: i,
      x: ex,
      y: GROUND_Y - 15,
      color: EGG_COLORS[i % EGG_COLORS.length],
      collected: false,
      bobOffset: Math.random() * Math.PI * 2,
    });
  }

  // Level 1: crabs
  gs.crabs = [];
  if (level === 1) {
    for (let i = 0; i < 6; i++) {
      gs.crabs.push({ x: 500 + i * 600, y: GROUND_Y - 10, dir: i % 2 === 0 ? 1 : -1, speed: 1.5 + Math.random() });
    }
  }

  // Level 2: jellyfish
  gs.jellyfish = [];
  if (level === 2) {
    for (let i = 0; i < 8; i++) {
      gs.jellyfish.push({ x: 400 + i * 550, startY: 150 + Math.random() * 150, phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() * 0.5 });
    }
  }

  // Level 1: waves
  gs.waves = [];
  if (level === 1) {
    for (let i = 0; i < 8; i++) {
      gs.waves.push({ x: 600 + i * 550, phase: Math.random() * Math.PI * 2, amplitude: 20 + Math.random() * 15 });
    }
  }

  // Level 3: branches and roots
  gs.branches = [];
  gs.roots = [];
  if (level === 3) {
    for (let i = 0; i < 10; i++) {
      gs.branches.push({ x: 600 + i * 400, y: GROUND_Y - 120 - Math.random() * 60, w: 80 + Math.random() * 60 });
    }
    for (let i = 0; i < 15; i++) {
      gs.roots.push({ x: 450 + i * 300 });
    }
  }

  // Clouds
  gs.clouds = [];
  for (let i = 0; i < 8; i++) {
    gs.clouds.push({ x: i * 200 + Math.random() * 100, y: 50 + Math.random() * 80, w: 80 + Math.random() * 60 });
  }

  gs.bgScrollX = 0;
}

// =====================================================================
// COLLISION DETECTION
// =====================================================================
function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// =====================================================================
// POWER-UP EFFECTS
// =====================================================================
function hasPowerUp(gs: GameStateData, color: EggColor): boolean {
  const now = Date.now();
  return gs.player.powerUps.some(p => p.color === color && p.endTime > now);
}

function addPowerUp(gs: GameStateData, color: EggColor) {
  const now = Date.now();
  const existing = gs.player.powerUps.find(p => p.color === color);
  if (existing) {
    existing.endTime = now + POWERUP_DURATION;
  } else {
    gs.player.powerUps.push({ color, endTime: now + POWERUP_DURATION });
  }
  playSoundPowerUp();
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

  function makeInitialState(): GameStateData {
    return {
      state: "START",
      level: 1,
      lives: 5,
      timer: TIMER_SECONDS,
      eggsCollected: 0,
      score: 0,
      player: {
        x: 100, y: GROUND_Y - 40, vx: 0, vy: 0,
        onGround: true, jumpsLeft: 2, crouching: false, facing: 1,
        frameTime: 0, frame: 0, powerUps: [],
      },
      dawn: {
        x: 350, y: GROUND_Y - 35, vx: 2.8, vy: 0,
        onGround: true, dir: 1, frameTime: 0, frame: 0, reverseCooldown: 0,
      },
      cameraX: 0,
      eggs: [],
      crabs: [],
      jellyfish: [],
      waves: [],
      branches: [],
      roots: [],
      clouds: [],
      bgScrollX: 0,
      storyTimer: 0,
      winAnimTime: 0,
      lolaIdleFrame: 0,
      lolaIdleTime: 0,
    };
  }

  const startGame = useCallback(() => {
    const gs = gsRef.current!;
    gs.state = "STORY";
    gs.storyTimer = 0;
  }, []);

  const startLevel = useCallback(() => {
    const gs = gsRef.current!;
    gs.state = "PLAYING";
    initLevel(gs.level, gs);
  }, []);

  const nextLevel = useCallback(() => {
    const gs = gsRef.current!;
    gs.level++;
    if (gs.level > 3) {
      gs.state = "WIN";
      gs.winAnimTime = 0;
      playSoundLevelComplete();
    } else {
      gs.state = "STORY";
      gs.storyTimer = 0;
      playSoundLevelComplete();
    }
  }, []);

  const resetGame = useCallback(() => {
    const gs = gsRef.current!;
    const newGs = makeInitialState();
    Object.assign(gs, newGs);
  }, []);

  const loseLife = useCallback(() => {
    const gs = gsRef.current!;
    if (hasPowerUp(gs, "purple")) {
      // damage resistance: remove purple power-up instead
      gs.player.powerUps = gs.player.powerUps.filter(p => p.color !== "purple");
      return;
    }
    gs.lives--;
    playSoundLifeLost();
    if (gs.lives <= 0) {
      gs.state = "GAME_OVER";
    } else {
      // respawn
      gs.player.x = Math.max(gs.cameraX + 50, 100);
      gs.player.y = GROUND_Y - 40;
      gs.player.vx = 0;
      gs.player.vy = 0;
    }
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gs = gsRef.current!;

    const dt = Math.min((timestamp - lastTimeRef.current) / 16.667, 3); // normalized to 60fps
    lastTimeRef.current = timestamp;

    const worldTime = timestamp / 1000;

    // ---- UPDATE ----
    if (gs.state === "START") {
      gs.lolaIdleTime += dt;
      if (gs.lolaIdleTime > 8) {
        gs.lolaIdleTime = 0;
        gs.lolaIdleFrame = (gs.lolaIdleFrame + 1) % 8;
      }
    } else if (gs.state === "STORY") {
      gs.storyTimer += dt;
    } else if (gs.state === "WIN") {
      gs.winAnimTime += dt * 0.016;
    } else if (gs.state === "PLAYING") {
      const keys = keysRef.current;
      const touch = touchRef.current;
      const p = gs.player;
      const dawn = gs.dawn;

      // Timer
      gs.timer -= dt / 60;
      if (gs.timer <= 0) {
        gs.state = "GAME_OVER";
      }

      // Clean expired power-ups
      const now = Date.now();
      p.powerUps = p.powerUps.filter(pu => pu.endTime > now);

      // Player movement
      const speedMultiplier = hasPowerUp(gs, "red") ? 1.55 : 1;
      const targetSpeed = PLAYER_SPEED * speedMultiplier;
      const crouchSpeed = targetSpeed * 0.5;
      const isUnderwater = gs.level === 2;
      const gravity = isUnderwater ? UNDERWATER_GRAVITY : GRAVITY;
      const jumpForce = isUnderwater ? UNDERWATER_JUMP_FORCE : (hasPowerUp(gs, "blue") ? JUMP_FORCE * 1.35 : JUMP_FORCE);
      const agile = hasPowerUp(gs, "yellow") ? 1.6 : 1;

      const movingLeft = keys["a"] || keys["ArrowLeft"] || touch.left;
      const movingRight = keys["d"] || keys["ArrowRight"] || touch.right;
      const wantJump = keys["w"] || keys["ArrowUp"] || keys[" "] || justPressedRef.current.jump;
      const wantCrouch = keys["s"] || keys["ArrowDown"] || touch.crouch;

      justPressedRef.current.jump = false;

      const spd = wantCrouch ? crouchSpeed : targetSpeed;

      if (movingLeft) {
        p.vx = -spd * agile;
        p.facing = -1;
      } else if (movingRight) {
        p.vx = spd * agile;
        p.facing = 1;
      } else {
        p.vx *= 0.75;
      }

      p.crouching = wantCrouch && p.onGround;

      if (wantJump && p.jumpsLeft > 0) {
        p.vy = jumpForce;
        p.jumpsLeft--;
        p.onGround = false;
        playSoundJump();
      }

      // Apply gravity
      p.vy += gravity * dt;
      if (isUnderwater) p.vy *= 0.97; // floatiness

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Ground collision
      const groundY = GROUND_Y - 40;
      if (p.y >= groundY) {
        p.y = groundY;
        p.vy = 0;
        p.onGround = true;
        p.jumpsLeft = 2;
      }

      // Keep player in world bounds
      const minX = gs.cameraX - 50;
      const maxX = LEVEL_LENGTH - 30;
      if (p.x < minX) { p.x = minX; p.vx = 0; }
      if (p.x > maxX) { p.x = maxX; p.vx = 0; }

      // Keep player above screen top
      if (p.y < 40) { p.y = 40; p.vy = 0; }

      // Player animation
      p.frameTime += dt;
      if (p.frameTime > 4) { p.frameTime = 0; p.frame++; }

      // ---- DAWN AI ----
      const baseSpeed = DAWN_SPEED[gs.level - 1];
      dawn.reverseCooldown = Math.max(0, dawn.reverseCooldown - dt);

      // Chase-away logic: dawn tries to stay ahead of Lola
      const dawnDistAhead = (dawn.x - p.x) * dawn.dir;
      if (dawnDistAhead < 80 && dawn.reverseCooldown <= 0) {
        // Dawn is close, try to run away
        dawn.dir = p.x < dawn.x ? 1 : -1;
        dawn.reverseCooldown = 60;
      }

      // Occasional random reverse
      if (Math.random() < DAWN_REVERSE_PROB[gs.level - 1] * dt && dawn.reverseCooldown <= 0) {
        dawn.dir *= -1;
        dawn.reverseCooldown = 120;
      }

      // Dawn jumps
      if (Math.random() < DAWN_JUMP_PROB[gs.level - 1] * dt && dawn.onGround) {
        dawn.vy = jumpForce * 0.8;
        dawn.onGround = false;
      }

      dawn.vx = baseSpeed * dawn.dir;
      dawn.vy += gravity * dt;
      dawn.x += dawn.vx * dt;
      dawn.y += dawn.vy * dt;

      if (dawn.y >= groundY) { dawn.y = groundY; dawn.vy = 0; dawn.onGround = true; }
      if (dawn.y < 40) { dawn.y = 40; dawn.vy = 0; }

      // Dawn world boundaries
      if (dawn.x < 50) { dawn.x = 50; dawn.dir = 1; dawn.reverseCooldown = 120; }
      if (dawn.x > LEVEL_LENGTH - 100) { dawn.x = LEVEL_LENGTH - 100; dawn.dir = -1; dawn.reverseCooldown = 120; }

      dawn.frameTime += dt;
      if (dawn.frameTime > 3) { dawn.frameTime = 0; dawn.frame++; }

      // ---- CAMERA ----
      const targetCamX = p.x - CANVAS_W * 0.35;
      gs.cameraX += (targetCamX - gs.cameraX) * 0.12 * dt;
      gs.cameraX = Math.max(0, Math.min(gs.cameraX, LEVEL_LENGTH - CANVAS_W));
      gs.bgScrollX = gs.cameraX;

      // ---- EGG COLLECTION ----
      for (const egg of gs.eggs) {
        if (egg.collected) continue;
        egg.bobOffset += 0.05 * dt;
        const pw = 20, ph = 38;
        const ex2 = egg.x - gs.cameraX;
        if (rectsOverlap(p.x - gs.cameraX - 10, p.y - ph / 2, pw, ph, ex2 - 8, egg.y - 11, 16, 22)) {
          egg.collected = true;
          gs.eggsCollected++;
          addPowerUp(gs, egg.color);
          playSoundEggCollect();
        }
      }

      // ---- CATCH DAWN ----
      const catchRange = hasPowerUp(gs, "green") ? 55 : 35;
      if (Math.abs(p.x - dawn.x) < catchRange && Math.abs(p.y - dawn.y) < 60) {
        if (gs.eggsCollected >= 5) {
          nextLevel();
        }
      }

      // ---- LEVEL 1 OBSTACLES ----
      if (gs.level === 1) {
        // Crabs
        for (const crab of gs.crabs) {
          crab.x += crab.speed * crab.dir * dt;
          if (crab.x < 50 || crab.x > LEVEL_LENGTH - 50) crab.dir *= -1;
          const cx4 = crab.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 10, p.y - 35, 20, 38, cx4 - 18, crab.y - 9, 36, 18)) {
            loseLife();
          }
        }

        // Waves
        for (const wave of gs.waves) {
          const waveY = GROUND_Y + 30 + Math.sin(worldTime * 2 + wave.phase) * wave.amplitude;
          const wx2 = wave.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 10, p.y - 35, 20, 50, wx2, waveY, 120, CANVAS_H - waveY)) {
            loseLife();
          }
        }

        // Lava (end of level 1? -- level 3 has lava, not level 1, skip)
      }

      // ---- LEVEL 2 OBSTACLES ----
      if (gs.level === 2) {
        for (const jf of gs.jellyfish) {
          const jfY = jf.startY + Math.sin(worldTime * jf.speed + jf.phase) * 40;
          const jx = jf.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 10, p.y - 35, 20, 50, jx - 18, jfY - 12, 36, 50)) {
            loseLife();
          }
        }
      }

      // ---- LEVEL 3 OBSTACLES ----
      if (gs.level === 3) {
        // Branches (duck under)
        for (const branch of gs.branches) {
          const bx2 = branch.x - gs.cameraX;
          if (!p.crouching && rectsOverlap(p.x - gs.cameraX - 10, p.y - 38, 20, 38, bx2, branch.y, branch.w, 14)) {
            loseLife();
          }
        }

        // Roots (jump over)
        for (const root of gs.roots) {
          const rx3 = root.x - gs.cameraX;
          if (rectsOverlap(p.x - gs.cameraX - 10, p.y - 10, 20, 10, rx3 - 5, GROUND_Y - 22, 35, 22)) {
            loseLife();
          }
        }

        // Lava at volcano
        const volcanoX = LEVEL_LENGTH - 200;
        const lavaX = volcanoX + 60;
        const lavaScreenX = lavaX - gs.cameraX;
        if (rectsOverlap(p.x - gs.cameraX - 10, p.y - 38, 20, 50, lavaScreenX, 0, 80, CANVAS_H)) {
          loseLife();
        }
      }
    }

    // ---- DRAW ----
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (gs.state === "START") {
      drawStartScreen(ctx, gs.lolaIdleFrame);
    } else if (gs.state === "STORY") {
      drawStoryCard(ctx, gs.level, gs.storyTimer);
    } else if (gs.state === "GAME_OVER") {
      drawGameOver(ctx);
    } else if (gs.state === "WIN") {
      drawWinScreen(ctx, gs.winAnimTime);
    } else if (gs.state === "PLAYING") {
      const gs2 = gs;

      // Background
      drawBackground(ctx, gs2.level, gs2.bgScrollX, worldTime, gs2.clouds, gs2.cameraX);

      // Level 3: branches (behind players)
      if (gs2.level === 3) {
        gs2.branches.forEach(b => drawBranch(ctx, b, gs2.cameraX));
        gs2.roots.forEach(r => drawRoot(ctx, r.x, gs2.cameraX));
        drawVolcano(ctx, gs2.cameraX, worldTime);
      }

      // Eggs
      gs2.eggs.forEach(e => {
        const ex = e.x - gs2.cameraX;
        if (ex > -20 && ex < CANVAS_W + 20) {
          drawEgg(ctx, { ...e, x: ex });
        }
      });

      // Level 1: waves
      if (gs2.level === 1) {
        gs2.waves.forEach(w => drawWave(ctx, w, worldTime, gs2.cameraX));
        gs2.crabs.forEach(c => {
          const cx5 = c.x - gs2.cameraX;
          if (cx5 > -40 && cx5 < CANVAS_W + 40) drawCrab(ctx, { ...c, x: cx5 });
        });
      }

      // Level 2: jellyfish
      if (gs2.level === 2) {
        gs2.jellyfish.forEach(jf => {
          const jx2 = jf.x - gs2.cameraX;
          if (jx2 > -50 && jx2 < CANVAS_W + 50) drawJellyfish(ctx, { ...jf, x: jx2 }, worldTime);
        });
      }

      // Lola
      drawLola(ctx, gs2.player.x - gs2.cameraX, gs2.player.y, gs2.player.facing, gs2.player.crouching, gs2.player.frame, gs2.player.powerUps);

      // Dawn
      const dawnSX = gs2.dawn.x - gs2.cameraX;
      if (dawnSX > -40 && dawnSX < CANVAS_W + 40) {
        drawDawn(ctx, dawnSX, gs2.dawn.y, gs2.dawn.dir, gs2.dawn.frame);
      }

      // Arrow to Dawn
      drawArrowIndicator(ctx, gs2.player.x - gs2.cameraX, gs2.dawn.x, gs2.cameraX);

      // HUD
      drawHUD(ctx, gs2.lives, gs2.timer, gs2.eggsCollected, gs2.level, gs2.player.powerUps);

      // Egg requirement hint
      if (gs2.eggsCollected < 5) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(CANVAS_W / 2 - 140, CANVAS_H - 32, 280, 26);
        ctx.fillStyle = "#ffcc00";
        ctx.font = "13px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`Collect ${5 - gs2.eggsCollected} more egg(s) before catching Dawn!`, CANVAS_W / 2, CANVAS_H - 14);
        ctx.textAlign = "left";
      }
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [nextLevel, loseLife]);

  // Key handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key === " " ? " " : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current[key] = true;

      if (key === "w" || key === "ArrowUp" || key === " ") {
        justPressedRef.current.jump = true;
      }

      const gs = gsRef.current!;
      if (key === "Enter" || key === " ") {
        if (gs.state === "START") startGame();
        else if (gs.state === "STORY") startLevel();
        else if (gs.state === "GAME_OVER") resetGame();
        else if (gs.state === "WIN") resetGame();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key === " " ? " " : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current[key] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startGame, startLevel, resetGame]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => {
      const pw = parent.clientWidth;
      const ph = parent.clientHeight;
      const scale = Math.min(pw / CANVAS_W, ph / CANVAS_H);
      canvas.style.width = `${CANVAS_W * scale}px`;
      canvas.style.height = `${CANVAS_H * scale}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Init and game loop
  useEffect(() => {
    gsRef.current = makeInitialState();
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameLoop]);

  // Touch button handlers
  const makeTouchHandlers = (key: keyof typeof touchRef.current) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      touchRef.current[key] = true;
      if (key === "jump") justPressedRef.current.jump = true;
      // Handle tap on non-playing screens
      const gs = gsRef.current!;
      if (key === "jump") {
        if (gs.state === "START") startGame();
        else if (gs.state === "STORY") startLevel();
        else if (gs.state === "GAME_OVER") resetGame();
        else if (gs.state === "WIN") resetGame();
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      touchRef.current[key] = false;
    },
  });

  // Canvas tap handler for story/start screens
  const handleCanvasTap = () => {
    const gs = gsRef.current!;
    if (gs.state === "START") startGame();
    else if (gs.state === "STORY") startLevel();
    else if (gs.state === "GAME_OVER") resetGame();
    else if (gs.state === "WIN") resetGame();
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 overflow-hidden select-none" style={{ touchAction: "none" }}>
      <div className="relative flex items-center justify-center w-full h-full">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block cursor-pointer"
          style={{ imageRendering: "pixelated" }}
          onClick={handleCanvasTap}
        />
      </div>

      {/* Mobile Controls */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end px-4 pb-4 pointer-events-none"
        style={{ maxWidth: "100vw" }}>
        {/* Left / Right buttons */}
        <div className="flex gap-2 pointer-events-auto">
          <button
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-bold select-none"
            style={{ background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.3)", WebkitTapHighlightColor: "transparent" }}
            {...makeTouchHandlers("left")}
          >◀</button>
          <button
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-bold select-none"
            style={{ background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.3)", WebkitTapHighlightColor: "transparent" }}
            {...makeTouchHandlers("right")}
          >▶</button>
        </div>

        {/* Jump / Crouch buttons */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-bold select-none"
            style={{ background: "rgba(0,0,150,0.65)", border: "2px solid rgba(100,150,255,0.5)", WebkitTapHighlightColor: "transparent" }}
            {...makeTouchHandlers("jump")}
          >▲</button>
          <button
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-bold select-none"
            style={{ background: "rgba(0,100,0,0.65)", border: "2px solid rgba(100,255,100,0.5)", WebkitTapHighlightColor: "transparent" }}
            {...makeTouchHandlers("crouch")}
          >▼</button>
        </div>
      </div>
    </div>
  );
}
