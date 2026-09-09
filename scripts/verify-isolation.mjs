/**
 * Tenant isolation check.
 *
 * The strongest security claim this product makes is that a user in one
 * organization can never reach another's data. This script proves it rather
 * than assuming it: it signs in as a SUPER_ADMIN of a *second* organization —
 * the highest-privilege attacker there is — and attempts every cross-tenant
 * read and write with real identifiers taken from the first organization.
 *
 * Every attempt must return 404. A 403 would already leak the fact that the
 * record exists, so "not found" is the correct answer to a request for
 * something outside your tenant.
 *
 * Usage:
 *   npm run db:seed                 # organization one (ABC Bank)
 *   npm run seed:second-tenant      # organization two (Zeta Retail)
 *   npm run build && npm start      # server on :3000
 *   node scripts/verify-isolation.mjs
 *
 * Requires playwright (npm i -D playwright) and exits non-zero on any failure.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch();

async function as(email) {
  const ctx = await browser.newContext();
  const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'BranchCheck#2026' } });
  if (!r.ok()) throw new Error(`login ${email}: ${r.status()}`);
  return ctx;
}

// A SUPER_ADMIN of a *different* organization — the highest-privilege attacker.
const zeta = await as('admin@zetaretail.example');
const abc = await as('admin@abcbank.example');

// Grab real ABC Bank identifiers to attempt access with.
const findings = (await (await abc.request.get(`${BASE}/api/v1/findings?pageSize=1`)).json()).data;
const inspections = (await (await abc.request.get(`${BASE}/api/v1/inspections?pageSize=1`)).json()).data;
const branches = (await (await abc.request.get(`${BASE}/api/v1/branches?pageSize=1`)).json()).data;
const templates = (await (await abc.request.get(`${BASE}/api/v1/templates`)).json()).data;

const findingId = findings[0].id;
const inspectionId = inspections[0].id;
const branchId = branches[0].id;
const templateId = templates[0].id;

const evId = await (async () => {
  const f = await (await abc.request.get(`${BASE}/api/v1/findings/${findingId}`)).json();
  return f.data.evidence?.[0]?.id ?? null;
})();

const checks = [
  ['GET  finding',            () => zeta.request.get(`${BASE}/api/v1/findings/${findingId}`), [404]],
  ['GET  inspection',         () => zeta.request.get(`${BASE}/api/v1/inspections/${inspectionId}`), [404]],
  ['GET  inspection PDF',     () => zeta.request.get(`${BASE}/api/v1/inspections/${inspectionId}/report.pdf`), [404]],
  ['GET  evidence file',      () => evId ? zeta.request.get(`${BASE}/api/v1/evidence/${evId}`) : null, [404]],
  ['POST assign finding',     () => zeta.request.post(`${BASE}/api/v1/findings/${findingId}/assign`, { data: { assignedToId: 'x' } }), [404]],
  ['POST verify finding',     () => zeta.request.post(`${BASE}/api/v1/findings/${findingId}/verify`, { data: { decision: 'ACCEPT' } }), [404]],
  ['POST submit inspection',  () => zeta.request.post(`${BASE}/api/v1/inspections/${inspectionId}/submit`, { data: {} }), [404]],
  ['PATCH responses',         () => zeta.request.patch(`${BASE}/api/v1/inspections/${inspectionId}/responses`, { data: { responses: [{ responseId: 'x', result: 'COMPLIANT' }] } }), [404]],
  ['POST assign inspection',  () => zeta.request.post(`${BASE}/api/v1/inspections`, { data: { branchId, templateId, inspectorId: 'x', scheduledFor: new Date().toISOString() } }), [404]],
  ['POST template category',  () => zeta.request.post(`${BASE}/api/v1/templates/${templateId}/categories`, { data: { name: 'Injected' } }), [404]],
  ['GET  branch (list leak)', () => zeta.request.get(`${BASE}/api/v1/branches`), [200]],
];

let failures = 0;
for (const [label, run, expected] of checks) {
  const res = run();
  if (!res) { console.log(`  ${label.padEnd(24)} skipped (no evidence)`); continue; }
  const r = await res;
  const ok = expected.includes(r.status());
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(24)} -> ${r.status()} (expected ${expected.join('/')})`);
}

// The cross-org admin's own listings must contain only their own data.
const zetaBranches = (await (await zeta.request.get(`${BASE}/api/v1/branches`)).json()).data;
const zetaFindings = (await (await zeta.request.get(`${BASE}/api/v1/findings`)).json()).data;
const zetaSearch = await (await zeta.newPage()).goto(`${BASE}/search?q=Multan`, { waitUntil: 'networkidle' });

console.log(`\n  Zeta admin sees ${zetaBranches.length} branch(es): ${zetaBranches.map((b) => b.code).join(', ')}`);
console.log(`  Zeta admin sees ${zetaFindings.length} finding(s) from their own org`);
if (zetaBranches.some((b) => b.code.startsWith('MUL') || b.code.startsWith('LHR'))) { failures++; console.log('  FAIL  branch list leaked ABC Bank data'); }
if (zetaFindings.length !== 0) { failures++; console.log('  FAIL  finding list leaked data'); }

const page = (await zeta.pages())[0] ?? (await zeta.newPage());
await page.goto(`${BASE}/search?q=Multan`, { waitUntil: 'networkidle' });
// Assert on actual result rows, not on any occurrence of the term — the page
// legitimately echoes the query and shows an example finding number in its
// empty-state help text.
const resultRows = await page.locator('main table tbody tr').count();
const summary = (await page.locator('main').innerText()).split('\n')[1] ?? '';
const leaked = resultRows > 0;
console.log(`  ${leaked ? 'FAIL' : 'PASS'}  global search "Multan": ${resultRows} result rows — "${summary.trim()}"`);
if (leaked) failures++;

console.log('\n' + (failures === 0 ? 'TENANT ISOLATION PASSED — no cross-organization access' : `${failures} ISOLATION FAILURES`));
await browser.close();
process.exit(failures === 0 ? 0 : 1);
