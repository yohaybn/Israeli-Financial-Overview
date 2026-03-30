#!/bin/sh
# Re-spawn node when the app exits with 42 (graceful restart from /api/config/restart).
# Without this, PID 1 exits and the container stops unless Docker has a restart policy.
cd /usr/src/app || exit 1
MAIN_JS="${1:-server/dist/index.js}"

while true; do
  node "$MAIN_JS"
  ec=$?
  if [ "$ec" -eq 42 ]; then
    echo "Restart requested, restarting..."
    continue
  fi
  exit "$ec"
done
