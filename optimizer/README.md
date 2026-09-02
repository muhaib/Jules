# Combined Claude Token Optimizer

A merge of the best ideas from five community optimizers into one drop-in toolkit.
Not a fork — a distilled superset. The goal is a session that starts small
(≤ 1 K auto-loaded tokens), stays small (compressed tool output, on-demand docs),
and reports honestly (measurable savings).

## Sources synthesized
| Idea kept | Origin |
|---|---|
| Trimmed `CLAUDE.md` + `.claudeignore` for a ≤ 1 K session prefix | nadimtuhin, Sagargupta16 |
| On-demand `docs/learnings/` topic files | nadimtuhin |
| `cost-mode` skill (no filler, model routing, minimal code) | Sagargupta16 |
| Path-scoped rules that only load with matching files | huzaifa525 |
| Progressive disclosure — index → entry points → deep read | huzaifa525 |
| Hook-based bash/read/grep compression before context ingest | alexgreensh |
| Delta re-reads and structure-map (signatures only) | alexgreensh |
| Artifact-first: large output goes to a file, not the chat | KINGSTAR-OMEGA |
| Aggressive/balanced/thorough mode dial | huzaifa525 |

## Layout
```
optimizer/
  CLAUDE.md                # ≤ 4 K char template (session prefix)
  .claudeignore            # aggressive ignore list
  settings.example.json    # hook wiring for Claude Code
  skills/
    cost-mode/SKILL.md     # frugality skill
  hooks/
    compress-bash.sh       # PostToolUse: shrink long CLI output
    compress-read.sh       # PostToolUse: delta / signature re-reads
    session-start.sh       # SessionStart: inject minimal context
```

## Install (project-local)
1. Copy `optimizer/` into your repo root.
2. Merge `optimizer/CLAUDE.md` into your existing `CLAUDE.md` (keep total under 4 K chars).
3. Append `optimizer/.claudeignore` to your `.claudeignore`.
4. Merge `optimizer/settings.example.json` into `.claude/settings.json`.
5. `chmod +x optimizer/hooks/*.sh`.

## Modes
Set `OPTIMIZER_MODE` in your shell:
- `aggressive` — max compression, JSON-only tool output where possible.
- `balanced` (default) — signatures on re-read, condensed bash, full first read.
- `thorough` — compression off; use when debugging the optimizer itself.

## Model-routing rule of thumb
| Task shape | Model |
|---|---|
| Rename, typo, one-line fix, extract summary | Haiku |
| Multi-file refactor, feature work, code review | Sonnet |
| Architecture, tricky debugging, novel design | Opus |

## Honest limits
- Compression only helps *repeated* reads and *large* tool outputs. A cold session on a small repo saves little.
- Prompt caching is a multiplicative win but only lands when the prefix stays byte-stable — every hook here is cache-safe by design.
- Claimed 60–90 % savings from source repos are best-case; realistic project-wide savings are 30–60 %.
