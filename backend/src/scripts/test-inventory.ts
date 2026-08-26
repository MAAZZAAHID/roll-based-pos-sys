/**
 * Smoke-tests for Inventory Management (Step 7).
 */

const BASE = `http://localhost:${process.env.PORT || 3001}/api`;

async function req(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, options);
  let resBody: any;
  try { resBody = await res.json(); } catch { resBody = await res.text(); }
  return { status: res.status, body: resBody };
}

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✅  ${label}`); }
  else           { console.error(`  ❌  ${label}`); process.exitCode = 1; }
}

async function main() {
  console.log('\n📦  Inventory Management smoke-tests\n');

  // ── Setup: login as owner ─────────────────────────────────────────────────
  const ownerLogin = await req('POST', '/auth/login', { username: 'owner', password: 'Admin@1234' });
  assert(ownerLogin.status === 200, 'Owner login');
  const ownerToken: string = ownerLogin.body.token;

  // Create a manager and cashier for role testing
  const rand = Math.floor(Math.random() * 100000);
  const mgrUser  = `inv_mgr_${rand}`;
  const cashUser = `inv_cash_${rand}`;

  const mgrCreate = await req('POST', '/users', {
    username: mgrUser, email: `${mgrUser}@test.com`,
    password: 'password123', full_name: 'Inv Manager', role: 'manager'
  }, ownerToken);
  assert(mgrCreate.status === 201, 'Test manager created');

  const cashCreate = await req('POST', '/users', {
    username: cashUser, email: `${cashUser}@test.com`,
    password: 'password123', full_name: 'Inv Cashier', role: 'cashier'
  }, ownerToken);
  assert(cashCreate.status === 201, 'Test cashier created');

  const mgrLogin  = await req('POST', '/auth/login', { username: mgrUser,  password: 'password123' });
  const cashLogin = await req('POST', '/auth/login', { username: cashUser, password: 'password123' });
  const managerToken: string  = mgrLogin.body.token;
  const cashierToken: string  = cashLogin.body.token;

  // Create a test product
  const catRes = await req('POST', '/categories', { name: `Inv Cat ${rand}` }, ownerToken);
  const catId = catRes.body.id;
  const prodRes = await req('POST', '/products', {
    name: `Inv Product ${rand}`,
    barcode: `INVBAR${rand}`,
    category_id: catId,
    selling_price: 10.00,
    cost_price: 5.00,
    low_stock_threshold: 5
  }, ownerToken);
  assert(prodRes.status === 201, 'Test product created');
  const productId: number = prodRes.body.id;

  // ── Test 1: Owner can view inventory ─────────────────────────────────────
  console.log('\n--- 1. View Inventory ---');
  const ownerView = await req('GET', '/inventory', undefined, ownerToken);
  assert(ownerView.status === 200, 'Owner can view inventory');

  // ── Test 2: Manager can view inventory ───────────────────────────────────
  const mgrView = await req('GET', '/inventory', undefined, managerToken);
  assert(mgrView.status === 200, 'Manager can view inventory');

  // ── Test 3: Cashier can view inventory ───────────────────────────────────
  const cashView = await req('GET', '/inventory', undefined, cashierToken);
  assert(cashView.status === 200, 'Cashier can view inventory');

  // ── Test 4: Owner can increase stock ─────────────────────────────────────
  console.log('\n--- 2. Stock Adjustments ---');
  const ownerAdd = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: 20,
    reason: 'Received new shipment'
  }, ownerToken);
  assert(ownerAdd.status === 200, 'Owner can increase stock');
  assert(ownerAdd.body.quantity_after === 20, 'New quantity is 20 after +20');
  assert(ownerAdd.body.quantity_before === 0, 'Previous quantity was 0');

  // ── Test 5: Manager can increase stock ───────────────────────────────────
  const mgrAdd = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: 10,
    reason: 'Manager top-up'
  }, managerToken);
  assert(mgrAdd.status === 200, 'Manager can increase stock');
  assert(mgrAdd.body.quantity_after === 30, 'Quantity is now 30');

  // ── Test 6: Owner can decrease stock ─────────────────────────────────────
  const ownerRemove = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: -5,
    reason: 'Damaged items'
  }, ownerToken);
  assert(ownerRemove.status === 200, 'Owner can decrease stock');
  assert(ownerRemove.body.quantity_after === 25, 'Quantity is now 25 after -5');

  // ── Test 7: Manager can decrease stock ───────────────────────────────────
  const mgrRemove = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: -5,
    reason: 'Stock correction'
  }, managerToken);
  assert(mgrRemove.status === 200, 'Manager can decrease stock');
  assert(mgrRemove.body.quantity_after === 20, 'Quantity is now 20 after -5');

  // ── Test 8: Cashier receives 403 ─────────────────────────────────────────
  const cashAdjust = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: 5,
    reason: 'Cashier attempt'
  }, cashierToken);
  assert(cashAdjust.status === 403, 'Cashier receives 403 on adjustment');

  // ── Test 9: Negative resulting stock is rejected ──────────────────────────
  console.log('\n--- 3. Validation ---');
  const negAdjust = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: -999,
    reason: 'Trying to go negative'
  }, ownerToken);
  assert(negAdjust.status === 400, 'Adjustment that would go negative is rejected');

  // Verify stock did not change
  const afterNegCheck = await req('GET', `/inventory/${productId}`, undefined, ownerToken);
  assert(parseInt(afterNegCheck.body.quantity) === 20, 'Stock unchanged after rejected negative adjustment');

  // ── Test 13: Reason is required ──────────────────────────────────────────
  const noReason = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: 5
  }, ownerToken);
  assert(noReason.status === 400, 'Missing reason is rejected (400)');

  const emptyReason = await req('POST', `/inventory/${productId}/adjust`, {
    quantity_change: 5,
    reason: '   '
  }, ownerToken);
  assert(emptyReason.status === 400, 'Empty reason is rejected (400)');

  // ── Test 10-12: Movement record is created correctly ─────────────────────
  console.log('\n--- 4. Movement Records ---');
  const movements = await req('GET', `/inventory/${productId}/movements`, undefined, ownerToken);
  assert(movements.status === 200, 'Owner can view movement history');
  const movList: any[] = movements.body;
  assert(movList.length >= 4, `At least 4 movement records exist (got ${movList.length})`);

  // Last successful owner remove was -5, qty 25→20
  const lastMovement = movList[0]; // ordered DESC by created_at
  assert(lastMovement.quantity_change === -5, 'Last movement has correct quantity_change (-5)');
  assert(lastMovement.quantity_before === 25, 'Last movement has correct quantity_before (25)');
  assert(lastMovement.quantity_after  === 20, 'Last movement has correct quantity_after (20)');
  assert(lastMovement.adjusted_by_username !== undefined, 'Movement includes username of adjuster');

  // ── Test 16-17: Status calculations ──────────────────────────────────────
  console.log('\n--- 5. Status Calculations ---');
  // Reduce to low-stock level (threshold=5, so quantity <= 5 = Low Stock)
  await req('POST', `/inventory/${productId}/adjust`, { quantity_change: -16, reason: 'Reduce to low stock' }, ownerToken);
  const lowStockCheck = await req('GET', `/inventory/${productId}`, undefined, ownerToken);
  assert(lowStockCheck.body.quantity == 4, 'Quantity reduced to 4');
  assert(lowStockCheck.body.status === 'Low Stock', 'Status is "Low Stock" when qty <= threshold');

  // Reduce to zero
  await req('POST', `/inventory/${productId}/adjust`, { quantity_change: -4, reason: 'Reduce to zero' }, ownerToken);
  const outOfStockCheck = await req('GET', `/inventory/${productId}`, undefined, ownerToken);
  assert(outOfStockCheck.body.quantity == 0, 'Quantity reduced to 0');
  assert(outOfStockCheck.body.status === 'Out of Stock', 'Status is "Out of Stock" when qty = 0');

  // Restore to In Stock
  await req('POST', `/inventory/${productId}/adjust`, { quantity_change: 50, reason: 'Restocking' }, ownerToken);
  const inStockCheck = await req('GET', `/inventory/${productId}`, undefined, ownerToken);
  assert(inStockCheck.body.status === 'In Stock', 'Status is "In Stock" when qty > threshold');

  console.log('\n' + (process.exitCode ? '❌  Some inventory tests failed.' : '✅  All inventory tests passed.') + '\n');
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

export {};
