#!/usr/bin/env bash
# SessionStart hook — inject a tiny status line and enforce optimizer mode.
set -euo pipefail

MODE="${OPTIMIZER_MODE:-balanced}"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'no-git')"
CHANGED="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

cat <<EOF
[optimizer] mode=${MODE} branch=${BRANCH} changed=${CHANGED}
[optimizer] docs on-demand: docs/learnings/{architecture,common-mistakes,quickstart}.md
EOF
