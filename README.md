# The Egg Beach

A 2D side-scrolling platformer built with my daughter on vacation. Lola chases Dawn the
chicken across four levels — Beach, Ocean, Forest, Volcano — collecting eggs.

All the art is her hand-drawn work, scanned in and animated procedurally: the drawing
provides the recognizable body, and the legs, arms and wings are drawn and animated in
code. Originals are kept in `attached_assets/`.

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

Hosted on the homelab Kubernetes cluster, **LAN-only** at <http://172.18.1.231>.

Pushing to `main` triggers `.github/workflows/build-image.yml`, which builds
`ghcr.io/flunkymonkey/egg-beach-platformer:latest` (linux/amd64) and pushes it to GHCR.
ArgoCD syncs the manifests from the `k8s-lab` repo (`apps/egg-beach/`) and restarts the
deployment onto the new image.

This is deliberately **not** exposed through the Cloudflare tunnel. Because `*.vgriz.com`
is a proxied CNAME to the tunnel, any Ingress under that domain would be public to the
whole internet. A `LoadBalancer` service on a MetalLB IP skips ingress-nginx entirely and
stays on the LAN. Adding an Ingress is all it would take to publish it.
