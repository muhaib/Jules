#!/usr/bin/env bash
# PostToolUse hook for Read — cache seen files, return diff on re-read.
# Cache-safe: emits a NEW string per turn; never rewrites a prior tool result.
set -euo pipefail

MODE="${OPTIMIZER_MODE:-balanced}"
[[ "$MODE" == "thorough" ]] && { cat; exit 0; }

CACHE_DIR="${TMPDIR:-/tmp}/optimizer-reads"
mkdir -p "$CACHE_DIR"

INPUT="$(cat)"
# The tool result includes the file path in a stable envelope; grep it out.
# Fallback: hash the payload so unrecognized formats still pass through.
PATH_HINT="$(printf '%s' "$INPUT" | head -n 1 | grep -oE '/[^ ]+' | head -n 1 || true)"
KEY="$(printf '%s' "${PATH_HINT:-unknown}" | shasum | awk '{print $1}')"
CACHED="$CACHE_DIR/$KEY"

if [[ -f "$CACHED" ]]; then
  DIFF="$(diff -u "$CACHED" <(printf '%s' "$INPUT") || true)"
  if [[ -z "$DIFF" ]]; then
    printf '[optimizer] Re-read of %s — unchanged since last read.\n' "${PATH_HINT:-file}"
  else
    printf '[optimizer] Re-read of %s — delta only:\n%s\n' "${PATH_HINT:-file}" "$DIFF"
  fi
else
  printf '%s' "$INPUT"
fi

printf '%s' "$INPUT" > "$CACHED"
