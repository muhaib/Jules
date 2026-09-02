---
name: cost-mode
description: Minimum-token operating mode. Load when the user says "cost mode", "cheap mode", "be brief", or when the session has already burned significant tokens and needs to slow the burn. Applies frugality rules to output, tool use, and model choice.
---

# cost-mode

You have opted into aggressive token frugality. Follow these rules until the user turns cost-mode off.

## Output
1. Answer the literal question. No preface, no recap, no closing summary.
2. Prefer tables and bullet lists over prose.
3. Never restate the user's request back to them.
4. Use `SendUserFile` for anything longer than a screenful — do not paste it into chat.

## Tool use
1. Locate with Grep/Glob; only Read the byte range you need.
2. Never re-read a file you just edited.
3. Prefer one `Bash` call with `&&` over three sequential calls.
4. If a shell command's output is expected to exceed one screen, pipe through `head`, `tail`, `wc -l`, or write to a file first.
5. Parallelize independent tool calls in one response.

## Model routing (self-suggest)
- Simple edits, renames, typo fixes → recommend switching to Haiku for the next session.
- Architecture, novel debugging, ambiguous design → recommend Opus.
- Everything else → Sonnet.

## Escalation
If the user pushes for verbose output ("explain more", "write it out"), cost-mode is implicitly off for that turn. Do not fight the user.
