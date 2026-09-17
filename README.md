# SmartBudget — Personal Finance & Budgeting

*Know your money. Control your spending. Reach your goals.*

A mobile-first personal finance app for anyone managing their own money.
You add your income — from a job, freelance work, a business, or anywhere
else — pick a budgeting framework, and SmartBudget calculates every limit
for you, then keeps them updated in real time as you log expenses, warns
you before you go over, and tracks your emergency fund and financial
goals.

It's a real working app, not a static prototype: every number on screen is
computed from your own income, chosen rule and logged expenses. Nothing is
hard-coded — no assumed salary, no assumed currency, no assumed country,
profession or employer.

## Quick start

```bash
npm start        # serves the app at http://localhost:5173
npm test          # runs the engine's unit test suite (node --test)
```

No build step, no dependencies to install — this is a zero-dependency
static app (see *Architecture* below).

## The core flow

1. **Onboarding** — name (optional), currency (preselected from your
   locale, changeable at any time), and one or more income sources. Each
   source has a type (Salary, Freelance, Business, Part-time, Other), an
   amount and a schedule — monthly, weekly, every two weeks, yearly, every
   N months, or one-time. Current savings, essential monthly expenses and
   existing debt are optional.
2. **Choose a budgeting rule** — 50/30/20, 70/20/10, 80/20, Pay Yourself
   First (percent or fixed amount), or a fully Custom split. The screen
   shows a live preview of what each rule means in your currency for your
   income.
3. **Add expenses** — amount, category → subcategory, date, payment
   method, optional note, in a few taps.
4. **Everything recalculates immediately** — spent, remaining, % used, and
   whether you're approaching or over a limit, per budget group.
5. **Alerts fire automatically** at 75% (info), 80% (warning), 90%
   ("almost finished — only X remains") and 100%+ ("exceeded by X").
   Before saving an expense that would push a group over budget, you get
   an "Add Anyway / Cancel" choice — SmartBudget never blocks a
   transaction, it only informs.
6. **Emergency fund & goals** — the emergency fund target is your own
   essential monthly expenses times a coverage window you choose (3
   months, 6 months or custom). Goals track progress toward a target, with
   both an estimated completion date from your monthly contribution and
   the contribution you'd need to hit a target date.
7. **Reports & analytics** — a monthly financial summary (income,
   expenses, savings, savings rate, exceeded categories, largest spends,
   month-over-month comparison) plus category/trend charts filterable by
   month, quarter, half-year, year or a custom range.

## Architecture

**Income engine (`src/engine/income.js`)** — a person's money can arrive
from any number of sources on any schedule, so each source is normalized
to a monthly equivalent (weekly × 52/12, yearly ÷ 12, every-N-months ÷ N)
and summed into a single monthly basis the rules work from. One-time
income counts only in the month it actually arrives, so a windfall lifts
that month's budget and nothing else.

**Currency (`src/engine/currency.js`)** — amounts are formatted through
`Intl.NumberFormat`, which knows each currency's symbol, separators and
minor unit (USD has two decimal places, JPY has none). 40+ currencies are
selectable; the initial choice is derived from the user's locale and can
be changed at any time. No amount anywhere in the app assumes a currency.

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
functions with no DOM/storage dependency, covered by 107 unit tests in
`test/*.test.js` (`npm test`). Several reproduce worked examples verbatim
(a $3,000 income split 1,500/900/600, the Wants 95%→exceeded case, the
"Can I afford this?" overshoot, a report with a 29.75% savings rate), and
a dedicated `edge-cases.test.js` covers what a public release actually
meets: no income yet, tiny incomes, incomes in the billions, every budget
group over at once, malformed amounts, and empty states.

**State store (`src/store.js`)** — the single source of truth: profile,
income sources, rule/config, categories, expenses, recurring items, goals,
emergency fund, notification settings. All mutations go through store
methods (`addExpense`, `contributeToGoal`, `setRule`, …); UI modules never
touch `localStorage` directly. Stored data carries a schema version and is
migrated forward on load (`migrateState`), so data written by an earlier
version keeps working.

**Categories (`src/engine/categories.js`)** — generic personal-finance
groupings: Needs, Wants and Financial, each with editable subcategories,
plus any custom categories the user creates. A subcategory can override
its parent's budget kind, which is how "Debt Payment" sits under Financial
for the user while still counting against a rule's debt group (the 10% in
70/20/10).

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

## What's implemented

Multiple income sources of any type and schedule · 40+ currencies with a
locale-derived default · 50/30/20, 70/20/10, 80/20, Pay Yourself First and
Custom rules · generic Needs/Wants/Financial categories plus custom ones ·
expense entry · real-time budget tracking · 75/80/90/100% alerts ·
in-app + browser notifications · emergency fund tracker sized from your
own essential expenses · dashboard · monthly report · category/trend
charts · financial goals with target dates and required contributions ·
recurring expenses · "Can I afford this?" checker · insights framed as
benchmarks, never verdicts ("According to your selected budgeting rule…")
· PIN lock, encryption at rest, export, and account deletion.

## Designed for any user

The app models one person managing their own money. It makes no assumption
about profession, employer, country, currency or income level:

- **Income** is a list of sources, not a salary. Any mix of salary,
  freelance, business, part-time and other income, on any schedule,
  including irregular and one-time amounts.
- **Currency** is chosen by the user from 40+ options and formatted by
  `Intl`; the default comes from their locale.
- **Categories, budgeting rules and percentages** are all user-editable
  data, and custom ones can be added.
- **Every figure** — budgets, alerts, emergency fund target, goal
  projections, reports — is derived from what the user entered. There is
  no sample data, no demo account and no hard-coded amount anywhere in the
  app.

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
    budget.js             allocation + spend + status + affordability
    income.js              income sources normalized to a monthly basis
    alerts.js              75/80/90/100% alert + pre-save warning copy
    currency.js            Intl-based, currency-independent formatting
    categories.js          generic categories + per-subcategory kinds
    emergencyFund.js, goals.js, recurring.js, insights.js, report.js
    crypto.js, validation.js, id.js
  ui/                   view modules + shared DOM/chart helpers
test/                 node --test unit tests for the engine
```
