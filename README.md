# The Egg Beach

A 2D side-scrolling platformer built with my daughter on vacation. Lola chases Dawn the
chicken across four levels — Beach, Ocean, Forest, Volcano — collecting eggs.

All the art is her hand-drawn work, photographed and animated procedurally: the drawing
provides the recognizable body, and the legs, arms, claws and wings are drawn and animated
in code around it. The photos in `attached_assets/` are the source of truth —
`scripts/extract_assets.py` rebuilds everything in `src/assets/` from them, so those PNGs
are generated and shouldn't be hand-edited.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts: `npm run build` (typecheck + production build to `dist/`),
`npm run preview` (serve the production build), `npm run typecheck`.

## How it's built

Pure HTML5 Canvas and vanilla JS — no game engine. React only mounts the canvas and the
touch controls; everything else is a 60fps `requestAnimationFrame` loop drawing into an
800×450 pixel-art canvas.

The whole game is one component, `src/game/EggBeach.tsx`. Sprites load at module level in
a `useEffect`, and every draw function falls back to procedural drawing if its image
hasn't loaded yet, so the game is playable from the first frame. Game states run
START → HOW_TO_PLAY → STORY → PLAYING → GAME_OVER/WIN.

Controls are WASD or arrows, with double-jump and crouch. You get 10 lives and need 5
eggs to catch Dawn.

### Layout

```
index.html          entry point
src/main.tsx        mounts React
src/App.tsx         full-viewport wrapper
src/game/           the entire game
src/assets/         sprites and level backgrounds
attached_assets/    original photos and drawings
```

Nothing is fetched at runtime — no fonts, no CDNs, no backend. The build is fully
self-contained, which is what lets it run on the LAN with no internet.

## Deployment

Hosted on the homelab Kubernetes cluster: public at <https://egg.vgriz.com> and on the LAN
at <http://172.18.1.231>.

Pushing to `main` is the whole deploy. `.github/workflows/deploy.yml` builds
`ghcr.io/flunkymonkey/egg-beach-platformer:sha-<commit>` (linux/amd64), then rewrites the
`image:` line in `deploy/deployment.yaml` and pushes that commit back. ArgoCD watches
`deploy/` and rolls the new tag out within a few minutes.

Images are pinned to the commit they were built from rather than a moving `latest`, so
what's running is always traceable and `git revert` on a deploy commit is a real
rollback.

Before pushing a visual change, run `./scripts/screenshots.sh` and look at the result —
a canvas game can compile perfectly and still render nothing.

The public path is Cloudflare edge → cloudflared tunnel → ingress-nginx → these pods. No
port forwarding is involved and no DNS record was needed: `*.vgriz.com` already points at
the tunnel, and the exact host in `deploy/ingress.yaml` beats that wildcard.

The MetalLB `LoadBalancer` address is kept alongside it so the game still works on the LAN
if the tunnel is down. Note the public URL has **no authentication** — anyone with the
link can play.
