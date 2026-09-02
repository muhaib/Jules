# TikTok Shop Affiliate Research Agent

A runnable agent that does the weekly **research → score → decide → plan → script**
loop for a faceless TikTok Shop affiliate account. It automates the two things
that eat hours and cause paralysis: deciding *what* to promote and drafting the
*hooks/scripts*. It does **not** film or post — that's yours, and it's the part
that actually earns.

## What it produces
Each run writes a dated Markdown plan to `output/` containing:
1. Live-researched trending products (real prices, commissions, ratings — via web search)
2. A scored table (6 criteria, GO/MAYBE/SKIP) with a strict visual-proof gate
3. One winning product to lead with + a backup
4. A 7-day, 21-slot posting plan with varied formats
5. Three fully ready-to-film faceless scripts (hook, shot-by-shot demo, CTA, caption, hashtags)
6. A "DO THIS TODAY" checklist

## Setup
```bash
cd tiktok_shop_agent
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...        # from console.anthropic.com
```

## Run
```bash
python agent.py                            # uses config.py defaults
python agent.py --niche "pet grooming gadgets"
python agent.py --niche "kitchen gadgets" --region "United Kingdom"
python agent.py --model claude-sonnet-5    # cheaper for frequent runs
```
The plan prints to your terminal and saves to `output/plan_<date>_<niche>.md`.

## Cost
One run makes ~8-10 web searches plus a long structured answer — a few cents to
~$0.30 on `claude-opus-5`, less on `claude-sonnet-5`. Run it once a week.

## Automate the weekly run (optional)
```bash
# crontab -e  → every Monday 8am
0 8 * * 1 cd /path/to/tiktok_shop_agent && /usr/bin/python3 agent.py >> output/cron.log 2>&1
```

## Honest expectations
- This removes decision paralysis and scriptwriting. It does not remove the work.
- Most videos earn nothing; income comes from the occasional hit. The system's
  value is letting you post *volume* with a *repeatable format* without burning out.
- You need ~1,000 followers to unlock TikTok Shop Affiliate, so the first weeks
  are about growing the account with good content — links come after.

## Configuration
Edit `config.py` for defaults (niche, region, model, search budget), or pass
flags per run.
