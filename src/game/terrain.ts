/**
 * Level terrain, and the little language the levels are written in.
 *
 * Before this, every level was one flat line 5000px long — `GROUND_Y` was a
 * constant and every egg sat on it. That meant you could finish the whole game by
 * holding right: nothing ever had to be jumped over, so the double jump, coyote
 * time and variable jump height were all working and all pointless.
 *
 * A level is now a list of beats, authored by hand rather than scattered at random
 * x-positions, which is what lets a level have rhythm — teach a thing, test it,
 * give a breather, reward it.
 */

export const BASE_GROUND = 360;

/** One authored piece of a level, laid down left to right. */
export type Beat =
  /** Solid ground. `up` raises the surface above the level's base height. */
  | { t: "ground"; len: number; up?: number }
  /** A hole. Falling in costs a life. */
  | { t: "gap"; len: number }
  /** A floating platform over whatever is beneath it. */
  | { t: "plat"; len: number; up: number; over?: "ground" | "gap" };

/** A compiled run of terrain. `top` is null where the level has a hole in it. */
export interface Span {
  x0: number;
  x1: number;
  top: number | null;
}

/** A platform you can land on from above. */
export interface Platform {
  x0: number;
  x1: number;
  top: number;
}

export interface Terrain {
  spans: Span[];
  platforms: Platform[];
  length: number;
}

export function compile(beats: Beat[], startX = 0): Terrain {
  const spans: Span[] = [];
  const platforms: Platform[] = [];
  let x = startX;

  for (const b of beats) {
    if (b.t === "gap") {
      spans.push({ x0: x, x1: x + b.len, top: null });
    } else if (b.t === "ground") {
      spans.push({ x0: x, x1: x + b.len, top: BASE_GROUND - (b.up ?? 0) });
    } else {
      spans.push({ x0: x, x1: x + b.len, top: b.over === "gap" ? null : BASE_GROUND });
      platforms.push({ x0: x, x1: x + b.len, top: BASE_GROUND - b.up });
    }
    x += b.len;
  }

  return { spans, platforms, length: x };
}

/** Surface height at a world x, or null if there is no ground there. */
export function groundAt(terrain: Terrain, x: number): number | null {
  const { spans } = terrain;
  if (x < spans[0].x0) return spans[0].top;
  for (let i = 0; i < spans.length; i++) {
    if (x >= spans[i].x0 && x < spans[i].x1) return spans[i].top;
  }
  return spans[spans.length - 1].top;
}

/**
 * Highest surface under a feet position, counting platforms.
 *
 * Platforms are one-way: they only catch something that is falling onto them from
 * above, so you can jump up through a branch and land on it, which is what makes
 * the forest climbable rather than a set of ceilings.
 */
export function surfaceUnder(
  terrain: Terrain,
  x: number,
  feetY: number,
  vy: number,
): number | null {
  let best = groundAt(terrain, x);

  if (vy >= 0) {
    for (const p of terrain.platforms) {
      if (x < p.x0 || x > p.x1) continue;
      // Only catch it if the feet were above the platform before this step.
      if (feetY <= p.top + Math.max(6, vy + 2)) {
        if (best === null || p.top < best) best = p.top;
      }
    }
  }
  return best;
}

/** Somewhere solid to put an egg, a checkpoint or an enemy near a given x. */
export function solidNear(terrain: Terrain, x: number): { x: number; top: number } | null {
  const candidates = terrain.spans.filter(s => s.top !== null);
  if (!candidates.length) return null;
  let best = candidates[0];
  let bestDist = Infinity;
  for (const s of candidates) {
    const cx = Math.max(s.x0 + 20, Math.min(x, s.x1 - 20));
    const d = Math.abs(cx - x);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  const cx = Math.max(best.x0 + 20, Math.min(x, best.x1 - 20));
  return { x: cx, top: best.top as number };
}
