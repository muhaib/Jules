# Token Optimizer Research Notes

Survey of five community projects for reducing Claude Code / Claude API token consumption.

## 1. nadimtuhin/claude-token-optimizer
- **Approach:** Restructure repo docs so only ~800 tokens auto-load at session start.
- **Mechanism:** Four essential files auto-load (`CLAUDE.md`, `.claudeignore`, `.claude/COMMON_MISTAKES.md`, `.claude/QUICK_START.md`, `.claude/ARCHITECTURE_MAP.md`); archives and topic learnings load on demand.
- **CLI:** `measure`, `audit`, `compress`, `prune`, `watch` (live dashboard).
- **Framework packs:** 13 stacks (Next.js, Django, Rails, NestJS, FastAPI, ...).
- **Claimed savings:** 83–87% at session start.

## 2. Sagargupta16/claude-cost-optimizer
- **Approach:** Bundle of skill + guides + CLI targeting 30–60% (up to 90% with caching).
- **cost-mode skill:** Strips filler/pleasantries, routes model choice (Haiku vs Opus), minimal code output.
- **Context levers:** CLAUDE.md capped at 4K chars, `.claudeignore` templates.
- **Advanced levers:** Prompt caching (~90% off cached input), Batch API (50% off), task-tier routing.
- **Tools:** Token estimator, usage analyzer, badge generator, MCP cost server.
- **Pricing table (2026-07-25):** Opus 5 $5/$25 · Sonnet 5 $3/$15 · Haiku 4.5 $1/$5 (per MTok).

## 3. huzaifa525/claude-code-optimizer
- **Approach:** npm package `claude-code-optimizer` installing to `~/.claude/`.
- **25 slash commands:** `/tdd`, `/smart-edit`, `/refactor`, `/worktree`, `/subagent-dev`, `/review`, `/security-scan`, `/perf-check`, `/commit`, `/create-pr`, `/fix-issue`, `/explore-area`, `/gen-context`, ...
- **6 path-scoped rules:** frontend.md / backend.md / database.md / testing.md — only load when matching files are opened.
- **13 hooks:** context injection at session start, `.env` protection, test-output summarization.
- **Techniques:** progressive disclosure (index → entry points → deep dive), forked subagents to isolate context, `/mode aggressive|balanced|thorough` budgets.
- **Claimed savings:** ~67%.

## 4. alexgreensh/token-optimizer
- **Approach:** Hook-based automatic compression of tool output before it enters context; SQLite metrics.
- **Nine compression features (all on by default):**
  - Delta mode on file re-reads (~20%)
  - Structure map — signatures only for unchanged files (~30%)
  - Bash output condensation (~10%)
  - Search/grep result compression to top hits + counts (~15%)
  - Progressive disclosure with local archive for expansion
- **Continuity:** Smart compaction with checkpoints and restoration across sessions.
- **Reporting:** Live HTML dashboard, per-turn breakdown, cost across four pricing tiers, S–F quality grades, Coach Mode (30-day trend).
- **Design constraint:** Cache-stable — never modifies existing context prefixes.
- **Platforms:** Claude Code, VS Code, Codex, OpenClaw, OpenCode, Hermes, GitHub Copilot.

## 5. KINGSTAR-OMEGA/claude-token-optimizer
- **Approach:** Three drop-in Claude Code skills with escalating aggressiveness.
- **Antigravity V1:** Intent Rectification (ask before guessing), persistent memory. ~76% savings.
- **Antigravity V2.0:** Artifact-First Editing — plans and large code blocks written to `.md` files instead of chat. ~81% savings.
- **Ultimate Protocol Simulator:** Zero-English mode, JSON-only status reports, silent internal testing. ~93% savings — for automated pipelines.

---

## Common patterns
1. Trimmed `CLAUDE.md` + `.claudeignore` to shrink the auto-loaded prefix.
2. On-demand / progressive disclosure of docs and code.
3. Model routing by task complexity (Haiku → Sonnet → Opus).
4. Hooks that intercept and compress tool output before it enters context.
5. Prompt caching + Batch API as multiplicative levers on top of everything else.
6. Structure/signatures instead of full file bodies on re-reads.
7. Measurement and dashboards to make the savings visible.

## Source links
- https://github.com/nadimtuhin/claude-token-optimizer
- https://github.com/Sagargupta16/claude-cost-optimizer
- https://github.com/huzaifa525/claude-code-optimizer
- https://github.com/alexgreensh/token-optimizer
- https://github.com/KINGSTAR-OMEGA/claude-token-optimizer
