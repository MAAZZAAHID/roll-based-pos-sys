/**
 * Smoke-test for authentication endpoints.
 *
 * Requires the backend server to be running on PORT (default 3001).
 * Run: node src/scripts/test-auth.js   (after building)
 *
 * Or: npm run test:auth  (see package.json)
 */

import { requiredTestCredential, testOwnerUsername } from './test-config';

const BASE = `http://localhost:${process.env.PORT || 3001}/api`;

async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅  ${label}`);
  } else {
    console.error(`  ❌  ${label}`);
    process.exitCode = 1;
  }
}

async function main() {
  const ownerPassword = requiredTestCredential('TEST_OWNER_PASSWORD');
  console.log('\n🔐  Auth smoke-tests\n');

  // ── 1. Login with wrong password ─────────────────────────────────────────
  console.log('1. Login with wrong password');
  const bad = await post('/auth/login', { username: 'owner', password: 'WRONG' });
  assert(bad.status === 401, `Expected 401 — got ${bad.status}`);

  // ── 2. Login as owner ─────────────────────────────────────────────────────
  console.log('2. Login as owner');
  const ownerLogin = await post('/auth/login', { username: testOwnerUsername, password: ownerPassword });
  assert(ownerLogin.status === 200, `Expected 200 — got ${ownerLogin.status}`);
  const ownerToken: string = (ownerLogin.body as { token: string }).token;
  assert(typeof ownerToken === 'string' && ownerToken.length > 0, 'Received JWT token');
  assert((ownerLogin.body as { user: { role: string } }).user.role === 'owner', 'Role is owner');

  // ── 3. GET /me with valid token ───────────────────────────────────────────
  console.log('3. GET /auth/me with valid token');
  const me = await get('/auth/me', ownerToken);
  assert(me.status === 200, `Expected 200 — got ${me.status}`);
  assert((me.body as { username: string }).username === testOwnerUsername, 'Username is owner');

  // ── 4. GET /me without token ─────────────────────────────────────────────
  console.log('4. GET /auth/me without token (should be 401)');
  const noToken = await get('/auth/me');
  assert(noToken.status === 401, `Expected 401 — got ${noToken.status}`);

  // ── 5. GET /me with tampered token ──────────────────────────────────────
  console.log('5. GET /auth/me with tampered token (should be 401)');
  const tampered = await get('/auth/me', ownerToken.slice(0, -5) + 'XXXXX');
  assert(tampered.status === 401, `Expected 401 — got ${tampered.status}`);

  console.log('\n' + (process.exitCode ? '❌  Some tests failed.' : '✅  All auth tests passed.') + '\n');
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

export {};
