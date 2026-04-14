# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Egg Beach Game

A 2D side-scrolling platformer built as a React+Vite artifact (`artifacts/egg-beach`).
Uses pure HTML5 Canvas + vanilla JS — no external game libraries. Frontend-only, no backend.

### Game Design
- **Characters**: Lola (player) chases Dawn (white chicken) across 4 levels to collect eggs
- **Levels**: Beach (crabs), Ocean (jellyfish, floaty physics), Forest (branch platforms, acorns), Volcano (lava drops)
- **Mechanics**: WASD/arrow controls, double-jump, crouch, 10 lives, 5 eggs to catch Dawn
- **Canvas**: 800×450, `imageRendering: pixelated`, 60fps RAF loop

### Art Assets (daughter's hand-drawn drawings)
All sprites in `artifacts/egg-beach/src/assets/`:
- `lola_sprite.png` — Lola character (body/head used with procedural animated legs + arms)
- `dawn_sprite.png` — Dawn chicken (body with white fill behind, black outline + red comb, procedural legs)
- `egg_sprite.png` — Collectible egg with yellow/orange shading
- `jellyfish_sprite.png` — Purple jellyfish (pulsing/swaying animation)
- `title_art.png` — "The Egg Beach" title card with starfish, shells, wavy border
- `win_screen.png` — "You win" barn scene
- `bg_beach.png`, `bg_ocean.png`, `bg_forest.png`, `bg_volcano.png` — Level background sketches (drawn as watermark layer behind procedural backgrounds)

### Sprite Animation Approach
- All sprites use the daughter's drawing as the recognizable body
- Legs, arms, wings are drawn procedurally and animated (bob, swing, flap)
- Sprites have procedural fallbacks if images haven't loaded yet
- Background sketches are drawn at low opacity (0.3-0.35) behind the procedural background layers

### Architecture
- Single component: `EggBeach.tsx` (~1750 lines)
- Module-level sprite variables loaded via `useEffect` on mount
- All drawing functions (`drawLola`, `drawDawn`, `drawEgg`, `drawJellyfish`, etc.) check sprite availability and fall back to procedural drawing
- Game states: START → HOW_TO_PLAY → STORY → PLAYING → GAME_OVER/WIN

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
