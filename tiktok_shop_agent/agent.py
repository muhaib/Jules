#!/usr/bin/env python3
"""
TikTok Shop affiliate research agent.

Weekly loop: research live trends -> score products -> pick the best ->
produce a 7-day content plan with ready-to-film scripts. Writes a dated
Markdown plan to output/.

It automates the two things a human wastes hours on — deciding what to
promote and drafting hooks/scripts. It does NOT film or post; that stays
with you, and that is the part that actually earns.

Run:
    export ANTHROPIC_API_KEY=sk-ant-...
    python agent.py                 # uses config.py defaults
    python agent.py --niche "pet grooming gadgets"

Requires: anthropic>=1.0  (see requirements.txt)
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys

from anthropic import Anthropic

import config

OUTPUT_DIR = pathlib.Path(__file__).parent / "output"

# Web search is a server-side tool: Claude runs the searches itself and reads
# the results in the same turn. dynamic-filtering variant for current models.
WEB_SEARCH_TOOL = {
    "type": "web_search_20260209",
    "name": "web_search",
    "max_uses": config.MAX_SEARCHES,
}

SYSTEM_PROMPT = """\
You are a TikTok Shop affiliate research analyst. You are precise, current, and \
honest. You never invent product names, prices, or commission rates — every \
concrete claim comes from a web search you actually ran this turn. When data is \
thin, you say so rather than guessing.

You optimize for a beginner with no following and near-zero capital, running a \
FACELESS account (voiceover + product b-roll, no face on camera). You judge every \
product on six criteria:
1. Visual proof — result visible on camera in under 3 seconds (hard gate; fail = drop it).
2. Price 10-30 USD (impulse-buyable, still worth the commission).
3. Commission >= 10%, ideally 15%+.
4. Rating >= 4.5 with real sales volume (refunds claw back affiliate income).
5. Healthy competition — demand exists but not a wall of large creators.
6. Reliable stock (won't sell out mid-viral).

You are blunt about realistic outcomes: most videos earn nothing; income comes \
from the occasional hit, so the game is volume plus a repeatable format."""

TASK_PROMPT = """\
Today is {today}. Region: {region}. Target niche: {niche}.

Do this in order, using web_search for anything factual:

1. RESEARCH — Search for what is genuinely trending on TikTok Shop RIGHT NOW in \
the "{niche}" space (and adjacent faceless niches if the niche is thin). Find \
5-8 specific candidate products with, where available: approximate price, \
commission %, rating, and rough sales volume. Prefer recent sources.

2. SCORE — Score each candidate against the six criteria. Show a compact table: \
product | price | commission | rating | visual-proof(Y/N) | verdict(GO/MAYBE/SKIP). \
Apply the visual-proof gate strictly.

3. DECIDE — Pick the ONE best product to lead with this week and one backup. \
Explain in 2-3 sentences why the winner beats the rest for a faceless beginner.

4. PLAN — Give a concrete 7-day posting plan (3 posts/day = 21 slots). For each \
day list the angle/format of each post (e.g. "problem-agitate demo", "before/after", \
"3 ways to use it", "reply-to-fake-comment"). Keep formats varied so the algorithm \
can find what converts.

5. SCRIPTS — Write 3 fully ready-to-film faceless scripts for the winning product. \
Each script must have: a 3-second HOOK (the exact spoken words), a shot-by-shot \
DEMO body with what to show on screen, a one-line CTA, an on-screen CAPTION line, \
and 5 hashtags. Make the hooks specific and scroll-stopping, not generic.

6. NEXT STEPS — End with a short "DO THIS TODAY" checklist of 3-5 concrete actions.

Format the whole thing as clean Markdown with clear headings. Be specific and \
usable — someone should be able to act on it in the next hour."""


def run(niche: str, region: str, model: str) -> str:
    client = Anthropic()  # reads ANTHROPIC_API_KEY (or an `ant auth login` profile)
    today = dt.date.today().isoformat()

    # Stream: web-search turns plus a long structured answer can exceed the
    # non-streaming HTTP timeout. get_final_message() collects the whole thing.
    with client.messages.stream(
        model=model,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        tools=[WEB_SEARCH_TOOL],
        thinking={"type": "adaptive"},
        messages=[{
            "role": "user",
            "content": TASK_PROMPT.format(today=today, region=region, niche=niche),
        }],
    ) as stream:
        message = stream.get_final_message()

    # Concatenate the text blocks (skip thinking / tool-use blocks).
    parts = [b.text for b in message.content if getattr(b, "type", None) == "text"]
    return "\n".join(parts).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description="TikTok Shop affiliate research agent")
    ap.add_argument("--niche", default=config.NICHE, help="target product niche")
    ap.add_argument("--region", default=config.REGION, help="market region")
    ap.add_argument("--model", default=config.MODEL, help="Claude model id")
    args = ap.parse_args()

    print(f"Researching '{args.niche}' ({args.region}) with {args.model} ...",
          file=sys.stderr)
    try:
        plan = run(args.niche, args.region, args.model)
    except Exception as exc:  # surface the real cause, don't swallow it
        print(f"ERROR: {exc}", file=sys.stderr)
        if "ANTHROPIC_API_KEY" in str(exc) or "authentication" in str(exc).lower():
            print("Set your key: export ANTHROPIC_API_KEY=sk-ant-...", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(exist_ok=True)
    stamp = dt.date.today().isoformat()
    slug = args.niche.lower().replace(" ", "-").replace("/", "-")[:40]
    path = OUTPUT_DIR / f"plan_{stamp}_{slug}.md"
    path.write_text(plan, encoding="utf-8")

    print(plan)
    print(f"\n---\nSaved to {path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
