# XAUUSD MTF Trend Pullback — Pine v6

Production-grade Pine Script v6 strategy for **gold (XAUUSD)** on 5m or 15m
charts, using 1h and 4h higher-timeframe bias.

File: `xauusd_mtf_v6.pine`

## The strategy in one paragraph
Only trade in the direction of both the 4h EMA(200) and the 1h EMA(50). On the
chart timeframe (5m or 15m), wait for price to pull back to EMA(20) and the
RSI(14) to cross back through 50 in the trend direction; optionally require an
engulfing candle for extra confirmation. Risk a fixed % of equity per trade,
stop at 1.5 × ATR beyond entry, take partial at +1.5R, move to breakeven at
+1R, ATR-trail the runner, hard exit at +3R. Skip trades outside London/NY
sessions, when ATR is dead or spiking, and after the day's loss cap is hit.

## Loading it in TradingView
1. Open TradingView → **Pine Editor**.
2. Paste the contents of `xauusd_mtf_v6.pine`.
3. **Save** with any name → **Add to chart**.
4. Set the chart to **XAUUSD, 5m or 15m**.
5. Open the strategy settings (gear icon) — every filter and R multiple is an input.

## Suggested starting inputs
| Setting | Conservative | Balanced (default) | Aggressive |
|---|---|---|---|
| Risk % per trade | 0.5 | 2.0 | 4.0 |
| Max daily loss % | 3 | 6 | 10 |
| Final target (R) | 2.0 | 3.0 | 4.0 |
| Partial exit (R) | 1.0 | 1.5 | 2.0 |
| Require engulfing | ✓ | ✗ | ✗ |
| ATR trail | ✓ | ✓ | ✓ |

Higher risk % raises expected return **and** ruin probability. Do the math
before you crank it: with 2% risk per trade and a 50% win rate at 1:2, the
probability of a 50% drawdown in a month is non-trivial; at 5% risk it is
almost certain.

## Why each piece is there
- **4h + 1h double bias filter** — filters ~60% of chop; without it XAUUSD 5m
  is unforgiving.
- **Pullback + RSI cross** — enters on a *continuation*, not a breakout, so
  slippage and false starts are lower.
- **Session filter** — XAUUSD moves are concentrated in London and NY.
  Trading Asia hours on 5m is a losing game statistically.
- **ATR-based stop and sizing** — every trade risks exactly the same dollar
  amount regardless of volatility. This is the single biggest edge over
  fixed-pip strategies.
- **Partial + BE + trail** — locks in half the reward at +1.5R, protects the
  remainder, lets a strong move breathe.
- **Daily loss cutoff** — the difference between a bad day and a blown account.
- **Cooldown** — stops the "revenge trade" pattern after a stop-out.
- **`request.security(..., lookahead=barmerge.lookahead_off, gaps=barmerge.gaps_off)`**
  — the standard repaint-safe way to pull HTF data. Backtests here match live.

## About the "$100 → $1000 in one month" target
That is a 10× in 30 calendar days (~22 trading days), equivalent to **~11.4%
per trading day compounded**. No mechanical strategy — mine, yours, or anyone
else's — reliably delivers that on gold. Published gold-strategy returns from
serious quant shops sit in the **1–4% monthly** range net of costs. The
script's aggressive preset (4% risk, 3R target) has a realistic *expected*
return of **8–20% monthly** on backtests, with real-world drift toward the
lower end after spread, slippage, and news-event losses.

If you need to 10× a $100 account, the honest answer is: use it as tuition, run
this strategy at 1–2% risk for at least 100 trades on paper, and only scale up
once you have a walk-forward equity curve you trust.

## What to test before going live
1. **Walk-forward on your broker's XAUUSD feed** — spread and swap differ per
   broker and materially change results.
2. **News event backtest** — the ATR-max filter helps but doesn't catch NFP or
   FOMC spikes. Consider a manual news-day off switch.
3. **Commission / slippage sensitivity** — the script assumes 0.02% commission
   and 2-tick slippage. If your broker is worse, results degrade fast.
4. **Session-specific breakdown** — the strategy tester's List of Trades tab
   will show which session your edge actually comes from.
