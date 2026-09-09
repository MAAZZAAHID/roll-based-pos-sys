/**
 * Smoke-tests for Sales History (Step 11).
 */

import { requiredTestCredential, testOwnerUsername } from './test-config';

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
  const ownerPassword = requiredTestCredential('TEST_OWNER_PASSWORD');
  const testPassword = requiredTestCredential('TEST_PASSWORD');
  console.log('\n📜  Sales History smoke-tests\n');

  // ── Setup: Logins ─────────────────────────────────────────────────────────
  const ownerLogin = await req('POST', '/auth/login', { username: testOwnerUsername, password: ownerPassword });
  const ownerToken: string = ownerLogin.body.token;
  
  let managerToken = '';
  let cashierToken = '';
  try {
    const mgrRes = await req('POST', '/users', {
      username: `manager_${Date.now()}`,
      email: `manager_${Date.now()}@test.com`,
      password: testPassword,
      full_name: 'Test Manager',
      role: 'manager'
    }, ownerToken);
    const mgrLogin = await req('POST', '/auth/login', { username: mgrRes.body.username, password: testPassword });
    managerToken = mgrLogin.body.token;

    const c1Res = await req('POST', '/users', {
      username: `cashier_${Date.now()}`,
      email: `cashier_${Date.now()}@test.com`,
      password: testPassword,
      full_name: 'Test Cashier 1',
      role: 'cashier'
    }, ownerToken);
    const c1Login = await req('POST', '/auth/login', { username: c1Res.body.username, password: testPassword });
    cashierToken = c1Login.body.token;
  } catch(e) {
    console.error("Failed to setup manager/cashier 1", e);
  }

  // Let's create another cashier to test isolation
  let cashier2Token = '';
  let c2Res: any;
  try {
    c2Res = await req('POST', '/users', {
      username: `cashier2_${Date.now()}`,
      email: `cashier2_${Date.now()}@test.com`,
      password: testPassword,
      full_name: 'Test Cashier 2',
      role: 'cashier'
    }, ownerToken);
    
  const cashier2Login = await req('POST', '/auth/login', { username: c2Res.body.username, password: testPassword });
    cashier2Token = cashier2Login.body.token;
  } catch (e) {
    console.error("Failed to setup cashier 2", e);
  }

  // Create products to sell
  const catRes = await req('POST', '/categories', { name: `Hist Cat ${Date.now()}` }, ownerToken);
  const prod1Res = await req('POST', '/products', {
    name: `Hist Prod 1 ${Date.now()}`, barcode: `HBAR1${Date.now()}`, category_id: catRes.body.id,
    selling_price: 10.00, cost_price: 5.00
  }, ownerToken);
  await req('POST', `/inventory/${prod1Res.body.id}/adjust`, { quantity_change: 100, reason: 'init' }, ownerToken);

  // Make a sale as owner
  const ownerSale = await req('POST', '/sales', {
    items: [{ product_id: prod1Res.body.id, quantity: 1 }],
    payment_method: 'card'
  }, ownerToken);
  assert(ownerSale.status === 201, 'Owner sale created');

  // Make a sale as cashier 1
  const c1Sale = await req('POST', '/sales', {
    items: [{ product_id: prod1Res.body.id, quantity: 2 }],
    payment_method: 'cash',
    amount_tendered: 20
  }, cashierToken);
  assert(c1Sale.status === 201, 'Cashier 1 sale created');
  if (c1Sale.status !== 201) console.log('C1SALE ERR:', c1Sale);

  // Make a sale as cashier 2
  const c2Sale = await req('POST', '/sales', {
    items: [{ product_id: prod1Res.body.id, quantity: 3 }],
    payment_method: 'other'
  }, cashier2Token);
  assert(c2Sale.status === 201, 'Cashier 2 sale created');

  // ── Tests ─────────────────────────────────────────────────────────────────

  console.log('\n--- 1. Owner & Manager Access ---');
  const ownerHist = await req('GET', '/sales', undefined, ownerToken);
  assert(ownerHist.status === 200, 'Owner can list all sales');
  assert(ownerHist.body.sales.length >= 3, 'Owner sees multiple sales');
  
  const mgrHist = await req('GET', '/sales', undefined, managerToken);
  assert(mgrHist.status === 200, 'Manager can list all sales');
  if (mgrHist.status !== 200) console.log("MGR HIST RESP:", mgrHist);

  console.log('\n--- 2. Cashier Isolation ---');
  const c1Hist = await req('GET', '/sales', undefined, cashierToken);
  assert(c1Hist.status === 200, 'Cashier 1 can list sales');
  
  // Verify Cashier 1 only sees their own sales
  const allC1SalesMine = c1Hist.body.sales.every((s: any) => s.cashier_username.startsWith('cashier_'));
  assert(allC1SalesMine, 'Cashier 1 only receives their own sales in list');

  const c1DetailMine = await req('GET', `/sales/${c1Sale.body.id}`, undefined, cashierToken);
  assert(c1DetailMine.status === 200, 'Cashier 1 can view their own sale detail');

  const c1DetailOther = await req('GET', `/sales/${ownerSale.body.id}`, undefined, cashierToken);
  assert(c1DetailOther.status === 403, 'Cashier 1 gets 403 trying to view Owner sale');

  const c1DetailOther2 = await req('GET', `/sales/${c2Sale.body.id}`, undefined, cashierToken);
  assert(c1DetailOther2.status === 403, 'Cashier 1 gets 403 trying to view Cashier 2 sale');

  console.log('\n--- 3. Detail Validation ---');
  const det = await req('GET', `/sales/${c1Sale.body.id}`, undefined, ownerToken);
  assert(det.status === 200, 'Owner can view cashier sale detail');
  assert(det.body.invoice_number === c1Sale.body.invoice_number, 'Invoice number matches');
  assert(det.body.cashier_username.startsWith('cashier_'), 'Cashier username matches');
  assert(det.body.total_amount === '20.00', 'Total amount is correct');
  assert(det.body.payment_method === 'cash', 'Payment method is correct');
  assert(det.body.amount_tendered === '20.00', 'Amount tendered is correct');
  assert(det.body.items.length === 1, 'Contains sale items');
  assert(det.body.items[0].product_name === prod1Res.body.name, 'Item name snapshot correct');
  assert(det.body.items[0].unit_price === '10.00', 'Item price snapshot correct');

  console.log('\n--- 4. Filters & Pagination ---');
  const pg1 = await req('GET', '/sales?page=1&limit=2', undefined, ownerToken);
  assert(pg1.body.sales.length === 2, 'Pagination limit is enforced');
  assert(pg1.body.pagination.page === 1, 'Pagination object returned');

  const fInv = await req('GET', `/sales?invoice_number=${c2Sale.body.invoice_number}`, undefined, ownerToken);
  assert(fInv.body.sales.length === 1 && fInv.body.sales[0].id === c2Sale.body.id, 'Invoice search works');

  const fMeth = await req('GET', '/sales?payment_method=other', undefined, ownerToken);
  assert(fMeth.body.sales.some((s:any) => s.id === c2Sale.body.id), 'Payment method filter works');

  // Date filter (sanity check, both today)
  const today = new Date().toISOString().split('T')[0];
  const fDate = await req('GET', `/sales?date_from=${today}&date_to=${today}`, undefined, ownerToken);
  assert(fDate.body.sales.length >= 3, 'Date filtering works');

  console.log('\n' + (process.exitCode ? '❌  Some history tests failed.' : '✅  All history tests passed.') + '\n');
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

export {};
