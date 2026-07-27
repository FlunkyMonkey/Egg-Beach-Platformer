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
src/game/EggBeach.tsx   the entire game — one component, ~1850 lines
src/assets/             her sprites and level backgrounds
deploy/                 k8s manifests ArgoCD reads (see below)
scripts/screenshots.sh  visual check
```

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
