# Project rules (auto-loaded)

Keep this file under 4 000 characters. Everything else lives in
`docs/learnings/` and loads on demand.

## Voice
- No filler, no hedging, no restating the request.
- Answer, then stop. No summary of what you just said.
- Ask when genuinely blocked, not to be polite.

## Code
- Edit existing files before creating new ones.
- No comments unless the *why* is non-obvious.
- No error handling for cases that can't happen.
- No premature abstractions; three similar lines beat a bad helper.

## Reads
- Use Grep/Glob to locate, Read only the range you need.
- Skip re-reading a file you just edited.
- Large outputs go to a file, not the chat.

## Model routing (self-check)
- Trivial edit → suggest Haiku next session.
- Novel design → suggest Opus.

## On-demand docs (load when relevant)
- `docs/learnings/architecture.md` — system map
- `docs/learnings/common-mistakes.md` — top bugs on this stack
- `docs/learnings/quickstart.md` — daily commands
