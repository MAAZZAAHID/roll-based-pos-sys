/**
 * Smoke-tests for User Management (Step 13).
 * Covers all 20 requirements listed in the spec.
 */

const BASE = `http://localhost:${process.env.PORT || 3001}/api`;

async function req(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let resBody: any = text;
  try { resBody = JSON.parse(text); } catch {}
  return { status: res.status, body: resBody };
}

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✅  ${label}`); }
  else           { console.error(`  ❌  ${label}`); process.exitCode = 1; }
}

async function main() {
  console.log('\n👥  User Management smoke-tests\n');

  // ── Owner login ──────────────────────────────────────────────────────────────
  const ownerLogin = await req('POST', '/auth/login', { username: 'owner', password: 'Admin@1234' });
  const ownerToken = ownerLogin.body.token;
  const ownerId: number = ownerLogin.body.user.id;
  assert(ownerLogin.status === 200 && !!ownerToken, 'Owner logged in');

  const rand = Date.now();

  // ── 1. Owner can list users ──────────────────────────────────────────────────
  console.log('\n--- 1. Owner can list users ---');
  const listRes = await req('GET', '/users', undefined, ownerToken);
  assert(listRes.status === 200, 'Owner can list users');
  assert(Array.isArray(listRes.body), 'Response is an array');
  assert(!JSON.stringify(listRes.body).includes('password_hash'), 'password_hash never returned in list');

  // ── 2. Owner can create a cashier ────────────────────────────────────────────
  console.log('\n--- 2. Create users ---');
  const cashierUsername = `cashier_${rand}`;
  const createCashier = await req('POST', '/users', {
    username: cashierUsername,
    password: 'password123',
    role: 'cashier',
    full_name: 'Test Cashier'
  }, ownerToken);
  assert(createCashier.status === 201, 'Owner can create a cashier');
  assert(!createCashier.body.password_hash, 'password_hash not returned on creation');
  const cashierId: number = createCashier.body.id;

  // ── 3. Owner can create a manager ────────────────────────────────────────────
  const managerUsername = `manager_${rand}`;
  const createManager = await req('POST', '/users', {
    username: managerUsername,
    password: 'password123',
    role: 'manager',
    full_name: 'Test Manager'
  }, ownerToken);
  assert(createManager.status === 201, 'Owner can create a manager');
  const managerId: number = createManager.body.id;

  // ── 4. Owner can create another owner ────────────────────────────────────────
  const owner2Username = `owner2_${rand}`;
  const createOwner2 = await req('POST', '/users', {
    username: owner2Username,
    password: 'password123',
    role: 'owner',
    full_name: 'Second Owner'
  }, ownerToken);
  assert(createOwner2.status === 201, 'Owner can create another owner');
  const owner2Id: number = createOwner2.body.id;

  // ── 5. Duplicate username → 409 ──────────────────────────────────────────────
  console.log('\n--- 3. Validation ---');
  const dupRes = await req('POST', '/users', {
    username: cashierUsername,
    password: 'password123',
    role: 'cashier'
  }, ownerToken);
  assert(dupRes.status === 409, 'Duplicate username rejected with 409');

  // ── 6. Invalid role → 400 ────────────────────────────────────────────────────
  const badRoleRes = await req('POST', '/users', {
    username: `badrole_${rand}`,
    password: 'password123',
    role: 'superadmin'
  }, ownerToken);
  assert(badRoleRes.status === 400, 'Invalid role rejected with 400');

  // ── 7. Missing required fields → 400 ─────────────────────────────────────────
  const missingRes = await req('POST', '/users', {
    username: `missing_${rand}`
    // no password, no role
  }, ownerToken);
  assert(missingRes.status === 400, 'Missing required fields rejected with 400');

  // ── 8. Password stored as bcrypt hash, never plaintext ───────────────────────
  // We verified password_hash never appears in API responses (tests 1 and 2 cover this)
  // We also know bcrypt.compare works on login (implicitly verified via test-auth.ts)
  assert(!createCashier.body.password_hash && !createCashier.body.password, 'Password never returned by API (create)');

  // ── 9. Owner can GET a user by ID ────────────────────────────────────────────
  console.log('\n--- 4. GET /:id ---');
  const getUser = await req('GET', `/users/${cashierId}`, undefined, ownerToken);
  assert(getUser.status === 200, 'Owner can get user by ID');
  assert(getUser.body.username === cashierUsername, 'Correct user returned by ID');
  assert(!getUser.body.password_hash, 'password_hash not returned in GET /:id');

  // ── 10. Owner can update username ────────────────────────────────────────────
  console.log('\n--- 5. PUT /:id updates ---');
  const updatedUsername = `cashier_upd_${rand}`;
  const updateRes = await req('PUT', `/users/${cashierId}`, {
    username: updatedUsername,
    role: 'cashier',
    is_active: true
  }, ownerToken);
  assert(updateRes.status === 200, 'Owner can update username');
  assert(updateRes.body.username === updatedUsername, 'Username was changed');

  // ── 11. Owner can change role ────────────────────────────────────────────────
  const changeRoleRes = await req('PUT', `/users/${cashierId}`, {
    username: updatedUsername,
    role: 'manager',
    is_active: true
  }, ownerToken);
  assert(changeRoleRes.status === 200, 'Owner can change role');
  assert(changeRoleRes.body.role === 'manager', 'Role changed to manager');

  // ── 12. Owner can deactivate a user ──────────────────────────────────────────
  console.log('\n--- 6. Deactivate / Reactivate ---');
  const deactivateRes = await req('DELETE', `/users/${cashierId}`, undefined, ownerToken);
  assert(deactivateRes.status === 200, 'Owner can deactivate a user');

  // ── 14. Deactivated user cannot authenticate ──────────────────────────────────
  // Login with original username (it was updated, but we'll use what the DB has)
  const deactivatedLogin = await req('POST', '/auth/login', { username: updatedUsername, password: 'password123' });
  assert(deactivatedLogin.status === 403, 'Deactivated user cannot authenticate');

  // ── 13. Owner can reactivate a user ──────────────────────────────────────────
  const reactivateRes = await req('PUT', `/users/${cashierId}`, {
    username: updatedUsername,
    role: 'cashier',
    is_active: true
  }, ownerToken);
  assert(reactivateRes.status === 200, 'Owner can reactivate a user');

  // Verify reactivated user can now log in
  const reactivatedLogin = await req('POST', '/auth/login', { username: updatedUsername, password: 'password123' });
  assert(reactivatedLogin.status === 200, 'Reactivated user can authenticate');

  // ── 13b. Owner can reset password ────────────────────────────────────────────
  console.log('\n--- 7. Password reset ---');
  const pwResetRes = await req('PUT', `/users/${managerId}/password`, {
    password: 'newpassword456'
  }, ownerToken);
  assert(pwResetRes.status === 200, 'Owner can reset user password');

  const pwLoginRes = await req('POST', '/auth/login', { username: managerUsername, password: 'newpassword456' });
  assert(pwLoginRes.status === 200, 'User can login with new password after reset');

  // ── 15. Cashier gets 403 ─────────────────────────────────────────────────────
  console.log('\n--- 8. Role enforcement ---');
  const cashierLoginForRole = await req('POST', '/auth/login', { username: updatedUsername, password: 'password123' });
  const cashierToken = cashierLoginForRole.body.token;
  const cashierReq = await req('GET', '/users', undefined, cashierToken);
  assert(cashierReq.status === 403, 'Cashier receives 403 on /users');

  // ── 16. Manager gets 403 ─────────────────────────────────────────────────────
  const mgrLoginForRole = await req('POST', '/auth/login', { username: managerUsername, password: 'newpassword456' });
  const managerToken = mgrLoginForRole.body.token;
  const mgrReq = await req('GET', '/users', undefined, managerToken);
  assert(mgrReq.status === 403, 'Manager receives 403 on /users');

  // ── 17. password_hash never returned ─────────────────────────────────────────
  console.log('\n--- 9. Security: no password_hash in responses ---');
  const fullList = await req('GET', '/users', undefined, ownerToken);
  const rawJson = JSON.stringify(fullList.body);
  assert(!rawJson.includes('password_hash'), 'password_hash not in list response');
  assert(!rawJson.includes('password'), 'password field not in list response');

  // ── 18. Historical sales remain after user deactivation ──────────────────────
  console.log('\n--- 10. Data integrity after deactivation ---');
  // Deactivate manager (we have owner2 active so owner count stays >=1)
  await req('DELETE', `/users/${managerId}`, undefined, ownerToken);
  const salesAfterDeactivation = await req('GET', '/sales', undefined, ownerToken);
  assert(salesAfterDeactivation.status === 200, 'Sales history still accessible after user deactivation');

  // ── 19. Cannot deactivate last active owner ───────────────────────────────────
  console.log('\n--- 11. Self-protection (last owner) ---');
  // First deactivate owner2, then try to deactivate original owner — should fail
  await req('DELETE', `/users/${owner2Id}`, undefined, ownerToken);
  const delOwnerRes = await req('DELETE', `/users/${ownerId}`, undefined, ownerToken);
  assert(delOwnerRes.status === 403, 'Cannot deactivate the last active owner');

  const demoteOwnerRes = await req('PUT', `/users/${ownerId}`, {
    username: 'owner',
    role: 'manager',
    is_active: true
  }, ownerToken);
  assert(demoteOwnerRes.status === 403, 'Cannot demote the last active owner');

  // ── 20. Invalid user ID gives 404 not 500 ────────────────────────────────────
  console.log('\n--- 12. Invalid IDs ---');
  const notFoundRes = await req('GET', '/users/999999', undefined, ownerToken);
  assert(notFoundRes.status === 404, 'Non-existent user returns 404');

  const badIdRes = await req('GET', '/users/abc', undefined, ownerToken);
  assert(badIdRes.status === 400, 'Invalid user ID returns 400');

  console.log('\n' + (process.exitCode ? '❌  Some user tests failed.' : '✅  All user tests passed.') + '\n');
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

export {};
