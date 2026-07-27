#!/usr/bin/env bash
# Build the game, serve it, and capture every screen to screenshots/.
#
# This is the visual check for a change. The canvas renders in a browser or not at
# all — `npm run build` passing proves nothing about whether the game still looks
# right, so look at the images before pushing.
#
# Usage: ./scripts/screenshots.sh [outdir]

set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${1:-screenshots}"
PORT=4173
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at $CHROME" >&2
  exit 1
fi

npm run build

mkdir -p "$OUT"
npm run preview -- --port "$PORT" >/dev/null 2>&1 &
PREVIEW_PID=$!
# Kill the preview server even if a capture fails, so a rerun isn't blocked by a
# stale process holding the port.
trap 'kill $PREVIEW_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.25
done

shot() {
  local name="$1" query="$2"
  "$CHROME" --headless --disable-gpu --no-sandbox \
    --virtual-time-budget=6000 --window-size=1280,800 \
    --screenshot="$OUT/$name.png" \
    "http://localhost:$PORT/$query" >/dev/null 2>&1
  echo "  $OUT/$name.png"
}

echo "Capturing:"
shot title        ""
shot lola-run-1   "?state=PLAYING&level=1&run=1"
shot lola-run-2   "?state=PLAYING&level=3&run=1"
shot how-to-play  "?state=HOW_TO_PLAY"
shot level-1-beach   "?state=PLAYING&level=1"
shot level-2-ocean   "?state=PLAYING&level=2"
shot level-3-forest  "?state=PLAYING&level=3"
shot level-4-volcano "?state=PLAYING&level=4"
shot win          "?state=WIN"
shot game-over    "?state=GAME_OVER"
