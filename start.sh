#!/usr/bin/env bash
# Meeting Lens launcher (macOS/Linux). Run:  ./start.sh
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$ROOT/backend/venv/bin/python"
[ -x "$PY" ] || PY="python3"
exec "$PY" "$ROOT/run.py"
