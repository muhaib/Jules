# BranchCheck

Branch inspection, facility compliance and corrective-action management for organizations
that run many sites — banks, retail chains, schools, hospitals, offices and franchises.

The product is deliberately **not** a checklist app. A checklist tells you an inspection
happened. This system answers the questions that actually matter afterwards:

> What was wrong, who was responsible, when was it supposed to be fixed, and was the
> correction actually verified?

Every finding carries a severity, an owner, a deadline and photographic evidence, and it
can only be closed by a verifier who accepted proof that the work was done.

---

## The workflow

```
Assign inspection → Inspect branch → Record findings → Add photo evidence → Generate score
   → Create corrective actions → Assign responsible person → Track deadline
   → Verify correction → Close issue → Management dashboard
```

The corrective-action lifecycle is an explicit state machine, not a status field:

```
OPEN → ASSIGNED → IN_PROGRESS → EVIDENCE_SUBMITTED → UNDER_VERIFICATION → CLOSED
                        ↑                                    │
                        └──────────── REJECTED ◄──────────────┘
```

A rejected submission returns the finding to the branch for rework with the verifier's
reason attached. Transitions that are not in the machine are rejected by the server, so a
finding can never be quietly jumped from Open to Closed.

---

## Getting started

**Requirements:** Node 20.11+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # then set DATABASE_URL and AUTH_SECRET
npm run db:deploy             # apply migrations
npm run db:seed               # load the ABC Bank demo dataset
npm run dev                   # http://localhost:3000
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Demo accounts

Every demo user shares the password `BranchCheck#2026`.

| Role | Email | What they see |
| --- | --- | --- |
| Super Admin | `admin@abcbank.example` | Everything: users, branches, templates, settings, audit |
| Regional Manager | `kamran.rashid@abcbank.example` | Their regions; assigns inspections, monitors corrective actions |
| Inspector | `usman.tariq@abcbank.example` | Their assigned inspections; the mobile runner |
| Branch Manager | `tahir.mehmood@abcbank.example` | Their branch; responds to findings with evidence |
| Verifier | `imran.qureshi@abcbank.example` | The verification queue; accepts, rejects, reopens, closes |

The seed builds a coherent history rather than random rows: 24 branches, 72 inspections
across four quarterly rounds, and 620 findings whose lifecycle position matches their age.
Multan Cantt traces the intended 81% → 86% → 90% → 94% improvement curve, 126 findings are
overdue and escalated, and "Fire exit access" fails three times at one branch so the repeat
detector has a genuine pattern to flag.

---

## Architecture

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind |
| Backend | Next.js route handlers under `/api/v1` |
| Database | PostgreSQL via Prisma |
| Auth | Signed JWT paired with a server-side session record |
| File storage | Pluggable driver — local filesystem or any S3-compatible object store |
| PDF | `pdfkit`, server-side |
| Excel | `exceljs` |
| Charts | Recharts |

### Directory map

```
prisma/
  schema.prisma          23 tables: tenancy, structure, identity, templates,
                         inspections, findings, corrective actions, evidence,
                         notifications, append-only audit log
  seed.ts, seed/         the ABC Bank demo dataset
src/
  app/
    (app)/               authenticated pages
    api/v1/              the REST API — the same surface a mobile app consumes
  components/            UI, charts, the inspection runner
  lib/
    auth/                sessions, password policy, permission matrix, scoping
    domain/              scoring, deadlines, escalation, findings, corrective
                         actions, recurrence, templates, notifications
    pdf/                 report generation
    storage/             local + S3 drivers
    analytics.ts         dashboard aggregations
    excel.ts             workbook exports
scripts/                 tenant-isolation verification
```

### The API is the product boundary

The web UI consumes `/api/v1` for every mutation, so a mobile client can be built against
the same endpoints with no backend changes. Notable ones:

| Endpoint | Purpose |
| --- | --- |
| `PATCH /api/v1/inspections/:id/responses` | Bulk answer upsert — what the offline queue replays |
| `POST /api/v1/inspections/:id/submit` | Validates, scores and raises findings in one transaction |
| `POST /api/v1/evidence` | Multipart upload; the file is stored exactly as captured |
| `POST /api/v1/findings/:id/verify` | Accept (closes) or reject (returns to rework) |
| `POST /api/v1/escalations` | Idempotent deadline sweep — point a scheduler at this |

---

## How the important parts work

### Scoring

```
Compliance Score = Earned Points ÷ Applicable Points × 100
```

Compliant earns 100% of an item's weight, partially compliant 50%, non-compliant 0% — all
configurable. **N/A is excluded from both sides**, so a branch is never penalised for
equipment it does not have. Items carry weights, so a fire-safety failure costs more than a
housekeeping one. Grade bands (Excellent / Good / Needs Improvement / Poor) are admin-set.

### Deadlines and escalation

Severity sets the clock: Critical 24h, High 3 days, Medium 7 days, Low 14 days by default,
all editable per organization. Findings are classified On Track / Due Soon / Overdue, and
overdue ones climb a four-step ladder — responsible person → branch manager → regional
manager → head office.

