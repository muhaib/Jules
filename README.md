# SmartBudget

An intelligent, mobile-first personal budgeting assistant. You enter your
income once, pick a budgeting framework, and SmartBudget calculates every
limit for you — then keeps them updated in real time as you log expenses,
warns you before you go over, tracks an emergency fund and financial goals,
and generates a monthly report.

It's a real working app, not a static prototype: every number on screen is
computed from your income, chosen rule and logged expenses — nothing is
hard-coded.

## Quick start

```bash
npm start        # serves the app at http://localhost:5173
npm test          # runs the engine's unit test suite (node --test)
```

No build step, no dependencies to install — this is a zero-dependency
static app (see *Architecture* below).

## The core flow

1. **Onboarding** — name (optional), currency (defaults to PKR), monthly
   salary, salary date, other income, existing savings, essential monthly
   expenses, existing debt (all but currency/salary optional).
2. **Choose a budgeting rule** — 50/30/20, 70/20/10, 80/20, Pay Yourself
   First (percent or fixed amount), or a fully Custom split. The screen
   shows a live preview of what each rule means in Rupees for your income.
3. **Add expenses** — amount, category → subcategory, date, payment
   method, optional note, in a few taps.
4. **Everything recalculates immediately** — spent, remaining, % used, and
   whether you're approaching or over a limit, per budget group.
5. **Alerts fire automatically** at 75% (info), 80% (warning), 90%
   ("almost finished — only Rs. X remains") and 100%+ ("exceeded by Rs.
   X"). Before saving an expense that would push a group over budget, you
   get an "Add Anyway / Cancel" choice — SmartBudget never blocks a
   transaction, it only informs.
6. **Emergency fund & goals** track cumulative progress toward a target,
   with an estimated completion date from your monthly contribution.
7. **Reports & analytics** — a monthly financial summary (income,
   expenses, savings, savings rate, exceeded categories, largest spends,
   month-over-month comparison) plus category/trend charts filterable by
   month, quarter, half-year, year or a custom range.

## Architecture

**Rule engine (`src/engine/rules.js` + `src/engine/budget.js`)** — this is
the piece the spec calls out explicitly: budgeting rules are *data*, never
hard-coded UI math. A rule is `{ name, groups: [{ id, label, kind[],
percent }], alertThresholds }`. `kind` says which category kinds (needs /
wants / savings / debt) count against that group, so `resolveGroups()` +
`calculateAllocations()` turn any rule + any income into concrete amounts,
and `computeBudgetSnapshot()` matches expenses to groups by kind. Adding a
new rule (e.g. a 60/20/20 variant) means appending one object to
`BUILTIN_RULES` — no other file changes. Pay Yourself First and Custom
resolve their groups from live user config (percent or fixed savings
amount; user-defined categories) instead of a fixed table.

**Pure calculation core (`src/engine/*.js`)** — budget math, alert
thresholds, emergency fund targets, goal progress, recurring-expense
materialization, insights and monthly-report generation are all pure
functions with no DOM/storage dependency, covered by 47 unit tests in
`test/*.test.js` (`npm test`). Several tests reproduce the spec's own
worked examples verbatim (the Rs. 80,000 / 50-30-20 example, the Wants
95%→exceeded example, the "Can I afford this?" Rs. 5,000 example, the
September report with its 29.75% savings rate) to keep the implementation
honest against the spec, not just internally consistent.

**State store (`src/store.js`)** — the single source of truth: profile,
rule/config, categories, expenses, recurring items, goals, emergency fund,
notification settings. All mutations go through store methods (`addExpense`,
`contributeToGoal`, `setRule`, …); UI modules never touch `localStorage`
directly.

**UI (`src/ui/*.js`)** — a small hyperscript-style helper (`h()`) builds
DOM directly; there's no framework and no build step, matching a
zero-dependency, fast-loading, mobile-first app. A hash router in
`src/main.js` maps `#/route` to a view module. Charts are hand-rolled
inline SVG (`src/ui/charts.js`) — a donut for category/group breakdowns, a
bar chart for monthly trends — again with no chart library dependency.

## Architecture & privacy: why this is a local-first app

The spec's MVP has no bank integration and asks for secure auth, an
encrypted store, user data isolation, account deletion, data export and
session management — but stood up against no real backend in this
environment. Rather than fake a server, SmartBudget is built **local-first
on purpose**: every screen works with zero network calls, and device data
never leaves the device, which is the strongest possible interpretation of
"user data isolation" and "encrypted transmission" (there is no
transmission).

What that means concretely:

- **Storage**: all data lives in the browser's `localStorage`, wrapped by
  `src/store.js`.
- **Optional PIN lock** (Settings → Security): choosing a PIN derives an
  AES-256-GCM key via PBKDF2 (150,000 iterations, `src/engine/crypto.js`)
  and encrypts the entire app-state blob at rest; without a PIN, data is
  simply local and unencrypted (still never transmitted anywhere). Session
  key lives in memory only, per the usual "unlock once, no work" balance.
- **Data export / import**: Settings → Your Data → Export downloads a full
  JSON snapshot; Import restores from one.
- **Account deletion**: Settings → Delete Account & All Data wipes
  `localStorage` completely.
- **Multi-device sync and true server-side accounts are out of scope for
  this MVP** by design — adding a backend later (real auth, a database,
  encrypted transport) is a drop-in replacement for `store.js`'s
  persistence calls; the rule engine, calculation core and UI don't change.

## What's implemented (MVP, spec section 21)

User setup and income · 50/30/20 (+70/20/10, 80/20, Pay Yourself First,
Custom — all live from day one via the rule engine, not staged later) ·
Needs/Wants/Savings/Debt categories with custom categories · expense entry
· real-time budget tracking · 75/80/90/100% alerts · in-app + browser
push notifications · emergency fund tracker · dashboard · monthly report ·
category/trend charts · financial goals · recurring expenses ·
"Can I afford this?" checker · smart insights framed as benchmarks, never
verdicts ("According to your selected budgeting rule…") · PIN lock,
encryption at rest, export, and account deletion.

## Project layout

```
index.html            entry HTML
server.js             zero-dependency static file server (npm start)
src/
  app.css              mobile-first styling (light + dark mode)
  main.js              hash router, boot sequence, notification checks
  store.js             state, persistence, security, all mutations
  engine/               pure, unit-tested calculation core
    rules.js              the budgeting-rule engine
    budget.js             allocation + spend + status calculation
    alerts.js              75/80/90/100% alert + pre-save warning copy
    emergencyFund.js, goals.js, recurring.js, insights.js, report.js
    categories.js, currency.js, crypto.js, validation.js, id.js
  ui/                   view modules + shared DOM/chart helpers
test/                 node --test unit tests for the engine
```
