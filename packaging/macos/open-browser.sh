#!/usr/bin/env bash
# Open the app in the default browser (default port 3000; override with PORT=...).
set -euo pipefail
PORT="${PORT:-3000}"
open "http://127.0.0.1:${PORT}/"