The sweep in `src/lib/domain/escalation.ts` is idempotent and free of any request-scoped
dependency, so it runs from a cron job, a queue worker or a seed script equally well:

```bash
curl -X POST https://your-host/api/v1/escalations -H "Cookie: <session>"
```

### History cannot be rewritten

- Assigning an inspection **snapshots** the template onto it and copies every checklist item
  onto its responses. Editing a template afterwards changes only future inspections — a
  report from six months ago always shows the questions actually asked.
- Template categories and items are **deactivated, never deleted**, because submitted
  inspections reference them.
- Submitted inspections are immutable; the API refuses edits.
- The audit log is **append-only**. Nothing in the application updates or deletes those rows.

### Repeat findings

A finding's identity for recurrence is `branch + normalised item text`, so re-wording a
checklist item does not reset a branch's history. Once the same item fails at the same
branch enough times (default 3, configurable), the whole series is flagged and surfaced
separately from one-off defects — a repeat failure is a systemic problem.

Series totals are counted at read time. A finding's stored `recurrenceCount` is its position
in the series when it was raised, which under-reports the total for every occurrence except
the newest.

### Offline inspections

Inspectors work in branches with poor signal, so the runner never depends on the network:

1. Opening an inspection caches it in IndexedDB.
2. Every answer is written locally **before** it is synced.
3. Photos that fail to upload on a transport error are queued rather than dropped.
4. Reconnecting replays answers first, then photos, so evidence always lands against a
   response the server already knows about.
5. A 4xx response drops the item (retrying will not help); a 5xx keeps it queued.

The UI states this plainly — "Offline — data saved locally on this device", then
"Syncing…", then "Inspection successfully synced". The service worker caches only the
application shell; API responses are never cached, because stale inspection data is worse
than none.

### Evidence

Photos are stored **exactly as captured** — never re-encoded or downscaled. A compressed
photo that no longer shows the defect is worthless as proof, which is the entire point of
the record. Evidence is served through an authenticated, branch-scoped route rather than a
public bucket URL.

---

## Security

- **Sessions** are a signed JWT paired with a random token whose SHA-256 hash is stored
  server-side. Every request checks the database record, so any session can be revoked and a
  stolen JWT alone is not enough. Resetting a password revokes every existing session.
- **Authorization** goes through a permission matrix keyed by permission code
  (`src/lib/auth/permissions.ts`). No page or route checks a role name directly.
- **Data scoping** is applied by query builders that combine the organization id with the
  caller's branch/region visibility. Out-of-scope records return **404**, not 403 — a 403
  would confirm the record exists.
- **Password policy** is defined once and enforced identically on the client and server.
  Sign-in responses and timing do not distinguish a missing account from a wrong password,
  and password reset never reveals whether an email is registered.
- **Uploads** are restricted by MIME type and size, and storage keys are resolved against
  the storage root so a crafted key cannot escape it.

### Verifying tenant isolation

The strongest claim here is that one organization can never reach another's data, so it is
tested rather than asserted:

```bash
npm run seed:second-tenant     # creates a second organization
npm run build && npm start
npm run verify:isolation       # exits non-zero on any leak
```

The script signs in as a **Super Admin of the second organization** — the highest-privilege
attacker available — and attempts every cross-tenant read and write using real identifiers
from the first: findings, inspections, PDF reports, evidence files, assignment, verification,
submission, response edits and template mutation. All must return 404, and the attacker's
own listings and global search must contain only their own records.

---

## Configuration

All behaviour below is editable by an admin under **Settings**, and stored per organization:

- Scoring weights for compliant / partial / non-compliant
- Grade band thresholds
- Remediation deadline and escalation interval per severity
- Which levels of the escalation ladder are active
- The "due soon" warning window
- Recurrence threshold and lookback window
- Whether photo evidence is mandatory for a non-compliance

Environment variables are documented in `.env.example`. Setting `STORAGE_DRIVER=s3` moves
evidence to any S3-compatible store (AWS S3, Cloudflare R2, MinIO) with no code change;
install `@aws-sdk/client-s3` when you do.

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Load the demo dataset |
| `npm run seed:second-tenant` | Second organization for the isolation check |
| `npm run verify:isolation` | Prove cross-tenant access is impossible |

---

## Known limitations

Stated plainly rather than left to be discovered:

- **No mail transport is wired up.** Password reset links are logged server-side in
  production and shown in the UI in development. Point `forgot-password/route.ts` at your
  mailer to finish it.
- **The escalation sweep needs a scheduler.** It is exposed at `POST /api/v1/escalations`
  and is safe to call repeatedly, but nothing in this repository runs it on a timer.
- **`npm audit` reports advisories in build-time transitive dependencies** — postcss bundled
  inside Next, `deepmerge-ts` inside the Prisma CLI, and `uuid` inside exceljs. None are
  reachable at runtime, and npm's suggested "fixes" are downgrades, so they are left alone
  deliberately.
- **Notification preferences are stored and honoured server-side** but there is no UI yet for
  a user to change their own.
- **Evidence is not virus-scanned.** Add scanning at the storage boundary before accepting
  uploads from untrusted users.
