const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const DB_PATH = path.join(__dirname, '.tmp-test.db');

let serverProcess;

function waitForServer(url, attempts = 50) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fetch(url)
        .then(() => resolve())
        .catch((err) => {
          if (n <= 0) return reject(err);
          setTimeout(() => attempt(n - 1), 150);
        });
    };
    attempt(attempts);
  });
}

before(async () => {
  for (const ext of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(DB_PATH + ext, { force: true });
  }
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH,
      JWT_SECRET: 'test-secret',
      SUPER_ADMIN_EMAIL: 'admin@test.local',
      SUPER_ADMIN_PASSWORD: 'test-password',
      CORS_ORIGINS: '',
    },
    stdio: 'pipe',
  });
  await waitForServer(`${BASE}/healthz`);
});

after(() => {
  serverProcess.kill();
  for (const ext of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(DB_PATH + ext, { force: true });
  }
});

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

function authed(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

test('rejects bad credentials', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'wrong' }),
  });
  assert.equal(res.status, 401);
});

test('super admin can log in and provision a restaurant', async () => {
  const { token } = await login('admin@test.local', 'test-password');
  assert.ok(token);

  const createRes = await fetch(`${BASE}/api/admin/restaurants`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({ name: 'Test Diner', owner_name: 'Own Er', owner_email: 'owner@testdiner.local' }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.restaurant.slug, 'test-diner');
  assert.ok(created.owner_login.temporary_password);
});

test('a non-super-admin cannot reach the master admin routes', async () => {
  const { token } = await login('admin@test.local', 'test-password');
  const list = await fetch(`${BASE}/api/admin/restaurants`, { headers: authed(token) });
  const { restaurants } = await list.json();
  const testDiner = restaurants.find((r) => r.slug === 'test-diner');

  const reset = await fetch(`${BASE}/api/admin/restaurants/${testDiner.id}/reset-owner-password`, {
    method: 'POST',
    headers: authed(token),
  });
  const { temporary_password } = await reset.json();
  const { token: ownerToken } = await login('owner@testdiner.local', temporary_password);

  const forbidden = await fetch(`${BASE}/api/admin/restaurants`, { headers: authed(ownerToken) });
  assert.equal(forbidden.status, 403);
});

test('tenants are isolated: one restaurant cannot see another\'s data', async () => {
  const { token } = await login('admin@test.local', 'test-password');

  const r1 = await (await fetch(`${BASE}/api/admin/restaurants`, {
    method: 'POST', headers: authed(token),
    body: JSON.stringify({ name: 'Isolation A', owner_name: 'A', owner_email: 'a@isolation.local' }),
  })).json();
  const r2 = await (await fetch(`${BASE}/api/admin/restaurants`, {
    method: 'POST', headers: authed(token),
    body: JSON.stringify({ name: 'Isolation B', owner_name: 'B', owner_email: 'b@isolation.local' }),
  })).json();

  const { token: tokenA } = await login('a@isolation.local', r1.owner_login.temporary_password);
  const { token: tokenB } = await login('b@isolation.local', r2.owner_login.temporary_password);

  const itemRes = await fetch(`${BASE}/api/menu/items`, {
    method: 'POST', headers: authed(tokenA),
    body: JSON.stringify({ name: 'Secret Sauce Special', price: 12 }),
  });
  const { item } = await itemRes.json();

  const bItems = await (await fetch(`${BASE}/api/menu/items`, { headers: authed(tokenB) })).json();
  assert.equal(bItems.items.length, 0);

  const crossPatch = await fetch(`${BASE}/api/menu/items/${item.id}`, {
    method: 'PATCH', headers: authed(tokenB), body: JSON.stringify({ price: 1 }),
  });
  assert.equal(crossPatch.status, 404);
});

test('full order lifecycle: create, advance kitchen status, pay', async () => {
  const { token } = await login('admin@test.local', 'test-password');
  const created = await (await fetch(`${BASE}/api/admin/restaurants`, {
    method: 'POST', headers: authed(token),
    body: JSON.stringify({ name: 'Order Flow', owner_name: 'Owner', owner_email: 'owner@orderflow.local' }),
  })).json();
  const { token: ownerToken } = await login('owner@orderflow.local', created.owner_login.temporary_password);

  const item = await (await fetch(`${BASE}/api/menu/items`, {
    method: 'POST', headers: authed(ownerToken), body: JSON.stringify({ name: 'Pasta', price: 10 }),
  })).json();
  const table = await (await fetch(`${BASE}/api/tables`, {
    method: 'POST', headers: authed(ownerToken), body: JSON.stringify({ name: 'T1', capacity: 2 }),
  })).json();

  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST', headers: authed(ownerToken),
    body: JSON.stringify({ table_id: table.table.id, items: [{ menu_item_id: item.item.id, qty: 2 }] }),
  });
  assert.equal(orderRes.status, 201);
  const { order } = await orderRes.json();
  assert.equal(order.total, 20);

  const tableAfter = await (await fetch(`${BASE}/api/tables`, { headers: authed(ownerToken) })).json();
  assert.equal(tableAfter.tables.find((t) => t.id === table.table.id).status, 'occupied');

  const kdsItem = order.items[0];
  await fetch(`${BASE}/api/orders/${order.id}/items/${kdsItem.id}`, {
    method: 'PATCH', headers: authed(ownerToken), body: JSON.stringify({ status: 'preparing' }),
  });
  const readyRes = await fetch(`${BASE}/api/orders/${order.id}/items/${kdsItem.id}`, {
    method: 'PATCH', headers: authed(ownerToken), body: JSON.stringify({ status: 'ready' }),
  });
  const { order: afterReady } = await readyRes.json();
  assert.equal(afterReady.items[0].status, 'ready');

  const payRes = await fetch(`${BASE}/api/orders/${order.id}/payments`, {
    method: 'POST', headers: authed(ownerToken), body: JSON.stringify({ amount: 20, method: 'cash' }),
  });
  assert.equal(payRes.status, 201);
  const { order: paidOrder } = await payRes.json();
  assert.equal(paidOrder.status, 'paid');

  const tableFreed = await (await fetch(`${BASE}/api/tables`, { headers: authed(ownerToken) })).json();
  assert.equal(tableFreed.tables.find((t) => t.id === table.table.id).status, 'free');
});

test('suspended restaurant cannot log in', async () => {
  const { token } = await login('admin@test.local', 'test-password');
  const created = await (await fetch(`${BASE}/api/admin/restaurants`, {
    method: 'POST', headers: authed(token),
    body: JSON.stringify({ name: 'Suspend Me', owner_name: 'Owner', owner_email: 'owner@suspendme.local' }),
  })).json();

  await fetch(`${BASE}/api/admin/restaurants/${created.restaurant.id}`, {
    method: 'PATCH', headers: authed(token), body: JSON.stringify({ status: 'suspended' }),
  });

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@suspendme.local', password: created.owner_login.temporary_password }),
  });
  assert.equal(loginRes.status, 403);
});
