/**
 * The four levels, written out beat by beat.
 *
 * These are authored rather than generated. Each level opens with something safe
 * so the player can find the controls, introduces its own idea in isolation where
 * a mistake is cheap, tests it a few times with rests in between, and finishes on
 * a run that uses everything it taught.
 *
 * `up` is height above the level's base ground, in pixels. The player clears about
 * 110px on a single jump and about 175 on a double, so anything above 120 needs
 * both — that is the number to have in mind when reading these.
 */
import type { Beat } from "./terrain";

/** Level 1 — the beach. Teaches jumping at all, which the game never used to ask. */
export const BEACH: Beat[] = [
  { t: "ground", len: 620 },                 // room to find the controls
  { t: "gap", len: 70 },                     // first hole, narrow enough to walk off and survive the lesson
  { t: "ground", len: 300 },
  { t: "gap", len: 92 },
  { t: "ground", len: 240, up: 40 },         // first step up
  { t: "gap", len: 96 },
  { t: "ground", len: 320 },
  { t: "plat", len: 130, up: 108 },          // first thing to jump *onto*
  { t: "ground", len: 260 },
  { t: "gap", len: 104 },
  { t: "ground", len: 300, up: 70 },
  { t: "gap", len: 110 },
  { t: "ground", len: 220, up: 30 },
  { t: "plat", len: 120, up: 120, over: "gap" },   // platform over a hole: miss it and you fall
  { t: "ground", len: 340 },
  { t: "gap", len: 100 },
  { t: "ground", len: 280, up: 46 },
  { t: "gap", len: 88 },
  { t: "ground", len: 700 },                 // long finish, Dawn cornered here
];

/** Level 2 — the ocean. Floaty, so gaps are wide and platforms are high. */
export const OCEAN: Beat[] = [
  { t: "ground", len: 520 },
  { t: "gap", len: 120 },                    // wider: you drift further underwater
  { t: "ground", len: 280 },
  { t: "plat", len: 130, up: 130 },
  { t: "plat", len: 120, up: 210 },          // stacked, to make you use the slow rise
  { t: "ground", len: 300 },
  { t: "gap", len: 150 },
  { t: "ground", len: 240, up: 60 },
  { t: "gap", len: 140 },
  { t: "plat", len: 140, up: 150, over: "gap" },
  { t: "ground", len: 300 },
  { t: "plat", len: 120, up: 190 },
  { t: "gap", len: 160 },
  { t: "ground", len: 320, up: 40 },
  { t: "gap", len: 130 },
  { t: "ground", len: 760 },
];

/** Level 3 — the forest. Goes up: the branches are the route, not decoration. */
export const FOREST: Beat[] = [
  { t: "ground", len: 480 },
  { t: "plat", len: 120, up: 100 },
  { t: "plat", len: 110, up: 190 },
  { t: "plat", len: 110, up: 275 },          // a proper climb
  { t: "ground", len: 260 },
  { t: "gap", len: 96 },
  { t: "ground", len: 200, up: 80 },
  { t: "plat", len: 110, up: 180 },
  { t: "plat", len: 100, up: 265, over: "gap" },
  { t: "ground", len: 240 },
  { t: "gap", len: 108 },
  { t: "plat", len: 120, up: 130, over: "gap" },
  { t: "ground", len: 220, up: 50 },
  { t: "plat", len: 110, up: 160 },
  { t: "plat", len: 110, up: 250 },
  { t: "ground", len: 300 },
  { t: "gap", len: 100 },
  { t: "ground", len: 680 },
];

/** Level 4 — the volcano. Tight ledges over holes, because the lava is rising. */
export const VOLCANO: Beat[] = [
  { t: "ground", len: 420 },
  { t: "gap", len: 100 },
  { t: "ground", len: 180, up: 60 },
  { t: "gap", len: 110 },
  { t: "ground", len: 170, up: 120 },
  { t: "gap", len: 116 },
  { t: "plat", len: 110, up: 165, over: "gap" },
  { t: "ground", len: 200, up: 90 },
  { t: "gap", len: 120 },
  { t: "ground", len: 190, up: 150 },
  { t: "plat", len: 100, up: 235 },
  { t: "gap", len: 124 },
  { t: "ground", len: 210, up: 110 },
  { t: "gap", len: 118 },
  { t: "ground", len: 240, up: 175 },
  { t: "plat", len: 110, up: 255, over: "gap" },
  { t: "ground", len: 260, up: 120 },
  { t: "gap", len: 112 },
  { t: "ground", len: 720, up: 60 },
];

export const LEVEL_BEATS = [BEACH, OCEAN, FOREST, VOLCANO];

/**
 * Where the checkpoints go, as fractions along each level.
 *
 * Placed just *after* the hard parts rather than before them, so clearing
 * something difficult is what banks progress.
 */
export const CHECKPOINT_FRACS = [0.34, 0.66];
