#!/usr/bin/env bash
# PostToolUse hook for Bash — condense oversized CLI output before it enters context.
# Reads the tool result from stdin, writes a compressed version to stdout.
# Cache-safe: only modifies the current tool's output, never a prior prefix.
set -euo pipefail

MODE="${OPTIMIZER_MODE:-balanced}"
[[ "$MODE" == "thorough" ]] && { cat; exit 0; }

MAX_LINES="${OPTIMIZER_BASH_MAX_LINES:-120}"
INPUT="$(cat)"
LINES="$(printf '%s\n' "$INPUT" | wc -l | tr -d ' ')"

if (( LINES <= MAX_LINES )); then
  printf '%s' "$INPUT"
  exit 0
fi

HEAD=$(( MAX_LINES / 2 ))
TAIL=$(( MAX_LINES - HEAD ))
ARCHIVE_DIR="${TMPDIR:-/tmp}/optimizer-archive"
mkdir -p "$ARCHIVE_DIR"
STAMP="$(date +%s%N)"
FULL="$ARCHIVE_DIR/bash-$STAMP.log"
printf '%s' "$INPUT" > "$FULL"

{
  printf '%s\n' "$INPUT" | head -n "$HEAD"
  printf '... [%d lines elided — full output archived at %s] ...\n' \
    "$(( LINES - MAX_LINES ))" "$FULL"
  printf '%s\n' "$INPUT" | tail -n "$TAIL"
}
