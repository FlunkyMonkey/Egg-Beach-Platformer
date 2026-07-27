# Egg Beach — Project Rules

Global rules come from `~/agent-config/AGENTS.md`. Lab/cluster facts live in
`~/agent-config/knowledge/homelab/` — read its INDEX.md.

## What This Is

A 2D canvas platformer Mike built with his daughter. **The art is hers** — hand-drawn,
scanned, animated procedurally. Treat the sprites and the look as the point of the
project, not as placeholder assets to be tidied up or replaced. If a change would alter
how her drawings read on screen, say so before doing it.

It was a Replit project. The Replit pnpm workspace excluded darwin-arm64 binaries, so it
could not build on the Mac; it is now a plain Vite app. Don't reintroduce the monorepo,
the Express/Drizzle scaffolding, or the `@replit/*` plugins.

## Layout

```
src/game/EggBeach.tsx      the entire game — one component
src/assets/                GENERATED art — do not hand-edit (see below)
attached_assets/           the original photos of her drawings; the real source
scripts/extract_assets.py  rebuilds src/assets from those photos
scripts/screenshots.sh     visual check
deploy/                    k8s manifests ArgoCD reads (see below)
```

## The Art Pipeline

**`src/assets/*.png` is generated output.** The source of truth is the photographs in
`attached_assets/`, and `scripts/extract_assets.py` turns them into sprites and
backgrounds. Edit the script, not the PNGs. It needs `numpy`, `scipy` and `pillow`.

```bash
python3 scripts/extract_assets.py            # writes src/assets/
python3 scripts/extract_assets.py --preview  # writes to a temp dir instead
```

Two things it does are worth knowing before changing it:

- **Cutouts fill the holes her outlines enclose.** Deleting pale pixels — the obvious
  approach, and what the Replit version did — also deletes the paper *inside* a drawn
  outline, because it is exactly as pale as the paper outside. That is why the eggs used
  to be see-through and Dawn was hollow. Anything solid-but-outlined (`fill=True`) is
  found by taking the largest blob of ink and filling its holes.
- **Thresholds are relative to each photo's own paper.** The pages were shot in warm
  light at different distances, so an absolute brightness cut marks one whole page as ink
  and misses another entirely.

Creatures that sit inside a busy drawing — the crabs on the sandbar, the jellyfish — come
out by marker colour instead, which avoids dragging scenery along with them.

## Working With Her Art

The art is the point of this project, not placeholder to be tidied. Some rules that came
out of getting it to look right:

- **Show her drawings at full opacity.** Every screen originally faded them to a
  watermark and drew generated graphics on top, which is what made the game look
  "forced" — two pictures competing. Her art is the scenery, and anything drawn over it
  should be sparse atmosphere.
- **Line her horizons up with `GROUND_Y`.** `BG_GROUND_FRAC` records where the ground
  sits in each drawing so the sea/sand line lands exactly where the player walks.
- **Don't mirror a background to hide a tiling seam** — her clouds are distinct shapes
  and mirroring turns the sky into an obvious butterfly. The backgrounds are made
  seamless in the pipeline instead.
- Animate *around* her drawings rather than redrawing them: procedural legs, arms, claws
  and eye stalks attach to the sprite so it moves without anything being repainted.

## Working on the Game

**Look at the game before you push.** It is a canvas game: `npm run build` passing proves
only that it compiles, not that anything still renders. Run:

```bash
./scripts/screenshots.sh          # writes screenshots/ (gitignored)
```

That captures the title, how-to-play, all four levels, win, and game-over. It works by
jumping straight to a screen via `?state=PLAYING&level=3`, handled in `applyDebugState`.
Add a capture there when adding a screen.

Chrome in this environment can reach `localhost` but **not** LAN IPs, so screenshot
against the local preview server, never against the cluster IP.

## Deploying

Push to `main`. That's the whole workflow:

1. `.github/workflows/deploy.yml` typechecks, builds, and pushes
   `ghcr.io/flunkymonkey/egg-beach-platformer:sha-<commit>`
2. The same run rewrites the `image:` line in `deploy/deployment.yaml` and pushes that
   commit back
3. ArgoCD sees the new tag and rolls it out (within ~3 min)

Live at **https://egg.vgriz.com** (public, via the Cloudflare tunnel) and at
**http://172.18.1.231** on the LAN. The public hostname is `deploy/ingress.yaml`; delete
that file to go back to LAN-only. There is **no authentication** on the public URL.

- Don't hand-edit the `image:` line; the workflow owns it.
- To roll back, revert the deploy commit — the tag is a real commit, so it's reproducible.
- To force a sync now:
  `kubectl annotate applications.argoproj.io egg-beach -n argocd argocd.argoproj.io/refresh=hard --overwrite`
- **Use the full CRD name** `applications.argoproj.io`. Plain `application` resolves to a
  different CRD and fails with `MethodNotAllowed`.
- `deploy/**` is excluded from the workflow trigger so the bot's own commit can't loop.
